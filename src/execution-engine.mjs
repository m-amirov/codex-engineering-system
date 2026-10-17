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
import {isArtOutputTransportBlocked,verifyArtOutputTransportRecovery} from './art-output-recovery.mjs';
import { narrativeDualFormatEnabled, verifyNarrativeDualFormatArt } from './narrative-dual-format-art.mjs';
import { inspectNativeProducerRoute, nativeProducerParentContext } from './native-producer-routing.mjs';
import { readRunCapabilityAttestation } from './capability-attestation.mjs';
import { NARRATIVE_ART_ACCEPTANCE_V2 } from './narrative-art-acceptance.mjs';
import { VERIFIED_EXISTING_ART_REUSE, verifyExistingArtReuse } from './existing-art-reuse.mjs';

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
const NATIVE_PARENT_MISMATCH_REASON = /\bnative producer route failed trusted parent binding\b/i;
const NATIVE_FALLBACK_STATUSES = new Set(['UNAVAILABLE', 'NOT_ACCEPTING_TURNS', 'RATE_LIMITED']);
const NATIVE_FALLBACK_REASON = /\b(transport|backend|runtime|bridge|connect(?:ion)?|disconnect(?:ed)?|unavailable|not accepting|rate[_ -]?limit(?:ed)?|usage limit(?:ed)?|timeout|timed out|http\s+\d{3}|refused)\b/i;
export const ART_MODES = Object.freeze({
  NEW_GENERATION: 'NEW_GENERATION',
  VERIFIED_EXISTING_ART_REUSE
});

function normalizeArtMode(pipeline, value) {
  if (pipeline !== 'production-art') {
    if (value !== undefined && value !== null) throw new Error('artMode is only supported for production-art runs');
    return null;
  }
  const mode = String(value ?? ART_MODES.NEW_GENERATION).trim().toUpperCase();
  if (!Object.values(ART_MODES).includes(mode)) throw new Error(`artMode must be one of: ${Object.values(ART_MODES).join(', ')}`);
  return mode;
}

function usesExistingArtReuse(run) {
  return run.pipeline === 'production-art' && run.artMode === ART_MODES.VERIFIED_EXISTING_ART_REUSE;
}

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
  // Run state is owned by CEOS and can be tracked by historical projects.
  // Exclude it from the product source snapshot without excluding any
  // user-authored source, manifests or acceptance evidence under artifacts/.
  const statusResult = run(['status', '--porcelain=v1', '--untracked-files=all',
    '--', '.', ':(exclude).ceos-runs']);
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

/** Bound an INTEGRATED batch to previously verified, immutable real bytes.
 * A caller cannot declare a smaller manifest after generating six other PNGs.
 */
function latestGeneratingBatchOutputChecks(runDir,cycle) {
  const checkpointsDir=path.join(runDir,'checkpoints');
  if (!fs.existsSync(checkpointsDir)) return null;
  const entries=fs.readdirSync(checkpointsDir)
    .filter(name=>/^\\d{3,}-generating\\.json$/.test(name)).sort().reverse();
  for (const name of entries) {
    const cp=readJson(path.join(checkpointsDir,name));
    if (cp.stage!=='GENERATING' || cp.cycle!==cycle ||
        !['CONTINUE','PASS'].includes(cp.outcome)) continue;
    if (cp.metadata?.artOutputGate?.status!=='PASS_ART_BATCH_MECHANICAL') return null;
    const checks=cp.metadata.artOutputGate.checks;
    return Array.isArray(checks) && checks.length>0 ? checks : null;
  }
  return null;
}

function priorExistingArtReuseContract(runDir) {
  const checkpointsDir = path.join(runDir, 'checkpoints');
  if (!fs.existsSync(checkpointsDir)) return null;
  const files = fs.readdirSync(checkpointsDir).filter(file => file.endsWith('.json')).sort().reverse();
  for (const file of files) {
    const checkpoint = readJson(path.join(checkpointsDir, file));
    if (checkpoint?.metadata?.existingArtReuse) return checkpoint.metadata.existingArtReuse;
  }
  return null;
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
  // Only explicit output-transport failures can request a special verified
  // reopen. The actual failed/PASS PNG receipt proofs are checked later
  // inside the run lock; classification alone never authorizes reopening.
  if (isArtOutputTransportBlocked(run)) return true;
  return stopReason.code === 'STAGE_BLOCKED' &&
    typeof stopReason.stage === 'string' &&
    Boolean(stageDefinition(run.pipeline, stopReason.stage)) &&
    EXTERNAL_RECOVERY_WORDS.test(String(stopReason.reason ?? '')) &&
    EXTERNAL_RECOVERY_FAILURES.test(String(stopReason.reason ?? ''));
}

