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
import { createRun, recordRoutingTrace } from '../src/execution-engine.mjs';

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
    webHighAcceptance:{status:'PASS',reviewTraceId:'fixture-web-high',taskId:'fixture-web-task',sourceHead,
      evidenceRefs:['fixture-pixels'],receivedEvidenceRefs:['fixture-pixels'],
      actualPixelsReceived:true},
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

function addIndependentBatch(x,pairs,id) {
  const replace = value => {
    if (typeof value === 'string') return value.replaceAll('S22','S24').replaceAll('S23','S25');
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,replace(item)]));
    return value;
  };
  const sourceReceipt=JSON.parse(fs.readFileSync(path.join(x.project,x.receiptPath),'utf8'));
  const sourceRuntime=JSON.parse(fs.readFileSync(path.join(x.project,'artifacts/runtime.json'),'utf8'));
  const receipt=replace(sourceReceipt);
  receipt.scope=[{sceneId:'ep2_c',pair:pairs[0]},{sceneId:'ep2_d',pair:pairs[1]}];
  receipt.webHighAcceptance={...receipt.webHighAcceptance,reviewTraceId:'fixture-web-high-2'};
  const captures=[];
  for (const [from,to] of [['S22',pairs[0]],['S23',pairs[1]]]) {
    for (const format of ['portrait','landscape']) {
      const source=`assets/${from}-${format}.png`,target=`assets/${to}-${format}.png`;
      fs.copyFileSync(path.join(x.project,source),path.join(x.project,target));
      const shot=`artifacts/screenshots/${to}-${format}.png`;
      fs.copyFileSync(path.join(x.project,`artifacts/screenshots/${from}-${format}.png`),path.join(x.project,shot));
      const asset=receipt.pixels.assets.find(item=>item.id===`${to}-${format}`);
      asset.path=target; asset.sha256=sha(fs.readFileSync(path.join(x.project,target)));
      const capture={tag:to,assetFormat:format,noHorizontalOverflow:true,noVerticalOverflow:true,
        screenshot:shot,screenshotSha256:sha(fs.readFileSync(path.join(x.project,shot)))};
      captures.push(capture);
      receipt.reviewedItems.push({id:`${to}-${format}`,status:'PASS'});
    }
    for (const platform of ['desktop','mobile']) receipt.reviewedItems.push({id:`${to}-${platform}-runtime`,status:'PASS'});
  }
  receipt.pixels.runtimeEvidence='artifacts/runtime-2.json';
  const runtimeHash=json(x.project,'artifacts/runtime-2.json',{...sourceRuntime,captures});
  const receiptPath='artifacts/acceptance-2.json';
  const receiptHash=json(x.project,receiptPath,receipt);
  x.index.batches.push({id,pairs,receipt:{path:receiptPath,sha256:receiptHash},runtimeSha256:runtimeHash});
  x.saveIndex();
}

