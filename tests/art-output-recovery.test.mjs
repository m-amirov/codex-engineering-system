import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRun,recordCheckpoint,reopenBlockedRun,resumeRun,inspectBlockedRunRecovery} from '../src/execution-engine.mjs';
import {inspectArtOutput,encodeProductionPng} from '../src/art-output-gate.mjs';

const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function exec(project,...args){
  const out=spawnSync('git',['-C',project,...args],{encoding:'utf8'});
  assert.equal(out.status,0,out.stderr);
  return out.stdout.trim();
}
function fixture(t,{reasonOverride=null}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ceos-transport-reopen-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const project=path.join(root,'game');
  fs.mkdirSync(project,{recursive:true});
  fs.writeFileSync(path.join(project,'source.txt'),'canonical accepted narrative');
  exec(project,'init','-q');exec(project,'config','user.name','CEOS Test');
  exec(project,'config','user.email','test@example.invalid');
  exec(project,'add','source.txt');exec(project,'commit','-qm','canon-source');
  const capabilities={
    web:{status:'NOT_CONFIGURED'},
    filesystem:{exists:true,readable:true,writable:true},
    imageGeneration:{status:'unknown',capabilityPresence:'PRESENT',serviceAvailability:'unknown',
      generationAllowed:true,trustedForGeneration:true,source:'test'},
    nativeAgents:{present:[],missing:[]},project:{manifest:{available:false}},executables:{}
  };
  const created=createRun(project,'production-art',{
    scope:{target:'S24 transport repair',inScope:['art'],outOfScope:['story'],
      acceptanceContract:'real native PNG',mutationBoundary:'S24 only'},
    capabilities,maxCycles:1
  });
  const runId=created.run.runId,runDir=created.runDir;
  const artifact=(relative,data)=> {
    const file=path.join(project,relative);
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,typeof data==='string'?data:JSON.stringify(data,null,2)+'\n');
    return relative;
  };
  const manifest=artifact('manifest.json','{ "assets": [] }');
  recordCheckpoint(project,runId,{stage:'INVENTORIED',artifacts:[manifest]});
  const canon=artifact('canon.json','{ "approved": true }');
  recordCheckpoint(project,runId,{stage:'CANON_READY',artifacts:[canon]});
  const relTarget='assets/production/cg/s24-portrait.png';
  const fileTarget=path.join(project,relTarget);
  const failedReceipt='artifacts/production-art/stage9.4/output-receipts/S24-failed.json';
  const passReceipt='artifacts/production-art/stage9.4/output-receipts/S24-imported-pass.json';
  const nativeDir=path.join(root,'.codex','generated_images','native-uuid');
  fs.mkdirSync(nativeDir,{recursive:true});
  const native=path.join(nativeDir,'exec.png');
  const width=16,height=24,pixels=Buffer.alloc(width*height*4);
  for(let i=0;i<width*height;i++) {
    pixels[i*4]=50;pixels[i*4+1]=100;pixels[i*4+2]=150;pixels[i*4+3]=255;
  }
  const bytes=encodeProductionPng({width,height,pixels});
  fs.writeFileSync(native,bytes);
  const hash=sha(bytes);
  artifact(failedReceipt,{
    schemaVersion:1,path:fileTarget,kind:'background',status:'BLOCKED_ART_OUTPUT',
    issues:['ART_FILE_NOT_FOUND'],recordedAt:new Date().toISOString()
  });
  const note=reasonOverride??`BLOCKED_ART_OUTPUT: S24 portrait native PNG in native generated-images storage (16x24, SHA-256 ${hash}), copy to target ${relTarget} failed; art-output-verify returned ART_FILE_NOT_FOUND.`;
  recordCheckpoint(project,runId,{
    stage:'GENERATING',artifacts:[failedReceipt],outcome:'BLOCKED',note
  });
  const blockedCheckpoint=path.join(runDir,'checkpoints',
    String(resumeRun(project,runId).run.checkpointCount).padStart(3,'0')+'-generating.json');
  const blockedBytes=fs.readFileSync(blockedCheckpoint);
  const recovered=()=>{
    fs.mkdirSync(path.dirname(fileTarget),{recursive:true});
    fs.copyFileSync(native,fileTarget);
    const verified=inspectArtOutput(fileTarget,{kind:'background',width,height});
    assert.equal(verified.status,'PASS_ART_OUTPUT_MECHANICAL');
    artifact(passReceipt,{...verified,recordedAt:new Date().toISOString()});
  };
  const options={reason:'Recovered original native S24 portrait transport and independently verified its byte-exact target',
    artOutputRecovery:{failedReceipt,passReceipt,nativeSource:native}};
  return {project,runId,runDir,relTarget,fileTarget,failedReceipt,passReceipt,
    blockedCheckpoint,blockedBytes,native,hash,recovered,options};
}

test('terminal S24 ART_FILE_NOT_FOUND is a recovery candidate but never reopens without evidence',t=>{
  const x=fixture(t);
  const prior=resumeRun(x.project,x.runId);
  assert.equal(prior.run.verdict,'BLOCKED');
  assert.equal(inspectBlockedRunRecovery(prior.run).reopenSupported,true);
  assert.throws(()=>reopenBlockedRun(x.project,x.runId,{reason:'recover'}),
    /ART_TRANSPORT_RECOVERY_EVIDENCE_REQUIRED/);
  assert.equal(resumeRun(x.project,x.runId).run.verdict,'BLOCKED');
  assert.deepEqual(fs.readFileSync(x.blockedCheckpoint),x.blockedBytes);
});

