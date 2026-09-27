import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRun, recordCheckpoint } from '../src/execution-engine.mjs';
import {
  beginCapabilityChallenge,
  respondCapabilityChallenge,
  readRunCapabilityAttestation
} from '../src/capability-attestation.mjs';
import { collectCapabilities } from '../src/capabilities.mjs';

function tempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-cap-attest-'));
}

function caps(project) {
  return {
    schemaVersion: 1,
    ceosVersion: 'test',
    observedAt: new Date().toISOString(),
    projectDir: project,
    filesystem: { exists: true, readable: true, writable: true },
    executables: {},
    project: { manifest: { available: false }, browser: { configured: false } },
    web: { status: 'NOT_CONFIGURED', ready: false, source: 'test' },
    imageGeneration: {
      status: 'unknown',
      capabilityPresence: 'UNKNOWN',
      serviceAvailability: 'unknown',
      trustedForGeneration: false,
      generationAllowed: false,
      source: 'test'
    },
    nativeAgents: { present: [], missing: [] },
    limitations: []
  };
}

function scope() {
  return {
    target: 'asset generation',
    inScope: ['assets'],
    outOfScope: ['game logic'],
    acceptanceContract: 'fresh visual assets',
    mutationBoundary: 'asset files'
  };
}

function writeRuntime(home, sessionId = 'session-1', turnId = 'turn-1') {
  const root = path.join(home, 'ceos', 'runtime');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'current-session.json'), JSON.stringify({ sessionId, observedAt: new Date().toISOString() }));
  fs.writeFileSync(path.join(root, 'current-turn.json'), JSON.stringify({ sessionId, turnId, observedAt: new Date().toISOString() }));
}

function reachGeneration(project, id) {
  const inventory = path.join(project, 'inventory.json');
  const canon = path.join(project, 'canon.json');
  fs.writeFileSync(inventory, '{}');
  fs.writeFileSync(canon, '{}');
  recordCheckpoint(project, id, { stage: 'INVENTORIED', artifacts: [inventory] });
  recordCheckpoint(project, id, { stage: 'CANON_READY', artifacts: [canon] });
}

test('run-scoped challenge binds session, turn and single-use nonce', () => {
  const project = tempProject();
  const codexHome = path.join(project, '.codex');
  writeRuntime(codexHome);
  const run = createRun(project, 'production-art', { scope: scope(), capabilities: caps(project) });
  reachGeneration(project, run.run.runId);

  const challenge = beginCapabilityChallenge(project, run.run.runId, { codexHome });
  assert.equal(challenge.sessionId, 'session-1');
  assert.equal(challenge.turnId, 'turn-1');
  const persisted = JSON.parse(fs.readFileSync(path.join(run.runDir, 'capability-attestation', 'challenges', `${challenge.challengeId}.json`), 'utf8'));
  assert.equal(persisted.nonce, undefined);
  assert.ok(persisted.nonceSha256);

  const response = respondCapabilityChallenge(project, run.run.runId, {
    codexHome,
    challengeId: challenge.challengeId,
    nonce: challenge.nonce,
    presence: 'PRESENT',
    serviceAvailability: 'UNKNOWN'
  });
  assert.equal(response.attestation.presence, 'PRESENT');
  assert.equal(response.attestation.serviceAvailability, 'UNKNOWN');
  assert.throws(() => respondCapabilityChallenge(project, run.run.runId, {
    codexHome,
    challengeId: challenge.challengeId,
    nonce: challenge.nonce,
    presence: 'PRESENT'
  }), /not open/);

  const observed = readRunCapabilityAttestation(project, run.run.runId, { codexHome });
  assert.equal(observed.valid, true);
  const snapshot = collectCapabilities(project, { codexHome, imageGenerationAttestation: observed });
  assert.equal(snapshot.imageGeneration.capabilityPresence, 'PRESENT');
  assert.equal(snapshot.imageGeneration.serviceAvailability, 'unknown');
  assert.equal(snapshot.imageGeneration.trustedForGeneration, true);
  assert.equal(snapshot.imageGeneration.generationAllowed, true);
});

test('attestation fails closed after the Codex turn changes', () => {
  const project = tempProject();
  const codexHome = path.join(project, '.codex');
  writeRuntime(codexHome);
  const run = createRun(project, 'production-art', { scope: scope(), capabilities: caps(project) });
  reachGeneration(project, run.run.runId);
  const challenge = beginCapabilityChallenge(project, run.run.runId, { codexHome });
  respondCapabilityChallenge(project, run.run.runId, {
    codexHome,
    challengeId: challenge.challengeId,
    nonce: challenge.nonce,
    presence: 'PRESENT'
  });

  writeRuntime(codexHome, 'session-1', 'turn-2');
  const observed = readRunCapabilityAttestation(project, run.run.runId, { codexHome });
  assert.equal(observed.valid, false);
  assert.match(observed.reason, /turn mismatch/);
});

test('service availability cannot be asserted without real-invocation evidence', () => {
  const project = tempProject();
  const codexHome = path.join(project, '.codex');
  writeRuntime(codexHome);
  const run = createRun(project, 'production-art', { scope: scope(), capabilities: caps(project) });
  reachGeneration(project, run.run.runId);
  const challenge = beginCapabilityChallenge(project, run.run.runId, { codexHome });
  assert.throws(() => respondCapabilityChallenge(project, run.run.runId, {
    codexHome,
    challengeId: challenge.challengeId,
    nonce: challenge.nonce,
    presence: 'PRESENT',
    serviceAvailability: 'AVAILABLE'
  }), /requires explicit serviceEvidence/);
});