function legacyLedgerFixture(t,{missingWeb=false}={}) {
  const project=fs.mkdtempSync(path.join(os.tmpdir(),'ceos-stage9-ledger-'));
  t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
  const sourceHead='a'.repeat(40);
  const dependency='narrative/graph.json';
  const dependencyHash=write(project,dependency,Buffer.from('{"scene":"S19"}\n'));
  const png=encodeProductionPng({width:16,height:16,pixels:Buffer.alloc(16*16*4,128)});
  const portrait='assets/S19-portrait.png',landscape='assets/S19-landscape.png';
  const portraitHash=write(project,portrait,png),landscapeHash=write(project,landscape,png);
  const manifest='artifacts/manifest.json',mechanical='artifacts/mechanical.json';
  const manifestHash=json(project,manifest,{schemaVersion:1,assets:[portrait,landscape]});
  const mechanicalHash=json(project,mechanical,{status:'PASS_ART_BATCH_MECHANICAL'});
  const web='artifacts/web-high.json',runtime='artifacts/runtime.json';
  const webHash=missingWeb ? 'f'.repeat(64) : json(project,web,{
    status:'PASS',reviewTraceId:'web-s19',taskId:'web-task-s19',sourceHead,reviewedItems:['S19'],
    evidenceRefs:['S19-pixels'],receivedEvidenceRefs:['S19-pixels'],actualPixelsReceived:true
  });
  const runtimeHash=json(project,runtime,{status:'PASS_RUNTIME',sourceHead,captures:[]});
  const ledgerPath='artifacts/STAGE9_4_ACCEPTANCE_LEDGER.json';
  json(project,ledgerPath,{
    schemaVersion:1,kind:'STAGE9_4_SOURCE_BOUND_ACCEPTANCE_LEDGER',currentHead:sourceHead,
    currentness:{mode:'DEPENDENCY_BASED_REUSE',productInputsUnchanged:true},
    progress:{plannedPairs:2,plannedPngs:4,acceptedPairs:1,acceptedPngs:2,acceptedPairIds:['S19']},
    dependencyEvidence:[{path:dependency,sha256:dependencyHash}],
    mechanicalRevalidation:{status:'PASS_ART_BATCH_MECHANICAL',manifest,manifestSha256:manifestHash,receipt:mechanical,receiptSha256:mechanicalHash},
    groups:[{pairs:['S19'],webReceipt:{path:web,sha256:webHash},runtimeReceipt:{path:runtime,sha256:runtimeHash},pairsDetail:[{id:'S19',assets:[
      {path:portrait,bytes:fs.statSync(path.join(project,portrait)).size,sha256:portraitHash,dimensions:'16x16'},
      {path:landscape,bytes:fs.statSync(path.join(project,landscape)).size,sha256:landscapeHash,dimensions:'16x16'}
    ]}]}],
    boundary:{episodeFinalAcceptance:false,releaseReady:false}
  });
  return {project,ledgerPath};
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

test('visual-content batch receipt is accepted only through its linked scope-locked CEOS run',t=>{
  const x=fixture(t);
  const run=createRun(x.project,'production-art',{
    scope:{target:'S22-S23 existing art acceptance',inScope:['ep2_a','ep2_b'],outOfScope:['release'],
      acceptanceContract:'independent NARRATIVE_ART_ACCEPTANCE_V2 pixel review',mutationBoundary:'existing assets only'},
    capabilities:{web:{status:'READY',ready:true},imageGeneration:{capabilityPresence:'ABSENT',generationAllowed:false},
      filesystem:{exists:true,readable:true,writable:true}},
    webRequired:true,webReviewMode:'enhanced',webReviewAssurance:'visual-content',artMode:'VERIFIED_EXISTING_ART_REUSE'
  }).run;
  const refs=[],visualEvidence=[];
  for(const asset of x.images){
    refs.push(asset.id);
    visualEvidence.push({ref:asset.id,path:asset.path,sha256:asset.sha256,
      observation:`The ${asset.id} source pixels show the authored characters and action in the correct CG format.`});
  }
  for(const [index,capture] of x.captures.entries()){
    const ref=`${capture.tag}-${capture.assetFormat}-runtime-${index}`;
    refs.push(ref);
    visualEvidence.push({ref,path:capture.screenshot,sha256:capture.screenshotSha256,
      observation:`The ${capture.tag} runtime pixels preserve the matching ${capture.assetFormat} scene composition and readable dialogue area.`});
  }
  const reviewPath=`.ceos-runs/${run.runId}/evidence/acceptance-review.json`;
  const review={schemaVersion:1,phase:'acceptance',agent:'ceos_art_director_web',sourceHead:'a'.repeat(40),status:'PASS',
    artAcceptanceProfile:'NARRATIVE_ART_ACCEPTANCE_V2',reviewedItems:refs,evidenceRefs:refs,receivedEvidenceRefs:[...refs],
    actualPixelsReceived:true,decision:'Every scoped image and runtime frame was received and visually inspected; no blocking findings remain.',
    findings:[],unresolved:[],visualEvidence,evidenceArtifact:reviewPath};
  json(x.project,reviewPath,review);
  recordRoutingTrace(x.project,run.runId,{webReview:review});
  x.updateReceipt(receipt=>({...receipt,webHighAcceptance:review}));

  const result=inspectArtProgress(x.project,x.indexPath);
  assert.equal(result.status,'PASS_ART_PROGRESS_REVALIDATED',JSON.stringify(result));
  assert.equal(result.acceptedPairs,2);
  assert.equal(result.acceptedPng,4);
  assert.equal(result.finalEpisodeAcceptance,'NOT_VERIFIED');
});

test('actual PNG drift never counts a formerly accepted batch',t=>{
  const x=fixture(t);
  fs.appendFileSync(path.join(x.project,x.images[0].path),'change');
  const r=inspectArtProgress(x.project,x.indexPath);
  assert.equal(r.status,'BLOCKED_ART_PROGRESS');
  assert.equal(r.acceptedPairs,0);
  assert.ok(r.problems.some(x=>x.includes('HASH_MISMATCH')));
});

test('historical ledger dependency drift is reported with old/current SHA without rewriting acceptance',t=>{
  const x=legacyLedgerFixture(t);
  const ledger=JSON.parse(fs.readFileSync(path.join(x.project,x.ledgerPath),'utf8'));
  const source='narrative/graph.json';
  const before=fs.readFileSync(path.join(x.project,x.ledgerPath));
  fs.writeFileSync(path.join(x.project,source),'{"scene":"S19","addedMapping":"S24"}\\n');
  const result=inspectArtProgress(x.project,x.ledgerPath);
  assert.equal(result.status,'BLOCKED_ART_PROGRESS');
  assert.equal(result.acceptedPairs,0);
  assert.ok(result.problems.includes('DEPENDENCY_0_HASH_MISMATCH'));
  assert.equal(result.revalidation.status,'REVALIDATION_REQUIRED');
  assert.deepEqual(result.staleDependencies,[{
    index:0,path:source,previousSha256:ledger.dependencyEvidence[0].sha256,
    currentSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(x.project,source))).digest('hex'),
    status:'HISTORICAL_DEPENDENCY_DRIFT_REVALIDATION_REQUIRED'
  }]);
  assert.deepEqual(fs.readFileSync(path.join(x.project,x.ledgerPath)),before);
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

test('independent receipts accumulate project progress without repeating accepted pairs',t=>{
  const x=fixture(t);
  addIndependentBatch(x,['S24','S25'],'ep2-s24-s25');
  const r=inspectArtProgress(x.project,x.indexPath);
  assert.equal(r.status,'PASS_ART_PROGRESS_REVALIDATED',JSON.stringify(r));
  assert.equal(r.acceptedPairs,4);
  assert.equal(r.acceptedPng,8);
  assert.equal(r.remainingPairs,21);
  assert.equal(r.batches.length,2);
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

test('missing independent Web High acceptance cannot count a mechanically valid batch',t=>{
  const x=fixture(t);
  x.updateReceipt(receipt=>{
    const next={...receipt};
    delete next.webHighAcceptance;
    return next;
  });
  const r=inspectArtProgress(x.project,x.indexPath);
  assert.equal(r.status,'BLOCKED_ART_PROGRESS');
  assert.equal(r.acceptedPairs,0);
  assert.ok(r.problems.some(code=>code.includes('INDEPENDENT_WEB_HIGH_MISSING')));
});

test('legacy source-bound Stage 9 ledger accumulates accepted pairs only from revalidated receipts',t=>{
  const x=legacyLedgerFixture(t);
  const r=inspectArtProgress(x.project,x.ledgerPath);
  assert.equal(r.status,'PASS_ART_PROGRESS_REVALIDATED',JSON.stringify(r));
  assert.equal(r.acceptanceSource,'STAGE9_4_SOURCE_BOUND_ACCEPTANCE_LEDGER');
  assert.equal(r.acceptedPairs,1);
  assert.equal(r.acceptedPng,2);
  assert.equal(r.remainingPairs,1);
  assert.equal(r.releaseReady,false);
});

test('legacy source-bound Stage 9 ledger does not promote missing Web High evidence',t=>{
  const x=legacyLedgerFixture(t,{missingWeb:true});
  const r=inspectArtProgress(x.project,x.ledgerPath);
  assert.equal(r.status,'BLOCKED_ART_PROGRESS');
  assert.equal(r.declaredAcceptedPairs,1);
  assert.equal(r.acceptedPairs,0);
  assert.ok(r.problems.some(code=>code.includes('WEB_HIGH')));
  assert.equal(r.releaseReady,false);
});

test('source-bound progress cannot self-promote to Release PASS',t=>{
  const x=legacyLedgerFixture(t);
  const ledger=JSON.parse(fs.readFileSync(path.join(x.project,x.ledgerPath),'utf8'));
  ledger.boundary.releaseReady=true;
  json(x.project,x.ledgerPath,ledger);
  const r=inspectArtProgress(x.project,x.ledgerPath);
  assert.equal(r.status,'BLOCKED_ART_PROGRESS');
  assert.ok(r.problems.includes('RELEASE_PROMOTION_FORBIDDEN'));
  assert.equal(r.releaseReady,false);
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
