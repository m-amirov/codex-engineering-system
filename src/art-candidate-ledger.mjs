import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const HASH = /^[a-f0-9]{64}$/i;
const HEAD = /^[a-f0-9]{40}$/i;
const DEFAULT_LIMIT = 2;
const ATTEMPT_STATES = new Set(['INVOKED','OUTPUT_SAVED','OUTPUT_LOST']);
const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const safe = value => typeof value === 'string' && value.length > 0 && !path.isAbsolute(value)
  && !value.includes('\\') && value.split('/').every(part => part && part !== '.' && part !== '..');

function sourceFile(projectDir, relative, expectedHash = null) {
  if (!safe(relative)) throw new Error('UNSAFE_ART_LEDGER_PATH');
  const root = fs.realpathSync(projectDir);
  const file = fs.realpathSync(path.resolve(root, relative));
  if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile())
    throw new Error('ART_LEDGER_FILE_OUTSIDE_PROJECT');
  const bytes = fs.readFileSync(file);
  if (expectedHash !== null && (!HASH.test(expectedHash) || hash(bytes) !== expectedHash.toLowerCase()))
    throw new Error('ART_LEDGER_SHA256_MISMATCH');
  return { value: JSON.parse(bytes.toString('utf8')), sha256: hash(bytes) };
}

function traceReferenceAllowed(tracePath) {
  if (typeof tracePath !== 'string') return false;
  if (safe(tracePath)) return true;
  const normalized = String(tracePath ?? '').replaceAll('\\', '/').toLowerCase();
  return path.isAbsolute(tracePath) && normalized.includes('/.codex/sessions/') &&
    normalized.endsWith('.jsonl');
}

function verifiedNativeTrace(projectDir, attempt) {
  if (!traceReferenceAllowed(attempt?.tracePath) || !HASH.test(attempt?.traceSha256 ?? '')) return false;
  try {
    const root = fs.realpathSync(projectDir);
    const external = !safe(attempt.tracePath);
    const filename = fs.realpathSync(external ? attempt.tracePath : path.resolve(root, attempt.tracePath));
    if (!external && !filename.startsWith(root + path.sep)) return false;
    if (!fs.statSync(filename).isFile()) return false;
    const complete = fs.readFileSync(filename);
    const length = external ? attempt.traceByteLength : complete.length;
    if (!Number.isInteger(length) || length < 1 || length > complete.length) return false;
    const bytes = complete.subarray(0, length);
    if (external && length < complete.length && bytes[bytes.length - 1] !== 10) return false;
    if (hash(bytes) !== attempt.traceSha256.toLowerCase()) return false;
    const lines = bytes.toString('utf8').split(/\r?\n/).filter(Boolean);
    return lines.length > 0 && lines.every(line => {
      try { JSON.parse(line); return true; } catch { return false; }
    });
  } catch { return false; }
}

function sourceHeadCompatible(projectDir, historicalHead, requestedHead) {
  if (historicalHead === requestedHead) return true;
  try {
    return spawnSync('git', ['merge-base', '--is-ancestor', historicalHead, requestedHead], {
      cwd: projectDir, windowsHide: true, timeout: 15000
    }).status === 0;
  } catch { return false; }
}

function normalizeOwnerException(value) {
  if (value?.kind === 'OWNER_AUTHORIZED_ART_EXCEPTION_V1' && Array.isArray(value.scenes))
    return { sourceHead: value.sourceHead, scenes: value.scenes };
  if (value?.kind !== 'OWNER_AUTHORIZED_ART_EXCEPTION' ||
      value.authorization?.status !== 'OWNER_AUTHORIZED' ||
      value.exception?.globalLimitReset !== false ||
      value.exception?.otherScenesAllowed !== false ||
      value.exception?.acceptedAssetsMayBeRegenerated !== false ||
      !Array.isArray(value.scope?.scenes)) return null;
  const scenes = value.scope.scenes.map(item => ({
    sceneId: item?.sceneId,
    variant: item?.variant ?? 'pair',
    baseLimit: item?.priorCandidateBudget?.limit,
    extraCandidates: item?.generationLedger?.allowedAdditionalAttempts,
    additionalAttemptCount: item?.generationLedger?.additionalAttemptCount
  }));
  if (value.exception.totalAdditionalCandidates !== scenes.length ||
      scenes.some(item => item.baseLimit !== DEFAULT_LIMIT || item.extraCandidates !== 1 ||
        item.additionalAttemptCount !== 0)) return null;
  return { sourceHead: value.sourceHead, scenes };
}

