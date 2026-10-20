import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {inspectDirectWorkflow} from '../src/direct-workflow.mjs';

const cli=path.resolve('bin/ceos.mjs');
function git(project,...args) {
  const r=spawnSync('git',args,{cwd:project,encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  return r.stdout.trim();
}
function fixture(t) {
  const project=fs.mkdtempSync(path.join(os.tmpdir(),'ceos-direct-'));
  t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
  git(project,'init','-q');
  git(project,'config','user.email','ceos-test@example.invalid');
  git(project,'config','user.name','CEOS Test');
  fs.writeFileSync(path.join(project,'project.txt'),'original');
  fs.writeFileSync(path.join(project,'package.json'),
    JSON.stringify({scripts:{test:'node --test', 'narrative:validate':'node validate.mjs', dangerous:'rm -rf something'}}));
  git(project,'add','project.txt','package.json');
  git(project,'commit','-qm','original product');
  return project;
}

test('direct mode is read-only, uses Git HEAD and does not create CEOS state',t=>{
  const project=fixture(t);
  const before=fs.readFileSync(path.join(project,'project.txt'));
  const r=inspectDirectWorkflow(project);
  assert.equal(r.status,'READY_FOR_DIRECT_DEVELOPMENT');
  assert.equal(r.workflow,'direct');
  assert.equal(r.runRequired,false);
  assert.equal(r.checkpointRequired,false);
  assert.equal(r.historicalRunsConsulted,false);
  assert.equal(r.mutated,false);
  assert.equal(r.releaseReady,false);
  assert.equal(r.independentAcceptance,'NOT_VERIFIED');
  assert.equal(r.git.head,git(project,'rev-parse','HEAD'));
  assert.equal(r.git.dirty,false);
  assert.deepEqual(r.suggestedChecks.map(x=>x.command),
    ['npm run test','npm run narrative:validate']);
  assert.equal(fs.existsSync(path.join(project,'.ceos-runs')),false);
  assert.deepEqual(fs.readFileSync(path.join(project,'project.txt')),before);
});

test('legacy ambiguous and damaged runs are irrelevant to direct development status',t=>{
  const project=fixture(t);
  for(const id of ['run-a','run-b']) {
    const dir=path.join(project,'.ceos-runs',id);
    fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'run.json'),'{ invalid JSON');
  }
  const r=inspectDirectWorkflow(project);
  assert.equal(r.status,'READY_FOR_DIRECT_DEVELOPMENT');
  assert.equal(r.historicalRunsConsulted,false);
  assert.equal(r.git.dirty,true);
  assert.equal(r.boundaries.doNotFalsifyEvidence,true);
});

test('dirty worktree remains visible but does not block read-only development guidance',t=>{
  const project=fixture(t);
  fs.appendFileSync(path.join(project,'project.txt'),'new change');
  const r=inspectDirectWorkflow(project);
  assert.equal(r.status,'READY_FOR_DIRECT_DEVELOPMENT');
  assert.equal(r.git.dirty,true);
  assert.ok(r.git.changedEntries>=1);
  assert.match(r.notes[0],/Uncommitted changes/);
});

test('direct mode refuses unsafe worktree selection and non-git project',t=>{
  const project=fixture(t);
  const nested=path.join(project,'nested');
  fs.mkdirSync(nested);
  assert.equal(inspectDirectWorkflow(nested).status,'BLOCKED_WRONG_WORKTREE');
  const empty=fs.mkdtempSync(path.join(os.tmpdir(),'ceos-direct-non-git-'));
  t.after(()=>fs.rmSync(empty,{recursive:true,force:true}));
  assert.equal(inspectDirectWorkflow(empty).status,'BLOCKED_NOT_GIT');
});

test('direct CLI returns read-only status and no claim or run references',t=>{
  const project=fixture(t);
  const r=spawnSync(process.execPath,[cli,'direct','--project',project,'--json'],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  const response=JSON.parse(r.stdout);
  assert.equal(response.status,'READY_FOR_DIRECT_DEVELOPMENT');
  assert.equal(response.historicalRunsConsulted,false);
  assert.equal(response.runRequired,false);
  assert.equal(response.boundaries.noImplicitPushOrMerge,true);
  assert.equal(response.boundaries.actualGenerationRequiresNativeToolAndRealOutput,true);
});

test('direct mode does not attempt to run test scripts or change files',t=>{
  const project=fixture(t);
  const file=path.join(project,'package.json');
  const before=fs.readFileSync(file);
  const r=inspectDirectWorkflow(project);
  assert.equal(r.suggestedChecks.length,2);
  assert.equal(r.mutated,false);
  assert.deepEqual(fs.readFileSync(file),before);
  assert.equal(fs.existsSync(path.join(project,'node_modules')),false);
});
