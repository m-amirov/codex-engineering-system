import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  encodeProductionPng, decodeProductionPng, inspectArtOutput,
  normalizeArtCanvas, inspectArtBatch
} from '../src/art-output-gate.mjs';

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-output-gate-'));
const S26_DAMIR_FIXTURE = path.resolve(import.meta.dirname, 'fixtures/art-output/s26-damir-doorway-neutral.png');
const S26_DAMIR_SHA256 = '190c4faa3f8ba52e2e61ead5cae0eafdad5bb14d7464c6a679f96420f9be002e';
function png(file, width, height, painter) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const color = painter(x, y);
    pixels.set(color, (y * width + x) * 4);
  }
  fs.writeFileSync(file, encodeProductionPng({ width, height, pixels }));
  return file;
}
const clearSprite = (x,y) => (x>=2&&x<14&&y>=3&&y<15) ? [30,80,140,255] : [0,0,0,0];

test('valid RGBA transparent sprite passes and opaque sprite fails closed',()=>{
  const dir=temp();
  const good=png(path.join(dir,'good.png'),16,18,clearSprite);
  const r=inspectArtOutput(good,{kind:'sprite',width:16,height:18});
  assert.equal(r.status,'PASS_ART_OUTPUT_MECHANICAL',r.issues.join(','));
  assert.ok(r.alpha.transparent>0);
  assert.equal(r.alpha.cornerAlpha.every(x=>x===0),true);
  assert.equal(r.visualAcceptance,'NOT_VERIFIED');
  const bad=png(path.join(dir,'opaque.png'),16,18,()=>[100,100,100,255]);
  const fail=inspectArtOutput(bad,{kind:'sprite',width:16,height:18});
  assert.equal(fail.status,'BLOCKED_ART_OUTPUT');
  assert.ok(fail.issues.includes('ART_ALPHA_MISSING_OR_OPAQUE'));
  assert.ok(fail.issues.includes('ART_CORNERS_NOT_TRANSPARENT'));
});

test('baked opaque checkerboard is detected, not interpreted as transparency',()=>{
  const dir=temp();
  const target=png(path.join(dir,'checker.png'),64,64,(x,y)=>{
    const v=((Math.floor(x/8)+Math.floor(y/8))%2)?204:230;
    return [v,v,v,255];
  });
  const r=inspectArtOutput(target,{kind:'sprite'});
  assert.equal(r.checkerboard.detected,true);
  assert.ok(r.issues.includes('BAKED_CHECKERBOARD_SUSPECTED'));
  assert.ok(r.issues.includes('ART_ALPHA_MISSING_OR_OPAQUE'));
});

test('S26 Damir regression fixture detects the real baked checkerboard and preserves its hash',()=>{
  const r=inspectArtOutput(S26_DAMIR_FIXTURE,{kind:'sprite',width:1024,height:1536});
  assert.equal(r.sha256,S26_DAMIR_SHA256);
  assert.equal(r.dimensions.width,1024);
  assert.equal(r.dimensions.height,1536);
  assert.equal(r.checkerboard.detected,true);
  assert.ok(r.issues.includes('BAKED_CHECKERBOARD_SUSPECTED'));
  assert.ok(r.issues.includes('ART_ALPHA_MISSING_OR_OPAQUE'));
  assert.ok(r.issues.includes('ART_CORNERS_NOT_TRANSPARENT'));
  assert.equal(r.status,'BLOCKED_ART_OUTPUT');
});

test('phase-robust checkerboard regression reproducer tolerates a transition row at a sample phase',()=>{
  const dir=temp();
  const target=png(path.join(dir,'phase-reproducer.png'),128,128,(x,y)=>{
    if ([56,57,120,121].includes(y)) {
      const v=198+((x+y)%5);
      return [v,v,v,255];
    }
    const v=((Math.floor(x/16)+Math.floor(y/16))%2)?174:253;
    return [v,v,v,255];
  });
  const r=inspectArtOutput(target,{kind:'sprite'});
  assert.equal(r.checkerboard.detected,true);
  assert.ok(r.issues.includes('BAKED_CHECKERBOARD_SUSPECTED'));
});

test('checkerboard detector stays negative for clothing, background texture, gradients, and valid transparent sprites',()=>{
  const dir=temp();
  const clothing=png(path.join(dir,'clothing.png'),128,128,(x,y)=>{
    const warm=(Math.floor(x/5)+Math.floor(y/7))%2;
    return warm?[48,94,146,255]:[72,118,170,255];
  });
  const texture=png(path.join(dir,'texture.png'),128,128,(x,y)=>{
    const v=128+Math.round(22*Math.sin(x/7)+18*Math.cos(y/11));
    return [v,v,v,255];
  });
  const gradient=png(path.join(dir,'gradient.png'),128,128,(x,y)=>{
    const v=64+Math.floor((x*5+y*3)/8)%160;
    return [v,v,v,255];
  });
  for (const file of [clothing,texture,gradient]) {
    assert.equal(inspectArtOutput(file,{kind:'sprite'}).checkerboard.detected,false,file);
  }
  const transparent=png(path.join(dir,'transparent.png'),32,32,(x,y)=>
    (x>=6&&x<26&&y>=8&&y<25)?[36,82,136,255]:[0,0,0,0]);
  const r=inspectArtOutput(transparent,{kind:'sprite'});
  assert.equal(r.checkerboard.detected,false);
  assert.equal(r.status,'PASS_ART_OUTPUT_MECHANICAL',r.issues.join(','));
});

