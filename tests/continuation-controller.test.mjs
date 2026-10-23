import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRun, recordCheckpoint, reopenBlockedRun, resumeRun } from '../src/execution-engine.mjs';
import { encodeProductionPng, inspectArtOutput } from '../src/art-output-gate.mjs';
import { planContinuation, recoverContinuation, claimContinuation, releaseContinuation } from '../src/continuation-controller.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root,'bin','ceos.mjs');
const capabilities = {
  web:{status:'NOT_CONFIGURED'},
  imageGeneration:{capabilityPresence:'ABSENT',serviceAvailability:'UNKNOWN',generationAllowed:false},
  filesystem:{exists:true,readable:true,writable:true}
};
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
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


function progressOnlyProject(t) {
  const project=setup(t);
  fs.appendFileSync(path.join(project,'.gitignore'),'artifacts/\n');
  git(project,'add','.gitignore');
  git(project,'commit','-m','ignore progress fixtures');
  const depPath='narrative/graph.json',dep=Buffer.from('{"scene":"S24"}\n');
  fs.mkdirSync(path.join(project,'narrative'),{recursive:true});
  fs.writeFileSync(path.join(project,depPath),dep);
  const planPath='artifacts/progress-plan.json';
  fs.mkdirSync(path.join(project,'artifacts'),{recursive:true});
  const plan=JSON.stringify({schemaVersion:1,summary:{
    productionPairsPlanned:25,plannedPngFiles:50
  },sourceHashes:{[depPath]:sha256(dep)}},null,2)+'\n';
  fs.writeFileSync(path.join(project,planPath),plan);
  const index='artifacts/art-progress-index.json';
  fs.writeFileSync(path.join(project,index),JSON.stringify({
    schemaVersion:1,plan:{path:planPath,sha256:sha256(plan)},batches:[]
  },null,2)+'\n');
  git(project,'add',depPath);
  git(project,'commit','-m','lock art dependency');
  return {project,index,depPath};
}

test('valid project progress without any runs requests ONE explicit scoped production-art run',t=>{
  const {project}=progressOnlyProject(t);
  const first=planContinuation(project,{mode:'inspect'});
  const second=planContinuation(project,{mode:'guided'});
  assert.equal(first.status,'NEEDS_SCOPED_PRODUCTION_RUN');
  assert.equal(first.executable,false);
  assert.equal(first.action.kind,'PREPARE_SCOPED_PRODUCTION_RUN');
  assert.equal(first.progress.pipeline,'production-art');
  assert.equal(first.progress.status,'PASS_ART_PROGRESS_REVALIDATED');
  assert.equal(first.progress.remainingPairs,25);
  assert.equal(second.status,first.status);
  assert.equal(recoverContinuation(project,{mode:'guided'}).status,first.status);
  assert.equal(fs.existsSync(path.join(project,'.ceos-runs')),false);
});

test('corrupt source-bound progress takes priority over no active run or unrelated run',t=>{
  const {project,depPath}=progressOnlyProject(t);
  fs.appendFileSync(path.join(project,depPath),'drift');
  const before=planContinuation(project,{mode:'inspect'});
  assert.equal(before.status,'BLOCKED_ART_PROGRESS');
  assert.equal(before.action.kind,'RESTORE_SOURCE_BOUND_PROGRESS');
  assert.equal(before.executable,false);
  const unrelated=newRun(project);
  const after=planContinuation(project,{mode:'auto'});
  assert.equal(after.status,'BLOCKED_ART_PROGRESS');
  assert.equal(after.action.kind,'RESTORE_SOURCE_BOUND_PROGRESS');
  assert.equal(after.progress.pipeline,'production-art');
  assert.equal(claimContinuation(project,{mode:'auto',expectedActionId:'anything'}).status,
    'BLOCKED_ART_PROGRESS');
  assert.equal(resumeRun(project,unrelated.runId).integrity.ok,true);
  assert.equal(fs.existsSync(path.join(project,'.ceos-runs','.continue-claims')),false);
});

