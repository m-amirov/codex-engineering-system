import { classifyContinuationError, RECOVERY_CATEGORIES } from './continuation-recovery.mjs';

export const CAPABILITY_BROKER_SCHEMA_VERSION = 1;
export const DEV_WEB_HIGH_PRIMARY_MODEL = 'chatgpt-web/gpt-6-sol';
export const DEV_WEB_HIGH_FALLBACK_MODEL = 'gpt-5.6-sol';

const TEMPORARY_WEB_STATUSES = new Set([
  'UNAVAILABLE', 'NOT_ACCEPTING_TURNS', 'RATE_LIMITED', 'UNKNOWN',
  'CAPABILITY_UNAVAILABLE', 'CAPABILITY_NOT_READY'
]);

function decision(category, reasonCode, nextAction, extra = {}) {
  const classification = category === 'READY'
    ? { category: 'READY', retryAllowed: false, consumesArtAttempt: false, consumesRepairCycle: false }
    : classifyContinuationError({ reasonCode, category });
  return {
    schemaVersion: CAPABILITY_BROKER_SCHEMA_VERSION,
    status: category === RECOVERY_CATEGORIES.AUTO_RECOVERABLE ? 'READY' : category,
    category,
    reasonCode,
    nextAction,
    executable: category === 'READY',
    ...classification,
    ...extra
  };
}

/**
 * Read-only capability routing. It observes a persisted capability snapshot;
 * it never creates a challenge, grants permission, invokes a host tool or
 * treats a manual/env override as native authorization.
 */
export function brokerCapabilities(capabilities, {
  pipeline = null,
  stage = null,
  webRequired = false,
  usesExistingArtReuse = false,
  allowWebFallback = true
} = {}) {
  if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities))
    return decision(RECOVERY_CATEGORIES.HARD_BLOCKED, 'CAPABILITY_SNAPSHOT_INVALID', 'STOP_AND_REPAIR');
  if (capabilities.filesystem && (capabilities.filesystem.exists === false || capabilities.filesystem.readable === false))
    return decision(RECOVERY_CATEGORIES.HARD_BLOCKED, 'PROJECT_NOT_READABLE', 'STOP_AND_REPAIR');

  const web = capabilities.web ?? { status: 'UNKNOWN' };
  const webStatus = String(web.status ?? 'UNKNOWN').toUpperCase();
  const webRoute = {
    provider: 'codex-chatgpt-web-dev',
    mode: 'browser-only',
    primaryModel: DEV_WEB_HIGH_PRIMARY_MODEL,
    fallbackModel: DEV_WEB_HIGH_FALLBACK_MODEL,
    fallbackAllowed: allowWebFallback === true && web.fallbackAllowed !== false
  };
  if (webRequired && webStatus !== 'READY') {
    const reasonCode = webStatus === 'RATE_LIMITED' ? 'RATE_LIMITED'
      : webStatus === 'NOT_ACCEPTING_TURNS' ? 'WEB_NOT_ACCEPTING_TURNS'
        : webStatus === 'UNKNOWN' ? 'CAPABILITY_NOT_READY' : 'WEB_REQUIRED_NOT_READY';
    return decision(RECOVERY_CATEGORIES.WAIT_EXTERNAL, reasonCode, 'WAIT_FOR_EXTERNAL_RECOVERY', {
      web: { status: webStatus, route: webRoute, retryAfterSeconds: web.retryAfterSeconds ?? null }
    });
  }

  const imageRequired = pipeline === 'production-art' && stage === 'GENERATING' && !usesExistingArtReuse;
  if (imageRequired) {
    const image = capabilities.imageGeneration ?? {};
    if (image.trustedForGeneration === true && image.capabilityPresence === 'PRESENT' && image.generationAllowed === true) {
      return decision('READY', 'CAPABILITY_READY', 'EXECUTE_NEXT_ACTION', {
        imageGeneration: {
          provider: image.provider ?? 'native-host',
          observedTool: image.observedTool ?? null,
          attestationFile: image.attestationFile ?? null,
          trustScope: image.trustScope ?? null,
          serviceAvailability: image.serviceAvailability ?? 'unknown'
        },
        web: { status: webStatus, route: webRoute }
      });
    }
    const service = String(image.serviceAvailability ?? 'unknown').toUpperCase();
    const observedAbsence = image.capabilityPresence === 'ABSENT' &&
      ['in-session-observation', 'host-attestation'].includes(image.source);
    if (['UNAVAILABLE', 'RATE_LIMITED', 'USAGE_LIMIT_REACHED'].includes(service) || observedAbsence) {
      return decision(RECOVERY_CATEGORIES.WAIT_EXTERNAL,
        service === 'RATE_LIMITED' ? 'RATE_LIMITED' : service === 'USAGE_LIMIT_REACHED' ? 'USAGE_LIMIT_REACHED' : 'CAPABILITY_UNAVAILABLE',
        'WAIT_FOR_EXTERNAL_RECOVERY', { imageGeneration: { serviceAvailability: service, trusted: false } });
    }
    return {
      schemaVersion: CAPABILITY_BROKER_SCHEMA_VERSION,
      status: 'READY',
      category: 'READY',
      reasonCode: 'CAPABILITY_CHALLENGE_REQUIRED',
      nextAction: 'REQUEST_FRESH_CAPABILITY_CHALLENGE',
      executable: true,
      requiresFreshCapabilityChallenge: true,
      authorizationRequired: true,
      retryAllowed: false,
      consumesArtAttempt: false,
      consumesRepairCycle: false,
      imageGeneration: { serviceAvailability: service, trusted: false, generationAllowed: false },
      web: { status: webStatus, route: webRoute }
    };
  }

  return decision('READY', 'CAPABILITY_READY', 'EXECUTE_NEXT_ACTION', {
    web: { status: webStatus, route: webRoute },
    imageGeneration: capabilities.imageGeneration ? {
      trusted: capabilities.imageGeneration.trustedForGeneration === true,
      generationAllowed: capabilities.imageGeneration.generationAllowed === true
    } : null
  });
}
