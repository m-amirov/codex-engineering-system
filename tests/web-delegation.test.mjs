import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
import { webReviewPlan, validateWebReview, verifyWebDelegation } from '../src/web-delegation.mjs';
import { createRun, recordCheckpoint, recordRoutingTrace, resumeRun } from '../src/execution-engine.mjs';

const HEAD = 'a'.repeat(40);
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-web-review-'));
const scope = () => ({ target:'visual consistency',inScope:['scene continuity'],outOfScope:[],acceptanceContract:'checked',mutationBoundary:'native only' });
const caps = project => ({
  schemaVersion:1,projectDir:project,web:{status:'READY',ready:true},
  imageGeneration:{capabilityPresence:'UNKNOWN',generationAllowed:false},filesystem:{exists:true,readable:true,writable:true}
});
const add = (p,name) => {fs.writeFileSync(path.join(p,name),'evidence');return name;};
const review = (phase, overrides={}) => ({
  phase,agent:'ceos_reasoner_web',reviewTraceId:`review-${phase}`,
  taskId:`task-${phase}`,sourceHead:HEAD,status:'PASS',
  reviewedItems:['S01:p2'],evidenceRefs:['capture-1'],receivedEvidenceRefs:['capture-1'],
  decision:'Reviewed the supplied current runtime evidence independently',
  findings:[],unresolved:[],actualPixelsReceived:true,evidenceArtifact:'web-report.json',...overrides
});
const finalEvidence = () => ({evidenceContract:{
  schemaVersion:1,assertionsExecuted:1,
  claims:[{id:'test',assertionId:'check',status:'PASS',executions:1}],
  coverage:{scope:'test',checked:1,total:1,complete:true},unresolved:[]
}});
const checkpoint = (project,id,stage) => recordCheckpoint(project,id,{stage,artifacts:[add(project,stage+'.json')]});

test('planning requires multi-phase Web High review and bounds large shards', () => {
  const p=webReviewPlan('audit-repair-loop',{complexity:'high',visual:true,totalItems:627});
  assert.deepEqual(p.phases,['analysis','midpoint','acceptance']);
  assert.equal(p.shards,4);
  assert.equal(webReviewPlan('production-art',{totalItems:20}).shards,1);
});

test('review validation refuses missing receipt, stale HEAD and missing pixels', () => {
  assert.deepEqual(validateWebReview(review('acceptance'),{pipeline:'audit-repair-loop',phase:'acceptance',currentHead:HEAD,visual:true}),[]);
  assert.match(validateWebReview(review('acceptance',{receivedEvidenceRefs:[]}),{pipeline:'audit-repair-loop',phase:'acceptance',currentHead:HEAD})+'',/receipt|bundle/i);
  assert.match(validateWebReview(review('acceptance',{sourceHead:'b'.repeat(40)}),{pipeline:'audit-repair-loop',phase:'acceptance',currentHead:HEAD})+'',/stale/i);
  assert.match(validateWebReview(review('acceptance',{actualPixelsReceived:false}),{pipeline:'audit-repair-loop',phase:'acceptance',currentHead:HEAD,visual:true})+'',/pixel/i);
  assert.match(validateWebReview(review('acceptance',{unresolved:['S55']}),{pipeline:'audit-repair-loop',phase:'acceptance',currentHead:HEAD})+'',/unresolved/i);
});

test('analysis can return substantive findings without pretending acceptance PASS', () => {
  const found=review('analysis',{status:'FINDINGS',findings:[{id:'S55',detail:'head clipped'}],unresolved:['S55']});
  assert.deepEqual(validateWebReview(found,{pipeline:'audit-repair-loop',phase:'analysis',currentHead:HEAD,visual:true}),[]);
  const result=verifyWebDelegation({...webReviewPlan('audit-repair-loop'),phases:['analysis']},[found],{pipeline:'audit-repair-loop',currentHead:HEAD});
  assert.equal(result.ok,true);
});

test('enhanced CEOS pipeline enforces actual phase-specific reviews rather than Web agent names', () => {
  const project=temp();
  const run=createRun(project,'audit-repair-loop',{scope:scope(),capabilities:caps(project),webReviewMode:'enhanced'});
  const id=run.run.runId;
  checkpoint(project,id,'EVIDENCE_COLLECTED');
  recordRoutingTrace(project,id,{webAgentsUsed:['ceos_reasoner_web']});
  assert.throws(()=>checkpoint(project,id,'AUDITED'),/WEB_REVIEW_NOT_VERIFIED/);
  add(project,'web-report.json');
  recordRoutingTrace(project,id,{webReview:review('analysis')});
  checkpoint(project,id,'AUDITED');
  recordCheckpoint(project,id,{stage:'DEFECTS_CONFIRMED',artifacts:[add(project,'defects.json')],metadata:{defectCount:1}});
  checkpoint(project,id,'REPAIRING');
  assert.throws(()=>checkpoint(project,id,'VERIFIED'),/WEB_REVIEW_NOT_VERIFIED/);
  recordRoutingTrace(project,id,{webReview:review('midpoint',{reviewTraceId:'second',taskId:'second-task'})});
  checkpoint(project,id,'VERIFIED');
  assert.throws(()=>recordCheckpoint(project,id,{stage:'REAUDITED',artifacts:[add(project,'final.json')],outcome:'PASS',metadata:finalEvidence()}),/WEB_REVIEW_NOT_VERIFIED/);
  recordRoutingTrace(project,id,{webReview:review('acceptance',{reviewTraceId:'third',taskId:'third-task'})});
  const complete=recordCheckpoint(project,id,{stage:'REAUDITED',artifacts:['final.json'],outcome:'PASS',metadata:finalEvidence()});
  assert.equal(complete.run.verdict,'PASS');
  assert.equal(complete.run.routingTrace.webReviews.length,3);
});