test('valid art progress cannot select unrelated active or historical terminal pipeline',t=>{
  const {project}=progressOnlyProject(t);
  const unrelated=newRun(project);
  const plan=planContinuation(project,{mode:'guided'});
  assert.equal(plan.status,'NEEDS_SCOPED_PRODUCTION_RUN');
  assert.deepEqual(plan.candidates,[unrelated.runId]);
  assert.equal(planContinuation(project,{runRef:unrelated.runId}).status,
    'BLOCKED_PROGRESS_PIPELINE_MISMATCH');
  const evidence=path.join(project,'evidence.txt');
  fs.writeFileSync(evidence,'blocked evidence');
  recordCheckpoint(project,unrelated.runId,{stage:'EVIDENCE_COLLECTED',
    artifacts:['evidence.txt'],outcome:'BLOCKED',note:'external transport unavailable'});
  assert.equal(planContinuation(project).status,'NEEDS_SCOPED_PRODUCTION_RUN');
});

test('empty project provides precise read-only status, never creates a run',t=>{
  const project=setup(t);
  const plan=planContinuation(project);
  assert.equal(plan.status,'BLOCKED_NO_RUN');
  assert.equal(fs.existsSync(path.join(project,'.ceos-runs')),false);
});

test('continue discovers source-bound art progress and keeps it across repeated inspection',t=>{
  const project=setup(t);
  fs.appendFileSync(path.join(project,'.gitignore'),'artifacts/\n');
  git(project,'add','.gitignore');
  git(project,'commit','-m','ignore evidence fixtures');
  const dependency=Buffer.from('{"scene":"S24"}\n');
  const dependencyPath=path.join(project,'narrative','graph.json');
  fs.mkdirSync(path.dirname(dependencyPath),{recursive:true});
  fs.writeFileSync(dependencyPath,dependency);
  const plan=JSON.stringify({schemaVersion:1,summary:{productionPairsPlanned:25,plannedPngFiles:50},
    sourceHashes:{'narrative/graph.json':sha256(dependency)}},null,2)+'\n';
  fs.mkdirSync(path.join(project,'artifacts'),{recursive:true});
  fs.writeFileSync(path.join(project,'artifacts','progress-plan.json'),plan);
  fs.writeFileSync(path.join(project,'artifacts','art-progress-index.json'),JSON.stringify({
    schemaVersion:1,
    plan:{path:'artifacts/progress-plan.json',sha256:sha256(plan)},
    batches:[]
  },null,2)+'\n');
  git(project,'add','narrative/graph.json');
  git(project,'commit','-m','lock progress dependency');
  const run=createRun(project,'production-art',{scope:{
    target:'planned art',inScope:['S24'],outOfScope:['release'],
    acceptanceContract:'art accepted',mutationBoundary:'assets only'
  },capabilities}).run;
  const first=planContinuation(project,{mode:'inspect'});
  const second=planContinuation(project,{mode:'inspect'});
  assert.equal(first.status,'READY_FOR_CODEX');
  assert.equal(first.progress.status,'PASS_ART_PROGRESS_REVALIDATED');
  assert.equal(first.progress.plannedPairs,25);
  assert.equal(first.progress.acceptedPairs,0);
  assert.equal(first.progress.remainingPairs,25);
  assert.equal(first.progress.indexPath,'artifacts/art-progress-index.json');
  assert.deepEqual(second.progress,first.progress);
  assert.equal(first.runId,run.runId);
});

