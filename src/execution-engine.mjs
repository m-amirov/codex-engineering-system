import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { VERSION } from './ceos.mjs';
import { capabilityBlockers } from './capabilities.mjs';

const TERMINAL = new Set(['PASS', 'FAIL', 'BLOCKED', 'ESCALATE']);
const OUTCOMES = new Set(['CONTINUE', 'PASS', 'FAIL', 'BLOCKED', 'ESCALATE']);

export const EXECUTION_PIPELINES = {
  'audit-repair-loop': {
    maxCyclesDefault: 3,
    stages: [
      {
        id: 'EVIDENCE_COLLECTED',
        description: 'Collect a fresh tool-backed evidence snapshot for the locked target.',
        minArtifacts: 1
      },
      {
        id: 'AUDITED',
        description: 'Complete substantive audit over the supplied evidence using the required routing contract.',
        minArtifacts: 1
      },
      {
        id: 'DEFECTS_CONFIRMED',
        description: 'Separate confirmed in-scope defects from uncertainty and out-of-scope observations.',
        minArtifacts: 1,
        requiresDefectCount: true
      },
      {
        id: 'REPAIRING',
        description: 'Apply the consolidated native remediation packet, or auto-skip when confirmed defect count is zero.',
        minArtifacts: 1
      },
      {
        id: 'VERIFIED',
        description: 'Run target-proportional mechanical verification against the repaired/current state.',
        minArtifacts: 1
      },
      {
        id: 'REAUDITED',
        description: 'Perform a fresh re-audit against the original locked scope and acceptance contract.',
        minArtifacts: 1,
        finalReview: true
      }
    ],
    retryAfterVerification: 'REPAIRING',
    retryAfterReaudit: 'EVIDENCE_COLLECTED'
  },
  'production-art': {
    maxCyclesDefault: 3,
    stages: [
      {
        id: 'INVENTORIED',
        description: 'Build the complete production-art asset manifest for the locked scope.',
        minArtifacts: 1
      },
      {
        id: 'CANON_READY',
        description: 'Freeze character, location, style, and reusable visual canon before volume generation.',
        minArtifacts: 1
      },
      {
        id: 'GENERATING',
        description: 'Generate a bounded native asset batch using the approved canon and manifest.',
        minArtifacts: 1,
        requiresImageGeneration: true
      },
      {
        id: 'INTEGRATED',
        description: 'Persist generated files and update project-owned runtime mappings/manifests.',
        minArtifacts: 1
      },
      {
        id: 'VISUAL_VERIFIED',
        description: 'Collect fresh runtime visual evidence and perform visual QA for the integrated batch.',
        minArtifacts: 1
      },
      {
        id: 'REAUDITED',
        description: 'Freshly re-audit manifest coverage, canon consistency, scene mapping, and runtime presentation.',
        minArtifacts: 1,
        finalReview: true
      }
    ],
    retryAfterVerification: 'GENERATING',
    retryAfterReaudit: 'GENERATING'
  }
};

function now() {
  return new Date().toISOString();
}

function safeStamp() {
  return now().replace(/[:.]/g, '-');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(x => String(x).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(';').map(x => x.trim()).filter(Boolean);
  return [];
}

function ensureText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function ensureMaxCycles(value, fallback) {
  const n = value == null ? fallback : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 20) throw new Error('maxCycles must be an integer from 1 to 20');
  return n;
}

function runRoot(projectDir) {
  return path.join(projectDir, '.ceos-runs');
}

