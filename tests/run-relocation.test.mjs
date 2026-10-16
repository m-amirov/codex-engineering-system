import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRun, recordCheckpoint, resumeRun } from '../src/execution-engine.mjs';
import { inspectRunRelocation, relocateRun } from '../src/run-relocation.mjs';
import { planContinuation } from '../src/continuation-controller.mjs';

const capabilities={
  web:{status:'NOT_CONFIGURED'},
  imageGeneration:{capabilityPresence:'ABSENT',serviceAvailability:'UNKNOWN',generationAllowed:false},
  filesystem:{exists:true,readable:true,writable:true}
};
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function git(cwd,...args) {
  const r=spawnSync('git',args,{cwd,encoding:'utf8'});
  assert.equal(r.status,0,(r.stderr||r.stdout)+' '+args.join(' '));
  return r.stdout.trim();
}
function setup(t) {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ceos-relocate-'));
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const from=path.join(temp,'original'),to=path.join(temp,'stage9');
  fs.mkdirSync(from);
  git(from,'init');
  git(from,'config','user.name','CEOS Test');
  git(from,'config','user.email','ceos-test@example.org');
  // Relocation validates exact bytes. Prevent Git for Windows autocrlf from
  // changing the test JSON evidence during its worktree checkout.
  git(from,'config','core.autocrlf','false');
  fs.writeFileSync(path.join(from,'.gitattributes'),'*.json text eol=lf\n');
  fs.writeFileSync(path.join(from,'.gitignore'),'.ceos-runs/\n');
  fs.writeFileSync(path.join(from,'inventory.json'),'{"scene":"S24"}\n');
  fs.writeFileSync(path.join(from,'canon.json'),'{"scene":"S24","locked":true}\n');
  git(from,'add','.');
  git(from,'commit','-m','source-bound art inventory');
  const run=createRun(from,'production-art',{
    scope:{target:'S24-S26',inScope:['S24','S25','S26'],
      outOfScope:['release','S19-S23'],acceptanceContract:'real generated art',
      mutationBoundary:'artifacts only'},
    capabilities
  }).run;
  recordCheckpoint(from,run.runId,{stage:'INVENTORIED',artifacts:['inventory.json']});
  recordCheckpoint(from,run.runId,{stage:'CANON_READY',artifacts:['canon.json']});
  const originalRunFile=path.join(from,'.ceos-runs',run.runId,'run.json');
  const originalRun=JSON.parse(fs.readFileSync(originalRunFile,'utf8'));
  // A narrative source project selects CURRENT_TURN only at GENERATING.
  // Stage/canon checkpoints remain independent of a Codex lifecycle marker.
  originalRun.producerBindingMode='CURRENT_TURN';
  originalRun.nativeProducerRouteRequired=true;
  fs.writeFileSync(originalRunFile,JSON.stringify(originalRun,null,2)+'\n');
  git(from,'worktree','add','-b','stage9-test',to,'HEAD');
  fs.cpSync(path.join(from,'.ceos-runs'),path.join(to,'.ceos-runs'),{recursive:true});
  const moved=path.join(to,'.ceos-runs',run.runId,'run.json');
  return {from,to,id:run.runId,originalRunFile,moved,originalSha:sha(moved)};
}
test('relocation is read-only until explicit SHA-confirmed apply and preserves checkpoints',t=>{
  const x=setup(t);
  const before=planContinuation(x.to,{runRef:x.id,mode:'inspect'});
  assert.equal(before.status,'NEEDS_EXPLICIT_RUN_RELOCATION',JSON.stringify(before));
  assert.equal(before.action.kind,'VERIFY_AND_RELOCATE_RUN');
  const preview=inspectRunRelocation(x.to,x.id);
  assert.equal(preview.status,'READY_FOR_EXPLICIT_RELOCATION',JSON.stringify(preview));
  assert.equal(preview.checkpointCount,4);
  assert.equal(sha(x.moved),x.originalSha);
  assert.equal(relocateRun(x.to,x.id,{}).status,'BLOCKED_RELOCATION_EXPECTED_SHA_REQUIRED');
  assert.equal(relocateRun(x.to,x.id,{expectedSha:'0'.repeat(64)}).status,
    'BLOCKED_RELOCATION_SOURCE_CHANGED');
  assert.equal(sha(x.moved),x.originalSha);
  const originBefore=sha(x.originalRunFile);
  const applied=relocateRun(x.to,x.id,{expectedSha:x.originalSha});
  assert.equal(applied.status,'PASS_RUN_RELOCATED',JSON.stringify(applied));
  assert.equal(applied.integrity.ok,true);
  assert.equal(applied.nextStage,'GENERATING');
  assert.equal(sha(x.originalRunFile),originBefore,'source worktree is immutable');
  const history=JSON.parse(fs.readFileSync(applied.receiptPath,'utf8'));
  assert.equal(history.originalRunSha256,x.originalSha);
  assert.equal(history.capabilityTrustInherited,false);
  const moved=resumeRun(x.to,x.id);
  assert.equal(moved.integrity.ok,true);
  assert.equal(moved.run.checkpointCount,4);
  assert.equal(moved.run.projectDir,fs.realpathSync(x.to));
  assert.equal(moved.run.relocation.fromProject,x.from);
  assert.equal(planContinuation(x.to,{runRef:x.id,mode:'inspect'}).status,
    'READY_FOR_CODEX');
  assert.equal(inspectRunRelocation(x.to,x.id).status,'BLOCKED_RUN_RELOCATION');
});
test('relocation denies modified evidence without changing run history',t=>{
  const x=setup(t);
  fs.writeFileSync(path.join(x.to,'canon.json'),'{"corrupted":true}\n');
  assert.equal(inspectRunRelocation(x.to,x.id).status,'BLOCKED_RUN_RELOCATION');
  assert.equal(relocateRun(x.to,x.id,{expectedSha:x.originalSha}).status,
    'BLOCKED_RUN_RELOCATION');
  assert.equal(sha(x.moved),x.originalSha);
});
test('relocation refuses a divergent Git history',t=>{
  const x=setup(t);
  git(x.to,'checkout','--orphan','unrelated');
  git(x.to,'rm','-rf','.');
  fs.writeFileSync(path.join(x.to,'independent.txt'),'unrelated\n');
  git(x.to,'add','.');
  git(x.to,'commit','-m','not an ancestor of the source');
  assert.equal(inspectRunRelocation(x.to,x.id).status,'BLOCKED_RUN_RELOCATION');
  assert.equal(sha(x.moved),x.originalSha);
});
test('relocation rejects generated or inherited native producer evidence',t=>{
  const x=setup(t);
  const run=JSON.parse(fs.readFileSync(x.moved,'utf8'));
  run.producerParentSessionId='previous-parent';
  fs.writeFileSync(x.moved,JSON.stringify(run,null,2)+'\n');
  assert.match(inspectRunRelocation(x.to,x.id).detail,/UNSAFE_STAGE_OR_PROVENANCE/);
});
