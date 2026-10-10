/**
 * Classify observed Web attachment failures without inferring an account quota
 * from a generic failed upload, a 429, or a healthy bridge.
 * The host must report the actual failed-turn evidence to CEOS.
 */
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

export function classifyWebTransportFailure({ message = '', code = '', httpStatus = null } = {}) {
  const detail = String(message ?? '');
  const normalizedCode = String(code ?? '').trim().toUpperCase();
  const normalized = detail.toLowerCase();
  const quotaCode = [
    'ATTACHMENT_QUOTA_EXHAUSTED', 'FILE_UPLOAD_LIMIT_REACHED',
    'ATTACHMENT_LIMIT_REACHED', 'FILE_ATTACHMENT_LIMIT_REACHED'
  ].includes(normalizedCode);
  const quotaMessage = [
    /достигнут лимит прикрепления файлов/i,
    /(?:достигнут|исчерпан|превышен) (?:допустимый )?лимит (?:загрузки|прикрепления) файлов/i,
    /(?:file |attachment )?(?:upload|attachment) limit (?:reached|exceeded)/i,
    /(?:you(?:'ve| have)? |your account has )?(?:reached|exceeded) (?:the |your )?(?:file |attachment )?(?:upload|attachment) limit/i,
    /(?:file|attachment) quota (?:exhausted|reached|exceeded)/i
  ].some(pattern => pattern.test(detail));
  if (quotaCode || quotaMessage) {
    return {
      classification: 'ATTACHMENT_QUOTA_EXHAUSTED',
      retryAllowed: false, nativeFallbackAllowed: false,
      consumesRepairCycle: false, blocksRequiredVisualReview: true,
      evidenceMessage: detail, observedCode: normalizedCode || null,
      scope: 'UNKNOWN'
    };
  }
  if (httpStatus === 429 || normalizedCode === 'RATE_LIMITED' ||
      /too many requests|rate[ _-]?limit|cooldown|retry.after/i.test(normalized)) {
    return {
      classification: 'RATE_LIMITED',
      retryAllowed: true, nativeFallbackAllowed: false,
      consumesRepairCycle: false, blocksRequiredVisualReview: true,
      evidenceMessage: detail, observedCode: normalizedCode || null,
      scope: 'UNKNOWN'
    };
  }
  if (/attachment|upload|прикреплен|вложени|загрузк.*файл/i.test(normalized) ||
      ['ATTACHMENT_TRANSPORT','ATTACHMENT_FAILED'].includes(normalizedCode)) {
    return {
      classification: 'ATTACHMENT_TRANSPORT',
      retryAllowed: true, nativeFallbackAllowed: false,
      consumesRepairCycle: false, blocksRequiredVisualReview: true,
      evidenceMessage: detail, observedCode: normalizedCode || null,
      scope: 'UNKNOWN'
    };
  }
  return {
    classification: 'UNKNOWN', retryAllowed: false,
    nativeFallbackAllowed: false, consumesRepairCycle: false,
    blocksRequiredVisualReview: true,
    evidenceMessage: nonempty(detail) ? detail : null,
    observedCode: normalizedCode || null, scope: 'UNKNOWN'
  };
}
