import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { planChangedSceneReviews } from '../src/art-change-impact.mjs';

const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ceos-v3-impact-'));
  t.after(()=>fs.rmSync(root,{force:true,recursive:true}));
  function run(...args) {
    const r=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});
    assert.equal(r.status,0,r.stderr);
    return r.stdout.trim();
  }
  function put(name,content) {
    const filename=path.join(root,name);
    fs.mkdirSync(path.dirname(filename),{recursive:true});
    const bytes=Buffer.from(typeof content==='string'?content:JSON.stringify(content));
    fs.writeFileSync(filename,bytes);
    return {path:name,sha256:sha(bytes)};
  }
  run('init','-q');
  run('config','user.email','ci@example.com');
  run('config','user.name','CEOS Test');
  const graph=put('narrative/graph.json',{schemaVersion:1,scenes:[
    {id:'ep3_old_photo',episode:3,assetId:'photo',dialogue:['Old photograph scene']},
    {id:'ep3_document_check_response',episode:3,assetId:'document',dialogue:['Document inspection scene']}
  ]});
  const photo=put('artifacts/images/photo.png','photo-pixels');
  const document=put('artifacts/images/document.png','document-pixels');
  run('add','.');
  run('commit','-qm','source baseline');
  const sourceHead=run('rev-parse','HEAD');
  const r1=put('artifacts/evidence/photo-review.json',{status:'PASS',sourceHead,actualPixelsReceived:true});
  const r2=put('artifacts/evidence/document-review.json',{status:'PASS',sourceHead,actualPixelsReceived:true});
  const rows=[
    {sceneId:'ep3_old_photo',assetIds:['photo'],dependencies:[graph,photo],receipt:r1},
    {sceneId:'ep3_document_check_response',assetIds:['document'],dependencies:[graph,document],receipt:r2}
  ];
  return {root,run,put,graph,photo,document,rows,sourceHead,
    plan:()=>planChangedSceneReviews(root,{
      sourceHead,currentHead:run('rev-parse','HEAD'),rows,sharedDependencies:[]
    })};
}
test('selective V3 plan changes only amended art, preserving unrelated accepted candidate for revalidation',t=>{
  const f=fixture(t);
  f.put('artifacts/images/document.png','new-document-pixels');
  f.run('add','.');f.run('commit','-qm','alter document art only');
  const p=f.plan();
  assert.equal(p.status,'PASS_IMPACT_PLAN',p.reason);
  assert.deepEqual(p.needsReview.map(x=>x.sceneId),['ep3_document_check_response']);
  assert.deepEqual(p.reuseCandidates.map(x=>x.sceneId),['ep3_old_photo']);
  assert.equal(p.reuseCandidates[0].status,'REVALIDATION_REQUIRED_NOT_ACCEPTED');
});
test('changes to another authored scene in shared graph do not force every scene re-review',t=>{
  const f=fixture(t);
  f.put('narrative/graph.json',{schemaVersion:1,scenes:[
    {id:'ep3_old_photo',episode:3,assetId:'photo',dialogue:['Old photograph scene']},
    {id:'ep3_document_check_response',episode:3,assetId:'document',dialogue:['Revised document response']}
  ]});
  f.run('add','.');f.run('commit','-qm','change only one scene dialogue');
  const p=f.plan();
  assert.equal(p.status,'PASS_IMPACT_PLAN',p.reason);
  assert.deepEqual(p.needsReview.map(x=>x.sceneId),['ep3_document_check_response']);
  assert.deepEqual(p.reuseCandidates.map(x=>x.sceneId),['ep3_old_photo']);
});
test('global runtime changes conservatively impact all scenes, docs do not',t=>{
  const f=fixture(t);
  f.put('docs/README.md','Documentation-only improvement');
  f.run('add','.');f.run('commit','-qm','docs only');
  assert.equal(f.plan().reuseCandidates.length,2);
  f.put('src/literary.css','main { object-fit: cover }');
  f.run('add','.');f.run('commit','-qm','global runtime styling');
  assert.equal(f.plan().needsReview.length,2);
});
test('changed reviewer receipt is never eligible for revalidation',t=>{
  const f=fixture(t);
  f.put('artifacts/evidence/photo-review.json',{status:'REWORK',sourceHead:f.sourceHead});
  const p=f.plan();
  assert.equal(p.status,'BLOCKED_IMPACT_ANALYSIS');
  assert.equal(p.code,'RECEIPT_CHANGED');
});

test('staged and unstaged image changes are included even when HEAD is unchanged', t => {
  const f = fixture(t);
  f.put('artifacts/images/document.png', 'unstaged-document-pixels');
  let p = f.plan();
  assert.equal(p.status, 'PASS_IMPACT_PLAN', p.reason);
  assert.deepEqual(p.needsReview.map(x => x.sceneId), ['ep3_document_check_response']);
  assert.deepEqual(p.reuseCandidates.map(x => x.sceneId), ['ep3_old_photo']);
  f.run('add', 'artifacts/images/document.png');
  p = f.plan();
  assert.deepEqual(p.needsReview.map(x => x.sceneId), ['ep3_document_check_response']);
});

test('untracked runtime or CSS changes are conservative global impact', t => {
  const f = fixture(t);
  f.put('src/story-frame.css', '.frame { object-fit: cover; }');
  const p = f.plan();
  assert.equal(p.status, 'PASS_IMPACT_PLAN', p.reason);
  assert.deepEqual(p.needsReview.map(x => x.sceneId).sort(), ['ep3_document_check_response', 'ep3_old_photo']);
  assert.equal(p.reuseCandidates.length, 0);
});
test('untrusted target HEAD or tampered old dependency invalidates the impact plan',t=>{
  const f=fixture(t);
  const a=planChangedSceneReviews(f.root,{
    sourceHead:f.sourceHead,currentHead:'b'.repeat(40),rows:f.rows,sharedDependencies:[]
  });
  assert.equal(a.status,'BLOCKED_IMPACT_ANALYSIS');
  const b=planChangedSceneReviews(f.root,{
    sourceHead:f.sourceHead,currentHead:f.sourceHead,
    rows:[{...f.rows[0],dependencies:[{...f.photo,sha256:'f'.repeat(64)}]}],sharedDependencies:[]
  });
  assert.equal(b.code,'SOURCE_DEPENDENCY_MISMATCH');
});
