import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRun, recordRecoveryEvent, resumeRun } from '../src/execution-engine.mjs';
import { planContinuation } from '../src/continuation-controller.mjs';
import { brokerCapabilities } from '../src/capability-broker.mjs';
import {
  applyRecoveryEvent,
  classifyContinuationError,
  createRecoveryState,
  recoveryDecision,
  RECOVERY_CATEGORIES
} from '../src/continuation-recovery.mjs';

const CEOS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(CEOS_ROOT, 'bin', 'ceos.mjs');

function project(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-phase03-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const args of [
    ['init', '-q'],
    ['config', 'user.name', 'CEOS Phase03'],
    ['config', 'user.email', 'ceos-phase03@example.invalid']
  ]) assert.equal(spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).status, 0);
  fs.writeFileSync(path.join(dir, 'source.txt'), 'source\n');
  assert.equal(spawnSync('git', ['-C', dir, 'add', 'source.txt'], { encoding: 'utf8' }).status, 0);
  assert.equal(spawnSync('git', ['-C', dir, 'commit', '-qm', 'fixture'], { encoding: 'utf8' }).status, 0);
  return dir;
}

function caps(dir, image = {}) {
  return {
    schemaVersion: 1,
    projectDir: dir,
    filesystem: { exists: true, readable: true, writable: true },
    web: { status: 'NOT_CONFIGURED', fallbackAllowed: true },
    imageGeneration: {
      capabilityPresence: 'UNKNOWN',
      serviceAvailability: 'unknown',
      trustedForGeneration: false,
      generationAllowed: false,
      ...image
    }
  };
}

function runFor(dir, capabilities = caps(dir)) {
  return createRun(dir, 'audit-repair-loop', {
    scope: {
      target: 'phase03 continuation',
      inScope: ['source.txt'],
      outOfScope: ['release'],
      acceptanceContract: 'fresh verification',
      mutationBoundary: 'source.txt'
    },
    capabilities
  }).run;
}

test('error classification separates transient, external, user and hard blockers', () => {
  assert.equal(classifyContinuationError({ reasonCode: 'TIMEOUT' }).category, RECOVERY_CATEGORIES.AUTO_RECOVERABLE);
  assert.equal(classifyContinuationError({ reasonCode: 'MODEL_ENTITLEMENT_UNAVAILABLE' }).category, RECOVERY_CATEGORIES.WAIT_EXTERNAL);
  assert.equal(classifyContinuationError({ reasonCode: 'CAPABILITY_CHALLENGE_REQUIRED' }).category, RECOVERY_CATEGORIES.NEEDS_USER_ACTION);
  assert.equal(classifyContinuationError({ reasonCode: 'ARTISTIC_REWORK' }).category, RECOVERY_CATEGORIES.HARD_BLOCKED);
  assert.equal(classifyContinuationError({ reasonCode: 'SOURCE_HEAD_CHANGED', integrity: false }).nextAction, 'STOP_AND_REPAIR');
});

test('expired or missing authorization overrides transient errors and explicit auto recovery', () => {
  for (const authorization of ['EXPIRED', 'MISSING', 'REVOKED', 'DENIED']) {
    const result = classifyContinuationError({
      reasonCode: 'TIMEOUT', category: 'AUTO_RECOVERABLE', authorization
    });
    assert.equal(result.category, RECOVERY_CATEGORIES.NEEDS_USER_ACTION);
    assert.equal(result.retryAllowed, false);
  }
  assert.equal(classifyContinuationError({
    reasonCode: 'SHA256_MISMATCH', authorization: 'EXPIRED'
  }).category, RECOVERY_CATEGORIES.HARD_BLOCKED);
});

