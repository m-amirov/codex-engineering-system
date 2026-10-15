import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRun, recordCheckpoint } from '../src/execution-engine.mjs';
import { planContinuation, claimContinuation, releaseContinuation } from '../src/continuation-controller.mjs';

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