test('transparent checker image is still blocked if a baked border is visible',()=>{
  const dir=temp();
  const target=png(path.join(dir,'partial.png'),64,64,(x,y)=>{
    const v=((Math.floor(x/8)+Math.floor(y/8))%2)?204:230;
    return (x>=25&&x<40&&y>=25&&y<40) ? [255,0,0,0] : [v,v,v,255];
  });
  const r=inspectArtOutput(target,{kind:'sprite'});
  assert.ok(r.issues.includes('BAKED_CHECKERBOARD_SUSPECTED'));
  assert.ok(r.issues.includes('ART_CORNERS_NOT_TRANSPARENT'));
});

test('square prop size enforced; safe normalize only crops/pads alpha bounds with exact source pixels',()=>{
  const dir=temp();
  const source=png(path.join(dir,'prop-src.png'),90,70,(x,y)=>{
    return x>=10&&x<38&&y>=17&&y<49?[155,65,30,255]:[0,0,0,0];
  });
  const before=inspectArtOutput(source,{kind:'prop'});
  assert.equal(before.status,'BLOCKED_ART_OUTPUT');
  assert.ok(before.issues.includes('ART_DIMENSION_MISMATCH'));
  const dest=path.join(dir,'prop-512.png');
  const result=normalizeArtCanvas(source,dest);
  assert.equal(result.status,'NORMALIZED_LOSSLESS');
  const after=inspectArtOutput(dest,{kind:'prop'});
  assert.equal(after.status,'PASS_ART_OUTPUT_MECHANICAL',after.issues.join(','));
  assert.deepEqual(after.dimensions,{width:512,height:512});
  assert.deepEqual(after.bounds,{x:242,y:240,width:28,height:32});
  const old=decodeProductionPng(fs.readFileSync(source));
  const now=decodeProductionPng(fs.readFileSync(dest));
  for(let y=0;y<32;y++)for(let x=0;x<28;x++){
    const a=( (17+y)*90 + (10+x) )*4;
    const b=( (240+y)*512 + (242+x) )*4;
    assert.equal(old.pixels.subarray(a,a+4).equals(now.pixels.subarray(b,b+4)),true);
  }
  assert.throws(()=>normalizeArtCanvas(source,dest),/EEXIST/);
  assert.throws(()=>normalizeArtCanvas(source,source),/OVERWRITE_ORIGINAL/);
});

test('normalization refuses 1024x1536 output whose nontransparent content cannot fit 512x512',()=>{
  const dir=temp(), filename=path.join(dir,'large.png');
  png(filename,600,520,(x,y)=>x>=20&&y>=20&&x<580&&y<500?[40,40,100,255]:[0,0,0,0]);
  assert.throws(()=>normalizeArtCanvas(filename,path.join(dir,'normalized.png')),/REQUIRES_RESAMPLING/);
  assert.equal(fs.existsSync(path.join(dir,'normalized.png')),false);
});

test('fail-fast manifest stops after the first invalid output, not after generating a whole batch',()=>{
  const dir=temp();
  png(path.join(dir,'first.png'),32,32,()=>[200,200,200,255]);
  const manifest={assets:[
    {path:'first.png',kind:'sprite'},
    ...Array.from({length:11},(_,n)=>({path:'missing-'+n+'.png',kind:'sprite'}))
  ]};
  const r=inspectArtBatch(manifest,{projectDir:dir});
  assert.equal(r.status,'BLOCKED_ART_BATCH');
  assert.equal(r.firstFailedIndex,0);
  assert.equal(r.inspected.length,1);
  assert.ok(r.issues.includes('ART_ALPHA_MISSING_OR_OPAQUE'));
});

test('malformed and truncated PNG, non-PNG output fail closed',()=>{
  const dir=temp(), f=png(path.join(dir,'pix.png'),16,18,clearSprite);
  const bytes=fs.readFileSync(f);
  bytes[45]^=0xff;
  fs.writeFileSync(f,bytes);
  assert.equal(inspectArtOutput(f,{kind:'sprite'}).status,'BLOCKED_ART_OUTPUT');
  fs.writeFileSync(f,Buffer.from('opaque-checkerboard'));
  assert.equal(inspectArtOutput(f,{kind:'sprite'}).status,'BLOCKED_ART_OUTPUT');
});

test('CLI returns exit 2 and writes new immutable receipts for failure; success only for decoded RGBA',()=>{
  const dir=temp();
  const src=png(path.join(dir,'valid.png'),16,18,clearSprite);
  const cli=path.resolve(import.meta.dirname,'../bin/ceos.mjs');
  const run=(args)=>spawnSync(process.execPath,[cli,...args,'--project',dir,'--json'],{encoding:'utf8'});
  let x=run(['art-output-verify','--file',src,'--kind','sprite','--width','16','--height','18','--receipt','gate.json']);
  assert.equal(x.status,0,x.stderr);
  assert.equal(JSON.parse(x.stdout).status,'PASS_ART_OUTPUT_MECHANICAL');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'gate.json'))).sha256,JSON.parse(x.stdout).sha256);
  x=run(['art-output-verify','--file',src,'--kind','sprite','--receipt','gate.json']);
  assert.notEqual(x.status,0);
  x=run(['art-output-batch','--manifest','invalid.json']);
  assert.notEqual(x.status,0);
  const invalid=png(path.join(dir,'wrong.png'),40,40,()=>[255,255,255,255]);
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({assets:[
    {path:'wrong.png',kind:'sprite'},{path:'not-checked.png',kind:'sprite'}
  ]}));
  x=run(['art-output-batch','--manifest','manifest.json','--receipt','blocked.json']);
  assert.equal(x.status,2,x.stderr);
  assert.equal(JSON.parse(x.stdout).firstFailedIndex,0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'blocked.json'))).status,'BLOCKED_ART_BATCH');
});
