import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { encodeProductionPng } from '../src/art-output-gate.mjs';
import { inspectArtProgress } from '../src/art-progress.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const mkdir=(project,relative) => fs.mkdirSync(path.dirname(path.join(project,relative)),{recursive:true});
const write=(project,relative,bytes) => {
  mkdir(project,relative);
  fs.writeFileSync(path.join(project,relative),bytes);
  return sha(fs.readFileSync(path.join(project,relative)));
};
const json=(project,relative,obj) => write(project,relative,JSON.stringify(obj,null,2)+'\n');
function fixture(t) {
  const project=fs.mkdtempSync(path.join(os.tmpdir(),'ceos-art-progress-'));
  t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
  const dep='narrative/graph.json';
  const depHash=json(project,dep,{scenes:['S22','S23']});
  const plan='artifacts/plan.json';
  const planHash=json(project,plan,{schemaVersion:1,summary:{
    productionPairsPlanned:25,plannedPngFiles:50
  },sourceHashes:{[dep]:depHash}});
  const dimensions=[
    {format:'portrait',width:768,height:1152},
    {format:'landscape',width:1280,height:720}
  ];
  const pixels={};
  const screen=(pair,format) => {
    const img=encodeProductionPng({width:16,height:16,pixels:Buffer.alloc(16*16*4,128)});
    const screenshot='artifacts/screenshots/'+pair+'-'+format+'.png';
    return {path:screenshot,sha256:write(project,screenshot,img)};
  };
  const images=[],reviewed=[],captures=[];
  for(const pair of ['S22','S23']) {
    for(const dim of dimensions){
      const bytes=Buffer.alloc(dim.width*dim.height*4);
      for(let i=0;i<bytes.length;i+=4){bytes[i]=91;bytes[i+1]=114;bytes[i+2]=130;bytes[i+3]=255;}
      const file='assets/'+pair+'-'+dim.format+'.png';
      images.push({id:pair+'-'+dim.format,path:file,
        sha256:write(project,file,encodeProductionPng({width:dim.width,height:dim.height,pixels:bytes}))});
      reviewed.push({id:pair+'-'+dim.format,status:'PASS'});
      const shot=screen(pair,dim.format);
      captures.push({tag:pair,assetFormat:dim.format,noHorizontalOverflow:true,
        noVerticalOverflow:true,screenshot:shot.path,screenshotSha256:shot.sha256});
    }
    for(const platform of ['desktop','mobile'])reviewed.push({id:pair+'-'+platform+'-runtime',status:'PASS'});
  }
  const sourceHead='a'.repeat(40);
  const runtimePath='artifacts/runtime.json';
  const runtimeHash=json(project,runtimePath,{schemaVersion:1,status:'PASS_RUNTIME',
    sourceHead,captures,consoleErrors:[],requestFailures:[],httpErrors:[]});
  const receiptPath='artifacts/acceptance.json';
  let receipt={
    schemaVersion:1,status:'PASS',profile:'NARRATIVE_ART_ACCEPTANCE_V2',
    actualPixelsReceived:true,acceptanceScope:'BATCH_ONLY',
    releaseReady:false,episodeFinalAcceptance:false,requiredRegeneration:false,
    sourceBase:sourceHead,scope:[{sceneId:'ep2_a',pair:'S22'},{sceneId:'ep2_b',pair:'S23'}],
    unresolvedFindings:[],reviewedItems:reviewed,pixels:{assets:images,runtimeEvidence:runtimePath}
  };
  let receiptHash=json(project,receiptPath,receipt);
  const indexPath='artifacts/index.json';
  let index={schemaVersion:1,plan:{path:plan,sha256:planHash},batches:[{
    id:'ep2-s22-s23',pairs:['S22','S23'],
    receipt:{path:receiptPath,sha256:receiptHash},runtimeSha256:runtimeHash
  }]};
  json(project,indexPath,index);
  function updateReceipt(change) {
    receipt=change(receipt) ?? receipt;
    index.batches[0].receipt.sha256=json(project,receiptPath,receipt);
    json(project,indexPath,index);
  }
  return {project,indexPath,plan,dep,images,captures,receiptPath,updateReceipt,index,
    saveIndex:()=>json(project,indexPath,index)};
}