function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function walkFiles(root, current = root, out = []) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) walkFiles(root, full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function hashPath(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return { type: 'file', sha256: sha256(fs.readFileSync(target)), size: stat.size };
  if (!stat.isDirectory()) throw new Error(`Artifact is neither file nor directory: ${target}`);
  const hash = crypto.createHash('sha256');
  let size = 0;
  for (const file of walkFiles(target)) {
    const rel = path.relative(target, file).split(path.sep).join('/');
    const bytes = fs.readFileSync(file);
    size += bytes.length;
    hash.update(rel);
    hash.update('\0');
    hash.update(bytes);
    hash.update('\0');
  }
  return { type: 'directory', sha256: hash.digest('hex'), size };
}

function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function resolveArtifact(projectDir, runDir, artifact) {
  const full = path.resolve(projectDir, artifact);
  if (!isInside(projectDir, full) && !isInside(runDir, full)) {
    throw new Error(`Artifact must be inside the project/run directory: ${artifact}`);
  }
  if (!fs.existsSync(full)) throw new Error(`Artifact does not exist: ${full}`);
  const hashed = hashPath(full);
  return {
    input: artifact,
    path: full,
    projectRelativePath: isInside(projectDir, full) ? path.relative(projectDir, full).split(path.sep).join('/') : null,
    ...hashed
  };
}

function checkpointFile(runDir, index, stage) {
  const slug = stage.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return path.join(runDir, 'checkpoints', `${String(index).padStart(3, '0')}-${slug}.json`);
}

function writeCheckpoint(runDir, run, checkpoint) {
  const index = (run.checkpointCount ?? 0) + 1;
  atomicWriteJson(checkpointFile(runDir, index, checkpoint.stage), { index, ...checkpoint });
  run.checkpointCount = index;
}

function withRunLock(runDir, fn) {
  const lockFile = path.join(runDir, '.lock');
  const acquire = () => {
    try {
      const fd = fs.openSync(lockFile, 'wx');
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: now() }));
      fs.closeSync(fd);
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const data = readJson(lockFile);
        const age = Date.now() - Date.parse(data.createdAt || 0);
        if (Number.isFinite(age) && age > 10 * 60 * 1000) {
          fs.rmSync(lockFile, { force: true });
          return acquire();
        }
      } catch {}
      throw new Error(`Run is locked by another CEOS process: ${lockFile}`);
    }
  };
  acquire();
  try {
    return fn();
  } finally {
    fs.rmSync(lockFile, { force: true });
  }
}

function normalizeScope(scope = {}) {
  const normalized = {
    target: ensureText(scope.target, 'target'),
    inScope: normalizeList(scope.inScope),
    outOfScope: normalizeList(scope.outOfScope),
    acceptanceContract: ensureText(scope.acceptanceContract, 'acceptanceContract'),
    mutationBoundary: ensureText(scope.mutationBoundary, 'mutationBoundary')
  };
  if (!normalized.inScope.length) throw new Error('inScope must contain at least one item');
  return normalized;
}

function stageDefinition(pipeline, stage) {
  return EXECUTION_PIPELINES[pipeline].stages.find(x => x.id === stage) ?? null;
}

function stageAfter(pipeline, stage) {
  const stages = EXECUTION_PIPELINES[pipeline].stages;
  const index = stages.findIndex(x => x.id === stage);
  return index >= 0 ? stages[index + 1]?.id ?? null : null;
}

function terminalize(run, verdict, reason) {
  run.state = verdict;
  run.verdict = verdict;
  run.nextStage = null;
  run.completedAt = now();
  run.stopReason = reason ?? null;
}

function nextAction(run) {
  if (TERMINAL.has(run.state)) {
    return {
      terminal: true,
      verdict: run.verdict,
      reason: run.stopReason ?? null
    };
  }
  const def = stageDefinition(run.pipeline, run.nextStage);
  if (!def) return { terminal: false, stage: run.nextStage, description: 'Unknown stage definition', requirements: [] };
  const requirements = [];
  if (def.minArtifacts) requirements.push(`at least ${def.minArtifacts} persisted evidence artifact(s)`);
  if (def.requiresDefectCount) requirements.push('metadata.defectCount as a non-negative integer');
  if (def.requiresImageGeneration) requirements.push('capabilities.imageGeneration.status = available');
  if (def.finalReview) requirements.push('explicit outcome PASS, FAIL, BLOCKED, or ESCALATE');
  return {
    terminal: false,
    stage: def.id,
    description: def.description,
    requirements
  };
}

function scopeHash(scope) {
  return sha256(Buffer.from(JSON.stringify(scope)));
}

function capabilitiesHash(capabilities) {
  return sha256(Buffer.from(JSON.stringify(capabilities)));
}

