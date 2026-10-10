import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRun, recordCheckpoint, recordRoutingTrace, preflightRoutingReceipt, resumeRun } from '../src/execution-engine.mjs';
import { normalizeResolutionReceiptContract, validateResolutionReceipt } from '../src/resolution-receipt.mjs';

const cues = ['Direct-prop cues: Alice offers tea at the quay.', 'Direct-prop cues: Erik keeps the thermos in hand.'];
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-resolution-preflight-'));
const scope = () => ({ target: 'S18 historical cues', inScope: ['S18 art acceptance'],
  outOfScope: [], acceptanceContract: 'historical cues verified before routed write',
  mutationBoundary: 'CEOS routing metadata only' });
const capabilities = project => ({ schemaVersion: 1, projectDir: project,
  web: { status: 'READY', ready: true },
  imageGeneration: { capabilityPresence: 'UNKNOWN', generationAllowed: false },
  filesystem: { exists: true, readable: true, writable: true } });
function fixture(project, withContract = true) {
  fs.writeFileSync(path.join(project, 'source.txt'), cues.join('\n')+'\n', 'utf8');
  const settings = { scope: scope(), capabilities: capabilities(project), webReviewMode: 'enhanced' };
  if (withContract) settings.resolutionReceiptContract = {
    schemaVersion: 1, requiredExactLines: cues, sourceEvidence: 'source.txt'
  };
  const created = createRun(project, 'audit-repair-loop', settings);
  const runId = created.run.runId;
  return { runId, file: path.join(created.runDir, 'run.json') };
}
function review(project, phase, overrides={}) {
  const file = 'web-' + phase + '.json';
  fs.writeFileSync(path.join(project, file), JSON.stringify({ realReview: phase })+'\n');
  return { phase, agent: 'ceos_reasoner_web', reviewTraceId: 'trace-'+phase,
    taskId: 'task-'+phase, sourceHead: 'a'.repeat(40),
    status: phase === 'analysis' ? 'FINDINGS' : 'PASS',
    reviewedItems: ['S18:[0,5]'], evidenceRefs: ['s18-pixels'],
    receivedEvidenceRefs: ['s18-pixels'],
    actualPixelsReceived: true, decision: 'Reviewed the actual S18 runtime image pixels independently',
    findings: phase === 'analysis' ? [{id:'historical-cue',detail:'verify historical prop cues'}] : [],
    unresolved: phase === 'analysis' ? ['historical-cue'] : [],
    evidenceArtifact: file, ...overrides };
}

test('contract validates exact historical lines and refuses missing or duplicate requirements', () => {
  const contract = normalizeResolutionReceiptContract({
    schemaVersion:1, requiredExactLines:cues, sourceEvidence:'source.txt'
  });
  assert.deepEqual(validateResolutionReceipt({historicalExactLines:cues},contract,cues.join('\n')),[]);
  assert.match(validateResolutionReceipt({historicalExactLines:[cues[0]]},contract,cues.join('\n')).join(';'),
    /RESOLUTION_RECEIPT_INCOMPLETE/);
  assert.match(validateResolutionReceipt({historicalExactLines:cues},contract,cues[0]).join(';'),
    /RESOLUTION_RECEIPT_SOURCE_MISSING/);
  assert.throws(() => normalizeResolutionReceiptContract({
    schemaVersion:1, requiredExactLines:[cues[0],cues[0]],sourceEvidence:'source.txt'
  }), /RESOLUTION_RECEIPT_CONTRACT_INVALID/);
});

test('missing exact cues are rejected BEFORE immutable routed trace recording, while corrected first receipt succeeds', () => {
  const project=temp(); const {runId,file}=fixture(project);
  recordRoutingTrace(project,runId,{webReview:review(project,'analysis')});
  const wrong = review(project,'acceptance',{resolvedFindings:[{id:'historical-cue',evidenceRef:'s18-pixels'}],
    historicalExactLines:[cues[0]]});
  const before = fs.readFileSync(file,'utf8');
  assert.throws(()=>recordRoutingTrace(project,runId,{webAgentsUsed:['ceos_reasoner_web'],webReview:wrong}),
    /RESOLUTION_RECEIPT_INCOMPLETE/);
  assert.equal(fs.readFileSync(file,'utf8'),before);
  assert.equal(resumeRun(project,runId).run.routingTrace.webReviews.length,1);
  const corrected={...wrong,historicalExactLines:[...cues]};
  assert.equal(preflightRoutingReceipt(project,runId,corrected).status,'READY_TO_RECORD');
  assert.equal(fs.readFileSync(file,'utf8'),before,'dry-run is read-only');
  recordRoutingTrace(project,runId,{webReview:corrected});
  assert.equal(resumeRun(project,runId).run.routingTrace.webReviews.length,2);
});

test('missing historical findings resolution is rejected before recording without an optional contract',()=>{
  const project=temp(); const {runId,file}=fixture(project,false);
  recordRoutingTrace(project,runId,{webReview:review(project,'analysis')});
  const before=fs.readFileSync(file,'utf8');
  assert.throws(()=>recordRoutingTrace(project,runId,{webReview:review(project,'acceptance')}),
    /RESOLUTION_RECEIPT_INCOMPLETE/);
  assert.equal(fs.readFileSync(file,'utf8'),before);
});

test('locked source hash changes invalidate historical receipt preflight',()=>{
  const project=temp(); const {runId,file}=fixture(project);
  fs.writeFileSync(path.join(project,'source.txt'),cues.join('\n')+'\nchanged\n');
  const before=fs.readFileSync(file,'utf8');
  assert.throws(()=>preflightRoutingReceipt(project,runId,review(project,'acceptance',{
    historicalExactLines:cues})),/RESOLUTION_RECEIPT_SOURCE_CHANGED/);
  assert.equal(fs.readFileSync(file,'utf8'),before);
});

test('invalid strict receipts are rejected at ingest, not later at checkpoint',()=>{
  const project=temp(); const {runId,file}=fixture(project,false);
  const before=fs.readFileSync(file,'utf8');
  assert.throws(()=>recordRoutingTrace(project,runId,{webReview:review(project,'analysis',{
    receivedEvidenceRefs:[]})}),/WEB_REVIEW_NOT_VERIFIED/);
  assert.equal(fs.readFileSync(file,'utf8'),before);
});

test('terminal runs never accept new routed provenance',()=>{
  const project=temp(); const {runId,file}=fixture(project);
  fs.writeFileSync(path.join(project,'proof.txt'),'proof');
  recordCheckpoint(project,runId,{stage:'EVIDENCE_COLLECTED',artifacts:['proof.txt'],
    outcome:'BLOCKED',note:'Web required but transport unavailable'});
  const before=fs.readFileSync(file,'utf8');
  assert.throws(()=>recordRoutingTrace(project,runId,{webReview:review(project,'analysis')}),
    /Run is terminal/);
  assert.equal(fs.readFileSync(file,'utf8'),before);
});
