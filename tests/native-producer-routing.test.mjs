import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectNativeProducerRoute } from '../src/native-producer-routing.mjs';
import { createRun,recordCheckpoint } from '../src/execution-engine.mjs';
import { encodeProductionPng } from '../src/art-output-gate.mjs';

function setup(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ceos-terra-route-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const home=path.join(root,'codex');
  const sessions=path.join(home,'sessions','2026','10','14');
  fs.mkdirSync(sessions,{recursive:true});
  fs.mkdirSync(path.join(home,'ceos','runtime'),{recursive:true});
  const parent='parent-123', child='child-456';
  fs.writeFileSync(path.join(home,'ceos','runtime','current-session.json'), JSON.stringify({sessionId:parent}));
  const trace=path.join(sessions,'rollout-2026-10-14T12-00-00-child-456.jsonl');
  function write({role='ceos_asset_generator',model='gpt-5.6-terra',effort='medium',parentId=parent,childId=child}={}) {
    const records=[
      {type:'session_meta',payload:{id:childId,source:{subagent:{thread_spawn:{parent_thread_id:parentId,agent_role:role}}}}},
      {type:'turn_context',payload:{model,effort}}
    ];
    fs.writeFileSync(trace,records.map(x=>JSON.stringify(x)).join('\n')+'\n');
  }
  write();
  return {root,home,parent,child,trace,write};
}
function createNovel(t) {
  const x=setup(t), game=path.join(x.root,'game');
  fs.mkdirSync(path.join(game,'config'),{recursive:true});
  fs.mkdirSync(path.join(game,'narrative'),{recursive:true});
  fs.writeFileSync(path.join(game,'config','narrative-game.local.json'),JSON.stringify({profile:'narrative-game',enabled:true,modelPath:'narrative/graph.json'}));
  fs.writeFileSync(path.join(game,'narrative','graph.json'),JSON.stringify({scenes:[{id:'S01',episode:1}]}));
  const prev=process.env.CODEX_HOME;
  process.env.CODEX_HOME=x.home;
  t.after(()=>{if(prev===undefined)delete process.env.CODEX_HOME; else process.env.CODEX_HOME=prev;});
  const caps={
    imageGeneration:{trustedForGeneration:true,capabilityPresence:'PRESENT',generationAllowed:true},
    web:{status:'NOT_CONFIGURED'},project:{},executables:{},filesystem:{}
  };
  const run=createRun(game,'production-art',{scope:{
    target:'EP1 production art',inScope:['S01'],outOfScope:[],
    acceptanceContract:'complete',mutationBoundary:'art'
  },capabilities:caps});
  fs.writeFileSync(path.join(game,'evidence.json'),'{}');
  recordCheckpoint(game,run.run.runId,{stage:'INVENTORIED',artifacts:['evidence.json']});
  recordCheckpoint(game,run.run.runId,{stage:'CANON_READY',artifacts:['evidence.json']});
  return {...x,game,runId:run.run.runId,run};
}
function generatedOutput(game) {
  const pixels=Buffer.alloc(16*16*4);
  for(let y=4;y<12;y++)for(let x=4;x<12;x++)pixels.set([150,90,30,255],(y*16+x)*4);
  fs.writeFileSync(path.join(game,'produced.png'),encodeProductionPng({width:16,height:16,pixels}));
  return {producerTraceFile:null,artOutputs:[{path:'produced.png',kind:'sprite',width:16,height:16}]};
}

test('real host rollout binds custom Terra role/model to a separate child session',t=>{
  const x=setup(t);
  const result=inspectNativeProducerRoute(x.trace,{codexHome:x.home,parentSessionId:x.parent});
  assert.equal(result.ok,true);
  assert.equal(result.actualModel,'gpt-5.6-terra');
  assert.equal(result.actualEffort,'medium');
  assert.equal(result.agentRole,'ceos_asset_generator');
  assert.equal(result.evidenceAssurance,'host-observed-local-jsonl-not-provider-signed');
  assert.equal(result.generationCapability,'NOT_VERIFIED');
});