test('recovery state persists a technical retry, survives re-read and never consumes art budget', t => {
  const dir = project(t);
  const run = runFor(dir);
  const event = { operationId: 'web-turn-1', attemptId: 'attempt-1', reasonCode: 'TIMEOUT', retryAfterMs: 0, stage: 'EVIDENCE_COLLECTED' };
  const first = recordRecoveryEvent(dir, run.runId, event, { nowMs: 1_000 });
  assert.equal(first.consumesArtAttempt, false);
  assert.equal(first.consumesRepairCycle, false);
  assert.equal(first.recovery.retryCount, 1);
  const persisted = resumeRun(dir, run.runId).run.recovery;
  assert.equal(persisted.retryCount, 1);
  const duplicate = recordRecoveryEvent(dir, run.runId, event, { nowMs: 100_000 });
  assert.equal(duplicate.alreadyRecorded, true);
  assert.equal(resumeRun(dir, run.runId).run.recovery.retryCount, 1);
});

test('retry backoff is finite and exhaustion requires user action', () => {
  let state = createRecoveryState({ sourceHead: 'a'.repeat(40), retryPolicy: { maxAttempts: 2, baseDelayMs: 0 } });
  const first = applyRecoveryEvent(state, { operationId: 'one', attemptId: 'attempt-1', reasonCode: 'TIMEOUT', sourceHead: state.sourceHead }, { now: 1_000 });
  state = first.state;
  assert.equal(recoveryDecision(state, { now: 1_000 }).category, RECOVERY_CATEGORIES.AUTO_RECOVERABLE);
  const second = applyRecoveryEvent(state, { operationId: 'two', attemptId: 'attempt-2', reasonCode: 'TIMEOUT', sourceHead: state.sourceHead }, { now: 2_000 });
  state = second.state;
  assert.equal(recoveryDecision(state, { now: 2_000 }).category, RECOVERY_CATEGORIES.AUTO_RECOVERABLE);
  const exhausted = applyRecoveryEvent(state, { operationId: 'three', attemptId: 'attempt-3', reasonCode: 'TIMEOUT', sourceHead: state.sourceHead }, { now: 3_000 });
  assert.equal(exhausted.state.lastEvent.reasonCode, 'RETRY_BUDGET_EXHAUSTED');
  assert.equal(recoveryDecision(exhausted.state).category, RECOVERY_CATEGORIES.NEEDS_USER_ACTION);
});

test('identical failures of distinct attempts exhaust the budget and replay of one attempt is idempotent', () => {
  let state = createRecoveryState({ sourceHead: 'a'.repeat(40), retryPolicy: { maxAttempts: 2, baseDelayMs: 0 } });
  const error = { operationId: 'same-logical-operation', reasonCode: 'TIMEOUT', sourceHead: state.sourceHead };
  state = applyRecoveryEvent(state, { ...error, attemptId: 'attempt-1' }, { now: 1_000 }).state;
  assert.equal(state.retryCount, 1);
  const replay = applyRecoveryEvent(state, { ...error, attemptId: 'attempt-1' }, { now: 2_000 });
  assert.equal(replay.alreadyRecorded, true);
  assert.equal(replay.state.retryCount, 1);
  state = applyRecoveryEvent(state, { ...error, attemptId: 'attempt-2' }, { now: 3_000 }).state;
  assert.equal(state.retryCount, 2);
  state = applyRecoveryEvent(state, { ...error, attemptId: 'attempt-3' }, { now: 4_000 }).state;
  assert.equal(recoveryDecision(state).reasonCode, 'RETRY_BUDGET_EXHAUSTED');
});

test('ambiguous legacy retry events cannot authorize automatic retries', () => {
  const state = createRecoveryState({ sourceHead: 'a'.repeat(40) });
  const missingAttempt = applyRecoveryEvent(state, {
    operationId: 'one-operation', reasonCode: 'TIMEOUT', sourceHead: state.sourceHead
  }, { now: 1_000 });
  assert.equal(missingAttempt.ok, true);
  assert.equal(missingAttempt.status, RECOVERY_CATEGORIES.NEEDS_USER_ACTION);
  assert.equal(missingAttempt.reasonCode, 'RECOVERY_ATTEMPT_ID_REQUIRED');
  assert.equal(state.retryCount, 0);
  assert.equal(missingAttempt.state.lastEvent.reasonCode, 'RECOVERY_ATTEMPT_ID_REQUIRED');

  const legacyState = structuredClone(state);
  legacyState.retryCount = 1;
  legacyState.lastEvent = { category: 'AUTO_RECOVERABLE', reasonCode: 'TIMEOUT' };
  assert.equal(recoveryDecision(legacyState).category, RECOVERY_CATEGORIES.NEEDS_USER_ACTION);
});

