import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRun, recordCheckpoint, resumeRun } from '../src/execution-engine.mjs';
import { planContinuation, recoverContinuation, claimContinuation, releaseContinuation } from '../src/continuation-controller.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root,'bin','ceos.mjs');
const capabilities = {
  web:{status:'NOT_CONFIGURED'},
  imageGeneration:{capabilityPresence:'ABSENT',serviceAvailability:'UNKNOWN',generationAllowed:false},
  filesystem:{exists:true,readable:true,writable:true}
};
function git(project, ...args) {
  const r = spawnSync('git',args,{cwd:project,encoding:'utf8'});
  assert.equal(r.status,0, (r.stderr || '')+' '+args.join(' '));
}
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'ceos-continue-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  git(dir,'init');
  git(dir,'config','user.name','CEOS Test');
  git(dir,'config','user.email','test@example.org');
  fs.writeFileSync(path.join(dir,'.gitignore'),'.ceos-runs/\n');
  fs.writeFileSync(path.join(dir,'tracked.txt'),'original\n');
  git(dir,'add','.gitignore','tracked.txt');
  git(dir,'commit','-m','initial');
  return dir;
}
function newRun(project) {
  return createRun(project,'audit-repair-loop',{
    scope:{target:'continue work',inScope:['tracked.txt'],outOfScope:['release'],
      acceptanceContract:'independent re-audit passes',mutationBoundary:'tracked.txt'},
    capabilities
  }).run;
}
function cliRun(project, ...args) {
  return spawnSync(process.execPath,[cli,'continue',...args,'--project',project,'--json'],
    {cwd:project,encoding:'utf8'});
}

test('empty project provides precise read-only status, never creates a run',t=>{
  const project=setup(t);
  const plan=planContinuation(project);
  assert.equal(plan.status,'BLOCKED_NO_RUN');
  assert.equal(fs.existsSync(path.join(project,'.ceos-runs')),false);
});

test('continue deterministically returns one next action without progressing the run',t=>{
  const project=setup(t),run=newRun(project);
  const one=planContinuation(project,{mode:'guided'});
  const two=planContinuation(project,{mode:'guided'});
  assert.equal(one.status,'READY_FOR_CODEX');
  assert.equal(one.action.kind,'COLLECT_EVIDENCE');
  assert.equal(one.action.id,two.action.id);
  assert.equal(one.runId,run.runId);
  assert.equal(one.git.status,'READY');
  assert.equal(one.nextAction.stage,'EVIDENCE_COLLECTED');
  assert.equal(one.hostExecutionRequired,true);
  assert.equal(fs.existsSync(path.join(project,'.ceos-runs','.continue-claims')),false);

  fs.writeFileSync(path.join(project,'evidence.txt'),'genuine evidence\n');
  recordCheckpoint(project,run.runId,{stage:'EVIDENCE_COLLECTED',artifacts:['evidence.txt']});
  const next=planContinuation(project,{mode:'guided'});
  assert.equal(next.action.kind,'REVIEW_EVIDENCE');
  assert.notEqual(next.action.id,one.action.id);
  assert.equal(next.nextAction.stage,'AUDITED');
});

test('claim is atomic, action-bound and only releasable by its opaque token',t=>{
  const project=setup(t),run=newRun(project);
  const plan=planContinuation(project,{mode:'guided'});
  assert.equal(claimContinuation(project,{runRef:run.runId,mode:'guided',expectedActionId:'bad'}).status,
    'BLOCKED_STALE_ACTION');
  const claim=claimContinuation(project,{runRef:run.runId,mode:'guided',expectedActionId:plan.action.id});
  assert.equal(claim.status,'READY_FOR_CODEX');
  assert.ok(claim.lease.token);
  assert.equal(claimContinuation(project,{runRef:run.runId,mode:'guided',expectedActionId:plan.action.id}).status,
    'BLOCKED_ALREADY_CLAIMED');
  assert.equal(releaseContinuation(project,{runRef:run.runId,token:'00000000-0000-0000-0000-000000000000'}).status,
    'BLOCKED_LEASE_NOT_OWNED');
  assert.equal(releaseContinuation(project,{runRef:run.runId,token:claim.lease.token}).status,'RELEASED');
  assert.equal(releaseContinuation(project,{runRef:run.runId,token:claim.lease.token}).status,
    'BLOCKED_LEASE_MISSING');
});

test('a dirty worktree prevents agent mutation; inspect is still readable',t=>{
  const project=setup(t);newRun(project);
  fs.appendFileSync(path.join(project,'tracked.txt'),'dirty');
  const plan=planContinuation(project,{mode:'auto'});
  assert.equal(plan.status,'BLOCKED_DIRTY_WORKTREE');
  assert.equal(plan.executable,false);
});

