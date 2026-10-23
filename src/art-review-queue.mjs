import { NARRATIVE_ART_ACCEPTANCE_V2, assessNarrativeArtFindings } from './narrative-art-acceptance.mjs';

const HEAD = /^[a-f0-9]{40}$/i;
const SHA = /^[a-f0-9]{64}$/i;
const OUTCOMES = new Set(['PASS', 'REWORK', 'BLOCKED']);

function hash(value) { return typeof value === 'string' && SHA.test(value); }

/**
 * Read-only coverage planner. It checks recorded metadata, NOT authenticity of
 * the remote Web reviewer or uploaded pixels. Release acceptance remains the
 * responsibility of the existing independent Web/art evidence gate.
 */
export function summarizeArtReviewQueue(ledger, receipts, { limit = 6 } = {}) {
  if (ledger?.schemaVersion !== 1 || !HEAD.test(ledger?.sourceHead ?? '') || !Array.isArray(ledger?.items))
    throw new Error('invalid coverage ledger: expected schemaVersion 1, exact sourceHead and items[]');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
    throw new Error('limit must be an integer between 1 and 1000');
  if (!Array.isArray(receipts)) throw new Error('receipts must be an array');
  const v2 = ledger.acceptanceProfile === NARRATIVE_ART_ACCEPTANCE_V2;
  if (ledger.acceptanceProfile && !v2) throw new Error('unknown art acceptance profile');

  const seen = new Set();
  const items = new Map();
  for (const item of ledger.items) {
    if (typeof item?.id !== 'string' || !item.id || seen.has(item.id) ||
        typeof item.sceneId !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,120}$/.test(item.sceneId) ||
        typeof item.cue !== 'string' || !item.cue ||
        typeof item.viewport !== 'string' || !item.viewport ||
        !hash(item.screenshotSha256) || !hash(item.productionAssetSha256))
      throw new Error('invalid or duplicated coverage item: ' + String(item?.id));
    seen.add(item.id);
    items.set(item.id, { ...item, status: 'NOT_REVIEWED' });
  }

  const rejected = [];
  let matchedRecords = 0;
  const history = new Map();
  for (const [index, record] of receipts.entries()) {
    const target = items.get(record?.itemId);
    if (!target) { rejected.push({ index, reason: 'UNKNOWN_ITEM' }); continue; }
    if (record.sourceHead !== ledger.sourceHead || record.screenshotSha256 !== target.screenshotSha256 ||
        record.productionAssetSha256 !== target.productionAssetSha256) {
      rejected.push({ index, itemId: record.itemId, reason: 'STALE_SOURCE_OR_PIXELS' });
      continue;
    }
    if (record.actualPixelsReceived !== true || !OUTCOMES.has(record.status) ||
        typeof record.observation !== 'string' || record.observation.trim().length < 20) {
      rejected.push({ index, itemId: record.itemId, reason: 'INVALID_VISUAL_RECEIPT' });
      continue;
    }

    if (v2) {
      if (record.acceptanceProfile !== NARRATIVE_ART_ACCEPTANCE_V2) {
        rejected.push({ index, itemId: record.itemId, reason: 'V2_PROFILE_MISMATCH' });
        continue;
      }
      // Reviewer MUST make a fresh, explicit PASS/REWORK decision.
      // This planner must not invent PASS from cosmetic findings.
      if (record.status !== 'BLOCKED') {
        const evaluation = assessNarrativeArtFindings(record.findings);
        if (!evaluation.ok) {
          rejected.push({ index, itemId: record.itemId, reason: 'V2_INVALID_FINDINGS', details: evaluation.errors });
          continue;
        }
        if ((record.status === 'REWORK' && evaluation.blockingFindings.length === 0) ||
            (record.status === 'PASS' && evaluation.blockingFindings.length !== 0)) {
          rejected.push({ index, itemId: record.itemId, reason: 'V2_STATUS_FINDINGS_MISMATCH' });
          continue;
        }
      }
    }

    const prior = history.get(record.itemId);
    if (record.status === 'PASS' && prior?.status === 'REWORK' &&
        (!Array.isArray(record.resolvedFindings) || record.resolvedFindings.length === 0)) {
      rejected.push({ index, itemId: record.itemId, reason: 'REWORK_NOT_RESOLVED' });
      continue;
    }

    matchedRecords++;
    history.set(record.itemId, { status: record.status, index });
    target.status = record.status;
  }

  const counts = { PASS: 0, REWORK: 0, BLOCKED: 0, NOT_REVIEWED: 0 };
  const outstanding = [];
  for (const item of items.values()) {
    counts[item.status]++;
    if (item.status !== 'PASS')
      outstanding.push({ id:item.id, sceneId:item.sceneId, cue:item.cue, viewport:item.viewport, status:item.status });
  }
  const ready = outstanding.filter(item => item.status === 'NOT_REVIEWED' || item.status === 'BLOCKED');
  const repair = outstanding.filter(item => item.status === 'REWORK');
  return {
    schemaVersion: 1,
    sourceHead: ledger.sourceHead,
    ...(v2 ? { acceptanceProfile: NARRATIVE_ART_ACCEPTANCE_V2 } : {}),
    totalUniqueFrames: items.size,
    receiptCount: receipts.length,
    matchedRecords, counts, rejected,
    nextBatch: ready.slice(0, limit),
    requiresRepair: repair,
    complete: outstanding.length === 0 && rejected.length === 0,
    verdict: outstanding.length === 0 && rejected.length === 0 ? 'READY_FOR_INDEPENDENT_ACCEPTANCE_GATE' : 'COVERAGE_INCOMPLETE',
    warning: 'This planner does not attest provider identity, real attachment delivery, evidence bytes, or artistic acceptance.'
  };
}
