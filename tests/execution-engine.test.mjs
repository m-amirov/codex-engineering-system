import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectCapabilities } from '../src/capabilities.mjs';
import {
  createRun,
  recordCheckpoint,
  recordRoutingTrace,
  refreshRunCapabilities,
  resumeRun
} from '../src/execution-engine.mjs';

function tempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-engine-'));
}

function scope() {
  return {
    target: 'test target',
    inScope: ['behavior'],
    outOfScope: ['release'],
    acceptanceContract: 'verified and freshly re-audited',
    mutationBoundary: 'project files only'
  };
}

function caps(project, {
  web = 'NOT_CONFIGURED',
  image = 'unknown'
} = {}) {
  return {
    schemaVersion: 1,
    ceosVersion: 'test',
    observedAt: new Date().toISOString(),
    projectDir: project,
    filesystem: { exists: true, readable: true, writable: true },
    executables: {},
    project: { manifest: { available: false }, browser: { configured: false } },
    web: { status: web, ready: web === 'READY', source: 'test' },
    imageGeneration: { status: image, source: 'test' },
    nativeAgents: { present: [], missing: [] },
    limitations: []
  };
}

function artifact(project, name, text = name) {
  const file = path.join(project, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return name;
}

test('capability snapshot records live Web result and explicit image-generation attestation', () => {
  const project = tempProject();
  const result = collectCapabilities(project, {
    codexHome: path.join(project, '.codex'),
    webPreflightResult: { status: 'READY', reason: 'ok', manifestFile: 'x', healthUrl: 'y' },
    imageGeneration: 'available'
  });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.filesystem.readable, true);
  assert.equal(result.web.status, 'READY');
  assert.equal(result.web.ready, true);
  assert.equal(result.imageGeneration.status, 'available');
  assert.equal(result.imageGeneration.source, 'cli-attestation');
});

test('createRun persists locked scope, capabilities and deterministic next stage', () => {
  const project = tempProject();
  const result = createRun(project, 'audit-repair-loop', { scope: scope(), capabilities: caps(project) });
  assert.equal(result.run.state, 'CAPABILITIES_CHECKED');
  assert.equal(result.run.nextStage, 'EVIDENCE_COLLECTED');
  assert.equal(result.run.cycle, 1);
  assert.ok(fs.existsSync(path.join(result.runDir, 'scope.json')));
  assert.ok(fs.existsSync(path.join(result.runDir, 'capabilities.json')));
  assert.ok(fs.existsSync(path.join(result.runDir, 'run.json')));
  assert.equal(resumeRun(project, result.run.runId).integrity.ok, true);
});

test('state machine rejects skipped or out-of-order stages', () => {
  const project = tempProject();
  const result = createRun(project, 'audit-repair-loop', { scope: scope(), capabilities: caps(project) });
  const ev = artifact(project, 'evidence.txt');
  assert.throws(
    () => recordCheckpoint(project, result.run.runId, { stage: 'AUDITED', artifacts: [ev] }),
    /expected stage EVIDENCE_COLLECTED/
  );
});

test('zero confirmed defects deterministically skips repair but still requires verification and re-audit', () => {
  const project = tempProject();
  const result = createRun(project, 'audit-repair-loop', { scope: scope(), capabilities: caps(project) });
  const id = result.run.runId;
  const ev = artifact(project, 'evidence.txt');
  const audit = artifact(project, 'audit.json');
  const defects = artifact(project, 'defects.json');

  recordCheckpoint(project, id, { stage: 'EVIDENCE_COLLECTED', artifacts: [ev] });
  recordCheckpoint(project, id, { stage: 'AUDITED', artifacts: [audit] });
  const afterDefects = recordCheckpoint(project, id, {
    stage: 'DEFECTS_CONFIRMED',
    artifacts: [defects],
    metadata: { defectCount: 0 }
  });
  assert.equal(afterDefects.run.state, 'REPAIRING');
  assert.equal(afterDefects.run.nextStage, 'VERIFIED');
  assert.equal(afterDefects.run.checkpointCount, 6);
});