test('routing trace evidence is tamper-evident', () => {
  const project=temp();const run=createRun(project,'audit-repair-loop',{scope:scope(),capabilities:caps(project),webReviewMode:'enhanced'});
  add(project,'web-report.json');
  recordRoutingTrace(project,run.run.runId,{webReview:review('analysis')});
  fs.writeFileSync(path.join(project,'web-report.json'),'tampered');
  const result=resumeRun(project,run.run.runId);
  assert.equal(result.integrity.ok,false);
  assert.ok(result.integrity.issues.some(x=>x.includes('Web review evidence artifact changed')));
});

test('zero-defect audit skips midpoint but still requires fresh acceptance review', () => {
  const plan=webReviewPlan('audit-repair-loop');
  const validation=verifyWebDelegation(plan,[review('analysis'),review('acceptance')],{pipeline:'audit-repair-loop',currentHead:HEAD,defectCount:0});
  assert.equal(validation.ok,true);
  assert.deepEqual(validation.required,['analysis','acceptance']);
});

test('visual-content is explicit, scoped to visual art, and strict remains the default', () => {
  assert.throws(()=>webReviewPlan('engineering',{visual:true,assurance:'visual-content'}),/visual-content/);
  assert.throws(()=>webReviewPlan('production-art',{visual:false,assurance:'visual-content'}),/visual-content/);
  assert.equal(webReviewPlan('production-art',{visual:true,assurance:'visual-content'}).assurance,'visual-content');
  assert.match(validateWebReview(review('acceptance',{taskId:null,reviewTraceId:null}),
    {pipeline:'production-art',phase:'acceptance',visual:true})+'',/trace|task/i);
});
const contentReview=(phase, overrides={})=>review(phase,{
  agent:'ceos_art_director_web',taskId:null,reviewTraceId:null,
  visualEvidence:[{ref:'capture-1',path:'capture.png',sha256:'a'.repeat(64),
    observation:'Two people are visibly standing beside the airport sign.'}],...overrides
});
test('visual-content independently checks receipt, per-frame observations, unresolved defects, current source',()=>{
  const options={pipeline:'production-art',phase:'acceptance',currentHead:HEAD,visual:true,assurance:'visual-content'};
  assert.deepEqual(validateWebReview(contentReview('acceptance'),options),[]);
  assert.match(validateWebReview(contentReview('acceptance',{actualPixelsReceived:false}),options)+'',/pixel/i);
  assert.match(validateWebReview(contentReview('acceptance',{receivedEvidenceRefs:[]}),options)+'',/receipt/i);
  assert.match(validateWebReview(contentReview('acceptance',{visualEvidence:[]}),options)+'',/per-image/i);
  assert.match(validateWebReview(contentReview('acceptance',{unresolved:['S38 cropped']}),options)+'',/unresolved/i);
  assert.match(validateWebReview(contentReview('acceptance',{sourceHead:'b'.repeat(40)}),options)+'',/stale/i);
});
test('visual-content binds physical screenshot hash and detects post-record tampering',()=>{
  const project=temp();
  fs.writeFileSync(path.join(project,'capture.png'),'fixture pixel bytes');
  const imageHash=crypto.createHash('sha256').update(fs.readFileSync(path.join(project,'capture.png'))).digest('hex');
  add(project,'web-report.json');
  const run=createRun(project,'production-art',{scope:scope(),capabilities:caps(project),
    webReviewMode:'enhanced',webReviewAssurance:'visual-content'});
  const r=contentReview('analysis',{visualEvidence:[{ref:'capture-1',path:'capture.png',sha256:imageHash,
    observation:'Alice and Nick stand visibly beside a cardboard airport sign.'}]});
  const recorded=recordRoutingTrace(project,run.run.runId,{webReview:r});
  assert.equal(recorded.run.routingTrace.webReviews[0].localScreenshotArtifacts[0].sha256,imageHash);
  assert.equal(resumeRun(project,run.run.runId).integrity.ok,true);
  fs.writeFileSync(path.join(project,'capture.png'),'tampered pixel bytes');
  assert.ok(resumeRun(project,run.run.runId).integrity.issues.some(issue=>issue.includes('screenshot changed')));
});

test('visual-content cannot be activated in legacy execution mode', () => {
  const project=temp();
  assert.throws(()=>createRun(project,'production-art',{
    scope:scope(),capabilities:caps(project),webReviewMode:'legacy',webReviewAssurance:'visual-content'
  }),/enhanced Web review mode/);
});
