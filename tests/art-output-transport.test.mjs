import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {encodeProductionPng} from '../src/art-output-gate.mjs';
import {importArtOutput} from '../src/art-output-transport.mjs';

const make=()=> {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ceos-art-transport-'));
  const project=path.join(root,'game');
  fs.mkdirSync(project);
  const source=path.join(root,'imagegen-native-output.png');
  const width=16,height=24;
  const pixels=Buffer.alloc(width*height*4);
  for(let i=0;i<width*height;i++){
    pixels[i*4]=19;pixels[i*4+1]=72;pixels[i*4+2]=128;pixels[i*4+3]=255;
  }
  fs.writeFileSync(source,encodeProductionPng({width,height,pixels}));
  const sha=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  return {root,project,source,sha,width,height,target:'assets/production/S24-portrait.png'};
};
function importOne(x,extra={}) {
  return importArtOutput(x.project,{sourceFile:x.source,targetFile:x.target,
    expectSha256:x.sha,kind:'background',width:x.width,height:x.height,...extra});
}

test('native PNG is persisted byte-for-byte in the project with correct dimensions and SHA',t=>{
  const x=make();
  t.after(()=>fs.rmSync(x.root,{recursive:true,force:true}));
  const result=importOne(x);
  assert.equal(result.status,'PASS_ART_OUTPUT_TRANSPORT',result.issues.join(','));
  assert.equal(result.sha256,x.sha);
  assert.deepEqual(result.dimensions,{width:16,height:24});
  assert.equal(result.alreadyPresent,false);
  const dest=path.join(x.project,x.target);
  assert.deepEqual(fs.readFileSync(dest),fs.readFileSync(x.source));
  const idempotent=importOne(x);
  assert.equal(idempotent.status,'PASS_ART_OUTPUT_TRANSPORT');
  assert.equal(idempotent.alreadyPresent,true);
  assert.equal(result.visualAcceptance,'NOT_VERIFIED');
  assert.equal(result.providerByteReceipt,'NOT_ATTESTED');
});

test('transport refuses absent native file and truncated or wrong source SHA',t=>{
  const x=make();
  t.after(()=>fs.rmSync(x.root,{recursive:true,force:true}));
  for (const opts of [
    {sourceFile:path.join(x.root,'missing.png')},
    {expectSha256:x.sha.slice(0,16)},
    {expectSha256:'0'.repeat(64)}
  ]) {
    const r=importOne(x,opts);
    assert.equal(r.status,'BLOCKED_ART_OUTPUT_TRANSPORT');
  }
  assert.equal(fs.existsSync(path.join(x.project,x.target)),false);
});

test('source must be a verified PNG, not a forged path or arbitrary bytes',t=>{
  const x=make();
  t.after(()=>fs.rmSync(x.root,{recursive:true,force:true}));
  const dest=path.join(x.project,x.target);
  assert.equal(importOne(x,{width:25}).status,'BLOCKED_ART_OUTPUT_TRANSPORT');
  const source=path.join(x.root,'bad.png');
  fs.writeFileSync(source,'not an image');
  const sha=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  assert.equal(importOne(x,{sourceFile:source,expectSha256:sha}).status,'BLOCKED_ART_OUTPUT_TRANSPORT');
  assert.equal(fs.existsSync(dest),false);
});

test('import refuses project escape, reserved directories and a conflicting accepted target',t=>{
  const x=make();
  t.after(()=>fs.rmSync(x.root,{recursive:true,force:true}));
  for(const target of ['../escape.png','.git/image.png','.ceos-runs/same.png',
    'assets/../escape.png',path.join(x.root,'elsewhere.png')]) {
    assert.equal(importOne(x,{targetFile:target}).status,'BLOCKED_ART_OUTPUT_TRANSPORT',target);
  }
  const dest=path.join(x.project,x.target);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,'accepted prior evidence');
  const conflict=importOne(x);
  assert.equal(conflict.status,'BLOCKED_ART_OUTPUT_TRANSPORT');
  assert.ok(conflict.issues.includes('ART_TRANSPORT_TARGET_EXISTS_DIFFERENT'));
  assert.equal(fs.readFileSync(dest,'utf8'),'accepted prior evidence');
});

test('CLI transports local native file, but never claims native image provider or art acceptance',t=>{
  const x=make();
  t.after(()=>fs.rmSync(x.root,{recursive:true,force:true}));
  const cli=fileURLToPath(new URL('../bin/ceos.mjs',import.meta.url));
  const res=spawnSync(process.execPath,[cli,'art-output-import','--project',x.project,
    '--source',x.source,'--target',x.target,'--sha256',x.sha,
    '--kind','background','--width','16','--height','24','--json'],{encoding:'utf8'});
  assert.equal(res.status,0,res.stderr+'\n'+res.stdout);
  const data=JSON.parse(res.stdout);
  assert.equal(data.status,'PASS_ART_OUTPUT_TRANSPORT');
  assert.equal(data.providerByteReceipt,'NOT_ATTESTED');
  assert.equal(data.visualAcceptance,'NOT_VERIFIED');
});