test('external transport blocked run is classified via the real engine recovery policy',t=>{
  const project=setup(t),run=newRun(project);
  fs.writeFileSync(path.join(project,'evidence.txt'),'evidence\n');
  recordCheckpoint(project,run.runId,{stage:'EVIDENCE_COLLECTED',artifacts:['evidence.txt'],outcome:'BLOCKED',
    note:'Web transport unavailable after disconnect'});
  const plan=planContinuation(project,{mode:'inspect'});
  assert.equal(plan.status,'RECOVERY_CHECK_REQUIRED');
  assert.equal(plan.action.kind,'VERIFY_RECOVERY_PREREQUISITES');
  assert.equal(plan.executable,false);
  assert.equal(plan.verdict,'BLOCKED');
});

test('non-recoverable blocked run never silently reopens',t=>{
  const project=setup(t),run=newRun(project);
  fs.writeFileSync(path.join(project,'evidence.txt'),'evidence\n');
  recordCheckpoint(project,run.runId,{stage:'EVIDENCE_COLLECTED',artifacts:['evidence.txt'],outcome:'BLOCKED',
    note:'Narrative source mismatch'});
  const plan=planContinuation(project);
  assert.equal(plan.status,'NEEDS_RECOVERY_DECISION');
  assert.equal(plan.action.kind,'PREPARE_LINKED_RECOVERY_PLAN');
  assert.equal(plan.executable,false);
});

test('checkpoint evidence drift blocks continuation even if the stage otherwise looks ready',t=>{
  const project=setup(t),run=newRun(project);
  const file=path.join(project,'evidence.txt');
  fs.writeFileSync(file,'first');
  recordCheckpoint(project,run.runId,{stage:'EVIDENCE_COLLECTED',artifacts:['evidence.txt']});
  fs.writeFileSync(file,'mutated');
  const plan=planContinuation(project,{runRef:run.runId});
  assert.equal(plan.status,'BLOCKED_INTEGRITY');
  assert.equal(plan.executable,false);
});

test('multiple active runs require explicit disambiguation',t=>{
  const project=setup(t);
  const first=newRun(project),second=newRun(project);
  const plan=planContinuation(project);
  assert.equal(plan.status,'BLOCKED_AMBIGUOUS_RUNS');
  assert.ok(plan.candidates.includes(first.runId));
  assert.ok(plan.candidates.includes(second.runId));
  const selected=planContinuation(project,{runRef:first.runId,mode:'guided'});
  assert.equal(selected.runId,first.runId);
  assert.equal(selected.status,'READY_FOR_CODEX');
});

test('CLI continue --dry-run is stable, no mutation; explicit claim and release work',t=>{
  const project=setup(t),run=newRun(project);
  let result=cliRun(project,run.runId,'--dry-run','--mode','inspect');
  assert.equal(result.status,0,result.stderr);
  let plan=JSON.parse(result.stdout);
  assert.equal(plan.status,'READY_FOR_CODEX');
  result=cliRun(project,run.runId,'--mode','guided','--claim','--action-id',plan.action.id);
  assert.equal(result.status,0,result.stderr);
  const claimed=JSON.parse(result.stdout);
  assert.ok(claimed.lease.token);
  result=cliRun(project,run.runId,'--release',claimed.lease.token);
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).status,'RELEASED');
});

test('explicit run reference cannot escape the project run directory',t=>{
  const project=setup(t);
  const external=planContinuation(project,{runRef:'../../outside'});
  assert.equal(external.status,'BLOCKED_RUN_REF_INVALID');
  assert.equal(external.executable,false);
});