test('task_name-only generic child inherits parent model and is rejected',t=>{
  const x=setup(t);
  x.write({role:null,model:'gpt-5.6-sol',effort:'ultra'});
  assert.equal(inspectNativeProducerRoute(x.trace,{codexHome:x.home,parentSessionId:x.parent}).status,'BLOCKED_NATIVE_AGENT_ROLE_MISMATCH');
  x.write({role:'ceos_asset_generator',model:'gpt-5.6-sol',effort:'ultra'});
  assert.equal(inspectNativeProducerRoute(x.trace,{codexHome:x.home,parentSessionId:x.parent}).status,'BLOCKED_NATIVE_AGENT_MODEL_MISMATCH');
});

test('parent/self and unrelated child cannot be misreported as Terra producer',t=>{
  const x=setup(t);
  x.write({childId:x.parent});
  assert.equal(inspectNativeProducerRoute(x.trace,{codexHome:x.home,parentSessionId:x.parent}).status,'BLOCKED_NATIVE_AGENT_PARENT_MISMATCH');
  x.write({parentId:'unrelated-parent'});
  assert.equal(inspectNativeProducerRoute(x.trace,{codexHome:x.home,parentSessionId:x.parent}).status,'BLOCKED_NATIVE_AGENT_PARENT_MISMATCH');
  x.write();
});

test('untrusted external files, missing or corrupt rollouts fail closed',t=>{
  const x=setup(t);
  const outside=path.join(x.root,'claimed.jsonl');
  fs.copyFileSync(x.trace,outside);
  assert.equal(inspectNativeProducerRoute(outside,{codexHome:x.home,parentSessionId:x.parent}).status,'BLOCKED_NATIVE_AGENT_TRACE_UNTRUSTED_PATH');
  assert.equal(inspectNativeProducerRoute(x.trace,{codexHome:x.home,parentSessionId:null}).status,'BLOCKED_NATIVE_AGENT_PARENT_UNVERIFIED');
  fs.writeFileSync(x.trace,'{malformed\n');
  assert.equal(inspectNativeProducerRoute(x.trace,{codexHome:x.home,parentSessionId:x.parent}).status,'BLOCKED_NATIVE_AGENT_TRACE_INVALID');
});

test('new narrative production-art checkpoint refuses missing and generic child trace',t=>{
  const x=createNovel(t);
  assert.equal(x.run.run.nativeProducerRouteRequired,true);
  assert.equal(x.run.run.producerParentSessionId,x.parent);
  const out=generatedOutput(x.game);
  assert.throws(()=>recordCheckpoint(x.game,x.runId,{
    stage:'GENERATING',artifacts:['evidence.json'],metadata:out
  }),/BLOCKED_NATIVE_AGENT_TRACE_MISSING/);
  x.write({role:null,model:'gpt-5.6-sol',effort:'ultra'});
  assert.throws(()=>recordCheckpoint(x.game,x.runId,{
    stage:'GENERATING',artifacts:['evidence.json'],metadata:{...out,producerTraceFile:x.trace}
  }),/BLOCKED_NATIVE_AGENT_ROLE_MISMATCH/);
  x.write();
  const ok=recordCheckpoint(x.game,x.runId,{
    stage:'GENERATING',artifacts:['evidence.json'],metadata:{...out,producerTraceFile:x.trace}
  });
  assert.equal(ok.run.nextStage,'INTEGRATED');
  const dir=path.join(x.run.runDir,'checkpoints');
  const cp=JSON.parse(fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(x=>x.endsWith('-generating.json'))),'utf8'));
  assert.equal(cp.metadata.producerRouteGate.status,'PASS_NATIVE_AGENT_ROUTE_HOST_OBSERVED');
});

test('generic production-art runs are unaffected by novel-only routing gate',t=>{
  const x=setup(t),game=path.join(x.root,'ordinary');
  fs.mkdirSync(game);
  const caps={imageGeneration:{trustedForGeneration:true,capabilityPresence:'PRESENT',generationAllowed:true},web:{status:'NOT_CONFIGURED'}};
  const run=createRun(game,'production-art',{scope:{target:'generic asset',inScope:['art'],outOfScope:[],acceptanceContract:'generated',mutationBoundary:'art'},capabilities:caps});
  assert.equal(run.run.nativeProducerRouteRequired,false);
});
