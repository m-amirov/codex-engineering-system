import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { VERSION } from './ceos.mjs';
import { assertPositiveEvidenceContract } from './evidence-contract.mjs';
import { capabilityBlockers } from './capabilities.mjs';
import { webReviewPlan, validateWebReview, verifyWebDelegation } from './web-delegation.mjs';
import { normalizeResolutionReceiptContract, validateResolutionReceipt } from './resolution-receipt.mjs';
import { classifyWebTransportFailure } from './web-transport-failure.mjs';
import { inspectArtBatch } from './art-output-gate.mjs';

const TERMINAL = new Set(['PASS', 'FAIL', 'BLOCKED', 'ESCALATE']);
const OUTCOMES = new Set(['CONTINUE', 'PASS', 'FAIL', 'BLOCKED', 'ESCALATE']);
const RECOVERABLE_BLOCK_CODES = new Set([
  'WEB_REQUIRED_NOT_READY',
  'WEB_HIGH_REVIEW_UNAVAILABLE',
  'WEB_UNAVAILABLE',
  'WEB_TRANSPORT_UNAVAILABLE',
  'ATTACHMENT_TRANSPORT',
  'CAPABILITY_UNAVAILABLE',
  'CAPABILITY_NOT_READY',
  'RATE_LIMITED',
  'USAGE_LIMIT_REACHED'
]);
const EXTERNAL_RECOVERY_WORDS = /\b(web|transport|capability|review|rate[_ -]?limit|usage limit)\b/i;
const EXTERNAL_RECOVERY_FAILURES = /\b(unavailable|not ready|disconnect(?:ed)?|failed?|failure|blocked|recover(?:ed|able)?|rate[_ -]?limited|usage limit(?:ed)?)\b/i;
const NATIVE_FALLBACK_STATUSES = new Set(['UNAVAILABLE', 'NOT_ACCEPTING_TURNS', 'RATE_LIMITED']);
const NATIVE_FALLBACK_REASON = /\b(transport|backend|runtime|bridge|connect(?:ion)?|disconnect(?:ed)?|unavailable|not accepting|rate[_ -]?limit(?:ed)?|usage limit(?:ed)?|timeout|timed out|http\s+\d{3}|refused)\b/i;

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
    retryAfterVerification: 'EVIDENCE_COLLECTED',
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

