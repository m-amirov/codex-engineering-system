import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRun, recordRecoveryEvent, resumeRun } from '../src/execution-engine.mjs';
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

test('recovery state persists a technical retry, survives re-read and never consumes art budget', t => {
  const dir = project(t);
  const run = runFor(dir);
  const event = { operationId: 'web-turn-1', reasonCode: 'TIMEOUT', retryAfterMs: 0, stage: 'EVIDENCE_COLLECTED' };
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
  const first = applyRecoveryEvent(state, { operationId: 'one', reasonCode: 'TIMEOUT', sourceHead: state.sourceHead }, { now: 1_000 });
  state = first.state;
  assert.equal(recoveryDecision(state, { now: 1_000 }).category, RECOVERY_CATEGORIES.AUTO_RECOVERABLE);
  const second = applyRecoveryEvent(state, { operationId: 'two', reasonCode: 'TIMEOUT', sourceHead: state.sourceHead }, { now: 2_000 });
  state = second.state;
  assert.equal(recoveryDecision(state, { now: 2_000 }).category, RECOVERY_CATEGORIES.AUTO_RECOVERABLE);
  const exhausted = applyRecoveryEvent(state, { operationId: 'three', reasonCode: 'TIMEOUT', sourceHead: state.sourceHead }, { now: 3_000 });
  assert.equal(exhausted.state.lastEvent.reasonCode, 'RETRY_BUDGET_EXHAUSTED');
  assert.equal(recoveryDecision(exhausted.state).category, RECOVERY_CATEGORIES.NEEDS_USER_ACTION);
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
  fs.writeFileSync(eventPath, JSON.stringify({ operationId: 'cli-timeout', reasonCode: 'TIMEOUT', retryAfterMs: 0 }));
  const result = spawnSync(process.execPath, [CLI, 'recovery-event', run.runId,
    '--project', dir, '--event-file', 'recovery-event.json', '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 2, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, RECOVERY_CATEGORIES.WAIT_EXTERNAL);
  assert.equal(payload.recovery.retryCount, 1);
  assert.equal(resumeRun(dir, run.runId).run.recovery.retryCount, 1);
});