test('missing attempt identity persists a user-action pause across continue and restart', t => {
  const dir = project(t);
  const run = runFor(dir);
  const denied = recordRecoveryEvent(dir, run.runId, {
    operationId: 'ambiguous-web-request', reasonCode: 'TIMEOUT'
  });
  assert.equal(denied.status, RECOVERY_CATEGORIES.NEEDS_USER_ACTION);
  assert.equal(denied.executable, false);
  assert.equal(resumeRun(dir, run.runId).run.recovery.lastEvent.reasonCode, 'RECOVERY_ATTEMPT_ID_REQUIRED');
  const resumed = planContinuation(dir, { runRef: run.runId, mode: 'auto' });
  assert.equal(resumed.executable, false);
  assert.equal(resumed.status, RECOVERY_CATEGORIES.NEEDS_USER_ACTION);
});

test('one attempt cannot be recorded twice with conflicting evidence', () => {
  const state = createRecoveryState({ sourceHead: 'a'.repeat(40) });
  const first = applyRecoveryEvent(state, {
    operationId: 'one-operation', attemptId: 'attempt-1', reasonCode: 'TIMEOUT'
  }, { now: 1_000 });
  const conflict = applyRecoveryEvent(first.state, {
    operationId: 'one-operation', attemptId: 'attempt-1', reasonCode: 'RATE_LIMITED'
  }, { now: 2_000 });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.reasonCode, 'RECOVERY_ATTEMPT_ID_CONFLICT');
});

test('server Retry-After is a lower bound, even beyond local backoff cap', () => {
  const state = createRecoveryState({ sourceHead: 'a'.repeat(40), retryPolicy: {
    maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 300_000
  } });
  const applied = applyRecoveryEvent(state, {
    operationId: 'api-review', attemptId: 'attempt-1', reasonCode: 'RATE_LIMITED',
    retryAfterMs: 1_800_000
  }, { now: 1_000 });
  assert.equal(Date.parse(applied.state.nextRetryAt), 1_801_000);
  assert.equal(recoveryDecision(applied.state, { now: 301_000 }).category, RECOVERY_CATEGORIES.WAIT_EXTERNAL);
  assert.equal(recoveryDecision(applied.state, { now: 1_801_000 }).category, RECOVERY_CATEGORIES.AUTO_RECOVERABLE);
});

test('restored external service resumes the saved operation without changing retry or art budgets', () => {
  let state = createRecoveryState({ sourceHead: 'a'.repeat(40) });
  state = applyRecoveryEvent(state, {
    operationId: 'web-review-1', reasonCode: 'WEB_HIGH_REVIEW_UNAVAILABLE', sourceHead: state.sourceHead
  }, { now: 1_000 }).state;
  assert.equal(recoveryDecision(state, { now: 2_000 }).category, RECOVERY_CATEGORIES.WAIT_EXTERNAL);
  const resumed = recoveryDecision(state, { now: 2_000, externalReady: true });
  assert.equal(resumed.category, RECOVERY_CATEGORIES.AUTO_RECOVERABLE);
  assert.equal(resumed.reasonCode, 'EXTERNAL_RECOVERY_OBSERVED');
  assert.equal(resumed.externalRecoveryObserved, true);
  assert.equal(state.retryCount, 0);
  assert.equal(resumed.consumesArtAttempt, undefined);
});

