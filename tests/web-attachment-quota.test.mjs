import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
import { classifyWebTransportFailure } from '../src/web-transport-failure.mjs';
import {
  createRun, recordCheckpoint, recordWebAttachmentQuotaBlock,
  resumeRun, reopenBlockedRun, recordRoutingTrace
} from '../src/execution-engine.mjs';

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-attachment-quota-'));
const capabilities = project => ({
  schemaVersion: 1, projectDir: project, web: { status: 'READY', ready: true },
  imageGeneration: { capabilityPresence: 'UNKNOWN', generationAllowed: false },
  filesystem: { exists: true, readable: true, writable: true }
});
const scope = () => ({
  target: 'attachment-bound visual review', inScope: ['S18 mobile visual'],
  outOfScope: [], acceptanceContract: 'real pixels independently received',
  mutationBoundary: 'CEOS evidence only'
});
const make = project => {
  const { run } = createRun(project, 'audit-repair-loop', {
    scope: scope(), capabilities: capabilities(project),
    webRequired: true, webReviewMode: 'enhanced'
  });
  fs.writeFileSync(path.join(project, 'evidence.json'), '{}');
  recordCheckpoint(project, run.runId, { stage: 'EVIDENCE_COLLECTED', artifacts: ['evidence.json'] });
  return run.runId;
};
const log = (project, content, filename = 'attachment-error.txt') => {
  fs.writeFileSync(path.join(project, filename), content);
  return filename;
};

test('explicit attachment quotas stop without retry or repair-cycle budget', () => {
  for (const message of [
    'Достигнут лимит прикрепления файлов',
    'File attachment limit reached',
    'You have reached your file upload limit',
    'File upload limit exceeded'
  ]) {
    const found = classifyWebTransportFailure({message});
    assert.equal(found.classification, 'ATTACHMENT_QUOTA_EXHAUSTED');
    assert.equal(found.retryAllowed, false);
    assert.equal(found.consumesRepairCycle, false);
    assert.equal(found.nativeFallbackAllowed, false);
    assert.equal(found.scope, 'UNKNOWN');
  }
});

test('no quota inference from HTTP 429, a failed upload or unrelated rate limiting', () => {
  assert.equal(classifyWebTransportFailure({
    message: 'Too many requests', httpStatus: 429
  }).classification, 'RATE_LIMITED');
  assert.equal(classifyWebTransportFailure({
    message: 'Failed to upload attachment'
  }).classification, 'ATTACHMENT_TRANSPORT');
  assert.equal(classifyWebTransportFailure({
    message: 'WEB 503', httpStatus: 503
  }).classification, 'UNKNOWN');
});

test('quota evidence blocks at the active Web phase, preserves cycle and prevents a false receipt', () => {
  const project = temp(), id = make(project);
  const evidence = log(project, 'Достигнут лимит прикрепления файлов');
  const before = resumeRun(project, id).run;
  const result = recordWebAttachmentQuotaBlock(project, id, { phase: 'analysis', evidence });
  assert.equal(result.run.verdict, 'BLOCKED');
  assert.equal(result.run.stopReason.code, 'ATTACHMENT_QUOTA_EXHAUSTED');
  assert.equal(result.run.stopReason.phase, 'analysis');
  assert.equal(result.run.cycle, before.cycle);
  assert.equal(result.run.nextStage, null);
  assert.equal(result.run.routingTrace.webReviews.length, 0);
  assert.equal(result.run.checkpointCount, before.checkpointCount + 1);
  assert.equal(result.run.stopReason.evidenceSha256,
    crypto.createHash('sha256').update(fs.readFileSync(path.join(project, evidence))).digest('hex'));
  assert.equal(result.integrity.ok, true);
  assert.throws(() => recordRoutingTrace(project, id, {webAgentsUsed:['ceos_reasoner_web']}), /terminal/);
  assert.throws(() => reopenBlockedRun(project, id, {reason:'Try again'}), /not recoverable/i);
  assert.throws(() => recordWebAttachmentQuotaBlock(project, id, {phase:'analysis',evidence}), /terminal/);
});

test('generic transport logs cannot mutate run or trigger an attachment quota blocker', () => {
  const project = temp(), id = make(project);
  const evidence = log(project, 'Attachment upload failed; connection reset');
  const saved = fs.readFileSync(path.join(project,'.ceos-runs',id,'run.json'));
  assert.throws(()=>recordWebAttachmentQuotaBlock(project,id,{phase:'analysis',evidence}),
    /ATTACHMENT_QUOTA_NOT_CONFIRMED/);
  assert.deepEqual(fs.readFileSync(path.join(project,'.ceos-runs',id,'run.json')),saved);
  assert.equal(resumeRun(project,id).run.verdict,null);
});

test('wrong phase cannot prematurely block an earlier Web stage',()=>{
  const project=temp(),id=make(project);
  const evidence=log(project,'File attachment limit reached');
  assert.throws(()=>recordWebAttachmentQuotaBlock(project,id,{phase:'midpoint',evidence}),/phase does not match/);
  assert.equal(resumeRun(project,id).run.verdict,null);
});

test('blocked evidence is immutable and integrity detects later changed logs',()=>{
  const project=temp(),id=make(project);
  const evidence=log(project,'File upload limit exceeded');
  recordWebAttachmentQuotaBlock(project,id,{phase:'analysis',evidence});
  fs.writeFileSync(path.join(project,evidence),'tampered');
  const state=resumeRun(project,id);
  assert.equal(state.integrity.ok,false);
  assert.ok(state.integrity.issues.some(issue=>issue.includes('artifact changed after checkpoint')));
});