test('continue blocks a damaged source-bound ledger before it can be claimed',t=>{
  const project=setup(t);
  fs.appendFileSync(path.join(project,'.gitignore'),'artifacts/\n');
  git(project,'add','.gitignore');
  git(project,'commit','-m','ignore progress evidence fixtures');
  fs.mkdirSync(path.join(project,'artifacts','production-art'),{recursive:true});
  fs.writeFileSync(path.join(project,'artifacts','production-art','acceptance-ledger.json'),'{}\n');
  const run=createRun(project,'production-art',{scope:{target:'art',inScope:['tracked.txt'],outOfScope:['release'],acceptanceContract:'accepted art',mutationBoundary:'tracked.txt'},capabilities});
  const plan=planContinuation(project,{mode:'guided'});
  assert.equal(plan.status,'BLOCKED_ART_PROGRESS');
  assert.equal(plan.executable,false);
  assert.equal(plan.progress.pipeline,'production-art');
  assert.equal(resumeRun(project,run.run.runId).integrity.ok,true);
  assert.equal(plan.action.kind,'RESTORE_SOURCE_BOUND_PROGRESS');
  assert.equal(fs.existsSync(path.join(project,'.ceos-runs','.continue-claims')),false);
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

test('CEOS-owned tracked latest.json and untracked checkpoints do not block continue',t=>{
  const project=setup(t);
  const run=newRun(project);
  const latest=path.join(project,'.ceos-runs','latest.json');
  git(project,'add','-f','.ceos-runs/latest.json');
  git(project,'commit','-m','historical project tracks CEOS latest');
  fs.writeFileSync(latest,JSON.stringify({runId:run.runId,updatedAt:'internal change'},null,2));
  const scratch=path.join(project,'.ceos-runs','session-extra','checkpoint.json');
  fs.mkdirSync(path.dirname(scratch),{recursive:true});
  fs.writeFileSync(scratch,'{"status":"internal"}\\n');
  assert.notEqual(spawnSync('git',['status','--porcelain=v1','--untracked-files=all'],
    {cwd:project,encoding:'utf8'}).stdout.trim(),'');
  const plan=planContinuation(project,{runRef:run.runId,mode:'inspect'});
  assert.equal(plan.status,'READY_FOR_CODEX');
  assert.equal(plan.git.dirty,false);
  assert.equal(plan.action.kind,'COLLECT_EVIDENCE');
  fs.writeFileSync(path.join(project,'user-evidence.json'),'{"note":"real user file"}\\n');
  assert.equal(planContinuation(project,{runRef:run.runId}).status,'BLOCKED_DIRTY_WORKTREE');
  fs.rmSync(path.join(project,'user-evidence.json'));
  fs.appendFileSync(path.join(project,'tracked.txt'),'product change');
  assert.equal(planContinuation(project,{runRef:run.runId}).status,'BLOCKED_DIRTY_WORKTREE');
});

test('creation of a new run snapshots source as clean when only CEOS runtime files are dirty',t=>{
  const project=setup(t);
  const old=newRun(project);
  git(project,'add','-f','.ceos-runs/latest.json');
  git(project,'commit','-m','legacy tracked run pointer');
  const file=path.join(project,'.ceos-runs','latest.json');
  fs.writeFileSync(file,JSON.stringify({runId:old.runId,updatedAt:'changed by CEOS'},null,2));
  const next=newRun(project);
  assert.equal(next.sourceAtStart.available,true);
  assert.equal(next.sourceAtStart.clean,true);
  fs.appendFileSync(path.join(project,'tracked.txt'),'real source drift');
  const withDrift=newRun(project);
  assert.equal(withDrift.sourceAtStart.clean,false);
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
  const suffix=planContinuation(project,{runRef:first.runId.slice(-6),mode:'inspect'});
  assert.equal(suffix.runId,first.runId);
  assert.equal(suffix.status,'READY_FOR_CODEX');
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

function novelRecoveryFixture(t,{receiptContract=false,legacy=true}={}) {
  const project=setup(t);
  fs.mkdirSync(path.join(project,'config'));
  fs.mkdirSync(path.join(project,'narrative'));
  fs.writeFileSync(path.join(project,'config','narrative-game.local.json'),
    JSON.stringify({profile:'narrative-game',enabled:true,modelPath:'narrative/graph.json'}));
  fs.writeFileSync(path.join(project,'narrative','graph.json'),
    JSON.stringify({scenes:[{id:'S22',episode:2}]}));
  fs.writeFileSync(path.join(project,'canon.json'), JSON.stringify({canon:'verified'}));
  const historicalLines=['The original generation used these source-bound pixels.',
    'The preserved receipt must repeat this exact second line.'];
  if(receiptContract)
    fs.writeFileSync(path.join(project,'historical-receipt.txt'),historicalLines.join('\n')+'\n');
  git(project,'add','config','narrative','canon.json',...(receiptContract?['historical-receipt.txt']:[]));
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
    },
    ...(receiptContract?{resolutionReceiptContract:{
      schemaVersion:1,requiredExactLines:historicalLines,sourceEvidence:'historical-receipt.txt'
    }}:{})
  });
  // Historical fixture: pre-deferred-binding runs were irrevocably pinned to
  // their parent at create time. Migration must not reinterpret them.
  if (legacy) {
    const originalRunFile=path.join(original.runDir,'run.json');
    const historical=JSON.parse(fs.readFileSync(originalRunFile,'utf8'));
    historical.producerBindingMode=null;
    historical.producerParentSessionId='parent-old';
    fs.writeFileSync(originalRunFile,JSON.stringify(historical,null,2)+'\n');
  }
  recordCheckpoint(project,original.run.runId,{stage:'INVENTORIED',artifacts:['canon.json']});
  recordCheckpoint(project,original.run.runId,{stage:'CANON_READY',artifacts:['canon.json']});
  assert.equal(resumeRun(project,original.run.runId).run.nextStage,'GENERATING');
  return {project,original:original.run.runId,writeContext};
}

test('deferred-binding run survives Codex restart before generation without a recovery run',t=>{
  const x=novelRecoveryFixture(t,{legacy:false});
  x.writeContext('parent-new');
  const result=recoverContinuation(x.project);
  assert.equal(result.status,'READY_FOR_CODEX',JSON.stringify(result));
  assert.equal(result.runId,x.original);
  assert.equal(resumeRun(x.project,x.original).run.producerBindingMode,'CURRENT_TURN');
  assert.equal(resumeRun(x.project,x.original).run.producerParentSessionId,null);
  assert.equal(fs.existsSync(path.join(x.project,'.ceos-runs','.continue-recoveries')),false);
});

test('deferred-binding preparation remains inspectable without UserPromptSubmit',t=>{
  const x=novelRecoveryFixture(t,{legacy:false});
  fs.rmSync(path.join(process.env.CODEX_HOME,'ceos','runtime','current-turn.json'),{force:true});
  const result=planContinuation(x.project,{mode:'inspect'});
  assert.equal(result.status,'READY_FOR_CODEX',JSON.stringify(result));
  assert.equal(result.stage,'GENERATING');
  assert.equal(result.runId,x.original);
});

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

test('linked session recovery preserves locked resolution receipt source and hash',t=>{
  const x=novelRecoveryFixture(t,{receiptContract:true});
  const sourceDir=path.join(x.project,'.ceos-runs',x.original);
  const sourceScope=JSON.parse(fs.readFileSync(path.join(sourceDir,'scope.json'),'utf8'));
  const before=fs.readFileSync(path.join(sourceDir,'run.json'),'utf8');
  assert.match(sourceScope.resolutionReceiptContract.sourceEvidenceSha256,/^[a-f0-9]{64}$/);
  x.writeContext('parent-new');
  const linked=recoverContinuation(x.project,{mode:'guided'});
  assert.equal(linked.status,'READY_FOR_CODEX',JSON.stringify(linked));
  const newRun=resumeRun(x.project,linked.runId);
  assert.equal(newRun.integrity.ok,true);
  assert.equal(newRun.run.scopeSha256,sourceScope && JSON.parse(before).scopeSha256);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(newRun.runDir,'scope.json'),'utf8')),sourceScope);
  assert.equal(newRun.run.linkedRecovery.sourceRunId,x.original);
  assert.equal(fs.readFileSync(path.join(sourceDir,'run.json'),'utf8'),before);
  assert.equal(recoverContinuation(x.project,{mode:'guided'}).runId,linked.runId);
});

