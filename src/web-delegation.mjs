/**
 * CEOS Web High review orchestration. Web reviewers reason over native-collected
 * evidence; this module does not claim to invoke agents or inspect screenshots.
 */
export const WEB_REVIEW_PHASES = Object.freeze({
  'audit-repair-loop': ['analysis', 'midpoint', 'acceptance'],
  'production-art': ['analysis', 'midpoint', 'acceptance'],
  'engineering': ['analysis', 'midpoint', 'acceptance'],
  'visual-qa': ['analysis', 'midpoint', 'acceptance'],
  'narrative': ['analysis', 'midpoint', 'acceptance'],
  'release': ['analysis', 'midpoint', 'acceptance']
});
export const WEB_REVIEW_AGENTS = Object.freeze({
  'audit-repair-loop': ['ceos_bulk_checker_web', 'ceos_reasoner_web'],
  'production-art': ['ceos_art_director_web', 'ceos_reasoner_web'],
  'engineering': ['ceos_reasoner_web', 'ceos_bulk_checker_web'],
  'visual-qa': ['ceos_art_director_web', 'ceos_reasoner_web'],
  'narrative': ['ceos_reasoner_web', 'ceos_bulk_checker_web'],
  'release': ['ceos_reasoner_web', 'ceos_bulk_checker_web']
});

export const WEB_REVIEW_ASSURANCE = Object.freeze(['strict','visual-content']);
const isVisualContent = (pipeline,visual,assurance) => assurance === 'visual-content' &&
  visual === true && ['production-art','visual-qa'].includes(pipeline);
const assuranceValid = (pipeline,visual,assurance) => WEB_REVIEW_ASSURANCE.includes(assurance) &&
  (assurance === 'strict' || isVisualContent(pipeline,visual,assurance));
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const uniqueStrings = value => Array.isArray(value) && value.length > 0
  && value.every(nonempty) && new Set(value).size === value.length;

export function webReviewPlan(pipeline, { complexity = 'high', visual = false, totalItems = null, assurance = 'strict' } = {}) {
  if (!WEB_REVIEW_PHASES[pipeline]) throw new Error(`Unsupported Web review pipeline: ${pipeline}`);
  if (!assuranceValid(pipeline,visual,assurance)) throw new Error('visual-content assurance requires an explicitly visual production-art or visual-qa pipeline');
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
    assurance,
    phases,
    shards,
    sourceOfTruth: 'native-collected-current-HEAD-evidence',
    execution: 'parent-hosted-subagent-delegation-not-automatic-CLI-invocation'
  };
}

export function validateWebReview(review, { pipeline, phase, currentHead, visual = false, assurance = 'strict' } = {}) {
  const errors = [];
  if (!review || typeof review !== 'object' || Array.isArray(review)) return ['Web review record must be an object'];
  const contentMode = isVisualContent(pipeline,visual,assurance);
  if (!assuranceValid(pipeline,visual,assurance)) errors.push('Invalid assurance for this pipeline or visual scope');
  if (!WEB_REVIEW_PHASES[pipeline]?.includes(phase)) errors.push('Unsupported review phase');
  if (review.phase !== phase) errors.push('Review phase mismatch');
  if (!WEB_REVIEW_AGENTS[pipeline]?.includes(review.agent)) errors.push('Unrecognized Web reviewer for pipeline');
  if (!contentMode) {
    if (!nonempty(review.reviewTraceId)) errors.push('Missing Web reviewer trace id');
    if (!nonempty(review.taskId)) errors.push('Missing delegated task id');
  } else {
    // Content-level review cannot authenticate remote delivery; require specific pixel observations.
    const frames=review.visualEvidence;
    if (!Array.isArray(frames) || !review.evidenceRefs?.length || frames.length !== review.evidenceRefs.length
        || new Set(frames.map(f=>f?.ref)).size !== frames.length
        || frames.some(f=>!review.evidenceRefs.includes(f?.ref) || !nonempty(f?.path)
          || !/^[a-f0-9]{64}$/i.test(f?.sha256??'')
          || !nonempty(f?.observation) || f.observation.trim().length<20)) {
      errors.push('Visual-content assurance requires unique per-image ref, path, SHA-256 and substantive pixel observation');
    }
  }
  if (!nonempty(review.sourceHead) || (currentHead && review.sourceHead !== currentHead)) errors.push('Stale or missing source HEAD');
  if (!(phase === 'analysis' ? ['PASS', 'FINDINGS'].includes(review.status) : review.status === 'PASS')) errors.push('Review status is not acceptable for this phase');
  if (!uniqueStrings(review.reviewedItems)) errors.push('Missing reviewed item identities');
  if (!uniqueStrings(review.evidenceRefs)) errors.push('Missing supplied evidence references');
  if (!uniqueStrings(review.receivedEvidenceRefs)
      || !review.evidenceRefs.every(ref => review.receivedEvidenceRefs.includes(ref))) errors.push('Reviewer did not confirm receipt of the complete evidence bundle');
  if (!nonempty(review.decision)) errors.push('Missing substantive reviewer decision');
  if (!Array.isArray(review.findings)) errors.push('Missing reviewer findings list');
  if (!Array.isArray(review.unresolved)) errors.push('Missing unresolved observations list');
  else if (phase !== 'analysis' && review.unresolved.length) errors.push('Review contains unresolved observations');
  if (review.status === 'FINDINGS' && !review.findings?.length) errors.push('FINDINGS requires substantive findings');
  if (visual && review.actualPixelsReceived !== true) errors.push('Visual review requires explicit actual-pixel receipt');
  return errors;
}

export function verifyWebDelegation(plan, reviews, { pipeline, currentHead, defectCount = null } = {}) {
  const errors = [];
  const assurance = plan?.assurance ?? 'strict';
  const contentMode = isVisualContent(pipeline,plan?.visual,assurance);
  const required = (plan?.phases ?? []).filter(phase => phase !== 'midpoint' || defectCount === null || defectCount > 0 || pipeline === 'production-art');
  for (const phase of required) {
    const records = (reviews ?? []).filter(review => review.phase === phase);
    if (!records.length) {
      errors.push(`WEB_REVIEW_NOT_VERIFIED: missing ${phase} review`);
      continue;
    }
    if (records.length > 1 && new Set(records.map(review => contentMode ? review.evidenceArtifact : review.taskId)).size !== records.length)
      errors.push(`Duplicate delegated task identity at ${phase}`);
    const valid = records.filter(review => validateWebReview(review, {
      pipeline, phase, currentHead, visual: plan.visual, assurance
    }).length === 0);
    if (!valid.length) errors.push(`WEB_REVIEW_NOT_VERIFIED: ${phase} evidence/receipt/provenance invalid`);
    // Analysis may discover defects; they must be explicitly resolved by the
    // independent acceptance reviewer, not silently reclassified by the parent.
    if (phase !== 'analysis' && records.some(review => Array.isArray(review.unresolved) && review.unresolved.length))
      errors.push(`WEB_REVIEW_NOT_VERIFIED: outstanding ${phase} reviewer findings require fresh independent re-review`);
  }
  const ids = (reviews ?? []).filter(review => required.includes(review.phase) && nonempty(review.reviewTraceId)).map(review => review.reviewTraceId);
  if (new Set(ids).size !== ids.length) errors.push('Web reviewer trace ids must be unique across reviews');
  return { ok: errors.length === 0, code: errors.length ? 'WEB_REVIEW_NOT_VERIFIED' : 'PASS', required, errors };
}