function novelRecoveryFixture(t) {
  const project=setup(t);
  fs.mkdirSync(path.join(project,'config'));
  fs.mkdirSync(path.join(project,'narrative'));
  fs.writeFileSync(path.join(project,'config','narrative-game.local.json'),
    JSON.stringify({profile:'narrative-game',enabled:true,modelPath:'narrative/graph.json'}));
  fs.writeFileSync(path.join(project,'narrative','graph.json'),
    JSON.stringify({scenes:[{id:'S22',episode:2}]}));
  fs.writeFileSync(path.join(project,'canon.json'), JSON.stringify({canon:'verified'}));
  git(project,'add','config','narrative','canon.json');
  git(project,'commit','-m','canonical assets and source');
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'ceos-recovery-home-'));
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  const previous=process.env.CODEX_HOME;
  process.env.CODEX_HOME=home;
  t.after(()=>{if(previous===undefined)delete process.env.CODEX_HOME;else process.env.CODEX_HOME=previous;});
  const runtime=path.join(home,'ceos','runtime');
  fs.mkdirSync(runtime,{recursive:true});
  const writeContext=(session,turnSession=session,ageMs=0)=>{
    fs.writeFileSync(path.join(runtime,'current-session.json'),JSON.stringify({
      sessionId:session,observedAt:new Date().toISOString(),cwd:project,source:'startup'
    }));
    fs.writeFileSync(path.join(runtime,'current-turn.json'),JSON.stringify({
      sessionId:turnSession,turnId:'fresh-user-turn',observedAt:new Date(Date.now()-ageMs).toISOString(),cwd:project
    }));
  };
  writeContext('parent-old');
  const original=createRun(project,'production-art',{
    scope:{target:'S22 production',inScope:['S22 portrait','S22 desktop'],
      outOfScope:['release'],acceptanceContract:'native dual-format art gates',
      mutationBoundary:'production-art/S22'},
    capabilities:{
      web:{status:'NOT_CONFIGURED'},
      imageGeneration:{status:'available',capabilityPresence:'PRESENT',trustedForGeneration:true,
        generationAllowed:true,serviceAvailability:'UNKNOWN',attestationFile:'stale-attestation',observedTool:'image_gen.imagegen',trustScope:'run-session-turn'},
      filesystem:{exists:true,readable:true,writable:true}
    }
  });
  recordCheckpoint(project,original.run.runId,{stage:'INVENTORIED',artifacts:['canon.json']});
  recordCheckpoint(project,original.run.runId,{stage:'CANON_READY',artifacts:['canon.json']});
  assert.equal(resumeRun(project,original.run.runId).run.nextStage,'GENERATING');
  return {project,original:original.run.runId,writeContext};
}

test('normal continue performs evidence-pinned linked recovery and never rewrites its source run',t=>{
  const x=novelRecoveryFixture(t);
  const originalFile=path.join(x.project,'.ceos-runs',x.original,'run.json');
  const before=fs.readFileSync(originalFile,'utf8');
  x.writeContext('parent-new');
  const inspected=planContinuation(x.project,{mode:'inspect'});
  assert.equal(inspected.status,'SESSION_RECOVERY_AVAILABLE');
  assert.equal(inspected.executable,false);
  assert.equal(fs.readFileSync(originalFile,'utf8'),before);
  const dry=cliRun(x.project,'--mode','guided','--dry-run');
  assert.equal(dry.status,2);
  assert.equal(JSON.parse(dry.stdout).status,'SESSION_RECOVERY_AVAILABLE');
  const created=recoverContinuation(x.project,{mode:'guided'});
  assert.equal(created.status,'READY_FOR_CODEX');
  assert.equal(created.nextAction.stage,'GENERATING');
  assert.notEqual(created.runId,x.original);
  assert.equal(created.recovery.status,'LINKED_SESSION_RECOVERY_CREATED');
  assert.equal(fs.readFileSync(originalFile,'utf8'),before);
  const fresh=resumeRun(x.project,created.runId);
  assert.equal(fresh.integrity.ok,true);
  assert.equal(fresh.run.producerParentSessionId,'parent-new');
  assert.equal(fresh.run.linkedRecovery.sourceRunId,x.original);
  assert.equal(fresh.run.linkedRecovery.canonCheckpointFile.endsWith('-canon-ready.json'),true);
  assert.equal(fresh.run.nextStage,'GENERATING');
  assert.equal(fresh.run.checkpointCount,3);
  const caps=JSON.parse(fs.readFileSync(path.join(fresh.runDir,'capabilities.json'),'utf8'));
  assert.equal(caps.imageGeneration.trustedForGeneration,false);
  assert.equal(caps.imageGeneration.generationAllowed,false);
  assert.equal(caps.imageGeneration.capabilityPresence,'UNKNOWN');
  assert.equal(caps.imageGeneration.status,'unknown');
  assert.equal(caps.imageGeneration.attestationFile,null);
  assert.equal(caps.imageGeneration.observedTool,null);
  assert.equal(caps.imageGeneration.trustScope,null);
  assert.equal(planContinuation(x.project).runId,created.runId);
  assert.equal(planContinuation(x.project,{runRef:x.original}).runId,created.runId);
  assert.equal(recoverContinuation(x.project,{mode:'guided'}).runId,created.runId);
});