test('source HEAD changes fail closed before recovery state is written', t => {
  const dir = project(t);
  const run = runFor(dir);
  fs.writeFileSync(path.join(dir, 'source.txt'), 'changed\n');
  assert.equal(spawnSync('git', ['-C', dir, 'add', 'source.txt'], { encoding: 'utf8' }).status, 0);
  assert.equal(spawnSync('git', ['-C', dir, 'commit', '-qm', 'changed'], { encoding: 'utf8' }).status, 0);
  const result = recordRecoveryEvent(dir, run.runId, { operationId: 'head-drift', reasonCode: 'TIMEOUT' });
  assert.equal(result.category, RECOVERY_CATEGORIES.HARD_BLOCKED);
  assert.equal(result.reasonCode, 'SOURCE_HEAD_CHANGED');
  assert.equal(resumeRun(dir, run.runId).run.recovery.retryCount, 0);
});

test('corrupted checkpoint and concurrent executor are hard blockers', t => {
  const dir = project(t);
  const run = runFor(dir);
  const checkpoint = fs.readdirSync(path.join(run.runDir, 'checkpoints')).find(file => file.endsWith('.json'));
  fs.writeFileSync(path.join(run.runDir, 'checkpoints', checkpoint), '{broken\n');
  const corrupt = recordRecoveryEvent(dir, run.runId, { operationId: 'corrupt', reasonCode: 'TIMEOUT' });
  assert.equal(corrupt.reasonCode, 'BLOCKED_INTEGRITY');

  const cleanDir = project(t);
  const cleanRun = runFor(cleanDir);
  const lock = path.join(cleanRun.runDir, '.lock');
  fs.writeFileSync(lock, JSON.stringify({ pid: 99999, createdAt: new Date().toISOString() }));
  assert.throws(() => recordRecoveryEvent(cleanDir, cleanRun.runId, { operationId: 'locked', reasonCode: 'TIMEOUT' }), /locked by another CEOS process/);
  fs.rmSync(lock, { force: true });
});

test('capability broker observes authorization and fallback without granting either', t => {
  const dir = project(t);
  const needsChallenge = brokerCapabilities(caps(dir), { pipeline: 'production-art', stage: 'GENERATING' });
  assert.equal(needsChallenge.category, 'READY');
  assert.equal(needsChallenge.reasonCode, 'CAPABILITY_CHALLENGE_REQUIRED');
  assert.equal(needsChallenge.executable, true);
  assert.equal(needsChallenge.requiresFreshCapabilityChallenge, true);
  assert.equal(needsChallenge.authorizationRequired, true);

  const ready = brokerCapabilities(caps(dir, {
    capabilityPresence: 'PRESENT', serviceAvailability: 'unknown',
    trustedForGeneration: true, generationAllowed: true,
    attestationFile: 'run-scoped.json', trustScope: 'run-session-turn'
  }), { pipeline: 'production-art', stage: 'GENERATING' });
  assert.equal(ready.category, 'READY');
  assert.equal(ready.executable, true);
  assert.equal(ready.imageGeneration.attestationFile, 'run-scoped.json');

  const external = brokerCapabilities({ ...caps(dir), web: { status: 'UNAVAILABLE', fallbackAllowed: true } }, { webRequired: true });
  assert.equal(external.category, RECOVERY_CATEGORIES.WAIT_EXTERNAL);
  assert.equal(external.web.route.fallbackModel, 'gpt-5.6-sol');
});

test('recovery-event CLI persists an observed event and returns a machine-readable decision', t => {
  const dir = project(t);
  const run = runFor(dir);
  const eventPath = path.join(dir, 'recovery-event.json');
  fs.writeFileSync(eventPath, JSON.stringify({ operationId: 'cli-timeout', attemptId: 'attempt-1', reasonCode: 'TIMEOUT', retryAfterMs: 0 }));
  const result = spawnSync(process.execPath, [CLI, 'recovery-event', run.runId,
    '--project', dir, '--event-file', 'recovery-event.json', '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 2, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, RECOVERY_CATEGORIES.WAIT_EXTERNAL);
  assert.equal(payload.recovery.retryCount, 1);
  assert.equal(resumeRun(dir, run.runId).run.recovery.retryCount, 1);
});
