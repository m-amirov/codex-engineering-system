import crypto from 'node:crypto';

export const RECOVERY_CATEGORIES = Object.freeze({
  AUTO_RECOVERABLE: 'AUTO_RECOVERABLE',
  WAIT_EXTERNAL: 'WAIT_EXTERNAL',
  NEEDS_USER_ACTION: 'NEEDS_USER_ACTION',
  HARD_BLOCKED: 'HARD_BLOCKED'
});

export const DEFAULT_RETRY_POLICY = Object.freeze({
  maxAttempts: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 300_000,
  historyLimit: 32
});

const AUTO_CODES = new Set([
  'TIMEOUT', 'NETWORK_TIMEOUT', 'NETWORK_UNAVAILABLE', 'CONNECTION_RESET',
  'ECONNRESET', 'ETIMEDOUT', 'WEB_TRANSPORT_UNAVAILABLE',
  'ATTACHMENT_TRANSPORT', 'ATTACHMENT_TRANSFER_FAILED', 'RATE_LIMITED',
  'USAGE_LIMIT_REACHED', 'TEMPORARY_NETWORK_FAILURE'
]);

const WAIT_CODES = new Set([
  'WEB_REQUIRED_NOT_READY', 'WEB_HIGH_REVIEW_UNAVAILABLE', 'WEB_UNAVAILABLE',
  'WEB_NOT_ACCEPTING_TURNS', 'CAPABILITY_UNAVAILABLE', 'CAPABILITY_NOT_READY',
  'DEV_UNAVAILABLE', 'MODEL_ENTITLEMENT_UNAVAILABLE',
  'BLOCKED_MODEL_ENTITLEMENT', 'SERVICE_UNAVAILABLE'
]);

const USER_CODES = new Set([
  'CAPABILITY_CHALLENGE_REQUIRED', 'AUTHORIZATION_EXPIRED',
  'AUTHORIZATION_REQUIRED', 'PERMISSION_REQUIRED', 'SCOPE_NOT_AUTHORIZED',
  'NEEDS_USER_ACTION', 'BLOCKED_RECOVERY_DECISION'
]);

const HARD_CODES = new Set([
  'INTEGRITY_MISMATCH', 'BLOCKED_INTEGRITY', 'SOURCE_BOUND_MISMATCH',
  'SOURCE_HEAD_CHANGED', 'CHECKPOINT_CORRUPTED', 'MISSING_EVIDENCE',
  'EVIDENCE_MISSING', 'PROVENANCE_MISMATCH', 'SHA256_MISMATCH',
  'ARTISTIC_REWORK', 'REWORK', 'P0', 'P1', 'INVALID_SCOPE',
  'INSUFFICIENT_RIGHTS', 'UNKNOWN_EXTERNAL_RESULT'
]);

function asCode(value) {
  return String(value ?? 'UNKNOWN').trim().toUpperCase().replace(/[ -]+/g, '_');
}

function asFiniteInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function recoveryEventId(event = {}) {
  const identity = {
    operationId: event.operationId ?? null,
    attemptId: event.attemptId ?? null,
    reasonCode: asCode(event.reasonCode ?? event.code),
    stage: event.stage ?? null,
    sourceHead: event.sourceHead ?? null,
    retryAfter: event.retryAfter ?? null,
    detail: event.detail ?? event.reason ?? null
  };
  return crypto.createHash('sha256').update(stableJson(identity)).digest('hex');
}

