/**
 * Fail-closed, run-scoped preflight for historical lines that must occur in the
 * FIRST routed acceptance resolution receipt. Requirements are supplied by
 * authoritative project evidence, not manufactured by CEOS.
 */
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const distinctExactLines = lines => Array.isArray(lines) && lines.length > 0 && lines.length <= 32 &&
  lines.every(line => typeof line === 'string' && line.trim() && !/[\r\n]/.test(line)) &&
  new Set(lines).size === lines.length;

export function normalizeResolutionReceiptContract(input) {
  if (!plain(input) || input.schemaVersion !== 1 ||
      !distinctExactLines(input.requiredExactLines) ||
      typeof input.sourceEvidence !== 'string' || !input.sourceEvidence.trim())
    throw new Error('RESOLUTION_RECEIPT_CONTRACT_INVALID: require schemaVersion=1, distinct requiredExactLines and sourceEvidence');
  return { schemaVersion: 1, requiredExactLines: [...input.requiredExactLines],
    sourceEvidence: input.sourceEvidence };
}

export function validateResolutionReceipt(review, contract, sourceText) {
  if (!contract) return [];
  const errors = [];
  if (!distinctExactLines(contract.requiredExactLines))
    return ['RESOLUTION_RECEIPT_CONTRACT_INVALID: locked requiredExactLines are invalid'];
  const sourceLines = typeof sourceText === 'string' ? sourceText.split(/\r?\n/) : [];
  for (const line of contract.requiredExactLines) {
    if (!sourceLines.includes(line))
      errors.push('RESOLUTION_RECEIPT_SOURCE_MISSING: required historical line is absent from the locked source');
    if (!Array.isArray(review?.historicalExactLines) || !review.historicalExactLines.includes(line))
      errors.push('RESOLUTION_RECEIPT_INCOMPLETE: the first routed receipt lacks a required exact historical line');
  }
  if (Array.isArray(review?.historicalExactLines) &&
      (review.historicalExactLines.some(line => !contract.requiredExactLines.includes(line)) ||
       new Set(review.historicalExactLines).size !== review.historicalExactLines.length))
    errors.push('RESOLUTION_RECEIPT_MISMATCH: unexpected or duplicate historical lines');
  return errors;
}
