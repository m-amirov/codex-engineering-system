import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {planProjectContinuation} from '../src/project-continuation.mjs';

const cli = path.resolve('bin/ceos.mjs');
function git(project,...args) {
  const x=spawnSync('git',args,{cwd:project,encoding:'utf8'});
  assert.equal(x.status,0,x.stderr);
  return x.stdout.trim();
}
function fixture(t) {
  const project=fs.mkdtempSync(path.join(os.tmpdir(),'ceos-project-continue-'));
  t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
  git(project,'init','-q');
  git(project,'config','user.name','Test');
  git(project,'config','user.email','test@example.com');
  fs.mkdirSync(path.join(project,'artifacts','audit'),{recursive:true});
  const planPath='artifacts/audit/FULL_SEASON_COMPLETION_PLAN_20261019.md';
  const matrixPath='artifacts/audit/FULL_SEASON_READINESS_MATRIX_20261019.json';
  const plan = [
    '# Full Season Completion Plan',
    '',
    '- [x] Verify EP2 original art evidence and preserve accepted receipts',
    '- [ ] Prepare EP3 art inventory and inspect full-season route architecture',
    '- [ ] Write and validate remaining narrative episodes',
    '',
    'Do not start generation before normal gated authorizations.'
  ].join('\n')+'\n';
  fs.writeFileSync(path.join(project,planPath),plan);
  fs.writeFileSync(path.join(project,matrixPath),JSON.stringify({
    schemaVersion:1,episodes:[{id:'EP2',status:'PASS'},{id:'EP3',status:'BLOCKED'}]
  })+'\n');
  git(project,'add','artifacts/audit');
  git(project,'commit','-qm','audit and plan');
  return {project,planPath,matrixPath};
}
function run(project,...args) {
  return spawnSync(process.execPath,[cli,'continue',...args,'--project',project,'--json'],
    {cwd:project,encoding:'utf8'});
}

test('discovers the newest committed plan and proposes one unfinished work unit without selecting a run',t=>{
  const f=fixture(t);
  for(const name of ['old-run-a','old-run-b']) {
    const dir=path.join(f.project,'.ceos-runs',name);
    fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'run.json'),JSON.stringify({
      runId:name,pipeline:'production-art',state:'GENERATING',verdict:null
    }));
  }
  const before=fs.readFileSync(path.join(f.project,f.planPath));
  const first=planProjectContinuation(f.project);
  const second=planProjectContinuation(f.project);
  assert.equal(first.status,'READY_FOR_PROJECT_PLANNING');
  assert.equal(first.executable,false);
  assert.equal(first.action.kind,'VALIDATE_NEXT_PROJECT_TASK');
  assert.match(first.action.candidate,/EP3 art inventory/);
  assert.equal(first.action.id,second.action.id);
  assert.equal(first.historicalRunsSelected,false);
  assert.equal(first.audit.inventoryOnly,true);
  assert.equal(first.plan.path,f.planPath);
  assert.deepEqual(fs.readFileSync(path.join(f.project,f.planPath)),before);
  assert.equal(fs.existsSync(path.join(f.project,'.ceos-runs','.continue-claims')),false);
});

test('explicit short user goal changes action identity, not historical state',t=>{
  const f=fixture(t);
  const base=planProjectContinuation(f.project);
  const goal=planProjectContinuation(f.project,{goal:'Prepare EP3 artwork inventory'});
  assert.equal(goal.status,'READY_FOR_PROJECT_PLANNING');
  assert.equal(goal.goal,'Prepare EP3 artwork inventory');
  assert.notEqual(goal.action.id,base.action.id);
  assert.equal(goal.action.risk,'R0_PLANNING');
});

test('uncommitted plan changes are not silently interpreted as a project contract',t=>{
  const f=fixture(t);
  fs.appendFileSync(path.join(f.project,f.planPath),'\n- [ ] silently inserted scope');
  const result=planProjectContinuation(f.project);
  assert.equal(result.status,'BLOCKED_PROJECT_PLAN_DIRTY');
});

test('missing or unsafe paths block rather than inventing a plan or reading outside repo',t=>{
  const f=fixture(t);
  assert.equal(planProjectContinuation(f.project,{planPath:'../secret.md'}).status,'BLOCKED_PROJECT_PLAN_PATH');
  assert.equal(planProjectContinuation(f.project,{planPath:'artifacts/audit/not-there.md'}).status,'BLOCKED_PROJECT_PLAN_INVALID');
  assert.equal(planProjectContinuation(f.project,{goal:''}).status,'BLOCKED_PROJECT_GOAL_INVALID');
});

test('non-checklist completion plan delegates milestone selection without inventing a PASS',t=>{
  const f=fixture(t);
  fs.writeFileSync(path.join(f.project,f.planPath),
    '# Season plan\n\n## EP3 artwork\n\nInventory before generation.\n\n## EP4 storyline\n\nWrite after architecture.\n');
  git(f.project,'add',f.planPath);
  git(f.project,'commit','-qm','use free-form plan');
  const result=planProjectContinuation(f.project);
  assert.equal(result.status,'READY_FOR_PROJECT_PLANNING');
  assert.equal(result.action.kind,'RESOLVE_NEXT_PROJECT_TASK');
  assert.equal(result.action.candidate,null);
  assert.equal(result.executable,false);
});

test('CLI returns project handoff without a RUN_ID and refuses claim or release shortcuts',t=>{
  const f=fixture(t);
  const result=run(f.project,'--scope','project');
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).status,'READY_FOR_PROJECT_PLANNING');
  const pinned=run(f.project,'--scope','project','--plan',f.planPath,'--goal','Continue season');
  assert.equal(pinned.status,0,pinned.stderr);
  assert.equal(JSON.parse(pinned.stdout).goal,'Continue season');
  const claim=run(f.project,'--scope','project','--claim','--action-id','fake');
  assert.equal(claim.status,1);
  assert.match(claim.stderr,/read-only/i);
  const runId=run(f.project,'some-run','--scope','project');
  assert.equal(runId.status,1);
});

test('two same-date plans require explicit path to prevent ambiguous scope',t=>{
  const f=fixture(t);
  const other='artifacts/audit/PROJECT_PLAN_20261019.md';
  fs.writeFileSync(path.join(f.project,other),'# Plan\n\nA different project plan is proposed for execution.\n');
  git(f.project,'add',other);
  git(f.project,'commit','-qm','second plan');
  const ambiguous=planProjectContinuation(f.project);
  assert.equal(ambiguous.status,'BLOCKED_AMBIGUOUS_PROJECT_PLANS');
  const selected=planProjectContinuation(f.project,{planPath:f.planPath});
  assert.equal(selected.status,'READY_FOR_PROJECT_PLANNING');
});

test('different plan dates choose newest without trusting unchecked completion claims',t=>{
  const f=fixture(t);
  const newer='artifacts/audit/FULL_SEASON_COMPLETION_PLAN_20261020.md';
  fs.writeFileSync(path.join(f.project,newer),
    '# Later full season plan\n\n- [ ] Verify EP3 mapped art and route architecture before any production.\n');
  git(f.project,'add',newer);
  git(f.project,'commit','-qm','newer plan');
  const result=planProjectContinuation(f.project);
  assert.equal(result.plan.path,newer);
  assert.match(result.action.candidate,/Verify EP3/);
  assert.equal(result.executable,false);
});