export function classifyContinuationError(event = {}) {
  const reasonCode = asCode(event.reasonCode ?? event.code);
  const explicitCategory = asCode(event.category);
  const integrity = event.integrity === false || event.sourceBound === false || event.evidenceComplete === false;
  const authorizationBlocked = ['EXPIRED', 'MISSING', 'REVOKED', 'DENIED'].includes(asCode(event.authorization));
  let category = RECOVERY_CATEGORIES.HARD_BLOCKED;
  if (integrity || HARD_CODES.has(reasonCode)) category = RECOVERY_CATEGORIES.HARD_BLOCKED;
  else if (authorizationBlocked || USER_CODES.has(reasonCode) || explicitCategory === RECOVERY_CATEGORIES.NEEDS_USER_ACTION) {
    category = RECOVERY_CATEGORIES.NEEDS_USER_ACTION;
  } else if (AUTO_CODES.has(reasonCode) || explicitCategory === RECOVERY_CATEGORIES.AUTO_RECOVERABLE) {
    category = RECOVERY_CATEGORIES.AUTO_RECOVERABLE;
  } else if (WAIT_CODES.has(reasonCode) || explicitCategory === RECOVERY_CATEGORIES.WAIT_EXTERNAL) {
    category = RECOVERY_CATEGORIES.WAIT_EXTERNAL;
  } else if (event.external === true || event.temporary === true) {
    category = RECOVERY_CATEGORIES.WAIT_EXTERNAL;
  }

  const nextAction = category === RECOVERY_CATEGORIES.AUTO_RECOVERABLE
    ? 'RETRY_SAME_OPERATION'
    : category === RECOVERY_CATEGORIES.WAIT_EXTERNAL
      ? 'WAIT_FOR_EXTERNAL_RECOVERY'
      : category === RECOVERY_CATEGORIES.NEEDS_USER_ACTION
        ? 'REQUEST_USER_ACTION'
        : 'STOP_AND_REPAIR';
  return {
    schemaVersion: 1,
    category,
    reasonCode,
    nextAction,
    retryAllowed: category === RECOVERY_CATEGORIES.AUTO_RECOVERABLE,
    consumesArtAttempt: false,
    consumesRepairCycle: false,
    detail: event.detail ?? event.reason ?? null
  };
}

export function createRecoveryState({ sourceHead = null, retryPolicy = {} } = {}) {
  const policy = {
    ...DEFAULT_RETRY_POLICY,
    ...retryPolicy,
    maxAttempts: asFiniteInteger(retryPolicy.maxAttempts, DEFAULT_RETRY_POLICY.maxAttempts, { min: 1, max: 20 }),
    baseDelayMs: asFiniteInteger(retryPolicy.baseDelayMs, DEFAULT_RETRY_POLICY.baseDelayMs, { min: 0, max: DEFAULT_RETRY_POLICY.maxDelayMs }),
    maxDelayMs: asFiniteInteger(retryPolicy.maxDelayMs, DEFAULT_RETRY_POLICY.maxDelayMs, { min: 0, max: 3_600_000 }),
    historyLimit: asFiniteInteger(retryPolicy.historyLimit, DEFAULT_RETRY_POLICY.historyLimit, { min: 1, max: 128 })
  };
  return {
    schemaVersion: 1,
    sourceHead: typeof sourceHead === 'string' ? sourceHead : null,
    retryPolicy: policy,
    retryCount: 0,
    nextRetryAt: null,
    lastEvent: null,
    history: [],
    processedEventIds: []
  };
}

export function validateRecoveryState(value) {
  const issues = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, issues: ['recovery state must be an object'] };
  if (value.schemaVersion !== 1) issues.push('unsupported recovery state schema');
  if (value.sourceHead !== null && (typeof value.sourceHead !== 'string' || !/^[a-f0-9]{40,64}$/i.test(value.sourceHead))) issues.push('recovery sourceHead is invalid');
  if (!Number.isInteger(value.retryCount) || value.retryCount < 0) issues.push('recovery retryCount is invalid');
  if (!value.retryPolicy || typeof value.retryPolicy !== 'object') issues.push('recovery retryPolicy is missing');
  else {
    for (const key of ['maxAttempts', 'baseDelayMs', 'maxDelayMs', 'historyLimit']) {
      if (!Number.isInteger(value.retryPolicy[key]) || value.retryPolicy[key] < 0) issues.push(`recovery retryPolicy.${key} is invalid`);
    }
    if (value.retryPolicy.maxAttempts < 1) issues.push('recovery retryPolicy.maxAttempts must be positive');
    if (value.retryPolicy.historyLimit < 1) issues.push('recovery retryPolicy.historyLimit must be positive');
  }
  if (!Array.isArray(value.history) || !Array.isArray(value.processedEventIds)) issues.push('recovery history is invalid');
  return { ok: issues.length === 0, issues };
}

function retryDelayMs(state, event, attempt) {
  const policy = { ...DEFAULT_RETRY_POLICY, ...(state.retryPolicy ?? {}) };
  const retryAfter = event.retryAfterMs != null
    ? Number(event.retryAfterMs)
    : event.retryAfterSeconds != null
      ? Number(event.retryAfterSeconds) * 1_000
      : Number(event.retryAfter);
  const hinted = Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : 0;
  const exponential = policy.baseDelayMs * (2 ** Math.max(0, attempt - 1));
  // maxDelayMs caps our own backoff, never the server's minimum Retry-After.
  return Math.max(hinted, Math.min(policy.maxDelayMs, exponential));
}