test('verified native original, failed and PASS receipts reopen same run at GENERATING without consuming cycle',t=>{
  const x=fixture(t);
  x.recovered();
  const prev=resumeRun(x.project,x.runId).run;
  const rr=reopenBlockedRun(x.project,x.runId,x.options);
  assert.equal(rr.integrity.ok,true,JSON.stringify(rr.integrity));
  assert.equal(rr.run.runId,x.runId);
  assert.equal(rr.run.cycle,1);
  assert.equal(rr.run.maxCycles,1);
  assert.equal(rr.run.verdict,null);
  assert.equal(rr.run.state,'GENERATING');
  assert.equal(rr.run.nextStage,'GENERATING');
  assert.equal(rr.run.reopenCount,1);
  assert.equal(rr.run.checkpointCount,prev.checkpointCount+1);
  assert.deepEqual(fs.readFileSync(x.blockedCheckpoint),x.blockedBytes);
  const reopened=JSON.parse(fs.readFileSync(path.join(x.runDir,'checkpoints',
    String(rr.run.checkpointCount).padStart(3,'0')+'-run-reopened.json')));
  assert.equal(reopened.stage,'RUN_REOPENED');
  assert.equal(reopened.artOutputRecovery.sha256,x.hash);
  assert.equal(reopened.artOutputRecovery.targetPath,x.relTarget);
  assert.equal(reopened.artOutputRecovery.visualAcceptance,'NOT_VERIFIED');
  assert.equal(reopened.generationCandidateReused,true);
  assert.equal(reopened.previousVerdict,'BLOCKED');
  assert.equal(reopened.previousStopReason.code,'STAGE_BLOCKED');
  assert.ok(reopened.artifacts.some(a=>a.sha256===x.hash));
  assert.ok(reopened.artifacts.some(a=>a.projectRelativePath===x.failedReceipt));
  assert.ok(reopened.artifacts.some(a=>a.projectRelativePath===x.passReceipt));
  assert.throws(()=>reopenBlockedRun(x.project,x.runId,x.options),/Only BLOCKED/);
});

test('missing original PNG, forged output, modified failed receipt and wrong sha remain BLOCKED',t=>{
  const x=fixture(t);
  x.recovered();
  for(const change of [
    {artOutputRecovery:{...x.options.artOutputRecovery,nativeSource:path.join(path.dirname(x.native),'missing.png')}},
    {artOutputRecovery:{...x.options.artOutputRecovery,passReceipt:x.failedReceipt}}
  ]){
    assert.throws(()=>reopenBlockedRun(x.project,x.runId,{...x.options,...change}),/ART_TRANSPORT_RECOVERY_/);
  }
  const fake=JSON.parse(fs.readFileSync(path.join(x.project,x.passReceipt)));
  fs.writeFileSync(x.fileTarget,'not the native PNG');
  assert.throws(()=>reopenBlockedRun(x.project,x.runId,x.options),/ART_TRANSPORT_RECOVERY_PNG_VERIFICATION_MISMATCH/);
  fs.copyFileSync(x.native,x.fileTarget);
  fs.writeFileSync(path.join(x.project,x.passReceipt),JSON.stringify({...fake,sha256:'f'.repeat(64)}));
  assert.throws(()=>reopenBlockedRun(x.project,x.runId,x.options),/ART_TRANSPORT_RECOVERY_STOP_REASON_MISMATCH/);
  assert.equal(resumeRun(x.project,x.runId).run.verdict,'BLOCKED');
  assert.deepEqual(fs.readFileSync(x.blockedCheckpoint),x.blockedBytes);
});

test('unrelated terminal art failure is never eligible for output transport recovery',t=>{
  const x=fixture(t,{reasonOverride:'BLOCKED_ART_OUTPUT: malformed image, no native file decode'});
  x.recovered();
  const old=resumeRun(x.project,x.runId).run;
  assert.equal(inspectBlockedRunRecovery(old).reopenSupported,false);
  assert.throws(()=>reopenBlockedRun(x.project,x.runId,x.options),/not recoverable/);
});

test('CLI explicit reopen uses actual evidence, never automatic continue or manual run edits',t=>{
  const x=fixture(t);
  x.recovered();
  const cli=fileURLToPath(new URL('../bin/ceos.mjs',import.meta.url));
  const o=x.options.artOutputRecovery;
  const args=['resume',x.runId,'--project',x.project,'--reopen-blocked',
    '--reason','S24 portrait binary transport restored',
    '--art-output-failed-receipt',o.failedReceipt,
    '--art-output-pass-receipt',o.passReceipt,
    '--art-output-native-source',o.nativeSource,'--json'];
  const res=spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});
  assert.equal(res.status,0,res.stderr+'\n'+res.stdout);
  const json=JSON.parse(res.stdout);
  assert.equal(json.run.verdict,null);
  assert.equal(json.run.nextStage,'GENERATING');
});
