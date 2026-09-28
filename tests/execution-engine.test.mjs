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
  reopenBlockedRun,
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
  recordCheckpoint(project, id, { stage: 'GENERATING', artifacts: [files[2]] });
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
  recordCheckpoint(project, id, { stage: 'GENERATING', artifacts: [files[2]] });
  recordCheckpoint(project, id, { stage: 'INTEGRATED', artifacts: [files[3]] });
  recordCheckpoint(project, id, { stage: 'VISUAL_VERIFIED', artifacts: [files[4]] });
  recordRoutingTrace(project, id, { webAgentsUsed: ['ceos_art_director_web'] });
  recordCheckpoint(project, id, { stage: 'REAUDITED', artifacts: [files[5]], outcome: 'PASS' });
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
  const done = recordCheckpoint(project, id, { stage: 'REAUDITED', artifacts: ['reaudit.json'], outcome: 'PASS' });
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
  const after = recordCheckpoint(project, id, { stage: 'GENERATING', artifacts: [generated] });
  assert.equal(after.run.nextStage, 'INTEGRATED');
});