test('fresh PASS cannot bypass observable Web routing when preflight was READY', () => {
  const project = tempProject();
  const result = createRun(project, 'audit-repair-loop', { scope: scope(), capabilities: caps(project, { web: 'READY' }) });
  const id = result.run.runId;
  const files = ['ev','audit','defects','verify','reaudit'].map(x => artifact(project, `${x}.json`));

  recordCheckpoint(project, id, { stage: 'EVIDENCE_COLLECTED', artifacts: [files[0]] });
  recordCheckpoint(project, id, { stage: 'AUDITED', artifacts: [files[1]] });
  recordCheckpoint(project, id, { stage: 'DEFECTS_CONFIRMED', artifacts: [files[2]], metadata: { defectCount: 0 } });
  recordCheckpoint(project, id, { stage: 'VERIFIED', artifacts: [files[3]], outcome: 'PASS' });

  assert.throws(
    () => recordCheckpoint(project, id, { stage: 'REAUDITED', artifacts: [files[4]], outcome: 'PASS' }),
    /requires observable Web review/
  );

  recordRoutingTrace(project, id, { webAgentsUsed: ['ceos_reasoner_web'] });
  const done = recordCheckpoint(project, id, { stage: 'REAUDITED', artifacts: [files[4]], outcome: 'PASS' });
  assert.equal(done.run.verdict, 'PASS');
  assert.equal(done.run.nextStage, null);
});

test('failed fresh re-audit increments cycle and resumes from fresh evidence', () => {
  const project = tempProject();
  const result = createRun(project, 'audit-repair-loop', { scope: scope(), capabilities: caps(project), maxCycles: 2 });
  const id = result.run.runId;
  const names = ['ev','audit','defects','repair','verify','reaudit'];
  const files = Object.fromEntries(names.map(x => [x, artifact(project, `${x}.json`)]));

  recordCheckpoint(project, id, { stage: 'EVIDENCE_COLLECTED', artifacts: [files.ev] });
  recordCheckpoint(project, id, { stage: 'AUDITED', artifacts: [files.audit] });
  recordCheckpoint(project, id, { stage: 'DEFECTS_CONFIRMED', artifacts: [files.defects], metadata: { defectCount: 1 } });
  recordCheckpoint(project, id, { stage: 'REPAIRING', artifacts: [files.repair] });
  recordCheckpoint(project, id, { stage: 'VERIFIED', artifacts: [files.verify], outcome: 'PASS' });
  const retry = recordCheckpoint(project, id, { stage: 'REAUDITED', artifacts: [files.reaudit], outcome: 'FAIL' });

  assert.equal(retry.run.cycle, 2);
  assert.equal(retry.run.nextStage, 'EVIDENCE_COLLECTED');
  assert.equal(retry.run.verdict, null);
});

test('resume detects changed checkpoint artifacts and blocks further progression', () => {
  const project = tempProject();
  const result = createRun(project, 'audit-repair-loop', { scope: scope(), capabilities: caps(project) });
  const ev = artifact(project, 'evidence.txt', 'before');
  recordCheckpoint(project, result.run.runId, { stage: 'EVIDENCE_COLLECTED', artifacts: [ev] });
  fs.writeFileSync(path.join(project, ev), 'after');

  const resumed = resumeRun(project, result.run.runId);
  assert.equal(resumed.integrity.ok, false);
  assert.equal(resumed.nextAction.stage, 'INTEGRITY_BLOCKED');
  assert.ok(resumed.integrity.issues.some(x => x.includes('artifact changed')));
});

test('Web-required blocked run can resume after refreshed READY capability', () => {
  const project = tempProject();
  const result = createRun(project, 'audit-repair-loop', {
    scope: scope(),
    capabilities: caps(project, { web: 'NOT_CONFIGURED' }),
    webRequired: true
  });
  assert.equal(result.run.verdict, 'BLOCKED');
  assert.equal(result.run.stopReason.code, 'WEB_REQUIRED_NOT_READY');

  const reopened = refreshRunCapabilities(project, result.run.runId, caps(project, { web: 'READY' }));
  assert.equal(reopened.run.verdict, null);
  assert.equal(reopened.run.state, 'CAPABILITIES_CHECKED');
  assert.equal(reopened.run.nextStage, 'EVIDENCE_COLLECTED');
  assert.equal(reopened.integrity.ok, true);
});

test('production-art refuses generation until native image capability is explicitly available', () => {
  const project = tempProject();
  const result = createRun(project, 'production-art', {
    scope: scope(),
    capabilities: caps(project, { image: 'unknown' })
  });
  const id = result.run.runId;
  const inventory = artifact(project, 'manifest.json');
  const canon = artifact(project, 'canon.json');
  const generated = artifact(project, 'generated.json');

  recordCheckpoint(project, id, { stage: 'INVENTORIED', artifacts: [inventory] });
  recordCheckpoint(project, id, { stage: 'CANON_READY', artifacts: [canon] });
  assert.throws(
    () => recordCheckpoint(project, id, { stage: 'GENERATING', artifacts: [generated] }),
    /requires image-generation capability = available/
  );

  const refreshed = refreshRunCapabilities(project, id, caps(project, { image: 'available' }));
  assert.equal(refreshed.integrity.ok, true);
  const after = recordCheckpoint(project, id, { stage: 'GENERATING', artifacts: [generated] });
  assert.equal(after.run.nextStage, 'INTEGRATED');
});
