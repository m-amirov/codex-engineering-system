import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { inspectNativeProducerRoute } from '../src/native-producer-routing.mjs';
import { preflightNativeProducerRoute } from '../src/execution-engine.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRun, recordCheckpoint, refreshRunCapabilities } from '../src/execution-engine.mjs';
import { beginCapabilityChallenge, respondCapabilityChallenge } from '../src/capability-attestation.mjs';
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
function createNovel(t, { attest = true } = {}) {
  const x=setup(t), game=path.join(x.root,'game');
  fs.mkdirSync(path.join(game,'config'),{recursive:true});
  fs.mkdirSync(path.join(game,'narrative'),{recursive:true});
  fs.writeFileSync(path.join(game,'config','narrative-game.local.json'),JSON.stringify({profile:'narrative-game',enabled:true,modelPath:'narrative/graph.json'}));
  fs.writeFileSync(path.join(game,'narrative','graph.json'),JSON.stringify({scenes:[{id:'S01',episode:1}]}));
  const prev=process.env.CODEX_HOME;
  process.env.CODEX_HOME=x.home;
  fs.writeFileSync(path.join(x.home,'ceos','runtime','current-session.json'),
    JSON.stringify({sessionId:x.parent,cwd:game,observedAt:new Date().toISOString()}));
  fs.writeFileSync(path.join(x.home,'ceos','runtime','current-turn.json'),
    JSON.stringify({sessionId:x.parent,turnId:'turn-route',cwd:game,observedAt:new Date().toISOString()}));
  t.after(()=>{if(prev===undefined)delete process.env.CODEX_HOME; else process.env.CODEX_HOME=prev;});
  const caps={
    imageGeneration:{trustedForGeneration:true,capabilityPresence:'PRESENT',generationAllowed:true},
    web:{status:'NOT_CONFIGURED'},project:{},executables:{},filesystem:{exists:true,readable:true,writable:true}
  };
  const run=createRun(game,'production-art',{scope:{
    target:'EP1 production art',inScope:['S01'],outOfScope:[],
    acceptanceContract:'complete',mutationBoundary:'art'
  },capabilities:caps});
  fs.writeFileSync(path.join(game,'evidence.json'),'{}');
  recordCheckpoint(game,run.run.runId,{stage:'INVENTORIED',artifacts:['evidence.json']});
  recordCheckpoint(game,run.run.runId,{stage:'CANON_READY',artifacts:['evidence.json']});
  if (attest) {
    const challenge=beginCapabilityChallenge(game,run.run.runId,{codexHome:x.home});
    const answer=respondCapabilityChallenge(game,run.run.runId,{
      codexHome:x.home,challengeId:challenge.challengeId,nonce:challenge.nonce,
      presence:'PRESENT',serviceAvailability:'UNKNOWN'
    });
    refreshRunCapabilities(game,run.run.runId,{
      ...caps,imageGeneration:{...caps.imageGeneration,
        attestationFile:answer.file,trustScope:'run-session-turn'}
    });
  }
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
  assert.equal(x.run.run.producerParentSessionId,null);
  assert.equal(x.run.run.producerBindingMode,'CURRENT_TURN');
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


test('new narrative art run can reach CANON_READY without any trusted session at creation',t=>{
  const x=createNovel(t,{attest:false});
  assert.equal(x.run.run.producerParentSessionId,null);
  assert.equal(x.run.run.producerBindingMode,'CURRENT_TURN');
  const outputs=generatedOutput(x.game);
  assert.throws(()=>recordCheckpoint(x.game,x.runId,{
    stage:'GENERATING',artifacts:['evidence.json'],
    metadata:{...outputs,producerTraceFile:x.trace}
  }),/BLOCKED_GENERATION_CURRENT_TURN_UNVERIFIED/);
});

test('generation permits same-session follow-up turn but refuses other session and child parent',t=>{
  const x=createNovel(t);
  const outputs=generatedOutput(x.game);
  const sessionFile=path.join(x.home,'ceos','runtime','current-session.json');
  const turnFile=path.join(x.home,'ceos','runtime','current-turn.json');
  const priorSession=fs.readFileSync(sessionFile,'utf8');
  const priorTurn=fs.readFileSync(turnFile,'utf8');
  fs.writeFileSync(turnFile,JSON.stringify({
    sessionId:x.parent,turnId:'new-turn',cwd:x.game,observedAt:new Date().toISOString()
  }));
  const followup=preflightNativeProducerRoute(x.game,x.runId,x.trace,{codexHome:x.home});
  assert.equal(followup.status,'PASS_NATIVE_AGENT_ROUTE_HOST_OBSERVED',JSON.stringify(followup));
  fs.writeFileSync(turnFile,priorTurn);
  fs.writeFileSync(sessionFile,JSON.stringify({
    sessionId:'unrelated-parent',cwd:x.game,observedAt:new Date().toISOString()
  }));
  fs.writeFileSync(turnFile,JSON.stringify({
    sessionId:'unrelated-parent',turnId:'unrelated-turn',cwd:x.game,observedAt:new Date().toISOString()
  }));
  assert.throws(()=>recordCheckpoint(x.game,x.runId,{
    stage:'GENERATING',artifacts:['evidence.json'],
    metadata:{...outputs,producerTraceFile:x.trace}
  }),/BLOCKED_GENERATION_CURRENT_TURN_UNVERIFIED/);
  fs.writeFileSync(sessionFile,priorSession);
  fs.writeFileSync(turnFile,priorTurn);
  // Live challenge alone cannot authorize a child from another parent.
  x.write({parentId:'unrelated-parent'});
  assert.throws(()=>recordCheckpoint(x.game,x.runId,{
    stage:'GENERATING',artifacts:['evidence.json'],
    metadata:{...outputs,producerTraceFile:x.trace}
  }),/BLOCKED_NATIVE_AGENT_PARENT_MISMATCH/);
  x.write();
  const success=recordCheckpoint(x.game,x.runId,{
    stage:'GENERATING',artifacts:['evidence.json'],
    metadata:{...outputs,producerTraceFile:x.trace}
  });
  assert.equal(success.integrity.ok,true);
  const checkpointDir=path.join(x.run.runDir,'checkpoints');
  const generatingFile=fs.readdirSync(checkpointDir).find(name=>name.endsWith('-generating.json'));
  const evidence=JSON.parse(fs.readFileSync(path.join(checkpointDir,generatingFile),'utf8'));
  assert.ok(evidence.artifacts.some(a=>/capability-attestation[\\/]+attestations[\\/]+cap-[a-f0-9]{20}\.json$/.test(a.path)));
});

test('generic production-art runs are unaffected by novel-only routing gate',t=>{
  const x=setup(t),game=path.join(x.root,'ordinary');
  fs.mkdirSync(game);
  const caps={imageGeneration:{trustedForGeneration:true,capabilityPresence:'PRESENT',generationAllowed:true},web:{status:'NOT_CONFIGURED'},filesystem:{exists:true,readable:true,writable:true}};
  const run=createRun(game,'production-art',{scope:{target:'generic asset',inScope:['art'],outOfScope:[],acceptanceContract:'generated',mutationBoundary:'art'},capabilities:caps});
  assert.equal(run.run.nativeProducerRouteRequired,false);
});


function appendRolloutPadding(file, count = 34) {
  // Reuse one 1-MiB JSONL record to exceed the historical 32-MiB cap
  // without allocating the entire test trace in RAM.
  const line = JSON.stringify({type:'event_msg',payload:{text:'x'.repeat(1024 * 1024)}}) + '\n';
  const fd = fs.openSync(file, 'a');
  try {
    for (let i = 0; i < count; i++) fs.writeSync(fd, line);
  } finally { fs.closeSync(fd); }
}

test('genuine 35+ MiB producer rollout passes and hashes ALL original bytes', t => {
  const x = setup(t);
  appendRolloutPadding(x.trace);
  assert.ok(fs.statSync(x.trace).size > 32 * 1024 * 1024);
  const result = inspectNativeProducerRoute(x.trace, {codexHome:x.home,parentSessionId:x.parent});
  assert.equal(result.status, 'PASS_NATIVE_AGENT_ROUTE_HOST_OBSERVED');
  assert.equal(result.traceSha256, crypto.createHash('sha256').update(fs.readFileSync(x.trace)).digest('hex'));
  assert.equal(result.agentId, x.child);
});

test('a wrong late turn context in a >32 MiB rollout is still rejected', t => {
  const x = setup(t);
  appendRolloutPadding(x.trace);
  fs.appendFileSync(x.trace, JSON.stringify({type:'turn_context',payload:{model:'gpt-5.6-sol',effort:'medium'}}) + '\n');
  assert.equal(inspectNativeProducerRoute(x.trace,{codexHome:x.home,parentSessionId:x.parent}).status,
    'BLOCKED_NATIVE_AGENT_MODEL_MISMATCH');
});

test('malformed late JSONL is rejected even when the header and model are valid', t => {
  const x = setup(t);
  appendRolloutPadding(x.trace);
  fs.appendFileSync(x.trace, '{bad-json}\n');
  assert.equal(inspectNativeProducerRoute(x.trace,{codexHome:x.home,parentSessionId:x.parent}).status,
    'BLOCKED_NATIVE_AGENT_TRACE_INVALID');
});

test('multiple session_meta records remain untrusted', t => {
  const x = setup(t);
  fs.appendFileSync(x.trace, JSON.stringify({type:'session_meta',payload:{id:'child-spoofed',source:{subagent:{thread_spawn:{agent_role:'ceos_asset_generator',parent_thread_id:x.parent}}}}}) + '\n');
  assert.equal(inspectNativeProducerRoute(x.trace,{codexHome:x.home,parentSessionId:x.parent}).status,
    'BLOCKED_NATIVE_AGENT_TRACE_INCOMPLETE');
});

test('oversized sparse rollout and unbounded JSONL record fail closed', t => {
  const x = setup(t);
  fs.truncateSync(x.trace, 513 * 1024 * 1024); // sparse: no 513 MiB test fixture allocation
  assert.equal(inspectNativeProducerRoute(x.trace,{codexHome:x.home,parentSessionId:x.parent}).status,
    'BLOCKED_NATIVE_AGENT_TRACE_INVALID');
  x.write();
  fs.truncateSync(x.trace, 65 * 1024 * 1024); // single record >64 MiB, no newline
  assert.equal(inspectNativeProducerRoute(x.trace,{codexHome:x.home,parentSessionId:x.parent}).status,
    'BLOCKED_NATIVE_AGENT_TRACE_INVALID');
});

test('CRLF, large records across read chunks and UTF-8 remain supported', t => {
  const x = setup(t);
  const record = JSON.stringify({type:'event_msg',payload:{text:'É'.repeat(40_000)}});
  fs.appendFileSync(x.trace, record + '\r\n');
  const result = inspectNativeProducerRoute(x.trace,{codexHome:x.home,parentSessionId:x.parent});
  assert.equal(result.status,'PASS_NATIVE_AGENT_ROUTE_HOST_OBSERVED');
});

test('CURRENT_TURN route CLI resolves parent through trusted run-scoped attestation, without modifying run',t=>{
  const x=createNovel(t);
  assert.equal(x.run.run.producerParentSessionId,null);
  const original=fs.readFileSync(path.join(x.run.runDir,'run.json'),'utf8');
  const route=preflightNativeProducerRoute(x.game,x.runId,x.trace,{codexHome:x.home});
  assert.equal(route.status,'PASS_NATIVE_AGENT_ROUTE_HOST_OBSERVED',JSON.stringify(route));
  assert.equal(route.parentSessionId,x.parent);
  assert.equal(route.bindingMode,'CURRENT_TURN');
  assert.match(route.attestationFile,/capability-attestation[\\/]+attestations[\\/]+cap-[a-f0-9]{20}\.json$/);
  const cli=fileURLToPath(new URL('../bin/ceos.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[cli,'producer-route-check',x.runId,
    '--project',x.game,'--trace',x.trace,'--codex-home',x.home,'--json'],{
    cwd:x.game,encoding:'utf8',env:{...process.env,CODEX_HOME:x.home}
  });
  assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
  const parsed=JSON.parse(result.stdout);
  assert.equal(parsed.status,'PASS_NATIVE_AGENT_ROUTE_HOST_OBSERVED');
  assert.equal(parsed.parentSessionId,x.parent);
  assert.equal(parsed.bindingMode,'CURRENT_TURN');
  assert.equal(fs.readFileSync(path.join(x.run.runDir,'run.json'),'utf8'),original);
});

test('CURRENT_TURN producer CLI refuses absent or stale attestation without borrowing parent',t=>{
  const x=createNovel(t,{attest:false});
  assert.equal(preflightNativeProducerRoute(x.game,x.runId,x.trace,{codexHome:x.home}).status,
    'BLOCKED_GENERATION_CURRENT_TURN_UNVERIFIED');
  const challenge=beginCapabilityChallenge(x.game,x.runId,{codexHome:x.home});
  const response=respondCapabilityChallenge(x.game,x.runId,{
    codexHome:x.home,challengeId:challenge.challengeId,nonce:challenge.nonce,
    presence:'PRESENT',serviceAvailability:'UNKNOWN'
  });
  // Attestation without a matching persisted capability refresh is not a grant.
  assert.equal(preflightNativeProducerRoute(x.game,x.runId,x.trace,{codexHome:x.home}).status,
    'BLOCKED_GENERATION_CURRENT_TURN_UNVERIFIED');
  const stored=JSON.parse(fs.readFileSync(path.join(x.run.runDir,'capabilities.json'),'utf8'));
  refreshRunCapabilities(x.game,x.runId,{
    ...stored,imageGeneration:{...stored.imageGeneration,
      trustedForGeneration:true,capabilityPresence:'PRESENT',generationAllowed:true,
      attestationFile:response.file,trustScope:'run-session-turn'}
  });
  assert.equal(preflightNativeProducerRoute(x.game,x.runId,x.trace,{codexHome:x.home}).status,
    'PASS_NATIVE_AGENT_ROUTE_HOST_OBSERVED');
  const currentTurn=path.join(x.home,'ceos','runtime','current-turn.json');
  fs.writeFileSync(currentTurn,JSON.stringify({
    sessionId:x.parent,turnId:'another-turn',cwd:x.game,observedAt:new Date().toISOString()
  }));
  assert.equal(preflightNativeProducerRoute(x.game,x.runId,x.trace,{codexHome:x.home}).status,
    'PASS_NATIVE_AGENT_ROUTE_HOST_OBSERVED');
});

test('CURRENT_TURN producer CLI still rejects an unrelated Terra child parent',t=>{
  const x=createNovel(t);
  x.write({parentId:'unrelated-parent'});
  const route=preflightNativeProducerRoute(x.game,x.runId,x.trace,{codexHome:x.home});
  assert.equal(route.status,'BLOCKED_NATIVE_AGENT_PARENT_MISMATCH',JSON.stringify(route));
});

test('CURRENT_TURN null stored parent does not cause a second producer parent mismatch',t=>{
  const x=createNovel(t);
  const persisted=JSON.parse(fs.readFileSync(path.join(x.run.runDir,'run.json'),'utf8'));
  assert.equal(persisted.producerBindingMode,'CURRENT_TURN');
  assert.equal(persisted.producerParentSessionId,null);
  // A legacy low-level attempt cannot authorize a route from null.
  const low=inspectNativeProducerRoute(x.trace,{
    codexHome:x.home,parentSessionId:persisted.producerParentSessionId
  });
  assert.equal(low.status,'BLOCKED_NATIVE_AGENT_PARENT_UNVERIFIED');
  assert.match(low.detail,/producer-route-check/);
  // The authoritative parent-aware preflight verifies a true Terra child.
  const checked=preflightNativeProducerRoute(x.game,x.runId,x.trace,{codexHome:x.home});
  assert.equal(checked.status,'PASS_NATIVE_AGENT_ROUTE_HOST_OBSERVED',JSON.stringify(checked));
  assert.equal(checked.bindingMode,'CURRENT_TURN');
  assert.equal(checked.parentSessionId,x.parent);
  assert.equal(checked.agentRole,'ceos_asset_generator');
  assert.equal(checked.actualModel,'gpt-5.6-terra');
  assert.equal(checked.actualEffort,'medium');
  // Same official gate still rejects a truly unrelated parent.
  x.write({parentId:'different-parent'});
  const bad=preflightNativeProducerRoute(x.game,x.runId,x.trace,{codexHome:x.home});
  assert.equal(bad.status,'BLOCKED_NATIVE_AGENT_PARENT_MISMATCH');
});

test('historical pinned-parent producer route remains supported without new attestation',t=>{
  const x=createNovel(t,{attest:false});
  const runFile=path.join(x.run.runDir,'run.json');
  const run=JSON.parse(fs.readFileSync(runFile,'utf8'));
  run.producerBindingMode=null;
  run.producerParentSessionId=x.parent;
  fs.writeFileSync(runFile,JSON.stringify(run,null,2)+'\n');
  const result=preflightNativeProducerRoute(x.game,x.runId,x.trace,{codexHome:x.home});
  assert.equal(result.status,'PASS_NATIVE_AGENT_ROUTE_HOST_OBSERVED',JSON.stringify(result));
  assert.equal(result.bindingMode,'PINNED_PARENT');
  assert.equal(result.parentSessionId,x.parent);
});