export function inspectArtCandidateLedger(projectDir, ledgerPath) {
  if (!ledgerPath) return { status: 'NO_LEDGER', attempts: [], consumed: {} };
  try {
    if (!safe(ledgerPath)) throw new Error('UNSAFE_ART_LEDGER_PATH');
    const root = fs.realpathSync(projectDir);
    const target = path.resolve(root, ledgerPath);
    if (!target.startsWith(root + path.sep))
      throw new Error('ART_LEDGER_PATH_OUTSIDE_PROJECT');
    if (!fs.existsSync(target)) return { status:'NO_LEDGER', attempts:[], consumed:{} };
    const { value, sha256 } = sourceFile(projectDir, ledgerPath);
    if (value.schemaVersion !== 1 || value.kind !== 'ART_CANDIDATE_LEDGER_V1' || !Array.isArray(value.attempts))
      throw new Error('ART_LEDGER_SCHEMA_INVALID');
    const seen = new Set(), ordinals = new Set(), consumed = {};
    for (const a of value.attempts) {
      if (!a || typeof a.attemptId !== 'string' || !a.attemptId.trim() ||
        typeof a.sceneId !== 'string' || !a.sceneId.trim() || !Number.isInteger(a.candidateNumber) ||
        a.candidateNumber < 1 || !ATTEMPT_STATES.has(a.status) || !HEAD.test(a.sourceHead ?? '') ||
        typeof a.variant !== 'string' || !a.variant || !a.producerTrace ||
        typeof a.producerTrace !== 'string') throw new Error('ART_LEDGER_ATTEMPT_INVALID');
      if (a.evidencePath !== undefined) {
        if (!safe(a.evidencePath) || !HASH.test(a.evidenceSha256 ?? ''))
          throw new Error('ART_LEDGER_EVIDENCE_INVALID');
        const evidenceFile = fs.realpathSync(path.resolve(root, a.evidencePath));
        if (!evidenceFile.startsWith(root + path.sep) || !fs.statSync(evidenceFile).isFile() ||
            hash(fs.readFileSync(evidenceFile)) !== a.evidenceSha256.toLowerCase())
          throw new Error('ART_LEDGER_EVIDENCE_SHA256_MISMATCH');
      }
      const key = a.sceneId + ':' + a.variant + ':' + a.candidateNumber;
      if (seen.has(a.attemptId) || ordinals.has(key)) throw new Error('ART_LEDGER_DUPLICATE_ATTEMPT');
      seen.add(a.attemptId); ordinals.add(key);
      const counter = a.sceneId + ':' + a.variant;
      consumed[counter] = Math.max(consumed[counter] ?? 0, a.candidateNumber);
    }
    return { status: 'PASS_CANDIDATE_LEDGER', attempts: value.attempts, consumed, sha256 };
  } catch (error) {
    return { status: 'BLOCKED_CANDIDATE_LEDGER', attempts: [], consumed: {}, reason: error.message };
  }
}

/** An exception file is scoped evidence, not cryptographic proof of who authorized it.
 * The host must independently attest user approval before setting ownerApprovalObserved=true.
 */
export function authorizeArtCandidate(projectDir, {
  sceneId, variant = 'pair', candidateNumber, sourceHead,
  ownerExceptionPath = null, ownerExceptionSha256 = null,
  ownerApprovalObserved = false, ledgerPath = null
} = {}) {
  const denied = (code, extra = {}) => ({ status: code, authorized: false, ...extra });
  if (typeof sceneId !== 'string' || !sceneId || !Number.isInteger(candidateNumber) ||
      candidateNumber < 1 || !HEAD.test(sourceHead ?? '') || typeof variant !== 'string' || !variant)
    return denied('BLOCKED_CANDIDATE_SCOPE_INVALID');
  const ledger = inspectArtCandidateLedger(projectDir, ledgerPath);
  if (ledger.status === 'BLOCKED_CANDIDATE_LEDGER') return denied(ledger.status, { reason: ledger.reason });
  const sceneAttempts = ledger.attempts.filter(a => a.sceneId === sceneId && a.variant === variant);
  if (sceneAttempts.some(attempt => !sourceHeadCompatible(projectDir, attempt.sourceHead, sourceHead)))
    return denied('BLOCKED_CANDIDATE_HISTORY_SOURCE_HEAD');
  const consumed = ledger.consumed[sceneId + ':' + variant] ?? 0;
  if (candidateNumber <= consumed) return denied('BLOCKED_CANDIDATE_ALREADY_CONSUMED', { consumed });
  if (candidateNumber !== consumed + 1 && ledger.status === 'PASS_CANDIDATE_LEDGER')
    return denied('BLOCKED_CANDIDATE_SEQUENCE', { consumed });
  if (candidateNumber <= DEFAULT_LIMIT)
    return { status: 'READY_TO_GENERATE', authorized: true, maxCandidates: DEFAULT_LIMIT, consumed, exceptionUsed: false };
  if (candidateNumber !== DEFAULT_LIMIT + 1 || !ownerApprovalObserved)
    return denied('BLOCKED_OWNER_APPROVAL_REQUIRED', { consumed });
  if (!ownerExceptionPath || !ownerExceptionSha256)
    return denied('BLOCKED_OWNER_EXCEPTION_EVIDENCE_REQUIRED', { consumed });
  try {
    const { value, sha256 } = sourceFile(projectDir, ownerExceptionPath, ownerExceptionSha256);
    const exception = normalizeOwnerException(value);
    if (!exception || exception.sourceHead !== sourceHead)
      return denied('BLOCKED_OWNER_EXCEPTION_SCHEMA');
    const grants = exception.scenes.filter(item => item?.sceneId === sceneId && (item.variant ?? 'pair') === variant);
    if (grants.length !== 1 || grants[0].extraCandidates !== 1 || grants[0].baseLimit !== DEFAULT_LIMIT)
      return denied('BLOCKED_OWNER_EXCEPTION_SCOPE');
    const prior = sceneAttempts.filter(a => a.candidateNumber <= DEFAULT_LIMIT);
    if (ledger.status !== 'PASS_CANDIDATE_LEDGER' || consumed !== DEFAULT_LIMIT ||
        prior.length !== DEFAULT_LIMIT || !prior.every(attempt => verifiedNativeTrace(projectDir, attempt)))
      return denied('BLOCKED_OWNER_EXCEPTION_HISTORY_UNVERIFIED', { consumed });
    return { status: 'READY_TO_GENERATE', authorized: true, maxCandidates: 3,
      consumed, exceptionUsed: true, exceptionSha256: sha256 };
  } catch (error) {
    return denied('BLOCKED_OWNER_EXCEPTION_INVALID', { reason: error.message });
  }
}