test('linked recovery rejects drifted receipt source without creating a new run',t=>{
  const x=novelRecoveryFixture(t,{receiptContract:true});
  x.writeContext('parent-new');
  fs.appendFileSync(path.join(x.project,'historical-receipt.txt'),'source changed\n');
  git(x.project,'add','historical-receipt.txt');
  git(x.project,'commit','-m','change locked evidence');
  const result=recoverContinuation(x.project,{mode:'guided'});
  assert.equal(result.status,'BLOCKED_RECOVERY_GUARD');
  assert.match(result.detail,/BLOCKED_RECOVERY_RESOLUTION_RECEIPT_SOURCE_CHANGED/);
  assert.equal(fs.readdirSync(path.join(x.project,'.ceos-runs'))
    .filter(name=>name.includes('production-art')).length,1);
});

test('linked recovery rejects missing locked evidence hash even when source scope is internally consistent',async t=>{
  const x=novelRecoveryFixture(t,{receiptContract:true});
  const base=path.join(x.project,'.ceos-runs',x.original);
  const scopePath=path.join(base,'scope.json'),runPath=path.join(base,'run.json');
  const scope=JSON.parse(fs.readFileSync(scopePath,'utf8'));
  delete scope.resolutionReceiptContract.sourceEvidenceSha256;
  fs.writeFileSync(scopePath,JSON.stringify(scope,null,2)+'\n');
  const old=JSON.parse(fs.readFileSync(runPath,'utf8'));
  const hash=await import('node:crypto');
  old.scopeSha256=hash.createHash('sha256').update(JSON.stringify(scope)).digest('hex');
  fs.writeFileSync(runPath,JSON.stringify(old,null,2)+'\n');
  // Model a well-formed historical checkpoint created before the hash field
  // was mandatory. A partial scope edit without updating this checkpoint
  // would correctly fail the existing integrity gate earlier.
  const cp=path.join(base,'checkpoints','001-scope-locked.json');
  const checkpoint=JSON.parse(fs.readFileSync(cp,'utf8'));
  checkpoint.artifacts[0].sha256=hash.createHash('sha256').update(fs.readFileSync(scopePath)).digest('hex');
  checkpoint.artifacts[0].size=fs.statSync(scopePath).size;
  fs.writeFileSync(cp,JSON.stringify(checkpoint,null,2)+'\n');
  x.writeContext('parent-new');
  const result=recoverContinuation(x.project,{mode:'guided'});
  assert.equal(result.status,'BLOCKED_RECOVERY_GUARD');
  assert.match(result.detail,/BLOCKED_RECOVERY_RESOLUTION_RECEIPT_HASH_MISSING/);
  assert.equal(fs.readdirSync(path.join(x.project,'.ceos-runs'))
    .filter(name=>name.includes('production-art')).length,1);
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

test('generic generating stop reason with trusted parent-binding evidence recovers',t=>{
  const x=novelRecoveryFixture(t);
  const file=path.join(x.project,'.ceos-runs',x.original,'run.json');
  const old=JSON.parse(fs.readFileSync(file,'utf8'));
  old.state='BLOCKED';
  old.verdict='BLOCKED';
  old.nextStage=null;
  old.stopReason={
    code:'STAGE_BLOCKED',
    stage:'GENERATING',
    reason:'BLOCKED: native producer route failed trusted parent binding; no Image Gen, PNG or receipt was created.'
  };
  fs.writeFileSync(file,JSON.stringify(old,null,2)+'\n');
  x.writeContext('parent-new');
  const result=recoverContinuation(x.project);
  assert.equal(result.status,'READY_FOR_CODEX',JSON.stringify(result));
  assert.equal(result.recovery.status,'LINKED_SESSION_RECOVERY_CREATED');
  assert.equal(resumeRun(x.project,result.runId).run.producerParentSessionId,'parent-new');
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

test('S24 recovered original PNG and failed+PASS receipts are checkpoint-pinned but never Git-clean',t=>{
  const project=setup(t);
  const inventory='inventory.json',canon='canon.json';
  fs.writeFileSync(path.join(project,inventory),'{"scenes":["S24"]}\n');
  fs.writeFileSync(path.join(project,canon),'{"source":"approved"}\n');
  git(project,'add',inventory,canon);
  git(project,'commit','-m','source-bound art preparation');

  const r=createRun(project,'production-art',{
    scope:{target:'S24 bounded generation',inScope:['S24'],outOfScope:['release'],
      acceptanceContract:'art verified',mutationBoundary:'generated PNG only'},
    capabilities:{...capabilities,imageGeneration:{
      status:'available',capabilityPresence:'PRESENT',
      trustedForGeneration:true,generationAllowed:true,serviceAvailability:'UNKNOWN'
    }},
    maxCycles:1
  });
  const id=r.run.runId;
  recordCheckpoint(project,id,{stage:'INVENTORIED',artifacts:[inventory]});
  recordCheckpoint(project,id,{stage:'CANON_READY',artifacts:[canon]});

  const rel='assets/production/cg/ep2-dining-refusal-response-cg.png';
  const dest=path.join(project,rel);
  const failure='artifacts/production-art/stage9.4/output-receipts/S24-failed.json';
  const success='artifacts/production-art/stage9.4/output-receipts/S24-imported-pass.json';
  const image=Buffer.alloc(16*24*4);
  for(let i=0;i<16*24;i++) {
    image[i*4]=70;image[i*4+1]=90;image[i*4+2]=140;image[i*4+3]=255;
  }
  const bytes=encodeProductionPng({width:16,height:24,pixels:image});
  const originalRoot=fs.mkdtempSync(path.join(os.tmpdir(),'ceos-native-art-'));
  t.after(()=>fs.rmSync(originalRoot,{force:true,recursive:true}));
  const folder=path.join(originalRoot,'generated_images','host-id');
  fs.mkdirSync(folder,{recursive:true});
  const native=path.join(folder,'exec.png');
  fs.writeFileSync(native,bytes);
  const expected=sha256(bytes);
  const persist=(rel,data)=>{
    const f=path.join(project,rel);
    fs.mkdirSync(path.dirname(f),{recursive:true});
    fs.writeFileSync(f,JSON.stringify(data,null,2)+'\n');
  };
  persist(failure,{schemaVersion:1,status:'BLOCKED_ART_OUTPUT',
    path:dest,kind:'background',issues:['ART_FILE_NOT_FOUND'],
    recordedAt:new Date().toISOString()});
  const note='BLOCKED_ART_OUTPUT: S24 portrait generated-images (16x24, SHA-256 '+
    expected+'), copy to target '+rel+' failed; art-output-verify ART_FILE_NOT_FOUND';
  recordCheckpoint(project,id,{stage:'GENERATING',artifacts:[failure],
    outcome:'BLOCKED',note});
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,bytes);
  const mechanical=inspectArtOutput(dest,{kind:'background',width:16,height:24});
  assert.equal(mechanical.status,'PASS_ART_OUTPUT_MECHANICAL');
  persist(success,{...mechanical,recordedAt:new Date().toISOString()});
  const opened=reopenBlockedRun(project,id,{reason:'native output copied byte-identically',
    artOutputRecovery:{failedReceipt:failure,passReceipt:success,nativeSource:native}});
  assert.equal(opened.integrity.ok,true);
  assert.equal(opened.run.checkpointCount,6);
  const plan=planContinuation(project,{runRef:id,mode:'guided'});
  assert.equal(plan.status,'READY_FOR_CODEX',JSON.stringify(plan));
  assert.equal(plan.git.dirty,true,'Git truth remains dirty');
  assert.equal(plan.git.checkpointedEvidenceOnly,true);
  assert.deepEqual(plan.git.allowedEvidencePaths.sort(),[rel,failure,success].sort());
  assert.deepEqual(plan.git.blockedPaths,[]);
  assert.equal(plan.action.kind,'PRODUCE_BOUNDED_ART_BATCH');
  const claim=claimContinuation(project,{runRef:id,mode:'guided',
    expectedActionId:plan.action.id});
  assert.equal(claim.status,'READY_FOR_CODEX');
  assert.equal(releaseContinuation(project,{runRef:id,token:claim.lease.token}).status,
    'RELEASED');

  // A new untracked candidate has no immutable checkpoint and is blocked.
  const extra='assets/production/cg/uncheckpointed.png';
  fs.copyFileSync(dest,path.join(project,extra));
  const uncheckpointed=planContinuation(project,{runRef:id,mode:'guided'});
  assert.equal(uncheckpointed.status,'BLOCKED_DIRTY_WORKTREE');
  assert.ok(uncheckpointed.git.blockedPaths.includes(extra));
  fs.rmSync(path.join(project,extra));

  // Valid generated evidence cannot hide a dirty tracked source file.
  fs.appendFileSync(path.join(project,'tracked.txt'),'source drift');
  assert.equal(planContinuation(project,{runRef:id,mode:'guided'}).status,
    'BLOCKED_DIRTY_WORKTREE');
  fs.writeFileSync(path.join(project,'tracked.txt'),'original\n');

  // Hash-pinned outputs remain immutable even if the Git status is still ??.
  fs.writeFileSync(dest,'tampered');
  assert.equal(planContinuation(project,{runRef:id,mode:'guided'}).status,
    'BLOCKED_INTEGRITY');
});

test('a SHA-pinned S24–S26 producer ledger from successful GENERATING does not block INTEGRATED',t=>{
  const project=setup(t);
  const canon=path.join(project,'approved-canon.json');
  const inventory=path.join(project,'approved-manifest.json');
  fs.writeFileSync(canon,'{"approved":true}\n');
  fs.writeFileSync(inventory,'{"scenes":["S24","S25","S26"]}\n');
  git(project,'add','approved-canon.json','approved-manifest.json');
  git(project,'commit','-m','source locked for production');
  const usable={...capabilities,imageGeneration:{
    capabilityPresence:'PRESENT',serviceAvailability:'UNKNOWN',
    trustedForGeneration:true,generationAllowed:true,status:'available'
  }};
  const run=createRun(project,'production-art',{
    scope:{target:'S24-S26 production art',inScope:['S24','S25','S26'],
      outOfScope:['release'],acceptanceContract:'real image gate PASS',
      mutationBoundary:'production PNG evidence'},
    capabilities:usable,maxCycles:1
  }).run;
  recordCheckpoint(project,run.runId,{stage:'INVENTORIED',artifacts:['approved-manifest.json']});
  recordCheckpoint(project,run.runId,{stage:'CANON_READY',artifacts:['approved-canon.json']});
  const original='assets/production/cg/ep2-dining-refusal-response-cg.png';
  const originalAbsolute=path.join(project,original);
  fs.mkdirSync(path.dirname(originalAbsolute),{recursive:true});
  const pixels=Buffer.alloc(16*24*4);
  for(let n=0;n<16*24;n++){
    pixels[n*4]=50;pixels[n*4+1]=100;pixels[n*4+2]=150;pixels[n*4+3]=255;
  }
  fs.writeFileSync(originalAbsolute,encodeProductionPng({width:16,height:24,pixels}));
  const verified=inspectArtOutput(originalAbsolute,{kind:'background',width:16,height:24});
  assert.equal(verified.status,'PASS_ART_OUTPUT_MECHANICAL');
  const receiptRel='artifacts/production-art/stage9.4/output-receipts/S24-portrait-verified.json';
  const ledgerRel='artifacts/production-art/stage9.4/producer-batches/2026-10-17-ep2-s24-s26-native-batch.json';
  const receiptAbsolute=path.join(project,receiptRel),ledgerAbsolute=path.join(project,ledgerRel);
  fs.mkdirSync(path.dirname(receiptAbsolute),{recursive:true});
  fs.mkdirSync(path.dirname(ledgerAbsolute),{recursive:true});
  fs.writeFileSync(receiptAbsolute,JSON.stringify({...verified,recordedAt:new Date().toISOString()},null,2)+'\n');
  fs.writeFileSync(ledgerAbsolute,JSON.stringify({
    schemaVersion:1,batch:'EP2-S24-S26',producer:'ceos_asset_generator',
    outputs:[{path:original,sha256:verified.sha256}]
  },null,2)+'\n');
  const done=recordCheckpoint(project,run.runId,{
    stage:'GENERATING',
    artifacts:[receiptRel,ledgerRel],
    metadata:{artOutputs:[{path:original,kind:'background',width:16,height:24}]}
  });
  assert.equal(done.run.nextStage,'INTEGRATED');
  assert.equal(done.integrity.ok,true);
  const checked=planContinuation(project,{runRef:run.runId,mode:'inspect'});
  assert.equal(checked.status,'READY_FOR_CODEX',JSON.stringify(checked));
  assert.equal(checked.git.dirty,true);
  assert.equal(checked.git.checkpointedEvidenceOnly,true);
  assert.deepEqual(checked.git.allowedEvidencePaths.sort(),[original,receiptRel,ledgerRel].sort());
  assert.deepEqual(checked.git.blockedPaths,[]);
  assert.equal(checked.action.kind,'INTEGRATE_ASSET_BATCH');
  const claim=claimContinuation(project,{runRef:run.runId,mode:'guided',expectedActionId:checked.action.id});
  assert.equal(claim.status,'READY_FOR_CODEX');
  assert.equal(releaseContinuation(project,{runRef:run.runId,token:claim.lease.token}).status,'RELEASED');

  // Uncheckpointed JSON in the same folder is not a valid producer receipt.
  const extra=path.join(project,'artifacts/production-art/stage9.4/producer-batches/rogue.json');
  fs.writeFileSync(extra,'{"notCheckpointed":true}\n');
  const blocked=planContinuation(project,{runRef:run.runId});
  assert.equal(blocked.status,'BLOCKED_DIRTY_WORKTREE');
  assert.ok(blocked.git.blockedPaths.includes('artifacts/production-art/stage9.4/producer-batches/rogue.json'));
  fs.rmSync(extra);

  // Tracked source drift is not masked by this evidence-only exemption.
  fs.appendFileSync(path.join(project,'tracked.txt'),'edited story');
  assert.equal(planContinuation(project,{runRef:run.runId}).status,'BLOCKED_DIRTY_WORKTREE');
  fs.writeFileSync(path.join(project,'tracked.txt'),'original\n');

  // The immutable checkpoint catches any later ledger modification.
  fs.appendFileSync(ledgerAbsolute,'{"tampered":true}');
  assert.equal(planContinuation(project,{runRef:run.runId}).status,'BLOCKED_INTEGRITY');
});

test('producer-batches JSON not included in a successful generating checkpoint is not allowlisted',t=>{
  const project=setup(t);
  const folder=path.join(project,'artifacts/production-art/stage9.4/producer-batches');
  fs.mkdirSync(folder,{recursive:true});
  fs.writeFileSync(path.join(folder,'unbound.json'),'{"producer":"terra"}\n');
  const run=createRun(project,'production-art',{
    scope:{target:'art',inScope:['S24'],outOfScope:['release'],
      acceptanceContract:'source art',mutationBoundary:'art assets'},
    capabilities
  }).run;
  const plan=planContinuation(project,{runRef:run.runId});
  assert.equal(plan.status,'BLOCKED_DIRTY_WORKTREE');
  assert.deepEqual(plan.git.allowedEvidencePaths,[]);
  assert.ok(plan.git.blockedPaths.includes(
    'artifacts/production-art/stage9.4/producer-batches/unbound.json'));
});