test('CLI default auto-links stale parent, but explicit inspect remains read-only',t=>{
  const x=novelRecoveryFixture(t);
  x.writeContext('parent-new');
  const inspect=cliRun(x.project,'--mode','inspect');
  assert.equal(JSON.parse(inspect.stdout).status,'SESSION_RECOVERY_AVAILABLE');
  const result=cliRun(x.project);
  assert.equal(result.status,0,result.stderr);
  const body=JSON.parse(result.stdout);
  assert.equal(body.status,'READY_FOR_CODEX');
  assert.equal(body.recovery.status,'LINKED_SESSION_RECOVERY_CREATED');
  assert.equal(JSON.parse(cliRun(x.project).stdout).runId,body.runId);
});

test('stale or inconsistent session hooks fail closed without a recovery run',t=>{
  const x=novelRecoveryFixture(t);
  x.writeContext('parent-new','other-parent');
  assert.equal(planContinuation(x.project).status,'BLOCKED_SESSION_CONTEXT_UNVERIFIED');
  x.writeContext('parent-new','parent-new',31*60*1000);
  assert.equal(recoverContinuation(x.project).status,'BLOCKED_SESSION_CONTEXT_UNVERIFIED');
  assert.equal(fs.readdirSync(path.join(x.project,'.ceos-runs')).filter(x=>x.includes('production-art')).length,1);
});

test('parent mismatch terminal block is eligible, missing art output is not',t=>{
  const x=novelRecoveryFixture(t);
  recordCheckpoint(x.project,x.original,{stage:'GENERATING',artifacts:['canon.json'],
    outcome:'BLOCKED',note:'BLOCKED_NATIVE_AGENT_PARENT_MISMATCH: producer trace parent is old'});
  x.writeContext('parent-new');
  assert.equal(recoverContinuation(x.project).status,'READY_FOR_CODEX');
  const y=novelRecoveryFixture(t);
  recordCheckpoint(y.project,y.original,{stage:'GENERATING',artifacts:['canon.json'],
    outcome:'BLOCKED',note:'BLOCKED_ART_OUTPUT / ART_FILE_NOT_FOUND'});
  y.writeContext('another-parent');
  assert.equal(recoverContinuation(y.project).status,'NEEDS_RECOVERY_DECISION');
});

test('explicit native parent mismatch stop code recovers without guessing other blocked stages',t=>{
  const x=novelRecoveryFixture(t);
  recordCheckpoint(x.project,x.original,{stage:'GENERATING',artifacts:['canon.json'],
    outcome:'BLOCKED',note:'Native agent parent mismatch'});
  const file=path.join(x.project,'.ceos-runs',x.original,'run.json');
  const old=JSON.parse(fs.readFileSync(file,'utf8'));
  old.stopReason={code:'BLOCKED_NATIVE_AGENT_PARENT_MISMATCH',reason:'Native agent parent mismatch'};
  fs.writeFileSync(file,JSON.stringify(old,null,2)+'\n');
  x.writeContext('parent-new');
  assert.equal(recoverContinuation(x.project).status,'READY_FOR_CODEX');
});

test('changed Git source, missing canon or damaged recovery provenance block',t=>{
  const x=novelRecoveryFixture(t);
  x.writeContext('parent-new');
  fs.appendFileSync(path.join(x.project,'tracked.txt'),'modified');
  assert.equal(recoverContinuation(x.project).status,'BLOCKED_RECOVERY_GIT_PREFLIGHT');
  git(x.project,'add','tracked.txt');
  git(x.project,'commit','-m','unrelated change');
  const changed=recoverContinuation(x.project);
  assert.equal(changed.status,'BLOCKED_RECOVERY_GUARD');
  assert.match(changed.detail,/BLOCKED_RECOVERY_CANON_NOT_CURRENT/);

  const y=novelRecoveryFixture(t);
  y.writeContext('parent-new');
  const linked=recoverContinuation(y.project);
  const oldfile=path.join(y.project,'.ceos-runs',y.original,'run.json');
  fs.appendFileSync(oldfile,' ');
  assert.equal(planContinuation(y.project,{runRef:linked.runId}).status,'BLOCKED_INTEGRITY');
});

test('active concurrent recovery lock blocks creation and never removes another lock',async t=>{
  const x=novelRecoveryFixture(t);
  x.writeContext('parent-new');
  const crypto=await import('node:crypto');
  const key=crypto.createHash('sha256').update(x.original).digest('hex');
  const dir=path.join(x.project,'.ceos-runs','.continue-recoveries');
  fs.mkdirSync(dir,{recursive:true});
  const lock=path.join(dir,key+'.lock');
  fs.writeFileSync(lock,'other process');
  const result=recoverContinuation(x.project);
  assert.equal(result.status,'BLOCKED_RECOVERY_ALREADY_IN_PROGRESS');
  assert.equal(fs.readFileSync(lock,'utf8'),'other process');
});