function assertRunIntegrity(runDir, run) {
  const issues = [];
  const scopeFile = path.join(runDir, 'scope.json');
  const capFile = path.join(runDir, 'capabilities.json');

  if (!fs.existsSync(scopeFile)) issues.push('scope.json missing');
  else {
    const actual = scopeHash(readJson(scopeFile));
    if (actual !== run.scopeSha256) issues.push('scope.json hash mismatch');
  }

  if (!fs.existsSync(capFile)) issues.push('capabilities.json missing');
  else {
    const actual = capabilitiesHash(readJson(capFile));
    if (actual !== run.capabilitiesSha256) issues.push('capabilities.json hash mismatch');
  }

  const checkpointsDir = path.join(runDir, 'checkpoints');
  if (fs.existsSync(checkpointsDir)) {
    const files = fs.readdirSync(checkpointsDir).filter(x => x.endsWith('.json')).sort();
    for (const file of files) {
      let checkpoint;
      try {
        checkpoint = readJson(path.join(checkpointsDir, file));
      } catch (error) {
        issues.push(`invalid checkpoint ${file}: ${error.message}`);
        continue;
      }
      for (const artifact of checkpoint.artifacts ?? []) {
        if (!fs.existsSync(artifact.path)) {
          issues.push(`artifact missing for ${checkpoint.stage}: ${artifact.path}`);
          continue;
        }
        const current = hashPath(artifact.path);
        if (current.sha256 !== artifact.sha256) issues.push(`artifact changed after checkpoint ${checkpoint.stage}: ${artifact.path}`);
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

export function resolveRun(projectDir, runRef = 'latest') {
  const root = runRoot(path.resolve(projectDir));
  let runDir;
  if (!runRef || runRef === 'latest') {
    const latestFile = path.join(root, 'latest.json');
    if (!fs.existsSync(latestFile)) throw new Error(`No CEOS execution run found under ${root}`);
    const latest = readJson(latestFile);
    runDir = path.join(root, latest.runId);
  } else {
    const candidate = path.resolve(runRef);
    runDir = fs.existsSync(candidate) && fs.existsSync(path.join(candidate, 'run.json'))
      ? candidate
      : path.join(root, runRef);
  }
  const file = path.join(runDir, 'run.json');
  if (!fs.existsSync(file)) throw new Error(`Run not found: ${runRef}`);
  return { runDir, file, run: readJson(file) };
}

export function createRun(projectDir, pipeline, {
  scope,
  capabilities,
  webRequired = false,
  maxCycles
} = {}) {
  const resolvedProject = path.resolve(projectDir);
  const definition = EXECUTION_PIPELINES[pipeline];
  if (!definition) throw new Error(`Unknown execution pipeline '${pipeline}'`);
  if (!fs.existsSync(resolvedProject)) throw new Error(`Project directory does not exist: ${resolvedProject}`);
  if (!capabilities || typeof capabilities !== 'object') throw new Error('capabilities snapshot is required');

  const normalizedScope = normalizeScope(scope);
  const cycles = ensureMaxCycles(maxCycles, definition.maxCyclesDefault);
  const runId = `${safeStamp()}-${pipeline}-${crypto.randomBytes(3).toString('hex')}`;
  const root = runRoot(resolvedProject);
  const runDir = path.join(root, runId);
  fs.mkdirSync(path.join(runDir, 'checkpoints'), { recursive: true });
  fs.mkdirSync(path.join(runDir, 'artifacts'), { recursive: true });
  fs.mkdirSync(path.join(runDir, 'evidence'), { recursive: true });

  atomicWriteJson(path.join(runDir, 'scope.json'), normalizedScope);
  atomicWriteJson(path.join(runDir, 'capabilities.json'), capabilities);

  const createdAt = now();
  const run = {
    schemaVersion: 1,
    engineVersion: 1,
    ceosVersion: VERSION,
    runId,
    pipeline,
    projectDir: resolvedProject,
    runDir,
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
    cycle: 1,
    maxCycles: cycles,
    webRequired: Boolean(webRequired),
    state: 'CAPABILITIES_CHECKED',
    nextStage: definition.stages[0].id,
    verdict: null,
    stopReason: null,
    checkpointCount: 0,
    scopeSha256: scopeHash(normalizedScope),
    capabilitiesSha256: capabilitiesHash(capabilities),
    routingTrace: {
      webPreflightStatus: capabilities.web?.status ?? 'UNKNOWN',
      webAgentsUsed: [],
      nativeFallbackUsed: false,
      fallbackReason: null
    }
  };

  writeCheckpoint(runDir, run, {
    stage: 'SCOPE_LOCKED',
    at: createdAt,
    auto: true,
    artifacts: [{ path: path.join(runDir, 'scope.json'), ...hashPath(path.join(runDir, 'scope.json')) }]
  });
  writeCheckpoint(runDir, run, {
    stage: 'CAPABILITIES_CHECKED',
    at: now(),
    auto: true,
    artifacts: [{ path: path.join(runDir, 'capabilities.json'), ...hashPath(path.join(runDir, 'capabilities.json')) }]
  });

  const blockers = capabilityBlockers(capabilities, { pipeline, webRequired });
  const hardBlocker = blockers.find(x => x.code !== 'IMAGE_GENERATION_UNAVAILABLE') ?? null;
  if (hardBlocker) terminalize(run, 'BLOCKED', hardBlocker);

  atomicWriteJson(path.join(runDir, 'run.json'), run);
  atomicWriteJson(path.join(root, 'latest.json'), { runId, runDir, updatedAt: run.updatedAt });

  return {
    runDir,
    run,
    scope: normalizedScope,
    capabilities,
    blockers,
    nextAction: nextAction(run)
  };
}

function checkpointOutcome(outcome) {
  const normalized = String(outcome || 'CONTINUE').toUpperCase();
  if (!OUTCOMES.has(normalized)) throw new Error(`outcome must be one of: ${[...OUTCOMES].join(', ')}`);
  return normalized;
}

function setNextAfterStage(run, stage) {
  run.state = stage;
  run.nextStage = stageAfter(run.pipeline, stage);
}

function retryOrFail(run, stage, nextStage, reason) {
  if (run.cycle >= run.maxCycles) {
    terminalize(run, 'FAIL', {
      code: 'MAX_CYCLES_REACHED',
      reason: reason || `${stage} failed at cycle limit ${run.maxCycles}`
    });
    return;
  }
  run.cycle += 1;
  run.state = stage;
  run.nextStage = nextStage;
}

export function recordCheckpoint(projectDir, runRef, {
  stage,
  artifacts = [],
  outcome = 'CONTINUE',
  metadata = {},
  note = null,
  skipped = false
} = {}) {
  const resolvedProject = path.resolve(projectDir);
  const resolved = resolveRun(resolvedProject, runRef);
  return withRunLock(resolved.runDir, () => {
    const run = readJson(resolved.file);
    if (TERMINAL.has(run.state)) throw new Error(`Run is terminal: ${run.state}`);
    const integrity = assertRunIntegrity(resolved.runDir, run);
    if (!integrity.ok) throw new Error(`Run integrity check failed:\n- ${integrity.issues.join('\n- ')}`);
    if (!stage || stage !== run.nextStage) {
      throw new Error(`Invalid transition: expected stage ${run.nextStage}, received ${stage || '(missing)'}`);
    }

    const definition = stageDefinition(run.pipeline, stage);
    const normalizedOutcome = checkpointOutcome(outcome);
    if (normalizedOutcome === 'FAIL' && !['VERIFIED', 'VISUAL_VERIFIED', 'REAUDITED'].includes(stage)) {
      throw new Error(`FAIL outcome is not valid for stage ${stage}; record defects and continue instead`);
    }

    const currentCapabilities = readJson(path.join(resolved.runDir, 'capabilities.json'));
    if (definition.requiresImageGeneration && currentCapabilities.imageGeneration?.status !== 'available') {
      throw new Error('GENERATING requires image-generation capability = available; refresh capabilities before continuing');
    }

    if (definition.requiresDefectCount) {
      const count = metadata?.defectCount;
      if (!Number.isInteger(count) || count < 0) throw new Error('DEFECTS_CONFIRMED requires metadata.defectCount as a non-negative integer');
    }

    const artifactInputs = normalizeList(artifacts);
    const allowNoArtifacts = skipped === true && stage === 'REPAIRING' && run.lastDefectCount === 0;
    if ((definition.minArtifacts ?? 0) > artifactInputs.length && !allowNoArtifacts) {
      throw new Error(`${stage} requires at least ${definition.minArtifacts} artifact(s)`);
    }
    const artifactRecords = artifactInputs.map(item => resolveArtifact(resolvedProject, resolved.runDir, item));

    const checkpoint = {
      stage,
      at: now(),
      cycle: run.cycle,
      outcome: normalizedOutcome,
      skipped: Boolean(skipped),
      note: note || null,
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
      artifacts: artifactRecords
    };
    writeCheckpoint(resolved.runDir, run, checkpoint);

    if (stage === 'DEFECTS_CONFIRMED') run.lastDefectCount = metadata.defectCount;

    if (normalizedOutcome === 'BLOCKED' || normalizedOutcome === 'ESCALATE') {
      terminalize(run, normalizedOutcome, {
        code: `STAGE_${normalizedOutcome}`,
        stage,
        reason: note || `${stage} returned ${normalizedOutcome}`
      });
    } else if (stage === 'VERIFIED' || stage === 'VISUAL_VERIFIED') {
      if (normalizedOutcome === 'FAIL') {
        retryOrFail(run, stage, EXECUTION_PIPELINES[run.pipeline].retryAfterVerification, note);
      } else {
        setNextAfterStage(run, stage);
      }
    } else if (stage === 'REAUDITED') {
      if (normalizedOutcome === 'PASS') {
        terminalize(run, 'PASS', { code: 'ACCEPTANCE_SATISFIED', stage, reason: note || 'fresh re-audit passed' });
      } else if (normalizedOutcome === 'FAIL') {
        retryOrFail(run, stage, EXECUTION_PIPELINES[run.pipeline].retryAfterReaudit, note);
      } else {
        throw new Error('REAUDITED requires explicit outcome PASS, FAIL, BLOCKED, or ESCALATE');
      }
    } else {
      setNextAfterStage(run, stage);
    }

    if (stage === 'DEFECTS_CONFIRMED' && metadata.defectCount === 0 && !TERMINAL.has(run.state)) {
      const autoStage = 'REPAIRING';
      writeCheckpoint(resolved.runDir, run, {
        stage: autoStage,
        at: now(),
        cycle: run.cycle,
        outcome: 'CONTINUE',
        skipped: true,
        auto: true,
        note: 'No confirmed defects; repair stage skipped deterministically.',
        metadata: { defectCount: 0 },
        artifacts: []
      });
      run.state = autoStage;
      run.nextStage = 'VERIFIED';
    }

    run.updatedAt = now();
    atomicWriteJson(resolved.file, run);
    atomicWriteJson(path.join(runRoot(resolvedProject), 'latest.json'), { runId: run.runId, runDir: resolved.runDir, updatedAt: run.updatedAt });

    return {
      runDir: resolved.runDir,
      run,
      integrity: assertRunIntegrity(resolved.runDir, run),
      nextAction: nextAction(run)
    };
  });
}

export function refreshRunCapabilities(projectDir, runRef, capabilities) {
  const resolvedProject = path.resolve(projectDir);
  const resolved = resolveRun(resolvedProject, runRef);
  return withRunLock(resolved.runDir, () => {
    const run = readJson(resolved.file);
    atomicWriteJson(path.join(resolved.runDir, 'capabilities.json'), capabilities);
    run.capabilitiesSha256 = capabilitiesHash(capabilities);
    run.routingTrace.webPreflightStatus = capabilities.web?.status ?? 'UNKNOWN';

    if (
      run.verdict === 'BLOCKED' &&
      run.stopReason?.code === 'WEB_REQUIRED_NOT_READY' &&
      capabilities.web?.status === 'READY'
    ) {
      run.state = 'CAPABILITIES_CHECKED';
      run.verdict = null;
      run.stopReason = null;
      run.completedAt = null;
      run.nextStage = EXECUTION_PIPELINES[run.pipeline].stages[0].id;
    }

    writeCheckpoint(resolved.runDir, run, {
      stage: 'CAPABILITIES_REFRESHED',
      at: now(),
      auto: true,
      artifacts: [{ path: path.join(resolved.runDir, 'capabilities.json'), ...hashPath(path.join(resolved.runDir, 'capabilities.json')) }]
    });
    run.updatedAt = now();
    atomicWriteJson(resolved.file, run);
    return {
      runDir: resolved.runDir,
      run,
      integrity: assertRunIntegrity(resolved.runDir, run),
      nextAction: nextAction(run)
    };
  });
}

export function resumeRun(projectDir, runRef = 'latest') {
  const resolved = resolveRun(projectDir, runRef);
  const run = readJson(resolved.file);
  const integrity = assertRunIntegrity(resolved.runDir, run);
  return {
    runDir: resolved.runDir,
    run,
    integrity,
    nextAction: integrity.ok ? nextAction(run) : {
      terminal: false,
      stage: 'INTEGRITY_BLOCKED',
      description: 'Persisted run evidence changed or disappeared; restore/recreate evidence before continuing.',
      requirements: integrity.issues
    }
  };
}

export function recordRoutingTrace(projectDir, runRef, {
  webAgentsUsed,
  nativeFallbackUsed,
  fallbackReason
} = {}) {
  const resolvedProject = path.resolve(projectDir);
  const resolved = resolveRun(resolvedProject, runRef);
  return withRunLock(resolved.runDir, () => {
    const run = readJson(resolved.file);
    if (webAgentsUsed !== undefined) run.routingTrace.webAgentsUsed = normalizeList(webAgentsUsed);
    if (nativeFallbackUsed !== undefined) run.routingTrace.nativeFallbackUsed = Boolean(nativeFallbackUsed);
    if (fallbackReason !== undefined) run.routingTrace.fallbackReason = fallbackReason || null;
    run.updatedAt = now();
    atomicWriteJson(resolved.file, run);
    return { runDir: resolved.runDir, run };
  });
}

export function executionStatus(projectDir, runRef = 'latest') {
  return resumeRun(projectDir, runRef);
}