test('accepted batches are projected without creating runs or writing evidence',t=>{
  const x=fixture(t);
  const before=fs.readFileSync(path.join(x.project,x.indexPath));
  const r=inspectArtProgress(x.project,x.indexPath);
  assert.equal(r.status,'PASS_ART_PROGRESS_REVALIDATED',JSON.stringify(r));
  assert.equal(r.acceptedPairs,2);
  assert.equal(r.acceptedPng,4);
  assert.equal(r.remainingPairs,23);
  assert.equal(r.remainingPng,46);
  assert.equal(r.releaseReady,false);
  assert.equal(r.finalEpisodeAcceptance,'NOT_VERIFIED');
  assert.deepEqual(fs.readFileSync(path.join(x.project,x.indexPath)),before);
  assert.equal(fs.existsSync(path.join(x.project,'.ceos-runs')),false);
});

test('actual PNG drift never counts a formerly accepted batch',t=>{
  const x=fixture(t);
  fs.appendFileSync(path.join(x.project,x.images[0].path),'change');
  const r=inspectArtProgress(x.project,x.indexPath);
  assert.equal(r.status,'BLOCKED_ART_PROGRESS');
  assert.equal(r.acceptedPairs,0);
  assert.ok(r.problems.some(x=>x.includes('HASH_MISMATCH')));
});

test('source dependencies changing invalidate historical acceptance',t=>{
  const x=fixture(t);
  fs.appendFileSync(path.join(x.project,x.dep),'new dialogue');
  const r=inspectArtProgress(x.project,x.indexPath);
  assert.equal(r.status,'BLOCKED_ART_PROGRESS');
  assert.equal(r.acceptedPairs,0);
  assert.equal(r.acceptedPng,0);
  assert.equal(r.remainingPairs,25);
  assert.equal(r.remainingPng,50);
  assert.ok(r.problems.some(x=>x.startsWith('PLAN_DEPENDENCY_')));
});

test('scope shrinkage and evidence omissions are never interpreted as PASS',t=>{
  const x=fixture(t);
  x.index.batches[0].pairs=['S22'];
  x.saveIndex();
  assert.equal(inspectArtProgress(x.project,x.indexPath).acceptedPairs,0);
  x.index.batches[0].pairs=['S22','S23'];
  x.saveIndex();
  x.updateReceipt(receipt=>({...receipt,pixels:{...receipt.pixels,
    assets:receipt.pixels.assets.filter(a=>a.id!=='S22-landscape')}}));
  const result=inspectArtProgress(x.project,x.indexPath);
  assert.equal(result.acceptedPairs,0);
  assert.ok(result.problems.some(x=>x.includes('MISSING_ACCEPTED_FORMAT')));
});

test('duplicate accepted pairs are not counted twice',t=>{
  const x=fixture(t);
  x.index.batches.push({...x.index.batches[0],id:'duplicate'});
  x.saveIndex();
  const r=inspectArtProgress(x.project,x.indexPath);
  assert.equal(r.status,'BLOCKED_ART_PROGRESS');
  assert.ok(r.problems.some(x=>x.includes('DUPLICATE_PAIR')||x.includes('RECEIPT_DUPLICATED')));
});

test('runtime screenshot tampering is caught without rewriting the original receipt',t=>{
  const x=fixture(t);
  fs.appendFileSync(path.join(x.project,x.captures[0].screenshot),'changed');
  const r=inspectArtProgress(x.project,x.indexPath);
  assert.equal(r.status,'BLOCKED_ART_PROGRESS');
  assert.equal(r.acceptedPairs,0);
  assert.ok(r.problems.some(x=>x.includes('SCREENSHOT')));
});

test('old runtime or missing reviewed runtime pixel cannot count as accepted',t=>{
  const x=fixture(t);
  x.updateReceipt(receipt=>({...receipt,
    reviewedItems:receipt.reviewedItems.filter(item=>item.id!=='S22-mobile-runtime')}));
  const r=inspectArtProgress(x.project,x.indexPath);
  assert.equal(r.acceptedPairs,0);
  assert.ok(r.problems.some(code=>code.includes('RUNTIME_REVIEW_MISSING')));
});

test('CLI art-progress is read-only and fails closed for unsafe index paths',t=>{
  const x=fixture(t);
  const cli=path.join(root,'bin','ceos.mjs');
  const run=(index)=>spawnSync(process.execPath,[cli,'art-progress','--project',x.project,'--index',index,'--json'],
    {cwd:x.project,encoding:'utf8',timeout:30000});
  const good=run(x.indexPath);
  assert.equal(good.status,0,good.stderr);
  assert.equal(JSON.parse(good.stdout).acceptedPairs,2);
  const unsafe=run('../outside.json');
  assert.equal(unsafe.status,2,unsafe.stderr);
  assert.equal(JSON.parse(unsafe.stdout).status,'BLOCKED_ART_PROGRESS');
});