/** Read-only recovery classification, sharing the exact allowlist used by reopenBlockedRun. */
export function inspectBlockedRunRecovery(run) {
  const blocked = run?.verdict === 'BLOCKED' && run?.state === 'BLOCKED';
  return {
    blocked,
    reopenSupported: blocked && isRecoverableBlocked(run),
    reason: blocked ? (run.stopReason ?? null) : null,
    policy: 'Never reopen automatically; require fresh external evidence and an explicit reason.'
  };
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
  if (def.requiresImageGeneration && !usesExistingArtReuse(run)) requirements.push('fresh trusted image-generation presence with generationAllowed = true (PRESENT + UNKNOWN service is sufficient for the first real invocation)');
  if (def.id === 'GENERATING' && usesExistingArtReuse(run))
    requirements.push('metadata.existingArtReuse: VERIFIED_EXISTING_ART_REUSE contract with current files, hashes, manifest, provenance, runtime pixels, independent art acceptance and clean blocking-findings summary');
  if (def.id === 'GENERATING' && run.artOutputGateRequired)
    requirements.push('metadata.artOutputs: real generated PNG paths, kind and expected dimensions; each output must pass ceos art-output-verify before the next Image Gen call');
  if (def.id === 'GENERATING' && run.nativeProducerRouteRequired) {
    requirements.push('metadata.producerTraceFile: actual Codex child rollout JSONL proving agent_role=ceos_asset_generator and effective model=gpt-5.6-terra/medium; a parent assertion is insufficient');
    if (run.producerBindingMode === 'CURRENT_TURN')
      requirements.push('consumed run-scoped Image Gen challenge from this parent session (original issuance/response turn verified, maximum 30 minutes old); a fresh current host turn, real Terra child and PNG gates are still required');
  }
  if (run.narrativeDualFormatRequired && (def.id === 'INTEGRATED' || def.id === 'REAUDITED'))
    requirements.push(run.artMode === ART_MODES.NEW_GENERATION
      ? 'metadata.dualFormatManifest: source-bound mappings for the exact generated batch; both portrait 2:3 and desktop 16:9 PNGs must match hash-pinned GENERATING output checks; episode final coverage is NOT asserted by a batch'
      : 'metadata.dualFormatManifest: full source-bound episode art mapping; both portrait 2:3 and desktop 16:9 files required for all authored scenes');
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

  if (run.linkedRecovery) {
    const link = run.linkedRecovery;
    const root = runRoot(path.resolve(run.projectDir));
    const sourceDir = path.join(root, link.sourceRunId ?? '');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(link.sourceRunId ?? '') ||
        !isInside(root, sourceDir) || sourceDir === runDir) {
      issues.push('linked recovery source run invalid');
    } else {
      for (const [file, expected, label] of [
        [path.join(sourceDir, 'run.json'), link.sourceRunSha256, 'source run'],
        [path.join(sourceDir, 'scope.json'), link.sourceScopeFileSha256, 'source scope'],
        [path.join(sourceDir, 'checkpoints', link.canonCheckpointFile ?? ''), link.canonCheckpointSha256, 'source canon checkpoint']
      ]) {
        if (!expected || !fs.existsSync(file) || hashPath(file).sha256 !== expected)
          issues.push('linked recovery ' + label + ' changed or missing');
      }
      if (link.scopeSha256 !== run.scopeSha256)
        issues.push('linked recovery scope differs from source scope');
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

/**
 * Rehydrate a historical receipt contract through the same source-backed
 * createRun preflight used for fresh runs. Never silently remove it or
 * treat changed source evidence as a valid recovery.
 */
function recoverResolutionReceiptContract(project, scope) {
  const allowed = ['target','inScope','outOfScope','acceptanceContract',
    'mutationBoundary','resolutionReceiptContract'];
  if (Object.keys(scope).some(key => !allowed.includes(key)))
    throw new Error('BLOCKED_RECOVERY_SCOPE_UNSUPPORTED');
  if (!Object.hasOwn(scope,'resolutionReceiptContract')) return null;
  const locked = scope.resolutionReceiptContract;
  const contract = normalizeResolutionReceiptContract(locked);
  if (typeof locked.sourceEvidenceSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(locked.sourceEvidenceSha256))
    throw new Error('BLOCKED_RECOVERY_RESOLUTION_RECEIPT_HASH_MISSING');
  const source = resolveArtifact(project,project,contract.sourceEvidence);
  if (source.type !== 'file' || source.sha256 !== locked.sourceEvidenceSha256)
    throw new Error('BLOCKED_RECOVERY_RESOLUTION_RECEIPT_SOURCE_CHANGED');
  const errors = validateResolutionReceipt(
    {historicalExactLines:contract.requiredExactLines},
    contract,fs.readFileSync(source.path,'utf8'));
  if (errors.length)
    throw new Error('BLOCKED_RECOVERY_RESOLUTION_RECEIPT_SOURCE_INVALID: ' + errors.join('; '));
  return contract;
}

/**
 * Session-only recovery of a previously accepted CANON_READY milestone.
 * No generated pixels, attestation or native trace is inherited. The source
 * run and canon checkpoint remain immutable, pinned by content hashes.
 */
export function createLinkedSessionRecoveryRun(projectDir, sourceRunRef, {expectedParentSessionId, expectedHead} = {}) {
  const project = path.resolve(projectDir);
  const original = resolveRun(project, sourceRunRef);
  return withRunLock(original.runDir, () => {
    const old = readJson(original.file);
    const integrity = assertRunIntegrity(original.runDir, old);
    if (!integrity.ok) throw new Error('BLOCKED_RECOVERY_SOURCE_INTEGRITY: ' + integrity.issues.join(', '));
    if (old.pipeline !== 'production-art' || old.nativeProducerRouteRequired !== true ||
        old.artMode !== ART_MODES.NEW_GENERATION || old.cycle !== 1)
      throw new Error('BLOCKED_RECOVERY_UNSUPPORTED_PIPELINE');
    const terminalMismatch = old.verdict === 'BLOCKED' &&
      (old.stopReason?.stage === 'GENERATING' ||
       (!old.stopReason?.stage && old.stopReason?.code === 'BLOCKED_NATIVE_AGENT_PARENT_MISMATCH')) &&
      (old.stopReason?.code === 'BLOCKED_NATIVE_AGENT_PARENT_MISMATCH' ||
       /BLOCKED_NATIVE_AGENT_PARENT_MISMATCH/.test(String(old.stopReason.reason ?? '')) ||
       NATIVE_PARENT_MISMATCH_REASON.test(String(old.stopReason.reason ?? '')));
    if (!(old.verdict === null && old.nextStage === 'GENERATING') && !terminalMismatch)
      throw new Error('BLOCKED_RECOVERY_NOT_AT_GENERATING');
    if (typeof expectedParentSessionId !== 'string' || !expectedParentSessionId.trim() ||
        expectedParentSessionId === old.producerParentSessionId ||
        nativeProducerParentContext({projectDir:project}) !== expectedParentSessionId)
      throw new Error('BLOCKED_RECOVERY_PARENT_UNVERIFIED');

    const source = gitSourceSnapshot(project);
    if (!source.available || source.head !== expectedHead)
      throw new Error('BLOCKED_RECOVERY_SOURCE_HEAD_CHANGED');
    const scope = readJson(path.join(original.runDir, 'scope.json'));
    if (scopeHash(scope) !== old.scopeSha256)
      throw new Error('BLOCKED_RECOVERY_SCOPE_CHANGED');
    const resolutionReceiptContract = recoverResolutionReceiptContract(project,scope);
    const checkpointsDir = path.join(original.runDir, 'checkpoints');
    const checkpoints = fs.readdirSync(checkpointsDir).filter(name=>name.endsWith('.json')).sort();
    const acceptedCanon = checkpoints.filter(name=>name.endsWith('-canon-ready.json'))
      .map(name=>({name, data:readJson(path.join(checkpointsDir,name))}))
      .filter(x=>x.data.stage==='CANON_READY' && x.data.outcome==='CONTINUE');
    const canon = acceptedCanon.at(-1);
    if (!canon || canon.data.source?.head !== source.head ||
        !checkpoints.some(name=>name.endsWith('-inventoried.json')))
      throw new Error('BLOCKED_RECOVERY_CANON_NOT_CURRENT');
    const caps = structuredClone(readJson(path.join(original.runDir, 'capabilities.json')));
    caps.imageGeneration = {
      ...caps.imageGeneration,
      status:'unknown',
      capabilityPresence:'UNKNOWN',
      serviceAvailability:'UNKNOWN',
      callable:false,
      trustedForGeneration:false,
      generationAllowed:false,
      attestationFile:null,
      observedTool:null,
      trustScope:null,
      serviceEvidence:null,
      source:'linked-recovery-requires-fresh-run-session-turn-challenge'
    };
    const blocker = capabilityBlockers(caps,{pipeline:old.pipeline,webRequired:old.webRequired})
      .find(x=>x.code!=='IMAGE_GENERATION_UNAVAILABLE');
    if (blocker) throw new Error('BLOCKED_RECOVERY_CAPABILITY_PREFLIGHT: ' + blocker.code);

    const linked = createRun(project, old.pipeline, {
      scope, capabilities:caps, webRequired:old.webRequired,
      maxCycles:old.maxCycles, webReviewMode:old.webReviewMode,
      webReviewAssurance:old.webReviewAssurance, artMode:old.artMode,
      resolutionReceiptContract
    });
    return withRunLock(linked.runDir, () => {
      const next = readJson(path.join(linked.runDir, 'run.json'));
      // A linked recovery of an historical pinned-parent run keeps its original
      // authority model. Do not silently migrate that run to deferred binding.
      next.producerBindingMode = null;
      next.producerParentSessionId = expectedParentSessionId;
      if (next.verdict !== null || next.nativeProducerRouteRequired !== true ||
          next.producerParentSessionId !== expectedParentSessionId ||
          next.scopeSha256 !== old.scopeSha256)
        throw new Error('BLOCKED_RECOVERY_NEW_RUN_BINDING');
      const canonFile = path.join(checkpointsDir, canon.name);
      next.linkedRecovery = {
        schemaVersion:1, reason:'PARENT_SESSION_CHANGED',
        sourceRunId:old.runId, sourceRunSha256:hashPath(original.file).sha256,
        sourceScopeFileSha256:hashPath(path.join(original.runDir,'scope.json')).sha256,
        scopeSha256:old.scopeSha256,
        sourceCheckpointCount:old.checkpointCount,
        canonCheckpointFile:canon.name,
        canonCheckpointSha256:hashPath(canonFile).sha256,
        sourceHead:source.head,
        oldParentSessionId:old.producerParentSessionId,
        newParentSessionId:expectedParentSessionId,
        sourceVerdict:old.verdict,
        at:now()
      };
      writeCheckpoint(linked.runDir, next, {
        stage:'LINKED_SESSION_RECOVERY',at:now(),auto:true,
        outcome:'CONTINUE',metadata:next.linkedRecovery,
        artifacts:[
          {path:original.file,...hashPath(original.file)},
          {path:canonFile,...hashPath(canonFile)}
        ]
      });
      next.state='CANON_READY';
      next.nextStage='GENERATING';
      next.updatedAt=now();
      atomicWriteJson(path.join(linked.runDir, 'run.json'),next);
      atomicWriteJson(path.join(runRoot(project),'latest.json'),
        {runId:next.runId,runDir:linked.runDir,updatedAt:next.updatedAt});
      return {runDir:linked.runDir,run:next,integrity:assertRunIntegrity(linked.runDir,next),nextAction:nextAction(next)};
    });
  });
}

export function createRun(projectDir, pipeline, {
  scope,
  capabilities,
  webRequired = false,
  maxCycles,
  webReviewMode = 'legacy',
  webReviewAssurance = 'strict',
  resolutionReceiptContract = null,
  artMode
} = {}) {
  const resolvedProject = path.resolve(projectDir);
  const definition = EXECUTION_PIPELINES[pipeline];
  if (!definition) throw new Error(`Unknown execution pipeline '${pipeline}'`);
  if (!fs.existsSync(resolvedProject)) throw new Error(`Project directory does not exist: ${resolvedProject}`);
  if (!capabilities || typeof capabilities !== 'object') throw new Error('capabilities snapshot is required');

  if (!['legacy', 'enhanced'].includes(webReviewMode)) throw new Error('Invalid webReviewMode');
  if (webReviewMode === 'legacy' && webReviewAssurance !== 'strict')
    throw new Error('visual-content assurance requires enhanced Web review mode');
  const normalizedArtMode = normalizeArtMode(pipeline, artMode);
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
    artMode: normalizedArtMode,
    artOutputGateRequired: pipeline === 'production-art' && normalizedArtMode !== ART_MODES.VERIFIED_EXISTING_ART_REUSE,
    narrativeDualFormatRequired: pipeline === 'production-art' && narrativeDualFormatEnabled(resolvedProject),
    nativeProducerRouteRequired: pipeline === 'production-art' && normalizedArtMode !== ART_MODES.VERIFIED_EXISTING_ART_REUSE && narrativeDualFormatEnabled(resolvedProject),
    artAcceptanceProfile: pipeline === 'production-art' && narrativeDualFormatEnabled(resolvedProject) ? NARRATIVE_ART_ACCEPTANCE_V2 : null,
    // The run is product-scoped, not Codex-session-scoped. Native parent trust is
    // resolved at GENERATING from the current, run-scoped capability challenge.
    // Historical runs without this mode retain their original pinned parent.
    producerBindingMode: pipeline === 'production-art' && normalizedArtMode === ART_MODES.NEW_GENERATION && narrativeDualFormatEnabled(resolvedProject)
      ? 'CURRENT_TURN' : null,
    producerParentSessionId: null,
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
  // Existing-art reuse carries a current, independently accepted art packet in
  // its immutable GENERATING checkpoint. Requiring a second Web High turn here
  // would turn reuse into an implicit re-generation/re-review path.
  if (usesExistingArtReuse(run)) return;
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
    pipeline: run.pipeline, currentHead, defectCount: run.lastDefectCount ?? null,
    artAcceptanceProfile: run.artAcceptanceProfile ?? null
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
  if (usesExistingArtReuse(run)) return;
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

/**
 * Resolve native producer authority without writing a session binding to run.json.
 * CURRENT_TURN uses a challenge issued and consumed in the same trusted
 * turn; its bounded authorization is valid for the same live parent session
 * (up to 30 minutes), paired with the persisted capability snapshot. Legacy pinned-parent
 * runs preserve their historical contract.
 *
 * This function is shared by producer-route-check and GENERATING to prevent
 * their parent resolution from diverging.
 */
function verifiedProducerParent(projectDir, run, capabilities, {codexHome} = {}) {
  if (run.producerBindingMode !== 'CURRENT_TURN') {
    return {ok:true, parentSessionId:run.producerParentSessionId,
      attestationFile:null, bindingMode:'PINNED_PARENT'};
  }
  const verified=readRunCapabilityAttestation(projectDir,run.runId,{codexHome});
  const attestation=verified.attestation;
  const image=capabilities?.imageGeneration;
  if (!verified.valid || attestation?.presence!=='PRESENT' ||
      !['UNKNOWN','AVAILABLE'].includes(attestation?.serviceAvailability) ||
      image?.trustedForGeneration!==true ||
      image?.capabilityPresence!=='PRESENT' ||
      image?.generationAllowed!==true ||
      image?.attestationFile!==verified.file ||
      !['run-session-turn','run-session-window'].includes(image?.trustScope)) {
    return {ok:false,status:'BLOCKED_GENERATION_CURRENT_TURN_UNVERIFIED',
      detail:'Fresh matching run-scoped capability challenge and trusted capability snapshot required' +
        (verified.reason ? ': '+verified.reason : '')};
  }
  return {ok:true,parentSessionId:attestation.sessionId,
    attestationFile:verified.file,bindingMode:'CURRENT_TURN'};
}

/** Read-only route preflight. It never grants generation, creates traces or mutates a run. */
export function preflightNativeProducerRoute(projectDir, runRef='latest', traceFile, {codexHome}={}) {
  const project=path.resolve(projectDir);
  const resumed=resumeRun(project,runRef);
  if (path.resolve(resumed.run.projectDir ?? '')!==project ||
      path.resolve(resumed.run.runDir ?? '')!==path.resolve(resumed.runDir))
    return {ok:false,status:'BLOCKED_NATIVE_AGENT_RUN_LOCATION_MISMATCH',
      detail:'Run location differs from the requested checkout; use verified run relocation'};
  if (resumed.run.pipeline!=='production-art')
    return {ok:false,status:'BLOCKED_NATIVE_AGENT_PIPELINE_MISMATCH',
      detail:'Native producer route requires a production-art run'};
  if (!resumed.integrity.ok)
    return {ok:false,status:'BLOCKED_INTEGRITY',
      detail:resumed.integrity.issues.join('; ')};
  if (resumed.run.verdict || resumed.run.nextStage!=='GENERATING')
    return {ok:false,status:'BLOCKED_NATIVE_AGENT_WRONG_STAGE',
      detail:'Native producer route preflight requires an active GENERATING stage'};
  if (resumed.run.nativeProducerRouteRequired!==true)
    return {ok:false,status:'BLOCKED_NATIVE_AGENT_ROUTE_NOT_REQUIRED',
      detail:'Selected run does not require a native producer route'};
  const capabilities=readJson(path.join(resumed.runDir,'capabilities.json'));
  const parent=verifiedProducerParent(project,resumed.run,capabilities,{codexHome});
  if (!parent.ok) return parent;
  const result=inspectNativeProducerRoute(traceFile,{
    codexHome,parentSessionId:parent.parentSessionId
  });
  return {...result,bindingMode:parent.bindingMode,
    ...(parent.attestationFile ? {attestationFile:parent.attestationFile} : {})};
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
    const existingArtReuse = usesExistingArtReuse(run);
    const existingArtReuseContract = existingArtReuse
      ? (metadata?.existingArtReuse ?? priorExistingArtReuseContract(resolved.runDir))
      : null;
    if (stage === 'GENERATING' && metadata?.existingArtReuse && !existingArtReuse) {
      throw new Error('EXISTING_ART_REUSE_MODE_REQUIRED: create the run with artMode=VERIFIED_EXISTING_ART_REUSE');
    }
    if (normalizedOutcome === 'PASS' || normalizedOutcome === 'CONTINUE') {
      assertWebReviewPhase(run, currentCapabilities, stage, currentSource.head);
    }
    if (stage === 'REAUDITED' && normalizedOutcome === 'PASS') {
      assertFinalRouting(run, currentCapabilities);
      assertPositiveEvidenceContract(metadata, { currentSourceHead: currentSource.available ? currentSource.head : null });
    }
    let existingReuseGate = null;
    if (stage === 'GENERATING' && existingArtReuse &&
        (normalizedOutcome === 'CONTINUE' || normalizedOutcome === 'PASS')) {
      if (Object.hasOwn(metadata ?? {}, 'artOutputs') ||
          Object.hasOwn(metadata ?? {}, 'producerTraceFile') ||
          Object.hasOwn(metadata ?? {}, 'imageGeneration') ||
          Object.hasOwn(metadata?.existingArtReuse ?? {}, 'generationReceipt')) {
        throw new Error('VERIFIED_EXISTING_ART_REUSE_MIXED_GENERATION: reuse checkpoints cannot carry generation outputs, producer traces or generation receipts');
      }
      existingReuseGate = verifyExistingArtReuse(resolvedProject, metadata?.existingArtReuse, {
        currentHead: currentSource.available ? currentSource.head : null,
        narrativeDualFormatRequired: run.narrativeDualFormatRequired === true
      });
      if (existingReuseGate.status !== 'PASS_VERIFIED_EXISTING_ART_REUSE') {
        throw new Error('VERIFIED_EXISTING_ART_REUSE_BLOCKED: ' + existingReuseGate.errors.join(', '));
      }
    }
    if (definition.requiresImageGeneration && !existingArtReuse) {
      const image = currentCapabilities.imageGeneration;
      if (!(image?.trustedForGeneration === true && image?.capabilityPresence === 'PRESENT' && image?.generationAllowed === true)) {
        throw new Error('GENERATING requires fresh trusted native image-generation presence; create and answer a run-scoped capability challenge from the current Codex turn');
      }
    }

    let producerRouteGate = null;
    let producerAttestationFile = null;
    if (stage === 'GENERATING' && !existingArtReuse && run.nativeProducerRouteRequired === true &&
        (normalizedOutcome === 'CONTINUE' || normalizedOutcome === 'PASS')) {
      // Resolve the exact parent with the same verified rules used by
      // ceos producer-route-check. CURRENT_TURN does not populate run.json.
      const parent=verifiedProducerParent(resolvedProject,run,currentCapabilities);
      if (!parent.ok) throw new Error(parent.status+': '+parent.detail);
      producerAttestationFile=parent.attestationFile;
      producerRouteGate=inspectNativeProducerRoute(metadata?.producerTraceFile, {
        parentSessionId:parent.parentSessionId
      });
      if (!producerRouteGate.ok)
        throw new Error(producerRouteGate.status + ': ' + producerRouteGate.detail);
    }

    let outputGate = null;
    if (stage === 'GENERATING' && !existingArtReuse && run.artOutputGateRequired === true &&
        (normalizedOutcome === 'CONTINUE' || normalizedOutcome === 'PASS')) {
      const entries = metadata?.artOutputs;
      outputGate = inspectArtBatch({ assets: entries }, { projectDir: resolvedProject });
      if (outputGate.status !== 'PASS_ART_BATCH_MECHANICAL')
        throw new Error('GENERATING output gate refused non-production assets: ' +
          outputGate.issues.join(', ') +
          (outputGate.firstFailedIndex === undefined ? '' : ' at index ' + outputGate.firstFailedIndex));
    }

    // Opted-in narrative games require independently authored portrait and desktop CG files.
    // Existing/historical runs without this flag are unchanged; scope does not silently
    // claim complete artistic acceptance merely from file existence.
    let dualFormatGate = null;
    if (run.narrativeDualFormatRequired && (stage === 'INTEGRATED' ||
        (stage === 'REAUDITED' && normalizedOutcome === 'PASS')) &&
        (normalizedOutcome === 'CONTINUE' || normalizedOutcome === 'PASS')) {
      if (typeof metadata?.dualFormatManifest !== 'string' || !metadata.dualFormatManifest.trim())
        throw new Error('NARRATIVE_DUAL_FORMAT_MANIFEST_REQUIRED: metadata.dualFormatManifest');
      const requestEpisodeFinal = metadata.episodeFinalAcceptance === true;
      const batchCoverage = !existingArtReuse && !requestEpisodeFinal;
      dualFormatGate = verifyNarrativeDualFormatArt(resolvedProject, metadata.dualFormatManifest, {
        currentHead: currentSource.available ? currentSource.head : undefined,
        baseHead: existingArtReuseContract?.sourceHead,
        dependencyBased: existingArtReuseContract?.currentness?.mode === 'DEPENDENCY_BASED_REUSE',
        coverageMode:batchCoverage?'BATCH_ONLY':'FULL_EPISODE',
        expectedBatchOutputs:batchCoverage
          ? latestGeneratingBatchOutputChecks(resolved.runDir,run.cycle)
          : null
      });
      if (dualFormatGate.status !== 'PASS_DUAL_FORMAT_ART_MECHANICAL')
        throw new Error('NARRATIVE_DUAL_FORMAT_ART_BLOCKED: ' +
          dualFormatGate.errors.map(e => e.code + ':' + e.id).join(', '));
      if (batchCoverage && metadata.episodeFinalAcceptance === true)
        throw new Error('NARRATIVE_BATCH_CANNOT_ASSERT_EPISODE_FINAL_ACCEPTANCE');
      if (batchCoverage && metadata.releaseReady === true)
        throw new Error('NARRATIVE_BATCH_CANNOT_ASSERT_RELEASE_READY');
    }

    if (definition.requiresDefectCount) {
      const count = metadata?.defectCount;
      if (!Number.isInteger(count) || count < 0) throw new Error('DEFECTS_CONFIRMED requires metadata.defectCount as a non-negative integer');
    }

    const artifactInputs = normalizeList(artifacts);
    if (producerAttestationFile) {
      // Pin the authority used for the exact produced batch in immutable
      // checkpoint evidence. It is not a reusable grant for later sessions.
      const relative = path.relative(resolvedProject, producerAttestationFile).split(path.sep).join('/');
      if (!artifactInputs.includes(relative)) artifactInputs.push(relative);
    }
    if (dualFormatGate && !artifactInputs.includes(metadata.dualFormatManifest))
      artifactInputs.push(metadata.dualFormatManifest);
    if (outputGate) {
      // Pin actual source image bytes to immutable checkpoint evidence, not just a mutable receipt.
      for (const entry of outputGate.inspected) {
        const rel = path.relative(resolvedProject, entry.path);
        if (!artifactInputs.includes(rel)) artifactInputs.push(rel);
      }
    }
    if (existingReuseGate) {
      for (const artifact of existingReuseGate.artifacts) {
        if (!artifactInputs.includes(artifact)) artifactInputs.push(artifact);
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
      metadata: {
        ...(metadata && typeof metadata === 'object' ? metadata : {}),
        ...(outputGate ? { artOutputGate: { status: outputGate.status, checks: outputGate.inspected.map(x => ({ path: x.path, sha256: x.sha256, dimensions: x.dimensions, alpha: x.alpha, checkerboard: x.checkerboard })) } } : {}),
        ...(dualFormatGate ? { dualFormatGate } : {}),
        ...(existingReuseGate ? { existingArtReuseGate: { status: existingReuseGate.status, assetCount: existingReuseGate.assetCount, visualAcceptance: existingReuseGate.visualAcceptance } } : {}),
        ...(producerRouteGate ? { producerRouteGate } : {})
      },
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
  evidence = [],
  artOutputRecovery = null
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

    const needsNativeOutputProof=isArtOutputTransportBlocked(run);
    if (!needsNativeOutputProof && artOutputRecovery)
      throw new Error('ART_TRANSPORT_RECOVERY_WRONG_BLOCKER');
    let outputRecovery=null;
    if (needsNativeOutputProof) {
      if (!artOutputRecovery)
        throw new Error('ART_TRANSPORT_RECOVERY_EVIDENCE_REQUIRED: failed receipt, passing receipt and original native PNG');
      outputRecovery=verifyArtOutputTransportRecovery(resolvedProject,resolved.runDir,run,artOutputRecovery);
      const originalCheckpoint=readJson(checkpointFile(resolved.runDir,run.checkpointCount,'GENERATING'));
      const currentSource=gitSourceSnapshot(resolvedProject);
      if (!originalCheckpoint.source?.available || !currentSource.available ||
          originalCheckpoint.source.head!==currentSource.head)
        throw new Error('ART_TRANSPORT_RECOVERY_SOURCE_HEAD_CHANGED');
    }
    const artifactNames=normalizeList(evidence);
    if (outputRecovery) {
      for (const file of [
        outputRecovery.failedReceipt,
        outputRecovery.passReceipt,
        outputRecovery.targetPath
      ]) if (!artifactNames.includes(file)) artifactNames.push(file);
    }
    const artifactRecords=artifactNames.map(item => resolveArtifact(resolvedProject, resolved.runDir, item));
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
      ...(outputRecovery ? { artOutputRecovery: outputRecovery,
        recoveryCategory:'NATIVE_IMAGE_OUTPUT_TRANSPORT_ONLY',
        generationCandidateReused:true,artisticAcceptance:'NOT_VERIFIED' } : {}),
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
    visual: Boolean(run.webDelegationPlan?.visual), assurance,
    artAcceptanceProfile: run.artAcceptanceProfile ?? null
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