function gitSourceSnapshot(projectDir) {
  const run = (args) => spawnSync('git', ['-C', projectDir, ...args], {
    encoding: 'utf8',
    windowsHide: true
  });
  const headResult = run(['rev-parse', 'HEAD']);
  if (headResult.status !== 0) {
    return { available: false, head: null, clean: null, worktreeSha256: null };
  }
  const statusResult = run(['status', '--porcelain=v1', '--untracked-files=all']);
  const statusText = statusResult.status === 0 ? String(statusResult.stdout ?? '') : '';
  return {
    available: true,
    head: String(headResult.stdout ?? '').trim() || null,
    clean: statusResult.status === 0 ? statusText.trim().length === 0 : null,
    worktreeSha256: statusResult.status === 0 ? sha256(Buffer.from(statusText)) : null
  };
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

function isRecoverableBlocked(run) {
  if (run.verdict !== 'BLOCKED' || run.state !== 'BLOCKED') return false;
  const stopReason = run.stopReason ?? {};
  if (RECOVERABLE_BLOCK_CODES.has(stopReason.code)) return true;
  return stopReason.code === 'STAGE_BLOCKED' &&
    typeof stopReason.stage === 'string' &&
    Boolean(stageDefinition(run.pipeline, stopReason.stage)) &&
    EXTERNAL_RECOVERY_WORDS.test(String(stopReason.reason ?? '')) &&
    EXTERNAL_RECOVERY_FAILURES.test(String(stopReason.reason ?? ''));
}

function reopenTarget(run, stopReason) {
  const stage = typeof stopReason?.stage === 'string' && stageDefinition(run.pipeline, stopReason.stage)
    ? stopReason.stage
    : null;
  return stage
    ? { state: stage, nextStage: stage }
    : { state: 'CAPABILITIES_CHECKED', nextStage: EXECUTION_PIPELINES[run.pipeline].stages[0].id };
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
  if (def.requiresImageGeneration) requirements.push('fresh trusted image-generation presence with generationAllowed = true (PRESENT + UNKNOWN service is sufficient for the first real invocation)');
  if (def.finalReview) requirements.push('explicit outcome PASS, FAIL, BLOCKED, or ESCALATE plus metadata.evidenceContract for PASS');
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
    try {
      const actual = scopeHash(readJson(scopeFile));
      if (actual !== run.scopeSha256) issues.push('scope.json hash mismatch');
    } catch (error) {
      issues.push(`scope.json invalid: ${error.message}`);
    }
  }

  if (!fs.existsSync(capFile)) issues.push('capabilities.json missing');
  else {
    try {
      const actual = capabilitiesHash(readJson(capFile));
      if (actual !== run.capabilitiesSha256) issues.push('capabilities.json hash mismatch');
    } catch (error) {
      issues.push(`capabilities.json invalid: ${error.message}`);
    }
  }

  for (const review of run.routingTrace?.webReviews ?? []) {
    for (const frame of review.localScreenshotArtifacts ?? []) {
      if (!frame?.path || !fs.existsSync(frame.path)) issues.push('Web visual evidence screenshot missing');
      else if (hashPath(frame.path).sha256 !== frame.sha256) issues.push('Web visual evidence screenshot changed after routing-trace');
    }
    const artifact = review.evidenceArtifact;
    if (!artifact?.path || !fs.existsSync(artifact.path)) {
      issues.push('Web review evidence artifact missing');
    } else if (hashPath(artifact.path).sha256 !== artifact.sha256) {
      issues.push('Web review evidence artifact changed after routing-trace');
    }
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
      if (checkpoint.stage === 'CAPABILITIES_CHECKED' || checkpoint.stage === 'CAPABILITIES_REFRESHED') continue;
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
  maxCycles,
  webReviewMode = 'legacy',
  webReviewAssurance = 'strict',
  resolutionReceiptContract = null
} = {}) {
  const resolvedProject = path.resolve(projectDir);
  const definition = EXECUTION_PIPELINES[pipeline];
  if (!definition) throw new Error(`Unknown execution pipeline '${pipeline}'`);
  if (!fs.existsSync(resolvedProject)) throw new Error(`Project directory does not exist: ${resolvedProject}`);
  if (!capabilities || typeof capabilities !== 'object') throw new Error('capabilities snapshot is required');

  if (!['legacy', 'enhanced'].includes(webReviewMode)) throw new Error('Invalid webReviewMode');
  if (webReviewMode === 'legacy' && webReviewAssurance !== 'strict')
    throw new Error('visual-content assurance requires enhanced Web review mode');
  const normalizedScope = normalizeScope(scope);
  if (resolutionReceiptContract !== null) {
    const contract = normalizeResolutionReceiptContract(resolutionReceiptContract);
    const source = resolveArtifact(resolvedProject, resolvedProject, contract.sourceEvidence);
    if (source.type !== 'file') throw new Error('RESOLUTION_RECEIPT_SOURCE_INVALID: expected a real evidence file');
    const issues = validateResolutionReceipt({ historicalExactLines: contract.requiredExactLines }, contract, fs.readFileSync(source.path, 'utf8'));
    if (issues.length) throw new Error(issues.join('; '));
    normalizedScope.resolutionReceiptContract = { ...contract, sourceEvidenceSha256: source.sha256 };
  }
  const visualReview = pipeline === 'production-art' || /(?:visual|image|\bart\b|screenshot|render|\bui\b|худож|визуал|изображен)/i.test([normalizedScope.target, ...normalizedScope.inScope].join(' '));
  const delegationPlan = webReviewMode === 'enhanced'
    ? webReviewPlan(pipeline, { complexity: 'high', visual: visualReview, assurance: webReviewAssurance }) : null;
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
    artOutputGateRequired: pipeline === 'production-art',
    projectDir: resolvedProject,
    runDir,
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
    cycle: 1,
    maxCycles: cycles,
    webRequired: Boolean(webRequired),
    webReviewMode,
    webReviewAssurance,
    webDelegationPlan: delegationPlan,
    state: 'CAPABILITIES_CHECKED',
    nextStage: definition.stages[0].id,
    verdict: null,
    stopReason: null,
    checkpointCount: 0,
    scopeSha256: scopeHash(normalizedScope),
    capabilitiesSha256: capabilitiesHash(capabilities),
    sourceAtStart: gitSourceSnapshot(resolvedProject),
    routingTrace: {
      webPreflightStatus: capabilities.web?.status ?? 'UNKNOWN',
      webAgentsUsed: [],
      webReviews: [],
      nativeFallbackUsed: false,
      fallbackReason: null,
      byCycle: { '1': { webAgentsUsed: [], webReviews: [], nativeFallbackUsed: false, fallbackReason: null } }
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
  run.routingTrace.byCycle ||= {};
  run.routingTrace.byCycle[String(run.cycle)] ||= { webAgentsUsed: [], webReviews: [], nativeFallbackUsed: false, fallbackReason: null };
}

function assertWebReviewPhase(run, capabilities, stage, currentHead) {
  if (run.webReviewMode !== 'enhanced') return;
  const phases = run.pipeline === 'production-art'
    ? { CANON_READY: 'analysis', VISUAL_VERIFIED: 'midpoint', REAUDITED: 'acceptance' }
    : { AUDITED: 'analysis', VERIFIED: 'midpoint', REAUDITED: 'acceptance' };
  const phase = phases[stage];
  if (!phase || (phase === 'midpoint' && run.pipeline === 'audit-repair-loop' && run.lastDefectCount === 0)) return;
  if (capabilities.web?.status !== 'READY') {
    if (run.webRequired) throw new Error('WEB_REVIEW_NOT_VERIFIED: required Web backend is not READY');
    if (['DISABLED', 'NOT_CONFIGURED'].includes(capabilities.web?.status)) return;
    const trace = run.routingTrace.byCycle?.[String(run.cycle)] ?? {};
    if (!trace.nativeFallbackUsed || !NATIVE_FALLBACK_STATUSES.has(capabilities.web?.status) || !NATIVE_FALLBACK_REASON.test(String(trace.fallbackReason ?? '')))
      throw new Error('WEB_REVIEW_NOT_VERIFIED: record a transport-only native fallback reason when Web is unavailable');
    return;
  }
  const trace = run.routingTrace.byCycle?.[String(run.cycle)] ?? {};
  const reviews = (trace.webReviews ?? []).filter(review => review.phase === phase);
  const plan = { ...run.webDelegationPlan, phases: [phase] };
  const verdict = verifyWebDelegation(plan, reviews, {
    pipeline: run.pipeline, currentHead, defectCount: run.lastDefectCount ?? null
  });
  if (!verdict.ok) throw new Error(`${verdict.code}: ${verdict.errors.join('; ')}`);
  if (phase === 'acceptance') {
    const pending = (trace.webReviews ?? []).filter(review => review.phase !== 'acceptance')
      .flatMap(review => review.unresolved ?? []);
    if (pending.length) {
      const accepted = reviews.find(review => review.status === 'PASS' && Array.isArray(review.resolvedFindings));
      const resolved = accepted?.resolvedFindings ?? [];
      const received = accepted?.receivedEvidenceRefs ?? [];
      if (pending.some(id => !resolved.some(item => item?.id === id && received.includes(item.evidenceRef))))
        throw new Error('WEB_REVIEW_NOT_VERIFIED: earlier Web findings lack independent acceptance resolution evidence');
    }
  }
}

function assertFinalRouting(run, capabilities) {
  const trace = run.routingTrace.byCycle?.[String(run.cycle)] ?? {
    webAgentsUsed: run.routingTrace.webAgentsUsed ?? [],
    nativeFallbackUsed: run.routingTrace.nativeFallbackUsed ?? false,
    fallbackReason: run.routingTrace.fallbackReason ?? null
  };
  const allowed = run.pipeline === 'production-art'
    ? ['ceos_art_director_web', 'ceos_reasoner_web']
    : ['ceos_bulk_checker_web', 'ceos_reasoner_web'];
  const used = (trace.webAgentsUsed ?? []).some(name => allowed.includes(name));
  const fallbackValid = trace.nativeFallbackUsed === true && Boolean(trace.fallbackReason);

  if (run.webRequired && capabilities.web?.status !== 'READY') {
    throw new Error(`Web review is required but current capability snapshot is ${capabilities.web?.status ?? 'UNKNOWN'}; refresh capabilities before final PASS`);
  }
  if ((run.webRequired || capabilities.web?.status === 'READY') && !used) {
    if (!run.webRequired && fallbackValid) return;
    throw new Error(`Final PASS requires observable Web review for cycle ${run.cycle}; record an allowed Web agent in routing-trace`);
  }
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
    if (stage === 'REAUDITED' && !['PASS', 'FAIL', 'BLOCKED', 'ESCALATE'].includes(normalizedOutcome)) {
      throw new Error('REAUDITED requires explicit outcome PASS, FAIL, BLOCKED, or ESCALATE');
    }
    if (normalizedOutcome === 'FAIL' && !['VERIFIED', 'VISUAL_VERIFIED', 'REAUDITED'].includes(stage)) {
      throw new Error(`FAIL outcome is not valid for stage ${stage}; record defects and continue instead`);
    }

    const currentCapabilities = readJson(path.join(resolved.runDir, 'capabilities.json'));
    const currentSource = gitSourceSnapshot(resolvedProject);
    if (normalizedOutcome === 'PASS' || normalizedOutcome === 'CONTINUE') {
      assertWebReviewPhase(run, currentCapabilities, stage, currentSource.head);
    }
    if (stage === 'REAUDITED' && normalizedOutcome === 'PASS') {
      assertFinalRouting(run, currentCapabilities);
      assertPositiveEvidenceContract(metadata, { currentSourceHead: currentSource.available ? currentSource.head : null });
    }
    if (definition.requiresImageGeneration) {
      const image = currentCapabilities.imageGeneration;
      if (!(image?.trustedForGeneration === true && image?.capabilityPresence === 'PRESENT' && image?.generationAllowed === true)) {
        throw new Error('GENERATING requires fresh trusted native image-generation presence; create and answer a run-scoped capability challenge from the current Codex turn');
      }
    }

    let outputGate = null;
    if (stage === 'GENERATING' && run.artOutputGateRequired === true &&
        (normalizedOutcome === 'CONTINUE' || normalizedOutcome === 'PASS')) {
      const entries = metadata?.artOutputs;
      outputGate = inspectArtBatch({ assets: entries }, { projectDir: resolvedProject });
      if (outputGate.status !== 'PASS_ART_BATCH_MECHANICAL')
        throw new Error('GENERATING output gate refused non-production assets: ' +
          outputGate.issues.join(', ') +
          (outputGate.firstFailedIndex === undefined ? '' : ' at index ' + outputGate.firstFailedIndex));
    }

    if (definition.requiresDefectCount) {
      const count = metadata?.defectCount;
      if (!Number.isInteger(count) || count < 0) throw new Error('DEFECTS_CONFIRMED requires metadata.defectCount as a non-negative integer');
    }

    const artifactInputs = normalizeList(artifacts);
    if (outputGate) {
      // Pin actual source image bytes to immutable checkpoint evidence, not just a mutable receipt.
      for (const entry of outputGate.inspected) {
        const rel = path.relative(resolvedProject, entry.path);
        if (!artifactInputs.includes(rel)) artifactInputs.push(rel);
      }
    }
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
      metadata: outputGate
        ? { ...metadata, artOutputGate: { status: outputGate.status, checks: outputGate.inspected.map(x => ({ path: x.path, sha256: x.sha256, dimensions: x.dimensions, alpha: x.alpha, checkerboard: x.checkerboard })) } }
        : (metadata && typeof metadata === 'object' ? metadata : {}),
      source: currentSource,
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

export function reopenBlockedRun(projectDir, runRef = 'latest', {
  reason,
  evidence = []
} = {}) {
  const resolvedProject = path.resolve(projectDir);
  const resolved = resolveRun(resolvedProject, runRef);
  const reopenReason = ensureText(reason, 'reopen reason');
  return withRunLock(resolved.runDir, () => {
    const run = readJson(resolved.file);
    if (run.verdict !== 'BLOCKED' || run.state !== 'BLOCKED') {
      throw new Error('Only BLOCKED runs can be reopened');
    }
    const integrity = assertRunIntegrity(resolved.runDir, run);
    if (!integrity.ok) throw new Error(`Run integrity check failed:\n- ${integrity.issues.join('\n- ')}`);
    if (!isRecoverableBlocked(run)) {
      throw new Error(`Blocked run is not recoverable from an explicitly supported external condition: ${run.stopReason?.code ?? '(missing code)'}`);
    }

    const artifactRecords = normalizeList(evidence).map(item => resolveArtifact(resolvedProject, resolved.runDir, item));
    const previousVerdict = run.verdict;
    const previousStopReason = structuredClone(run.stopReason ?? null);
    const target = reopenTarget(run, previousStopReason);
    const reopenedAt = now();
    writeCheckpoint(resolved.runDir, run, {
      stage: 'RUN_REOPENED',
      at: reopenedAt,
      cycle: run.cycle,
      outcome: 'CONTINUE',
      previousVerdict,
      previousStopReason,
      reopenReason,
      artifacts: artifactRecords
    });

    run.state = target.state;
    run.nextStage = target.nextStage;
    run.verdict = null;
    run.completedAt = null;
    run.stopReason = null;
    run.reopenCount = (run.reopenCount ?? 0) + 1;
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

/**
 * Report an observed ChatGPT attachment-quota failure without retrying,
 * advancing a product stage, consuming an art cycle, or manufacturing a Web
 * pixel receipt. The actual failed-turn log must be present on disk.
 */
export function recordWebAttachmentQuotaBlock(projectDir, runRef = 'latest', {
  phase, evidence
} = {}) {
  const resolvedProject = path.resolve(projectDir);
  const resolved = resolveRun(resolvedProject, runRef);
  if (!['analysis', 'midpoint', 'acceptance'].includes(phase))
    throw new Error('Web attachment failure phase must be analysis, midpoint or acceptance');
  const evidenceInput = ensureText(evidence, 'attachment quota evidence');
  return withRunLock(resolved.runDir, () => {
    const run = readJson(resolved.file);
    if (TERMINAL.has(run.state)) throw new Error('Run is terminal: ' + run.state);
    const integrity = assertRunIntegrity(resolved.runDir, run);
    if (!integrity.ok) throw new Error('Run integrity check failed: ' + integrity.issues.join('; '));
    if (run.webReviewMode !== 'enhanced' ||
        !run.webDelegationPlan?.phases?.includes(phase))
      throw new Error('Attachment quota block requires a planned enhanced Web review phase');
    const stageForPhase = run.pipeline === 'production-art'
      ? { analysis: 'CANON_READY', midpoint: 'VISUAL_VERIFIED', acceptance: 'REAUDITED' }
      : { analysis: 'AUDITED', midpoint: 'VERIFIED', acceptance: 'REAUDITED' };
    if (run.nextStage !== stageForPhase[phase])
      throw new Error('Attachment quota phase does not match the current required Web stage');
    const artifact = resolveArtifact(resolvedProject, resolved.runDir, evidenceInput);
    if (artifact.type !== 'file' || artifact.size > 1024 * 1024)
      throw new Error('Attachment quota evidence must be a file at most 1 MiB');
    const recordedMessage = fs.readFileSync(artifact.path, 'utf8');
    // Never trust a CLI assertion in place of an actual error excerpt.
    const observed = classifyWebTransportFailure({ message: recordedMessage });
    if (observed.classification !== 'ATTACHMENT_QUOTA_EXHAUSTED')
      throw new Error('ATTACHMENT_QUOTA_NOT_CONFIRMED: evidence lacks an explicit attachment-quota error');
    const blockedAt = now();
    const priorStage = run.nextStage;
    writeCheckpoint(resolved.runDir, run, {
      stage: 'WEB_ATTACHMENT_QUOTA_BLOCKED',
      at: blockedAt, cycle: run.cycle, outcome: 'BLOCKED',
      phase, priorStage,
      transportClassification: observed.classification,
      retryAllowed: false, consumesRepairCycle: false,
      scope: 'UNKNOWN', artifacts: [artifact]
    });
    terminalize(run, 'BLOCKED', {
      code: 'ATTACHMENT_QUOTA_EXHAUSTED',
      stage: priorStage,
      phase,
      reason: 'Explicit Web attachment quota failure; required image pixels not delivered',
      evidenceSha256: artifact.sha256,
      retryAllowed: false, consumesRepairCycle: false, scope: 'UNKNOWN'
    });
    run.updatedAt = blockedAt;
    atomicWriteJson(resolved.file, run);
    atomicWriteJson(path.join(runRoot(resolvedProject), 'latest.json'), {
      runId: run.runId, runDir: resolved.runDir, updatedAt: blockedAt
    });
    return { runDir: resolved.runDir, run,
      classification: observed.classification,
      integrity: assertRunIntegrity(resolved.runDir, run),
      nextAction: nextAction(run) };
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

function preflightWebReview(projectDir, runDir, run, webReview) {
  if (!webReview || typeof webReview !== 'object' || Array.isArray(webReview))
    throw new Error('webReview must be an object');
  if (!webReview.evidenceArtifact) throw new Error('webReview.evidenceArtifact is required');
  const assurance = run.webDelegationPlan?.assurance ?? 'strict';
  const contentMode = assurance === 'visual-content' && run.pipeline === 'production-art';
  const current = gitSourceSnapshot(projectDir);
  const issues = validateWebReview(webReview, {
    pipeline: run.pipeline, phase: webReview.phase,
    currentHead: current.available ? current.head : null,
    visual: Boolean(run.webDelegationPlan?.visual), assurance
  });
  if (issues.length) throw new Error('WEB_REVIEW_NOT_VERIFIED: ' + issues.join('; '));
  if (webReview.phase === 'acceptance') {
    const trace = run.routingTrace.byCycle?.[String(run.cycle)] ?? {};
    const pending = (trace.webReviews ?? []).filter(review => review.phase !== 'acceptance')
      .flatMap(review => review.unresolved ?? []);
    if (pending.some(id => !Array.isArray(webReview.resolvedFindings) ||
        !webReview.resolvedFindings.some(item => item?.id === id &&
          (webReview.receivedEvidenceRefs ?? []).includes(item.evidenceRef))))
      throw new Error('RESOLUTION_RECEIPT_INCOMPLETE: historical Web findings lack independently received resolution evidence');
    const locked = readJson(path.join(runDir, 'scope.json')).resolutionReceiptContract;
    if (locked) {
      const source = resolveArtifact(projectDir, runDir, locked.sourceEvidence);
      if (source.type !== 'file' || source.sha256 !== locked.sourceEvidenceSha256)
        throw new Error('RESOLUTION_RECEIPT_SOURCE_CHANGED: historical source is missing or no longer matches locked SHA-256');
      const cueErrors = validateResolutionReceipt(webReview, locked, fs.readFileSync(source.path, 'utf8'));
      if (cueErrors.length) throw new Error(cueErrors.join('; '));
    }
  }
  const artifact = resolveArtifact(projectDir, runDir, webReview.evidenceArtifact);
  const cycleTrace = run.routingTrace.byCycle?.[String(run.cycle)] ?? {};
  if (contentMode
      ? (run.routingTrace.webReviews ?? []).some(item => item.evidenceArtifact?.path === artifact.path)
      : (cycleTrace.webReviews ?? []).some(item => item.reviewTraceId === webReview.reviewTraceId))
    throw new Error('Duplicate Web reviewer identity/evidence artifact');
  const localScreenshotArtifacts = contentMode ? webReview.visualEvidence.map(frame => {
    const captured = resolveArtifact(projectDir, runDir, frame.path);
    if (captured.type !== 'file' || !/\.(?:png|jpe?g|webp)$/i.test(frame.path)
        || captured.sha256.toLowerCase() !== frame.sha256.toLowerCase())
      throw new Error('WEB_REVIEW_NOT_VERIFIED: screenshot hash/format mismatch: ' + frame.path);
    return captured;
  }) : [];
  return { artifact, localScreenshotArtifacts };
}

/** Read-only preview; recordRoutingTrace repeats exactly these checks under the run lock. */
export function preflightRoutingReceipt(projectDir, runRef, webReview) {
  const resolvedProject = path.resolve(projectDir);
  const resolved = resolveRun(resolvedProject, runRef);
  return withRunLock(resolved.runDir, () => {
    const run = readJson(resolved.file);
    if (TERMINAL.has(run.state)) throw new Error('Run is terminal: ' + run.state);
    const integrity = assertRunIntegrity(resolved.runDir, run);
    if (!integrity.ok) throw new Error('Run integrity check failed: ' + integrity.issues.join('; '));
    const ready = preflightWebReview(resolvedProject, resolved.runDir, run, webReview);
    return { status: 'READY_TO_RECORD', runId: run.runId,
      phase: webReview.phase, artifactSha256: ready.artifact.sha256 };
  });
}

export function recordRoutingTrace(projectDir, runRef, {
  webAgentsUsed,
  webReview,
  nativeFallbackUsed,
  fallbackReason
} = {}) {
  const resolvedProject = path.resolve(projectDir);
  const resolved = resolveRun(resolvedProject, runRef);
  return withRunLock(resolved.runDir, () => {
    const run = readJson(resolved.file);
    if (TERMINAL.has(run.state)) throw new Error('Run is terminal: ' + run.state);
    const integrity = assertRunIntegrity(resolved.runDir, run);
    if (!integrity.ok) throw new Error('Run integrity check failed: ' + integrity.issues.join('; '));
    const preparedReview = webReview === undefined ? null
      : preflightWebReview(resolvedProject, resolved.runDir, run, webReview);
    run.routingTrace.byCycle ||= {};
    const cycleKey = String(run.cycle);
    const cycleTrace = run.routingTrace.byCycle[cycleKey] ||= { webAgentsUsed: [], webReviews: [], nativeFallbackUsed: false, fallbackReason: null };
    if (webAgentsUsed !== undefined) {
      const merged = [...new Set([...(cycleTrace.webAgentsUsed ?? []), ...normalizeList(webAgentsUsed)])];
      cycleTrace.webAgentsUsed = merged;
      run.routingTrace.webAgentsUsed = [...new Set([...(run.routingTrace.webAgentsUsed ?? []), ...merged])];
    }
    if (preparedReview) {
      const stored = { ...webReview, evidenceArtifact: preparedReview.artifact,
        localScreenshotArtifacts: preparedReview.localScreenshotArtifacts, recordedAt: now() };
      cycleTrace.webReviews ||= [];
      cycleTrace.webReviews.push(stored);
      run.routingTrace.webReviews ||= [];
      run.routingTrace.webReviews.push(stored);
      if (['PASS', 'FINDINGS'].includes(webReview.status)) {
        cycleTrace.webAgentsUsed = [...new Set([...(cycleTrace.webAgentsUsed ?? []), webReview.agent])];
        run.routingTrace.webAgentsUsed = [...new Set([...(run.routingTrace.webAgentsUsed ?? []), webReview.agent])];
      }
    }
    if (nativeFallbackUsed !== undefined) {
      cycleTrace.nativeFallbackUsed = Boolean(nativeFallbackUsed);
      run.routingTrace.nativeFallbackUsed = Boolean(nativeFallbackUsed);
    }
    if (fallbackReason !== undefined) {
      cycleTrace.fallbackReason = fallbackReason || null;
      run.routingTrace.fallbackReason = fallbackReason || null;
    }
    run.updatedAt = now();
    atomicWriteJson(resolved.file, run);
    return { runDir: resolved.runDir, run };
  });
}

export function executionStatus(projectDir, runRef = 'latest') {
  return resumeRun(projectDir, runRef);
}