export function applyRecoveryEvent(state, event = {}, { now = Date.now() } = {}) {
  const validation = validateRecoveryState(state);
  if (!validation.ok) return { ok: false, status: RECOVERY_CATEGORIES.HARD_BLOCKED, reasonCode: 'CHECKPOINT_CORRUPTED', issues: validation.issues };
  const next = structuredClone(state);
  let classification = classifyContinuationError(event);
  const eventId = String(event.eventId ?? recoveryEventId(event));
  if (!/^[a-f0-9-]{8,128}$/i.test(eventId)) return { ok: false, status: RECOVERY_CATEGORIES.HARD_BLOCKED, reasonCode: 'INVALID_RECOVERY_EVENT_ID' };
  if (event.sourceHead && next.sourceHead && event.sourceHead !== next.sourceHead) {
    return { ok: false, status: RECOVERY_CATEGORIES.HARD_BLOCKED, reasonCode: 'SOURCE_HEAD_CHANGED', eventId,
      detail: 'Recovery event is bound to a different source HEAD' };
  }
  // The logical operation can fail repeatedly with identical payloads. A
  // stable, attempt-specific identity is required to distinguish a new
  // failure from a retransmission of the same failure receipt.
  const hasAttemptId = typeof event.attemptId === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(event.attemptId);
  if (classification.category === RECOVERY_CATEGORIES.AUTO_RECOVERABLE && !hasAttemptId) {
    classification = {
      ...classification,
      category: RECOVERY_CATEGORIES.NEEDS_USER_ACTION,
      reasonCode: 'RECOVERY_ATTEMPT_ID_REQUIRED',
      nextAction: 'REQUEST_USER_ACTION',
      retryAllowed: false,
      detail: 'Retryable events require an attemptId unique to each actual execution attempt'
    };
  }
  const existingAttempt = hasAttemptId ? next.history.find(record =>
    record.attemptId === event.attemptId && record.operationId === (event.operationId ?? null)) : null;
  if (existingAttempt && existingAttempt.eventId !== eventId) {
    return { ok: false, status: RECOVERY_CATEGORIES.HARD_BLOCKED,
      reasonCode: 'RECOVERY_ATTEMPT_ID_CONFLICT', eventId };
  }
  if (next.processedEventIds.includes(eventId)) {
    const existingEvent = next.history.find(record => record.eventId === eventId);
    if (!existingEvent || existingEvent.attemptId !== (event.attemptId ?? null) ||
        existingEvent.operationId !== (event.operationId ?? null)) {
      return { ok: false, status: RECOVERY_CATEGORIES.HARD_BLOCKED,
        reasonCode: 'RECOVERY_EVENT_ID_CONFLICT', eventId };
    }
    return { ok: true, alreadyRecorded: true, state: next, eventId,
      ...recoveryDecision(next, { now }) };
  }
  const recordedAt = new Date(now).toISOString();
  const record = {
    eventId,
    recordedAt,
    reasonCode: classification.reasonCode,
    category: classification.category,
    nextAction: classification.nextAction,
    stage: event.stage ?? null,
    operationId: event.operationId ?? null,
    attemptId: hasAttemptId ? event.attemptId : null,
    sourceHead: event.sourceHead ?? next.sourceHead ?? null,
    detail: classification.detail
  };
  next.processedEventIds = [...next.processedEventIds, eventId].slice(-next.retryPolicy.historyLimit);
  next.history = [...next.history, record].slice(-next.retryPolicy.historyLimit);
  next.lastEvent = record;
  if (classification.category === RECOVERY_CATEGORIES.AUTO_RECOVERABLE) {
    const attempt = next.retryCount + 1;
    next.retryCount = attempt;
    if (attempt > next.retryPolicy.maxAttempts) {
      next.lastEvent = { ...record, category: RECOVERY_CATEGORIES.NEEDS_USER_ACTION,
        reasonCode: 'RETRY_BUDGET_EXHAUSTED', nextAction: 'REQUEST_USER_ACTION' };
      next.nextRetryAt = null;
    } else {
      next.nextRetryAt = new Date(now + retryDelayMs(next, event, attempt)).toISOString();
    }
  } else {
    next.nextRetryAt = null;
  }
  return { ok: true, alreadyRecorded: false, state: next, eventId,
    ...recoveryDecision(next, { now }) };
}

