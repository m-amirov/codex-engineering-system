/** Blocked external dependencies must pause only dependent work.
 * Integrity failures, semantic REWORK and safety decisions never auto-recover.
 */
import { classifyContinuationError, RECOVERY_CATEGORIES } from './continuation-recovery.mjs';

const EXTERNAL = new Set([
  'WEB_REQUIRED_NOT_READY', 'WEB_HIGH_REVIEW_UNAVAILABLE', 'WEB_UNAVAILABLE',
  'WEB_TRANSPORT_UNAVAILABLE', 'ATTACHMENT_TRANSPORT', 'RATE_LIMITED',
  'CAPABILITY_UNAVAILABLE', 'CAPABILITY_NOT_READY', 'USAGE_LIMIT_REACHED',
  'MODEL_ENTITLEMENT_UNAVAILABLE', 'BLOCKED_MODEL_ENTITLEMENT',
  'DEV_UNAVAILABLE', 'NETWORK_UNAVAILABLE'
]);
const SAFE_NEXT = new Set(['DOCUMENT_BRIEF','RUN_TESTS','REPAIR_CODE','INSPECT_EVIDENCE','PREPARE_NEXT_SCENE']);

export function classifyTemporaryBlocker(reasonCode) {
  const classification = classifyContinuationError({ reasonCode,
    external: EXTERNAL.has(reasonCode), temporary: EXTERNAL.has(reasonCode) });
  const external = EXTERNAL.has(reasonCode);
  if (external) return { status: 'PAUSED_EXTERNAL', category: classification.category,
    reasonCode: classification.reasonCode, nextAction: classification.nextAction,
    retryAllowed: classification.category !== RECOVERY_CATEGORIES.HARD_BLOCKED,
    requiresFreshCapability: true, consumesArtAttempt: false, canContinueIndependentWork: true };
  return { status: 'HARD_BLOCKED', category: RECOVERY_CATEGORIES.HARD_BLOCKED,
    reasonCode: classification.reasonCode, nextAction: classification.nextAction,
    retryAllowed: false, requiresFreshCapability: false, consumesArtAttempt: false,
    canContinueIndependentWork: false };
}

export function planWorkAroundTemporaryBlocker(reasonCode, nextAction) {
  const issue = classifyTemporaryBlocker(reasonCode);
  if (!issue.canContinueIndependentWork) return { ...issue, executable: false };
  if (!SAFE_NEXT.has(nextAction)) return { ...issue, executable: false,
    reason: 'DEPENDENCY_OR_SCOPE_NOT_PROVEN_INDEPENDENT' };
  return { ...issue, executable: true, nextAction,
    requirement: 'Preserve blocked original run; use separately authorized in-scope task, never forge acceptance' };
}
