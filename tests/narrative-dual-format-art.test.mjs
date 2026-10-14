import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {encodeProductionPng} from '../src/art-output-gate.mjs';
import {narrativeDualFormatEnabled,verifyNarrativeDualFormatArt} from '../src/narrative-dual-format-art.mjs';

function project(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'ceos-narrative-dual-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'config'),{recursive:true});
  fs.mkdirSync(path.join(root,'narrative'),{recursive:true});
  fs.mkdirSync(path.join(root,'assets'),{recursive:true});
  const profile={schemaVersion:1,profile:'narrative-game',enabled:true,modelPath:'narrative/graph.json'};
  fs.writeFileSync(path.join(root,'config/narrative-game.local.json'),JSON.stringify(profile));
  fs.writeFileSync(path.join(root,'narrative/graph.json'),JSON.stringify({
    schemaVersion:1,scenes:[{id:'S01',episode:1},{id:'S02',episode:1},{id:'S03',episode:2}]
  }));
  const git=(...args)=>spawnSync('git',args,{cwd:root,encoding:'utf8'});
  assert.equal(git('init','-q').status,0);
  assert.equal(git('config','user.email','ceos@example.invalid').status,0);
  assert.equal(git('config','user.name','CEOS Test').status,0);
  assert.equal(git('add','.').status,0);
  assert.equal(git('commit','-qm','init').status,0);
  return {root,head:git('rev-parse','HEAD').stdout.trim()};
}
function png(root,name,width,height,value) {
  const pixels=Buffer.alloc(width*height*4,value);
  const bytes=encodeProductionPng({width,height,pixels});
  fs.writeFileSync(path.join(root,'assets',name),bytes);
  return {path:'assets/'+name,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),width,height};
}
function manifest(t) {
  const {root,head}=project(t);
  const doc={
    schemaVersion:1,profile:'narrative-game',sourceHead:head,episode:1,
    sceneAssets:{S01:'cg01',S02:'cg01'},
    assets:{cg01:{
      portrait:png(root,'cg01-portrait.png',768,1152,101),
      desktop:png(root,'cg01-desktop.png',1280,720,149)
    }}
  };
  fs.writeFileSync(path.join(root,'art.json'),JSON.stringify(doc));
  const check=()=>verifyNarrativeDualFormatArt(root,'art.json',{currentHead:head});
  const save=()=>fs.writeFileSync(path.join(root,'art.json'),JSON.stringify(doc));
  return {root,head,doc,check,save};
}

test('novel profile turns on mandatory two-asset contract, generic game remains outside it',t=>{
  const p=project(t);
  assert.equal(narrativeDualFormatEnabled(p.root),true);
  fs.unlinkSync(path.join(p.root,'config/narrative-game.local.json'));
  assert.equal(narrativeDualFormatEnabled(p.root),false);
});

test('full scene coverage can reuse one CG pair across neighboring scenes',t=>{
  const {check}=manifest(t);
  const result=check();
  assert.equal(result.status,'PASS_DUAL_FORMAT_ART_MECHANICAL',JSON.stringify(result.errors));
  assert.equal(result.requiredScenes,2);
  assert.equal(result.uniqueAssets,1);
  assert.equal(result.variantFilesChecked,2);
  assert.equal(result.visualAcceptance,'NOT_VERIFIED');
});

test('missing desktop, broken hashes or wrong aspect ratio cannot pass',t=>{
  const {doc,check,save}=manifest(t);
  const original=doc.assets.cg01.desktop;
  delete doc.assets.cg01.desktop;
  save();
  assert.ok(check().errors.some(e=>e.code==='ART_VARIANT_MISSING'));
  doc.assets.cg01.desktop=original;
  doc.assets.cg01.desktop.sha256='a'.repeat(64);
  save();
  assert.ok(check().errors.some(e=>e.code==='ART_VARIANT_HASH_MISMATCH'));
  doc.assets.cg01.desktop={...doc.assets.cg01.portrait};
  save();
  assert.ok(check().errors.some(e=>e.code==='ART_VARIANT_FORMAT_INVALID'));
  assert.ok(check().errors.some(e=>e.code==='ART_VARIANTS_NOT_INDEPENDENT'));
});

test('cannot claim complete episode by omitting an authored scene',t=>{
  const {doc,check,save}=manifest(t);
  delete doc.sceneAssets.S02;
  save();
  assert.ok(check().errors.some(e=>e.code==='ART_SCENE_UNMAPPED'));
});

test('null asset object cannot bypass missing-format verification',t=>{
  const {doc,check,save}=manifest(t);
  doc.assets.cg01=null;
  save();
  assert.ok(check().errors.some(e=>e.code==='ART_ASSET_SCHEMA'));
});

test('missing or forged PNG bytes cannot be counted as artwork',t=>{
  const {root,doc,check,save}=manifest(t);
  const target=path.join(root,doc.assets.cg01.desktop.path);
  fs.writeFileSync(target,Buffer.alloc(32));
  doc.assets.cg01.desktop.sha256=crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
  save();
  assert.ok(check().errors.some(e=>e.code==='ART_VARIANT_FORMAT_INVALID'));
});

test('source head mismatch and path traversal are not accepted',t=>{
  const {doc,check,save}=manifest(t);
  doc.sourceHead='f'.repeat(40);
  doc.assets.cg01.portrait.path='../escape.png';
  save();
  const codes=check().errors.map(e=>e.code);
  assert.ok(codes.includes('ART_SOURCE_HEAD_MISMATCH'));
  assert.ok(codes.includes('ART_UNSAFE_PATH'));
});

test('production-art state machine requires verified pairs only for new opted-in narrative runs',()=>{
  const engine=fs.readFileSync(new URL('../src/execution-engine.mjs',import.meta.url),'utf8');
  assert.match(engine,/narrativeDualFormatRequired: pipeline === 'production-art' && narrativeDualFormatEnabled/);
  assert.match(engine,/stage === 'INTEGRATED'/);
  assert.match(engine,/stage === 'REAUDITED' && normalizedOutcome === 'PASS'/);
  assert.match(engine,/NARRATIVE_DUAL_FORMAT_MANIFEST_REQUIRED/);
  assert.match(engine,/NARRATIVE_DUAL_FORMAT_ART_BLOCKED/);
});