export function recoveryDecision(state, { now = Date.now(), externalReady = false } = {}) {
  const validation = validateRecoveryState(state);
  if (!validation.ok) return { status: RECOVERY_CATEGORIES.HARD_BLOCKED, category: RECOVERY_CATEGORIES.HARD_BLOCKED,
    reasonCode: 'CHECKPOINT_CORRUPTED', nextAction: 'STOP_AND_REPAIR', issues: validation.issues };
  const last = state.lastEvent;
  if (!last) return { status: 'READY', category: 'READY', reasonCode: null, nextAction: null, retryCount: state.retryCount, nextRetryAt: null };
  if (last.category === RECOVERY_CATEGORIES.HARD_BLOCKED) return { status: RECOVERY_CATEGORIES.HARD_BLOCKED,
    category: last.category, reasonCode: last.reasonCode, nextAction: 'STOP_AND_REPAIR', detail: last.detail,
    retryCount: state.retryCount, nextRetryAt: null };
  if (last.category === RECOVERY_CATEGORIES.NEEDS_USER_ACTION || last.reasonCode === 'RETRY_BUDGET_EXHAUSTED')
    return { status: RECOVERY_CATEGORIES.NEEDS_USER_ACTION, category: RECOVERY_CATEGORIES.NEEDS_USER_ACTION,
      reasonCode: last.reasonCode, nextAction: 'REQUEST_USER_ACTION', detail: last.detail,
      retryCount: state.retryCount, nextRetryAt: null };
  if (last.category === RECOVERY_CATEGORIES.AUTO_RECOVERABLE && !last.attemptId)
    return { status: RECOVERY_CATEGORIES.NEEDS_USER_ACTION, category: RECOVERY_CATEGORIES.NEEDS_USER_ACTION,
      reasonCode: 'RECOVERY_ATTEMPT_ID_REQUIRED', nextAction: 'REQUEST_USER_ACTION',
      retryCount: state.retryCount, nextRetryAt: null };
  if (last.category === RECOVERY_CATEGORIES.WAIT_EXTERNAL && externalReady === true)
    return { status: RECOVERY_CATEGORIES.AUTO_RECOVERABLE, category: RECOVERY_CATEGORIES.AUTO_RECOVERABLE,
      reasonCode: 'EXTERNAL_RECOVERY_OBSERVED', nextAction: 'RETRY_SAME_OPERATION', detail: last.detail,
      retryCount: state.retryCount, nextRetryAt: null, externalRecoveryObserved: true };
  if (last.category === RECOVERY_CATEGORIES.WAIT_EXTERNAL)
    return { status: RECOVERY_CATEGORIES.WAIT_EXTERNAL, category: last.category, reasonCode: last.reasonCode,
      nextAction: 'WAIT_FOR_EXTERNAL_RECOVERY', detail: last.detail, retryCount: state.retryCount, nextRetryAt: null };
  const due = !state.nextRetryAt || Date.parse(state.nextRetryAt) <= now;
  if (!due) return { status: RECOVERY_CATEGORIES.WAIT_EXTERNAL, category: RECOVERY_CATEGORIES.WAIT_EXTERNAL,
    reasonCode: 'RETRY_BACKOFF_ACTIVE', nextAction: 'WAIT_FOR_RETRY_WINDOW', detail: last.detail,
    retryCount: state.retryCount, nextRetryAt: state.nextRetryAt };
  if (state.retryCount > state.retryPolicy.maxAttempts)
    return { status: RECOVERY_CATEGORIES.NEEDS_USER_ACTION, category: RECOVERY_CATEGORIES.NEEDS_USER_ACTION,
      reasonCode: 'RETRY_BUDGET_EXHAUSTED', nextAction: 'REQUEST_USER_ACTION', retryCount: state.retryCount, nextRetryAt: null };
  return { status: RECOVERY_CATEGORIES.AUTO_RECOVERABLE, category: RECOVERY_CATEGORIES.AUTO_RECOVERABLE,
    reasonCode: last.reasonCode, nextAction: 'RETRY_SAME_OPERATION', detail: last.detail,
    retryCount: state.retryCount, nextRetryAt: state.nextRetryAt };
}
