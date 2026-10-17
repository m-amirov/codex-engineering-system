import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { collectCapabilities } from '../src/capabilities.mjs';
import { encodeProductionPng } from '../src/art-output-gate.mjs';
import {
  createRun,
  recordCheckpoint,
  recordRoutingTrace,
  refreshRunCapabilities,
  reopenBlockedRun,
  inspectBlockedRunRecovery,
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
  image = 'unknown',
  imagePresence,
  serviceAvailability,
  trustedForGeneration
} = {}) {
  const presence = imagePresence ?? (image === 'available' ? 'PRESENT' : image === 'unavailable' ? 'ABSENT' : 'UNKNOWN');
  const service = serviceAvailability ?? (image === 'available' ? 'available' : image === 'unavailable' ? 'unavailable' : 'unknown');
  const trusted = trustedForGeneration ?? (image === 'available');
  return {
    schemaVersion: 1,
    ceosVersion: 'test',
    observedAt: new Date().toISOString(),
    projectDir: project,
    filesystem: { exists: true, readable: true, writable: true },
    executables: {},
    project: { manifest: { available: false }, browser: { configured: false } },
    web: { status: web, ready: web === 'READY', source: 'test' },
    imageGeneration: {
      status: image,
      source: 'test',
      capabilityPresence: presence,
      serviceAvailability: service,
      trustedForGeneration: trusted,
      generationAllowed: trusted && presence === 'PRESENT' && !['unavailable', 'rate_limited', 'usage_limit_reached'].includes(service)
    },
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

function digestFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function gitProject() {
  const project = tempProject();
  fs.writeFileSync(path.join(project, 'source.txt'), 'source-bound dependency');
  for (const args of [
    ['init', '-q'],
    ['config', 'user.name', 'CEOS Test'],
    ['config', 'user.email', 'ceos-test@example.invalid'],
    ['add', '.'],
    ['-c', 'user.name=CEOS Test', '-c', 'user.email=ceos-test@example.invalid', 'commit', '-qm', 'fixture']
  ]) {
    const result = spawnSync('git', ['-C', project, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  return project;
}

function existingReuseFixture(project, overrides = {}) {
  const portrait = path.join(project, 'art', 'scene-portrait.png');
  const desktop = path.join(project, 'art', 'scene-desktop.png');
  fs.mkdirSync(path.dirname(portrait), { recursive: true });
  fs.writeFileSync(portrait, encodeProductionPng({ width: 2, height: 3, pixels: Buffer.alloc(2 * 3 * 4, 180) }));
  fs.writeFileSync(desktop, encodeProductionPng({ width: 16, height: 9, pixels: Buffer.alloc(16 * 9 * 4, 120) }));
  const assetManifestPath = path.join(project, 'existing-assets.json');
  fs.writeFileSync(assetManifestPath, JSON.stringify({
    schemaVersion: 1,
    assets: [
      { id: 'scene-portrait', format: 'portrait', path: 'art/scene-portrait.png', kind: 'background', width: 2, height: 3, sha256: digestFile(portrait) },
      { id: 'scene-desktop', format: 'desktop', path: 'art/scene-desktop.png', kind: 'background', width: 16, height: 9, sha256: digestFile(desktop) }
    ]
  }, null, 2));
  const evidence = {};
  for (const name of ['provenance.json', 'acceptance.json', 'runtime.json', 'canon.json']) {
    const file = path.join(project, name);
    fs.writeFileSync(file, JSON.stringify({ name, status: 'PASS' }));
    evidence[name] = { path: name, sha256: digestFile(file) };
  }
  const runtimePixels = path.join(project, 'runtime.png');
  fs.writeFileSync(runtimePixels, encodeProductionPng({ width: 16, height: 9, pixels: Buffer.alloc(16 * 9 * 4, 90) }));
  const runtimePortrait = path.join(project, 'runtime-portrait.png');
  fs.writeFileSync(runtimePortrait, encodeProductionPng({ width: 2, height: 3, pixels: Buffer.alloc(2 * 3 * 4, 90) }));
  const head = spawnSync('git', ['-C', project, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const contract = {
    schemaVersion: 1,
    mode: 'VERIFIED_EXISTING_ART_REUSE',
    generationInvoked: false,
    sourceHead: head,
    dependencies: [{ path: 'source.txt', sha256: digestFile(path.join(project, 'source.txt')) }],
    assetManifest: 'existing-assets.json',
    assetManifestSha256: digestFile(assetManifestPath),
    provenance: { status: 'DOCUMENTED', sourceHead: head, evidence: evidence['provenance.json'].path, evidenceSha256: evidence['provenance.json'].sha256 },
    artAcceptance: {
      profile: 'NARRATIVE_ART_ACCEPTANCE_V2', status: 'PASS', actualPixelsReceived: true,
      sourceHead: head, evidence: evidence['acceptance.json'].path, evidenceSha256: evidence['acceptance.json'].sha256,
      reviewedItems: ['scene-portrait', 'scene-desktop'], unresolved: []
    },
    runtimeEvidence: {
      status: 'PASS', actualPixelsReceived: true, sourceHead: head,
      evidence: evidence['runtime.json'].path, evidenceSha256: evidence['runtime.json'].sha256,
      screenshots: [
        { path: 'runtime-portrait.png', sha256: digestFile(runtimePortrait) },
        { path: 'runtime.png', sha256: digestFile(runtimePixels) }
      ]
    },
    canon: { status: 'CURRENT', sourceHead: head, evidence: evidence['canon.json'].path, evidenceSha256: evidence['canon.json'].sha256 },
    issueSummary: { openP0: 0, openP1: 0, openMaterialP2: 0 },
    receipts: [evidence['acceptance.json'], evidence['runtime.json']]
  };
  return {
    contract: { ...contract, ...overrides },
    portrait,
    desktop,
    assetManifestPath,
    runtimePixels,
    head
  };
}

function reuseRun(project) {
  const fixture = existingReuseFixture(project);
  const start = createRun(project, 'production-art', {
    scope: scope(),
    capabilities: caps(project, { image: 'unknown' }),
    artMode: 'VERIFIED_EXISTING_ART_REUSE'
  });
  const id = start.run.runId;
  recordCheckpoint(project, id, { stage: 'INVENTORIED', artifacts: ['source.txt'] });
  recordCheckpoint(project, id, { stage: 'CANON_READY', artifacts: ['canon.json'] });
  return { ...fixture, id, start };
}

function passedArtOutputs(project) {
  const rel = 'production-asset.png';
  const pixels = Buffer.alloc(16 * 16 * 4);
  for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) {
    const i = (y * 16 + x) * 4;
    pixels.set([100, 60, 40, 255], i);
  }
  fs.writeFileSync(path.join(project, rel), encodeProductionPng({ width: 16, height: 16, pixels }));
  return { artOutputs: [{ path: rel, kind: 'sprite', width: 16, height: 16 }] };
}
function passMetadata(overrides = {}) {
  return {
    evidenceContract: {
      schemaVersion: 1,
      assertionsExecuted: 1,
      claims: [
        { id: 'acceptance', assertionId: 'test:acceptance', status: 'PASS', executions: 1 }
      ],
      coverage: { scope: 'declared acceptance scope', checked: 1, total: 1, complete: true },
      unresolved: [],
      ...overrides
    }
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function blockedProductionRun(project, { maxCycles = 3, reason = 'mandatory independent Web High art-direction review unavailable after transport failure' } = {}) {
  const result = createRun(project, 'production-art', {
    scope: scope(),
    capabilities: caps(project, { web: 'READY', image: 'available' }),
    webRequired: true,
    maxCycles
  });
  const id = result.run.runId;
  const files = ['inventory', 'canon', 'generated', 'integrated', 'visual'].map(name => artifact(project, `${name}.json`));
  recordCheckpoint(project, id, { stage: 'INVENTORIED', artifacts: [files[0]] });
  recordCheckpoint(project, id, { stage: 'CANON_READY', artifacts: [files[1]] });
  recordCheckpoint(project, id, { stage: 'GENERATING', artifacts: [files[2]], metadata: passedArtOutputs(project) });
  recordCheckpoint(project, id, { stage: 'INTEGRATED', artifacts: [files[3]] });
  recordCheckpoint(project, id, {
    stage: 'VISUAL_VERIFIED',
    artifacts: [files[4]],
    outcome: 'BLOCKED',
    note: reason
  });
  return { id, files };
}

function completeProductionRun(project) {
  const result = createRun(project, 'production-art', {
    scope: scope(),
    capabilities: caps(project, { web: 'READY', image: 'available' }),
    webRequired: true
  });
  const id = result.run.runId;
  const files = ['inventory', 'canon', 'generated', 'integrated', 'visual', 'reaudit'].map(name => artifact(project, `${name}.json`));
  recordCheckpoint(project, id, { stage: 'INVENTORIED', artifacts: [files[0]] });
  recordCheckpoint(project, id, { stage: 'CANON_READY', artifacts: [files[1]] });
  recordCheckpoint(project, id, { stage: 'GENERATING', artifacts: [files[2]], metadata: passedArtOutputs(project) });
  recordCheckpoint(project, id, { stage: 'INTEGRATED', artifacts: [files[3]] });
  recordCheckpoint(project, id, { stage: 'VISUAL_VERIFIED', artifacts: [files[4]] });
  recordRoutingTrace(project, id, { webAgentsUsed: ['ceos_art_director_web'] });
  recordCheckpoint(project, id, { stage: 'REAUDITED', artifacts: [files[5]], outcome: 'PASS', metadata: passMetadata() });
  return id;
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

test('session-bound host callable inventory records trusted presence without claiming service availability', () => {
  const project = tempProject();
  const home = path.join(project, '.codex');
  fs.mkdirSync(path.join(home, 'ceos', 'runtime'), { recursive: true });
  fs.writeFileSync(path.join(home, 'ceos', 'runtime', 'current-session.json'), JSON.stringify({ sessionId: 's1' }));
  fs.writeFileSync(path.join(home, 'ceos', 'native-capabilities.json'), JSON.stringify({ sessionId: 's1', capabilities: { 'image-generation': { provider: 'native-host', callable: true } } }));
  const result = collectCapabilities(project, { codexHome: home });
  assert.equal(result.imageGeneration.capabilityPresence, 'PRESENT');
  assert.equal(result.imageGeneration.callable, true);
  assert.equal(result.imageGeneration.serviceAvailability, 'unknown');
  assert.equal(result.imageGeneration.status, 'unknown');
  assert.equal(result.imageGeneration.trustedForGeneration, true);
  assert.equal(result.imageGeneration.generationAllowed, true);
});

test('host capability absent remains fail-closed', () => {
  const project = tempProject();
  const result = collectCapabilities(project, { codexHome: path.join(project, '.codex') });
  assert.equal(result.imageGeneration.capabilityPresence, 'UNKNOWN');
  assert.equal(result.imageGeneration.status, 'unknown');
});

test('host explicit service availability can be available only when session-bound and attested', () => {
  const project = tempProject();
  const home = path.join(project, '.codex');
  fs.mkdirSync(path.join(home, 'ceos', 'runtime'), { recursive: true });
  fs.writeFileSync(path.join(home, 'ceos', 'runtime', 'current-session.json'), JSON.stringify({ sessionId: 's1' }));
  fs.writeFileSync(path.join(home, 'ceos', 'native-capabilities.json'), JSON.stringify({ sessionId: 's1', capabilities: { 'image-generation': { callable: true, serviceAvailability: 'available' } } }));
  const result = collectCapabilities(project, { codexHome: home });
  assert.equal(result.imageGeneration.status, 'available');
  assert.equal(result.imageGeneration.serviceAvailability, 'available');
  assert.equal(result.imageGeneration.trustedForGeneration, true);
});

test('legacy environment attestation remains diagnostic-only', () => {
  const project = tempProject();
  const previous = process.env.CEOS_IMAGE_GENERATION_CAPABILITY;
  process.env.CEOS_IMAGE_GENERATION_CAPABILITY = 'available';
  try {
    const result = collectCapabilities(project, { codexHome: path.join(project, '.codex') });
    assert.equal(result.imageGeneration.status, 'available');
    assert.equal(result.imageGeneration.source, 'environment-attestation');
    assert.equal(result.imageGeneration.trustedForGeneration, false);
    assert.equal(result.imageGeneration.generationAllowed, false);
  } finally {
    if (previous === undefined) delete process.env.CEOS_IMAGE_GENERATION_CAPABILITY;
    else process.env.CEOS_IMAGE_GENERATION_CAPABILITY = previous;
  }
});

test('fresh session-bound host evidence takes precedence over manual overrides', () => {
  const project = tempProject();
  const home = path.join(project, '.codex');
  fs.mkdirSync(path.join(home, 'ceos', 'runtime'), { recursive: true });
  fs.writeFileSync(path.join(home, 'ceos', 'runtime', 'current-session.json'), JSON.stringify({ sessionId: 's1' }));
  fs.writeFileSync(path.join(home, 'ceos', 'native-capabilities.json'), JSON.stringify({ sessionId: 's1', capabilities: { 'image-generation': { callable: true, serviceAvailability: 'available' } } }));
  const previous = process.env.CEOS_IMAGE_GENERATION_CAPABILITY;
  process.env.CEOS_IMAGE_GENERATION_CAPABILITY = 'unavailable';
  try {
    const result = collectCapabilities(project, { codexHome: home, imageGeneration: 'unknown' });
    assert.equal(result.imageGeneration.status, 'available');
    assert.equal(result.imageGeneration.source, 'host-attestation');
    assert.equal(result.imageGeneration.trustedForGeneration, true);
  } finally {
    if (previous === undefined) delete process.env.CEOS_IMAGE_GENERATION_CAPABILITY;
    else process.env.CEOS_IMAGE_GENERATION_CAPABILITY = previous;
  }
});

test('malformed host inventory and project-local lookalike do not attest capability', () => {
  const project = tempProject();
  fs.writeFileSync(path.join(project, 'native-capabilities.json'), JSON.stringify({ capabilities: { 'image-generation': { callable: true, serviceAvailability: 'available' } } }));
  const home = path.join(project, '.codex');
  fs.mkdirSync(path.join(home, 'ceos'), { recursive: true });
  fs.writeFileSync(path.join(home, 'ceos', 'native-capabilities.json'), '{not-json');
  const result = collectCapabilities(project, { codexHome: home });
  assert.equal(result.imageGeneration.capabilityPresence, 'UNKNOWN');
  assert.equal(result.imageGeneration.serviceAvailability, 'unknown');
  assert.equal(result.imageGeneration.status, 'unknown');
  assert.equal(result.imageGeneration.source, 'unobserved');
});

test('host service availability blocks generation on usage/rate limits', () => {
  for (const serviceAvailability of ['usage_limit_reached', 'rate_limited']) {
    const project = tempProject();
    const home = path.join(project, '.codex');
    fs.mkdirSync(path.join(home, 'ceos', 'runtime'), { recursive: true });
    fs.writeFileSync(path.join(home, 'ceos', 'runtime', 'current-session.json'), JSON.stringify({ sessionId: 's1' }));
    fs.writeFileSync(path.join(home, 'ceos', 'native-capabilities.json'), JSON.stringify({ sessionId: 's1', capabilities: { 'image-generation': { callable: true, serviceAvailability } } }));
    const result = collectCapabilities(project, { codexHome: home });
    assert.equal(result.imageGeneration.capabilityPresence, 'PRESENT');
    assert.equal(result.imageGeneration.serviceAvailability, serviceAvailability);
    assert.equal(result.imageGeneration.generationAllowed, false);
  }
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

test('terminal PASS rejects fake-zero evidence even when an artifact exists', () => {
  const project = tempProject();
  const result = createRun(project, 'audit-repair-loop', { scope: scope(), capabilities: caps(project) });
  const id = result.run.runId;
  const files = ['ev','audit','defects','verify','reaudit'].map(x => artifact(project, `${x}.json`));

  recordCheckpoint(project, id, { stage: 'EVIDENCE_COLLECTED', artifacts: [files[0]] });
  recordCheckpoint(project, id, { stage: 'AUDITED', artifacts: [files[1]] });
  recordCheckpoint(project, id, { stage: 'DEFECTS_CONFIRMED', artifacts: [files[2]], metadata: { defectCount: 0 } });
  recordCheckpoint(project, id, { stage: 'VERIFIED', artifacts: [files[3]], outcome: 'PASS' });

  assert.throws(
    () => recordCheckpoint(project, id, {
      stage: 'REAUDITED',
      artifacts: [files[4]],
      outcome: 'PASS',
      metadata: passMetadata({ assertionsExecuted: 0 })
    }),
    /SEMANTIC_ASSERTIONS_MISSING/
  );
  assert.equal(resumeRun(project, id).run.verdict, null);
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
  const done = recordCheckpoint(project, id, { stage: 'REAUDITED', artifacts: [files[4]], outcome: 'PASS', metadata: passMetadata() });
  assert.equal(done.run.verdict, 'PASS');
  assert.equal(done.run.nextStage, null);
});

test('native fallback rejects semantic reviewer outcomes when Web transport is unavailable', () => {
  const project = tempProject();
  const result = createRun(project, 'audit-repair-loop', {
    scope: scope(),
    capabilities: caps(project, { web: 'UNAVAILABLE' }),
    webReviewMode: 'enhanced'
  });
  const id = result.run.runId;
  recordCheckpoint(project, id, { stage: 'EVIDENCE_COLLECTED', artifacts: [artifact(project, 'evidence.json')] });
  recordRoutingTrace(project, id, {
    nativeFallbackUsed: true,
    fallbackReason: 'reviewer found an unresolved semantic defect'
  });

  assert.throws(
    () => recordCheckpoint(project, id, { stage: 'AUDITED', artifacts: [artifact(project, 'audit.json')] }),
    /WEB_REVIEW_NOT_VERIFIED|transport|fallback/i
  );
});

test('native fallback accepts explicit Web transport failure states', () => {
  const project = tempProject();
  const result = createRun(project, 'audit-repair-loop', {
    scope: scope(),
    capabilities: caps(project, { web: 'RATE_LIMITED' }),
    webReviewMode: 'enhanced'
  });
  const id = result.run.runId;
  recordCheckpoint(project, id, { stage: 'EVIDENCE_COLLECTED', artifacts: [artifact(project, 'evidence.json')] });
  recordRoutingTrace(project, id, {
    nativeFallbackUsed: true,
    fallbackReason: 'health endpoint returned HTTP 429; Retry-After is 180 seconds'
  });

  const audited = recordCheckpoint(project, id, { stage: 'AUDITED', artifacts: [artifact(project, 'audit.json')] });
  assert.equal(audited.run.nextStage, 'DEFECTS_CONFIRMED');
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

test('Web-required blocked run stays terminal after refresh until explicitly reopened', () => {
  const project = tempProject();
  const result = createRun(project, 'audit-repair-loop', {
    scope: scope(),
    capabilities: caps(project, { web: 'NOT_CONFIGURED' }),
    webRequired: true
  });
  assert.equal(result.run.verdict, 'BLOCKED');
  assert.equal(result.run.stopReason.code, 'WEB_REQUIRED_NOT_READY');

  const reopened = refreshRunCapabilities(project, result.run.runId, caps(project, { web: 'READY' }));
  assert.equal(reopened.run.verdict, 'BLOCKED');
  assert.equal(reopened.run.state, 'BLOCKED');
  const explicitlyReopened = reopenBlockedRun(project, result.run.runId, { reason: 'Web capability recovered' });
  assert.equal(explicitlyReopened.run.verdict, null);
  assert.equal(explicitlyReopened.run.state, 'CAPABILITIES_CHECKED');
  assert.equal(explicitlyReopened.run.nextStage, 'EVIDENCE_COLLECTED');
  assert.equal(reopened.integrity.ok, true);
});

test('recoverable Web BLOCKED production run reopens at visual review and can pass re-audit', () => {
  const project = tempProject();
  const { id } = blockedProductionRun(project);
  const before = resumeRun(project, id);
  const scopeHash = before.run.scopeSha256;
  const checkpointDir = path.join(before.runDir, 'checkpoints');
  const beforeFiles = fs.readdirSync(checkpointDir).sort();
  assert.equal(before.run.verdict, 'BLOCKED');
  assert.equal(before.run.stopReason.stage, 'VISUAL_VERIFIED');

  const reopened = reopenBlockedRun(project, id, {
    reason: 'Web High recovered; fresh S55 rework evidence is available for formal visual re-audit.'
  });
  assert.equal(reopened.run.verdict, null);
  assert.equal(reopened.run.completedAt, null);
  assert.equal(reopened.run.state, 'VISUAL_VERIFIED');
  assert.equal(reopened.run.nextStage, 'VISUAL_VERIFIED');
  assert.equal(reopened.run.scopeSha256, scopeHash);
  assert.equal(reopened.integrity.ok, true);

  const afterFiles = fs.readdirSync(checkpointDir).sort();
  assert.equal(afterFiles.length, beforeFiles.length + 1);
  assert.ok(afterFiles.some(file => file.endsWith('-run-reopened.json')));
  const reopenedCheckpoint = readJson(path.join(checkpointDir, afterFiles.find(file => file.endsWith('-run-reopened.json'))));
  assert.equal(reopenedCheckpoint.stage, 'RUN_REOPENED');
  assert.equal(reopenedCheckpoint.previousVerdict, 'BLOCKED');
  assert.equal(reopenedCheckpoint.previousStopReason.stage, 'VISUAL_VERIFIED');
  assert.match(reopenedCheckpoint.reopenReason, /fresh S55/);
  assert.ok(afterFiles.some(file => file.includes('visual-verified')));

  recordCheckpoint(project, id, { stage: 'VISUAL_VERIFIED', artifacts: ['visual.json'], outcome: 'PASS' });
  recordRoutingTrace(project, id, { webAgentsUsed: ['ceos_art_director_web'] });
  artifact(project, 'reaudit.json');
  const done = recordCheckpoint(project, id, { stage: 'REAUDITED', artifacts: ['reaudit.json'], outcome: 'PASS', metadata: passMetadata() });
  assert.equal(done.run.verdict, 'PASS');
  assert.equal(done.run.nextStage, null);
});

test('blocked run with integrity failure cannot be reopened', () => {
  const project = tempProject();
  const { id } = blockedProductionRun(project);
  const run = resumeRun(project, id).run;
  fs.writeFileSync(path.join(run.runDir, 'scope.json'), 'changed');
  assert.throws(
    () => reopenBlockedRun(project, id, { reason: 'Web High recovered' }),
    /integrity check failed/i
  );
});

test('reopen rejects PASS, FAIL, ESCALATE, and arbitrary manual blockers', () => {
  const passProject = tempProject();
  const passId = completeProductionRun(passProject);
  assert.throws(
    () => reopenBlockedRun(passProject, passId, { reason: 'retry' }),
    /only BLOCKED runs/i
  );

  for (const outcome of ['FAIL', 'ESCALATE']) {
    const project = tempProject();
    const { id } = blockedProductionRun(project, { maxCycles: 1, reason: 'temporary Web High transport unavailable' });
    // Replace the recoverable terminal with the requested terminal outcome in a fresh run.
    const runFile = path.join(project, '.ceos-runs', id, 'run.json');
    const run = JSON.parse(fs.readFileSync(runFile, 'utf8'));
    run.state = outcome;
    run.verdict = outcome;
    run.stopReason = { code: `STAGE_${outcome}`, stage: 'VISUAL_VERIFIED', reason: `terminal ${outcome}` };
    run.completedAt = new Date().toISOString();
    fs.writeFileSync(runFile, `${JSON.stringify(run, null, 2)}\n`);
    assert.throws(
      () => reopenBlockedRun(project, id, { reason: 'retry' }),
      /only BLOCKED runs/i
    );
  }

  const manualProject = tempProject();
  const { id: manualId } = blockedProductionRun(manualProject, { reason: 'manual blocker: reviewer uncertain' });
  assert.throws(
    () => reopenBlockedRun(manualProject, manualId, { reason: 'retry' }),
    /not recoverable/i
  );
});

test('reopen requires an explicit reason and cannot be repeated without a new BLOCKED state', () => {
  const project = tempProject();
  const { id } = blockedProductionRun(project);
  assert.throws(() => reopenBlockedRun(project, id), /reason is required/i);
  reopenBlockedRun(project, id, { reason: 'Web High recovered' });
  assert.throws(
    () => reopenBlockedRun(project, id, { reason: 'Web High recovered again' }),
    /only BLOCKED runs/i
  );
});

test('production-art requires fresh trusted presence and accepts PRESENT with UNKNOWN service', () => {
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
    /requires fresh trusted native image-generation presence/
  );

  const refreshed = refreshRunCapabilities(project, id, caps(project, {
    image: 'unknown',
    imagePresence: 'PRESENT',
    serviceAvailability: 'unknown',
    trustedForGeneration: true
  }));
  assert.equal(refreshed.integrity.ok, true);
  const after = recordCheckpoint(project, id, { stage: 'GENERATING', artifacts: [generated], metadata: passedArtOutputs(project) });
  assert.equal(after.run.nextStage, 'INTEGRATED');
});

test('new production-art GENERATING checkpoint fails closed on opaque or missing output metadata',()=>{
  const project=tempProject();
  const start=createRun(project,'production-art',{ scope: scope(), capabilities: caps(project,{image:'available'}) });
  assert.equal(start.run.artOutputGateRequired,true);
  const id=start.run.runId;
  const art=artifact(project,'source.txt');
  recordCheckpoint(project,id,{stage:'INVENTORIED',artifacts:[art]});
  recordCheckpoint(project,id,{stage:'CANON_READY',artifacts:[art]});
  assert.throws(()=>recordCheckpoint(project,id,{stage:'GENERATING',artifacts:[art]}),/output gate refused/);
  const outputs=passedArtOutputs(project);
  // Alter the source so every pixel is opaque, mimicking a checkerboard sprite.
  fs.writeFileSync(path.join(project,'production-asset.png'),encodeProductionPng({
    width:16,height:16,pixels:Buffer.from(Array.from({length:16*16},()=>[230,230,230,255]).flat())
  }));
  assert.throws(()=>recordCheckpoint(project,id,{stage:'GENERATING',artifacts:[art],metadata:outputs}),/ART_ALPHA_MISSING_OR_OPAQUE/);
  const passed=passedArtOutputs(project);
  const result=recordCheckpoint(project,id,{stage:'GENERATING',artifacts:[art],metadata:passed});
  assert.equal(result.run.nextStage,'INTEGRATED');
  const checkpoint=fs.readdirSync(path.join(start.runDir,'checkpoints')).filter(f=>f.includes('generating')).map(f=>readJson(path.join(start.runDir,'checkpoints',f)))[0];
  assert.equal(checkpoint.metadata.artOutputGate.status,'PASS_ART_BATCH_MECHANICAL');
  assert.ok(checkpoint.artifacts.some(x=>x.path.endsWith('production-asset.png')));
});

test('existing legacy production-art run is not retroactively gated',()=>{
  const project=tempProject();
  const start=createRun(project,'production-art',{scope:scope(),capabilities:caps(project,{image:'available'})});
  const id=start.run.runId;
  const file=path.join(start.runDir,'run.json');
  const legacy=readJson(file);
  delete legacy.artOutputGateRequired;
  fs.writeFileSync(file,JSON.stringify(legacy,null,2));
  const art=artifact(project,'prior.txt');
  recordCheckpoint(project,id,{stage:'INVENTORIED',artifacts:[art]});
  recordCheckpoint(project,id,{stage:'CANON_READY',artifacts:[art]});
  const result=recordCheckpoint(project,id,{stage:'GENERATING',artifacts:[art]});
  assert.equal(result.run.nextStage,'INTEGRATED');
});

test('VERIFIED_EXISTING_ART_REUSE validates real files and advances without image generation', () => {
  const project = gitProject();
  const fixture = reuseRun(project);
  const result = recordCheckpoint(project, fixture.id, {
    stage: 'GENERATING',
    artifacts: ['canon.json'],
    metadata: { existingArtReuse: fixture.contract }
  });
  assert.equal(result.run.artMode, 'VERIFIED_EXISTING_ART_REUSE');
  assert.equal(result.run.nextStage, 'INTEGRATED');
  assert.equal(fixture.start.capabilities.imageGeneration.generationAllowed, false);
  const checkpoint = fs.readdirSync(path.join(fixture.start.runDir, 'checkpoints'))
    .find(file => file.includes('generating'));
  const saved = JSON.parse(fs.readFileSync(path.join(fixture.start.runDir, 'checkpoints', checkpoint), 'utf8'));
  assert.equal(saved.metadata.existingArtReuse.mode, 'VERIFIED_EXISTING_ART_REUSE');
  assert.ok(saved.artifacts.some(entry => entry.path.endsWith('scene-portrait.png')));
});

test('VERIFIED_EXISTING_ART_REUSE permits a dependency-only HEAD change', () => {
  const project = gitProject();
  const fixture = reuseRun(project);
  const commit = spawnSync('git', ['-C', project, 'commit', '--allow-empty', '-qm', 'dependency-only integration head'], { encoding: 'utf8' });
  assert.equal(commit.status, 0, commit.stderr);
  const currentHead = spawnSync('git', ['-C', project, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  assert.notEqual(currentHead, fixture.head);
  const contract = {
    ...fixture.contract,
    currentness: { mode: 'DEPENDENCY_BASED_REUSE', baseHead: fixture.head }
  };
  const result = recordCheckpoint(project, fixture.id, {
    stage: 'GENERATING',
    artifacts: ['canon.json'],
    metadata: { existingArtReuse: contract }
  });
  assert.equal(result.run.nextStage, 'INTEGRATED');
});

test('VERIFIED_EXISTING_ART_REUSE reuses current acceptance without new Web High routing', () => {
  const project = gitProject();
  const fixture = existingReuseFixture(project);
  const start = createRun(project, 'production-art', {
    scope: scope(), capabilities: caps(project, { web: 'READY', image: 'unknown' }),
    webRequired: true, webReviewMode: 'enhanced', artMode: 'VERIFIED_EXISTING_ART_REUSE'
  });
  const id = start.run.runId;
  recordCheckpoint(project, id, { stage: 'INVENTORIED', artifacts: ['source.txt'] });
  recordCheckpoint(project, id, { stage: 'CANON_READY', artifacts: ['canon.json'] });
  recordCheckpoint(project, id, { stage: 'GENERATING', metadata: { existingArtReuse: fixture.contract } });
  recordCheckpoint(project, id, { stage: 'INTEGRATED', artifacts: ['source.txt'] });
  recordCheckpoint(project, id, { stage: 'VISUAL_VERIFIED', artifacts: ['runtime.png'] });
  const result = recordCheckpoint(project, id, {
    stage: 'REAUDITED', artifacts: ['acceptance.json'], outcome: 'PASS', metadata: passMetadata({ sourceHead: fixture.head })
  });
  assert.equal(result.run.state, 'PASS');
});

test('narrative existing-art reuse also validates dual-format scene mapping', () => {
  const project = gitProject();
  const fixture = existingReuseFixture(project);
  fs.mkdirSync(path.join(project, 'config'), { recursive: true });
  fs.mkdirSync(path.join(project, 'narrative'), { recursive: true });
  fs.writeFileSync(path.join(project, 'config', 'narrative-game.local.json'), JSON.stringify({
    profile: 'narrative-game', enabled: true, modelPath: 'narrative/graph.json'
  }));
  fs.writeFileSync(path.join(project, 'narrative', 'graph.json'), JSON.stringify({ scenes: [{ id: 'S01', episode: 1 }] }));

  const portrait = path.join(project, 'art', 'scene-portrait.png');
  const desktop = path.join(project, 'art', 'scene-desktop.png');
  fs.writeFileSync(portrait, encodeProductionPng({ width: 768, height: 1152, pixels: Buffer.alloc(768 * 1152 * 4, 180) }));
  fs.writeFileSync(desktop, encodeProductionPng({ width: 1280, height: 720, pixels: Buffer.alloc(1280 * 720 * 4, 120) }));
  const manifest = {
    schemaVersion: 1,
    assets: [
      { id: 'scene-portrait', format: 'portrait', path: 'art/scene-portrait.png', kind: 'background', width: 768, height: 1152, sha256: digestFile(portrait) },
      { id: 'scene-desktop', format: 'desktop', path: 'art/scene-desktop.png', kind: 'background', width: 1280, height: 720, sha256: digestFile(desktop) }
    ]
  };
  fs.writeFileSync(fixture.assetManifestPath, JSON.stringify(manifest, null, 2));
  const dualFormatManifest = {
    schemaVersion: 1, profile: 'narrative-game', episode: 1, sourceHead: fixture.head,
    sceneAssets: { S01: 'scene-1' },
    assets: {
      'scene-1': {
        portrait: { path: 'art/scene-portrait.png', sha256: digestFile(portrait), width: 768, height: 1152 },
        desktop: { path: 'art/scene-desktop.png', sha256: digestFile(desktop), width: 1280, height: 720 }
      }
    }
  };
  fs.writeFileSync(path.join(project, 'dual-format.json'), JSON.stringify(dualFormatManifest, null, 2));
  const contract = {
    ...fixture.contract,
    assetManifestSha256: digestFile(fixture.assetManifestPath),
    dualFormatManifest: 'dual-format.json'
  };
  const start = createRun(project, 'production-art', {
    scope: scope(), capabilities: caps(project, { image: 'unknown' }),
    artMode: 'VERIFIED_EXISTING_ART_REUSE'
  });
  recordCheckpoint(project, start.run.runId, { stage: 'INVENTORIED', artifacts: ['source.txt'] });
  recordCheckpoint(project, start.run.runId, { stage: 'CANON_READY', artifacts: ['canon.json'] });
  const result = recordCheckpoint(project, start.run.runId, {
    stage: 'GENERATING', metadata: { existingArtReuse: contract }
  });
  assert.equal(result.run.nextStage, 'INTEGRATED');
});

test('narrative dependency-based reuse carries currentness through integration', () => {
  const project = gitProject();
  const fixture = existingReuseFixture(project);
  fs.mkdirSync(path.join(project, 'config'), { recursive: true });
  fs.mkdirSync(path.join(project, 'narrative'), { recursive: true });
  fs.writeFileSync(path.join(project, 'config', 'narrative-game.local.json'), JSON.stringify({
    profile: 'narrative-game', enabled: true, modelPath: 'narrative/graph.json'
  }));
  fs.writeFileSync(path.join(project, 'narrative', 'graph.json'), JSON.stringify({ scenes: [{ id: 'S01', episode: 1 }] }));
  const portrait = path.join(project, 'art', 'scene-portrait.png');
  const desktop = path.join(project, 'art', 'scene-desktop.png');
  fs.writeFileSync(portrait, encodeProductionPng({ width: 768, height: 1152, pixels: Buffer.alloc(768 * 1152 * 4, 180) }));
  fs.writeFileSync(desktop, encodeProductionPng({ width: 1280, height: 720, pixels: Buffer.alloc(1280 * 720 * 4, 120) }));
  fs.writeFileSync(fixture.assetManifestPath, JSON.stringify({
    schemaVersion: 1,
    assets: [
      { id: 'scene-portrait', format: 'portrait', path: 'art/scene-portrait.png', kind: 'background', width: 768, height: 1152, sha256: digestFile(portrait) },
      { id: 'scene-desktop', format: 'desktop', path: 'art/scene-desktop.png', kind: 'background', width: 1280, height: 720, sha256: digestFile(desktop) }
    ]
  }, null, 2));
  const dual = {
    schemaVersion: 1, profile: 'narrative-game', episode: 1, sourceHead: fixture.head,
    sceneAssets: { S01: 'scene-1' },
    assets: { 'scene-1': {
      portrait: { path: 'art/scene-portrait.png', sha256: digestFile(portrait), width: 768, height: 1152 },
      desktop: { path: 'art/scene-desktop.png', sha256: digestFile(desktop), width: 1280, height: 720 }
    } }
  };
  fs.writeFileSync(path.join(project, 'dual-format.json'), JSON.stringify(dual, null, 2));
  const contract = {
    ...fixture.contract,
    currentness: { mode: 'DEPENDENCY_BASED_REUSE', baseHead: fixture.head },
    assetManifestSha256: digestFile(fixture.assetManifestPath),
    dualFormatManifest: 'dual-format.json'
  };
  const start = createRun(project, 'production-art', { scope: scope(), capabilities: caps(project, { image: 'unknown' }), artMode: 'VERIFIED_EXISTING_ART_REUSE' });
  recordCheckpoint(project, start.run.runId, { stage: 'INVENTORIED', artifacts: ['source.txt'] });
  recordCheckpoint(project, start.run.runId, { stage: 'CANON_READY', artifacts: ['canon.json'] });
  recordCheckpoint(project, start.run.runId, { stage: 'GENERATING', metadata: { existingArtReuse: contract } });
  const commit = spawnSync('git', ['-C', project, 'commit', '--allow-empty', '-qm', 'integration head'], { encoding: 'utf8' });
  assert.equal(commit.status, 0, commit.stderr);
  const result = recordCheckpoint(project, start.run.runId, {
    stage: 'INTEGRATED', artifacts: ['dual-format.json'], metadata: { dualFormatManifest: 'dual-format.json' }
  });
  assert.equal(result.run.nextStage, 'VISUAL_VERIFIED');
});

test('existing-art reuse blocks a missing PNG', () => {
  const project = gitProject();
  const fixture = reuseRun(project);
  fs.rmSync(fixture.portrait);
  assert.throws(() => recordCheckpoint(project, fixture.id, {
    stage: 'GENERATING', metadata: { existingArtReuse: fixture.contract }
  }), /EXISTING_ART_ASSET_0_FILE_MISSING/);
});

test('existing-art reuse blocks a SHA-256 mismatch', () => {
  const project = gitProject();
  const fixture = reuseRun(project);
  fs.appendFileSync(fixture.portrait, Buffer.from('changed'));
  assert.throws(() => recordCheckpoint(project, fixture.id, {
    stage: 'GENERATING', metadata: { existingArtReuse: fixture.contract }
  }), /EXISTING_ART_ASSET_0_HASH_MISMATCH/);
});

test('existing-art reuse blocks an invalid asset manifest', () => {
  const project = gitProject();
  const fixture = reuseRun(project);
  fs.writeFileSync(fixture.assetManifestPath, '{ invalid json');
  assert.throws(() => recordCheckpoint(project, fixture.id, {
    stage: 'GENERATING', metadata: { existingArtReuse: fixture.contract }
  }), /EXISTING_ART_MANIFEST_INVALID/);
});

test('existing-art reuse blocks missing portrait or desktop coverage', () => {
  const project = gitProject();
  const fixture = reuseRun(project);
  const manifest = JSON.parse(fs.readFileSync(fixture.assetManifestPath, 'utf8'));
  manifest.assets = manifest.assets.filter(entry => entry.id !== 'scene-desktop');
  fs.writeFileSync(fixture.assetManifestPath, JSON.stringify(manifest, null, 2));
  assert.throws(() => recordCheckpoint(project, fixture.id, {
    stage: 'GENERATING', metadata: { existingArtReuse: fixture.contract }
  }), /EXISTING_ART_FORMAT_COVERAGE/);
});

test('existing-art reuse blocks stale runtime evidence', () => {
  const project = gitProject();
  const fixture = reuseRun(project);
  const stale = { ...fixture.contract, runtimeEvidence: { ...fixture.contract.runtimeEvidence, sourceHead: '0'.repeat(40) } };
  assert.throws(() => recordCheckpoint(project, fixture.id, {
    stage: 'GENERATING', metadata: { existingArtReuse: stale }
  }), /EXISTING_ART_RUNTIME_CURRENTNESS/);
});

test('existing-art reuse blocks stale independent art acceptance', () => {
  const project = gitProject();
  const fixture = reuseRun(project);
  const stale = { ...fixture.contract, artAcceptance: { ...fixture.contract.artAcceptance, sourceHead: '0'.repeat(40) } };
  assert.throws(() => recordCheckpoint(project, fixture.id, {
    stage: 'GENERATING', metadata: { existingArtReuse: stale }
  }), /EXISTING_ART_ACCEPTANCE_CURRENTNESS/);
});

test('existing-art reuse blocks unknown provenance', () => {
  const project = gitProject();
  const fixture = reuseRun(project);
  const unknown = { ...fixture.contract, provenance: { ...fixture.contract.provenance, status: 'UNKNOWN' } };
  assert.throws(() => recordCheckpoint(project, fixture.id, {
    stage: 'GENERATING', metadata: { existingArtReuse: unknown }
  }), /EXISTING_ART_PROVENANCE_UNKNOWN/);
});

test('existing-art reuse blocks incomplete independent acceptance', () => {
  const project = gitProject();
  const fixture = reuseRun(project);
  const incomplete = { ...fixture.contract, artAcceptance: { ...fixture.contract.artAcceptance, status: 'PENDING', unresolved: ['scene-portrait'] } };
  assert.throws(() => recordCheckpoint(project, fixture.id, {
    stage: 'GENERATING', metadata: { existingArtReuse: incomplete }
  }), /EXISTING_ART_ACCEPTANCE_INCOMPLETE/);
});

test('existing-art reuse rejects a new-generation payload under the reuse mode', () => {
  const project = gitProject();
  const fixture = reuseRun(project);
  assert.throws(() => recordCheckpoint(project, fixture.id, {
    stage: 'GENERATING',
    metadata: { existingArtReuse: fixture.contract, artOutputs: [{ path: 'art/scene-desktop.png', kind: 'background', width: 16, height: 9 }] }
  }), /VERIFIED_EXISTING_ART_REUSE_MIXED_GENERATION/);
});

test('generation and reuse cannot mix without an explicit art mode', () => {
  const project = gitProject();
  const fixture = existingReuseFixture(project);
  const start = createRun(project, 'production-art', { scope: scope(), capabilities: caps(project, { image: 'unknown' }) });
  recordCheckpoint(project, start.run.runId, { stage: 'INVENTORIED', artifacts: ['source.txt'] });
  recordCheckpoint(project, start.run.runId, { stage: 'CANON_READY', artifacts: ['canon.json'] });
  assert.throws(() => recordCheckpoint(project, start.run.runId, {
    stage: 'GENERATING', metadata: { existingArtReuse: fixture.contract }
  }), /EXISTING_ART_REUSE_MODE_REQUIRED/);
});

test('immutable reuse checkpoint detects changed source bytes on resume', () => {
  const project = gitProject();
  const fixture = reuseRun(project);
  recordCheckpoint(project, fixture.id, {
    stage: 'GENERATING', metadata: { existingArtReuse: fixture.contract }
  });
  fs.appendFileSync(fixture.desktop, Buffer.from('changed'));
  const resumed = resumeRun(project, fixture.id);
  assert.equal(resumed.integrity.ok, false);
  assert.match(resumed.integrity.issues.join('\n'), /artifact changed after checkpoint GENERATING/);
});

test('only legacy scoped INTEGRATED coverage terminal qualifies for explicit dual-format recovery',()=>{
  const base={pipeline:'production-art',artMode:'NEW_GENERATION',
    narrativeDualFormatRequired:true,state:'BLOCKED',verdict:'BLOCKED',
    stopReason:{code:'STAGE_BLOCKED',stage:'INTEGRATED',
      reason:'NARRATIVE_DUAL_FORMAT_FULL_EPISODE_COVERAGE: batch S24-S26 covers 3 of 17 EP2 scenes'}};
  assert.equal(inspectBlockedRunRecovery(base).reopenSupported,true);
  for(const mutation of [
    {stopReason:{...base.stopReason,reason:'ART_SCENE_EXTRA: unknown'}},
    {stopReason:{...base.stopReason,stage:'GENERATING'}},
    {artMode:'VERIFIED_EXISTING_ART_REUSE'},
    {pipeline:'audit-repair-loop'}
  ]) {
    assert.equal(inspectBlockedRunRecovery({...base,...mutation}).reopenSupported,false);
  }
});

test('legacy S24-S26-style coverage blocker is classified from the INTEGRATED checkpoint metadata',()=>{
  const run={pipeline:'production-art',artMode:'NEW_GENERATION',
    narrativeDualFormatRequired:true,state:'BLOCKED',verdict:'BLOCKED',
    stopReason:{code:'STAGE_BLOCKED',stage:'INTEGRATED',
      reason:'S24-S26 batch integration evidence is complete, but the full-EP2 coverage gate blocks INTEGRATED.'}};
  const integratedCheckpoint={
    stage:'INTEGRATED',outcome:'BLOCKED',note:run.stopReason.reason,
    source:{head:'a'.repeat(40)},
    metadata:{
      blockerCode:'NARRATIVE_DUAL_FORMAT_FULL_EPISODE_COVERAGE',
      dualFormatGate:{
        verificationMode:'BATCH_INTEGRATION',
        errors:['NARRATIVE_DUAL_FORMAT_FULL_EPISODE_COVERAGE']
      }
    }
  };
  assert.equal(inspectBlockedRunRecovery(run,{integratedCheckpoint}).reopenSupported,true);
});

test('checkpoint-qualified BATCH_ONLY recovery rejects unconfirmed legacy coverage metadata',()=>{
  const run={pipeline:'production-art',artMode:'NEW_GENERATION',
    narrativeDualFormatRequired:true,state:'BLOCKED',verdict:'BLOCKED',
    stopReason:{code:'STAGE_BLOCKED',stage:'INTEGRATED',
      reason:'S24-S26 batch integration evidence is complete, but the full-EP2 coverage gate blocks INTEGRATED.'}};
  const checkpoint={
    stage:'INTEGRATED',outcome:'BLOCKED',note:run.stopReason.reason,
    source:{head:'a'.repeat(40)},
    metadata:{
      blockerCode:'NARRATIVE_DUAL_FORMAT_FULL_EPISODE_COVERAGE',
      dualFormatManifest:'batch.json',
      dualFormatGate:{verificationMode:'BATCH_INTEGRATION',errors:['NARRATIVE_DUAL_FORMAT_FULL_EPISODE_COVERAGE']}
    }
  };
  for (const mutation of [
    {metadata:{...checkpoint.metadata,blockerCode:'ART_SCENE_EXTRA'}},
    {metadata:{...checkpoint.metadata,dualFormatGate:{...checkpoint.metadata.dualFormatGate,verificationMode:'FULL_EPISODE'}}},
    {metadata:{...checkpoint.metadata,dualFormatGate:{...checkpoint.metadata.dualFormatGate,errors:['ART_SCENE_EXTRA']}}},
    {stage:'GENERATING'}
  ]) {
    assert.equal(inspectBlockedRunRecovery(run,{integratedCheckpoint:{...checkpoint,...mutation},requireCheckpoint:true}).reopenSupported,false);
  }
});

test('scoped recovery rejects a manifest that is not bound to the legacy checkpoint',()=>{
  const project=gitProject();
  fs.mkdirSync(path.join(project,'config'),{recursive:true});
  fs.mkdirSync(path.join(project,'narrative'),{recursive:true});
  fs.writeFileSync(path.join(project,'config','narrative-game.local.json'),JSON.stringify({profile:'narrative-game',enabled:true,modelPath:'narrative/graph.json'}));
  fs.writeFileSync(path.join(project,'narrative','graph.json'),JSON.stringify({schemaVersion:1,scenes:[{id:'S01',episode:1}]}));
  const start=createRun(project,'production-art',{scope:scope(),capabilities:caps(project,{image:'unknown'})});
  const runFile=path.join(start.runDir,'run.json');
  const run=JSON.parse(fs.readFileSync(runFile,'utf8'));
  const reason='S24-S26 batch integration evidence is complete, but the full-EP2 coverage gate blocks INTEGRATED.';
  run.state='BLOCKED'; run.verdict='BLOCKED'; run.nextStage=null; run.completedAt=new Date().toISOString(); run.checkpointCount=18;
  run.stopReason={code:'STAGE_BLOCKED',stage:'INTEGRATED',reason};
  const checkpoint={index:18,stage:'INTEGRATED',outcome:'BLOCKED',note:reason,source:{available:true,head:start.run.sourceAtStart.head},metadata:{blockerCode:'NARRATIVE_DUAL_FORMAT_FULL_EPISODE_COVERAGE',dualFormatManifest:'correct.json',dualFormatGate:{verificationMode:'BATCH_INTEGRATION',errors:['NARRATIVE_DUAL_FORMAT_FULL_EPISODE_COVERAGE']}},artifacts:[]};
  fs.mkdirSync(path.join(start.runDir,'checkpoints'),{recursive:true});
  fs.writeFileSync(path.join(start.runDir,'checkpoints','018-integrated.json'),JSON.stringify(checkpoint,null,2));
  fs.writeFileSync(runFile,JSON.stringify(run,null,2));
  assert.throws(()=>reopenBlockedRun(project,start.run.runId,{reason:'wrong manifest',dualFormatBatchRecovery:{manifest:'wrong.json'}}),/NARRATIVE_DUAL_FORMAT_RECOVERY_BLOCKED_CHECKPOINT_CHANGED/);
});