/**
 * Record one real host-observed native generation invocation. A failure to
 * save the output still consumes the ordinal. The record is append-only in
 * meaning: earlier entries cannot be deleted or replaced by this API.
 *
 * The native host is responsible for providing a genuine trace. Checking its
 * bytes and hash is provenance verification, NOT proof of provider identity.
 */
export function recordArtCandidateAttempt(projectDir, {
  ledgerPath, attempt, expectedLedgerSha256 = null,
  ownerExceptionPath = null, ownerExceptionSha256 = null,
  ownerApprovalObserved = false
} = {}) {
  const denied = (status, reason) => ({ status, recorded: false, ...(reason ? { reason } : {}) });
  if (!safe(ledgerPath) || !attempt || !traceReferenceAllowed(attempt.tracePath) ||
      !HASH.test(attempt.traceSha256 ?? '') || !ATTEMPT_STATES.has(attempt.status) ||
      !HEAD.test(attempt.sourceHead ?? '') || !attempt.attemptId || !attempt.producerTrace)
    return denied('BLOCKED_ATTEMPT_RECORD_INVALID');
  let root, file;
  try {
    root = fs.realpathSync(projectDir);
    file = path.resolve(root, ledgerPath);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(path.dirname(file)) ||
        !fs.realpathSync(path.dirname(file)).startsWith(root + path.sep))
      return denied('BLOCKED_LEDGER_PATH');
    if (!verifiedNativeTrace(projectDir, attempt)) return denied('BLOCKED_NATIVE_TRACE_MISSING');
  } catch (error) {
    return denied('BLOCKED_NATIVE_TRACE_INVALID', error.message);
  }
  const lock = file + '.lock';
  let owned = false;
  try {
    fs.writeFileSync(lock, String(process.pid), { flag:'wx', mode:0o600 });
    owned = true;
    const current = inspectArtCandidateLedger(projectDir, ledgerPath);
    if (current.status === 'BLOCKED_CANDIDATE_LEDGER')
      return denied('BLOCKED_CANDIDATE_LEDGER', current.reason);
    if ((current.status === 'NO_LEDGER' && expectedLedgerSha256 !== null) ||
        (current.status === 'PASS_CANDIDATE_LEDGER' &&
          (!HASH.test(expectedLedgerSha256 ?? '') || current.sha256 !== expectedLedgerSha256.toLowerCase())))
      return denied('BLOCKED_LEDGER_CONCURRENT_CHANGE');
    const authorization = authorizeArtCandidate(projectDir, {
      sceneId: attempt.sceneId, variant: attempt.variant,
      candidateNumber: attempt.candidateNumber, sourceHead: attempt.sourceHead,
      ownerExceptionPath, ownerExceptionSha256, ownerApprovalObserved, ledgerPath
    });
    if (!authorization.authorized) return denied(authorization.status);
    if (current.attempts.some(a => a.attemptId === attempt.attemptId))
      return denied('BLOCKED_DUPLICATE_ATTEMPT');
    const next = {
      schemaVersion:1, kind:'ART_CANDIDATE_LEDGER_V1',
      attempts:[...current.attempts, attempt]
    };
    const temp = file + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
    try {
      fs.writeFileSync(temp, JSON.stringify(next,null,2) + '\n', {flag:'wx',mode:0o600});
      fs.renameSync(temp,file);
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
    return { status:'PASS_CANDIDATE_ATTEMPT_RECORDED', recorded:true,
      sceneId:attempt.sceneId, candidateNumber:attempt.candidateNumber, exceptionUsed:authorization.exceptionUsed,
      ledgerSha256:hash(fs.readFileSync(file)) };
  } catch (error) {
    return denied('BLOCKED_LEDGER_WRITE', error.message);
  } finally {
    if (owned) try { fs.unlinkSync(lock); } catch {}
  }
}
