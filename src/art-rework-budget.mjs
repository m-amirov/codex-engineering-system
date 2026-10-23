import { NARRATIVE_ART_ACCEPTANCE_V2, assessNarrativeArtFindings } from './narrative-art-acceptance.mjs';
import { authorizeArtCandidate } from './art-candidate-ledger.mjs';

const MATERIAL = new Set(['P0', 'P1', 'P2']);
const SEVERITIES = new Set([...MATERIAL, 'P3']);
const METHODS = new Set(['generation', 'mapping', 'staging', 'crop', 'css']);
const TRANSPORT = new Set(['ATTACHMENT_QUOTA_EXHAUSTED', 'ATTACHMENT_TRANSPORT', 'RATE_LIMITED', 'WEB_UNAVAILABLE']);
const text = x => typeof x === 'string' && x.trim().length > 0;

/**
 * Pre-action guard for project-local art repairs. Requires real host invocation.
 * The guard does not attest reviewer identity or truthfulness of the supplied data.
 */
export function authorizeArtRework(request) {
  const denied = (status, detail, stats = null) => ({ status, detail, stats, authorizesMutation: false });
  if (!request || !text(request.scopeKey) || !Array.isArray(request.findings) ||
      !Array.isArray(request.attempts) || !METHODS.has(request.proposedMethod))
    return denied('BLOCKED_INVALID_REWORK_REQUEST', 'Scoped findings, history and proposed method are required.');
  if (TRANSPORT.has(request.transportState))
    return denied('BLOCKED_WEB_TRANSPORT', 'Attachment/provider failure never authorizes art regeneration.');
  if (request.transportState && request.transportState !== 'READY')
    return denied('BLOCKED_INVALID_REWORK_REQUEST', 'Unknown transport state.');

  if (request.acceptanceProfile && request.acceptanceProfile !== NARRATIVE_ART_ACCEPTANCE_V2)
    return denied('BLOCKED_INVALID_REWORK_REQUEST', 'Unsupported art acceptance profile');
  const v2 = request.acceptanceProfile === NARRATIVE_ART_ACCEPTANCE_V2;
  const assessment = v2 ? assessNarrativeArtFindings(request.findings) : null;
  if (v2 && !assessment.ok)
    return denied('BLOCKED_UNVERIFIED_FINDINGS', assessment.errors.join('; '));
  const findings = request.findings.filter(f => f?.status === 'OPEN');
  if (findings.some(f => !text(f.id) || !SEVERITIES.has(f.severity)))
    return denied('BLOCKED_INVALID_REWORK_REQUEST', 'Every open finding needs identity and severity.');
  const actionable = v2 ? assessment.blockingFindings : findings.filter(f => MATERIAL.has(f.severity));
  if (!actionable.length)
    return denied('NO_MATERIAL_REWORK', v2
      ? 'V2: advisory P2/P3 feedback is not blocking and cannot authorize production repair.'
      : 'P3-only feedback does not authorize art generation or production repair.');
  if (actionable.some(f => !text(f.authoredCue) || !text(f.observation) || !text(f.playerImpact) ||
      !text(f.evidenceRef) || f.actualPixelsReceived !== true))
    return denied('BLOCKED_UNVERIFIED_FINDINGS', 'Material findings need authored cue, observed pixels and player impact.');
  if (new Set(actionable.map(f => f.id)).size !== actionable.length)
    return denied('BLOCKED_INVALID_REWORK_REQUEST', 'Material finding ids must be unique.');

  const scoped = request.attempts.filter(a => a?.scopeKey === request.scopeKey);
  if (scoped.some(a => !METHODS.has(a.method) || !text(a.strategyKey) ||
      !['FAIL', 'PASS', 'BLOCKED'].includes(a.outcome)))
    return denied('BLOCKED_INVALID_REWORK_REQUEST', 'Malformed repair history.');

  const generations = scoped.filter(a => a.method === 'generation' && a.outcome !== 'BLOCKED');
  const failed = scoped.filter(a => a.outcome === 'FAIL');
  const strategies = new Set(failed.map(a => a.method + ':' + a.strategyKey));
  const stats = { generationAttempts: generations.length,
    distinctFailedStrategies: strategies.size, priorAttempts: scoped.length };

  if (scoped.some(a => a.outcome === 'PASS'))
    return denied('BLOCKED_ALREADY_ACCEPTED', 'Previously accepted scope requires a new independent finding before another repair.', stats);
  if (strategies.size >= 3)
    return denied('ESCALATE_ART_REWORK', 'Three failed approaches require escalation, not a fourth automatic attempt.', stats);
  if (request.proposedMethod === 'generation' && generations.length >= 2) {
    if (!request.projectDir || !request.sceneId || !request.sourceHead ||
        !request.ownerExceptionPath || !request.candidateLedgerPath)
      return denied('ESCALATE_ART_GENERATION', 'Two generation candidates exhausted; automatic third candidate prohibited.', stats);
    const auth = authorizeArtCandidate(request.projectDir, {
      sceneId: request.sceneId, variant: request.variant ?? 'pair',
      candidateNumber: generations.length + 1, sourceHead: request.sourceHead,
      ownerExceptionPath: request.ownerExceptionPath,
      ownerExceptionSha256: request.ownerExceptionSha256,
      ownerApprovalObserved: request.ownerApprovalObserved === true,
      ledgerPath: request.candidateLedgerPath
    });
    if (!auth.authorized) return denied('ESCALATE_ART_GENERATION', 'Owner exception not verified: ' + auth.status, stats);
  }
  if (!text(request.proposedStrategyKey) || strategies.has(request.proposedMethod + ':' + request.proposedStrategyKey))
    return denied('BLOCKED_REPEAT_STRATEGY', 'Do not repeat the same failed strategy automatically.', stats);

  return {status:'READY_FOR_SCOPED_REPAIR',authorizesMutation:true,stats,
    findingIds:actionable.map(f => f.id),
    detail:'Local budget preflight only; does not authorize independent art PASS or publication.'};
}
