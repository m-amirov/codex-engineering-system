/**
 * CEOS Web High review orchestration. Web reviewers reason over native-collected
 * evidence; this module does not claim to invoke agents or inspect screenshots.
 */
export const WEB_REVIEW_PHASES = Object.freeze({
  'audit-repair-loop': ['analysis', 'midpoint', 'acceptance'],
  'production-art': ['analysis', 'midpoint', 'acceptance']
});
export const WEB_REVIEW_AGENTS = Object.freeze({
  'audit-repair-loop': ['ceos_bulk_checker_web', 'ceos_reasoner_web'],
  'production-art': ['ceos_art_director_web', 'ceos_reasoner_web']
});

const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const uniqueStrings = value => Array.isArray(value) && value.length > 0
  && value.every(nonempty) && new Set(value).size === value.length;

export function webReviewPlan(pipeline, { complexity = 'high', visual = false, totalItems = null } = {}) {
  if (!WEB_REVIEW_PHASES[pipeline]) throw new Error(`Unsupported Web review pipeline: ${pipeline}`);
  if (!['low', 'medium', 'high', 'critical'].includes(complexity)) throw new Error('Invalid complexity');
  if (totalItems !== null && (!Number.isInteger(totalItems) || totalItems < 1)) throw new Error('totalItems must be a positive integer or null');
  // Large review sets get bounded sharding, not parallel attachment storms.
  const shards = totalItems !== null && totalItems > 40 ? Math.min(4, Math.ceil(totalItems / 40)) : 1;
  const phases = complexity === 'low' ? ['acceptance'] : WEB_REVIEW_PHASES[pipeline];
  return {
    schemaVersion: 1,
    pipeline,
    complexity,
    visual: Boolean(visual),
    phases,
    shards,
    sourceOfTruth: 'native-collected-current-HEAD-evidence',
    execution: 'parent-hosted-subagent-delegation-not-automatic-CLI-invocation'
  };
}

export function validateWebReview(review, { pipeline, phase, currentHead, visual = false } = {}) {
  const errors = [];
  if (!review || typeof review !== 'object' || Array.isArray(review)) return ['Web review record must be an object'];
  if (!WEB_REVIEW_PHASES[pipeline]?.includes(phase)) errors.push('Unsupported review phase');
  if (review.phase !== phase) errors.push('Review phase mismatch');
  if (!WEB_REVIEW_AGENTS[pipeline]?.includes(review.agent)) errors.push('Unrecognized Web reviewer for pipeline');
  if (!nonempty(review.reviewTraceId)) errors.push('Missing Web reviewer trace id');
  if (!nonempty(review.taskId)) errors.push('Missing delegated task id');
  if (!nonempty(review.sourceHead) || (currentHead && review.sourceHead !== currentHead)) errors.push('Stale or missing source HEAD');
  if (review.status !== 'PASS') errors.push('Review did not PASS');
  if (!uniqueStrings(review.reviewedItems)) errors.push('Missing reviewed item identities');
  if (!uniqueStrings(review.evidenceRefs)) errors.push('Missing supplied evidence references');
  if (!uniqueStrings(review.receivedEvidenceRefs)
      || !review.evidenceRefs.every(ref => review.receivedEvidenceRefs.includes(ref))) errors.push('Reviewer did not confirm receipt of the complete evidence bundle');
  if (!nonempty(review.decision)) errors.push('Missing substantive reviewer decision');
  if (!Array.isArray(review.findings)) errors.push('Missing reviewer findings list');
  if (!Array.isArray(review.unresolved) || review.unresolved.length) errors.push('Review contains unresolved observations');
  if (visual && review.actualPixelsReceived !== true) errors.push('Visual review requires explicit actual-pixel receipt');
  return errors;
}

export function verifyWebDelegation(plan, reviews, { pipeline, currentHead, defectCount = null } = {}) {
  const errors = [];
  const required = (plan?.phases ?? []).filter(phase => phase !== 'midpoint' || defectCount === null || defectCount > 0 || pipeline === 'production-art');
  for (const phase of required) {
    const records = (reviews ?? []).filter(review => review.phase === phase);
    if (!records.length) {
      errors.push(`WEB_REVIEW_NOT_VERIFIED: missing ${phase} review`);
      continue;
    }
    if (records.length > 1 && new Set(records.map(review => review.taskId)).size !== records.length)
      errors.push(`Duplicate delegated task identity at ${phase}`);
    const valid = records.filter(review => validateWebReview(review, {
      pipeline, phase, currentHead, visual: plan.visual
    }).length === 0);
    if (!valid.length) errors.push(`WEB_REVIEW_NOT_VERIFIED: ${phase} evidence/receipt/provenance invalid`);
    // An explicit reviewer request for more evidence cannot be erased by another PASS.
    if (records.some(review => Array.isArray(review.unresolved) && review.unresolved.length))
      errors.push(`WEB_REVIEW_NOT_VERIFIED: outstanding ${phase} reviewer findings require fresh independent re-review`);
  }
  const ids = (reviews ?? []).filter(review => required.includes(review.phase)).map(review => review.reviewTraceId);
  if (new Set(ids).size !== ids.length) errors.push('Web reviewer trace ids must be unique across reviews');
  return { ok: errors.length === 0, code: errors.length ? 'WEB_REVIEW_NOT_VERIFIED' : 'PASS', required, errors };
}
