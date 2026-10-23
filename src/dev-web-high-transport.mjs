import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';

import { assessNarrativeArtFindings, NARRATIVE_ART_ACCEPTANCE_V2, NARRATIVE_ART_STORY_FIRST_GUIDANCE } from './narrative-art-acceptance.mjs';
import { classifyWebTransportFailure } from './web-transport-failure.mjs';
import { NARRATIVE_ART_ACCEPTANCE_V3, ART_V3_REVIEW_GUIDANCE, validateArtReviewV3 } from './narrative-art-acceptance-v3.mjs';

export const DEV_WEB_HIGH_MODEL = 'chatgpt-web/gpt-6-sol';
export const DEV_WEB_HIGH_RELEASE = '6.1.11';
export const DEV_WEB_HIGH_AGENT = 'ceos_art_director_web';
export const DEFAULT_DEV_WEB_HIGH_INTERVAL_MS = 20_000;
export const DEFAULT_DEV_WEB_HIGH_RETRY_DELAYS_MS = Object.freeze([30_000, 60_000]);
export const DEFAULT_DEV_WEB_HIGH_LEASE_TTL_MS = 120_000;
export const DEFAULT_DEV_WEB_HIGH_PACING_WAIT_TIMEOUT_MS = 120_000;
export const DEV_WEB_HIGH_ATTACHMENT_LEASE_FILE = '.dev-web-high-attachment.lease.json';
export const DEV_WEB_HIGH_ATTACHMENT_STATE_FILE = '.dev-web-high-attachment.pacing.json';

const HEAD = /^[a-f0-9]{7,64}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;
const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_TURN_IMAGE_BYTES = 50 * 1024 * 1024;
const MIME_BY_EXTENSION = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
});
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');

const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const sleepDefault = ms => new Promise(resolve => setTimeout(resolve, ms));
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function readOptionalJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function writeAtomicJson(file, value) {
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch {}
  }
}

function asError(error) {
  return error instanceof Error ? error : new Error(String(error));
}

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw fail('DEV_UNAVAILABLE', `Could not read ${label}: ${asError(error).message}`);
  }
}

function assertSafeProjectRelative(projectDir, file, label) {
  if (!nonempty(file) || path.isAbsolute(file)) throw fail('PROVENANCE_FAILURE', `${label} must be project-relative`);
  const resolvedProject = path.resolve(projectDir);
  const resolved = path.resolve(resolvedProject, file);
  if (resolved !== resolvedProject && !resolved.startsWith(resolvedProject + path.sep)) {
    throw fail('PROVENANCE_FAILURE', `${label} escapes the project directory`);
  }
  return resolved;
}

function projectRelative(projectDir, file) {
  return path.relative(path.resolve(projectDir), path.resolve(file)).split(path.sep).join('/');
}

function assertProfile(profile) {
  if (!profile || typeof profile !== 'object') throw fail('DEV_UNAVAILABLE', 'DEV profile is unavailable');
  if (path.resolve(profile.home ?? '') === path.resolve(profile.stableHome ?? '')) {
    throw fail('DEV_UNAVAILABLE', 'DEV profile resolves to the Stable profile');
  }
  if (profile.releaseVersion !== DEV_WEB_HIGH_RELEASE) {
    throw fail('DEV_UNAVAILABLE', `DEV release ${DEV_WEB_HIGH_RELEASE} is required`);
  }
  if (profile.mode !== 'browser-only') {
    throw fail('DEV_UNAVAILABLE', 'DEV Web High transport requires browser-only mode');
  }
  if (profile.solAvailable !== true) throw fail('DEV_UNAVAILABLE', 'DEV account has no GPT-6 Sol capability');
  if (profile.descriptor?.profile !== 'development' || profile.descriptor?.kind !== 'codex-web-gpt-launcher') {
    throw fail('DEV_UNAVAILABLE', 'DEV launcher descriptor is not development-scoped');
  }
  if (!nonempty(profile.descriptorPath) || !nonempty(profile.descriptor?.helper?.executable)
      || !nonempty(profile.descriptor?.helper?.script)) {
    throw fail('DEV_UNAVAILABLE', 'DEV launcher helper descriptor is incomplete');
  }
}

export function loadDevWebProfile({
  devHome = process.env.CODEX_WEB_GPT_DEV_HOME || path.join(os.homedir(), '.codex-chatgpt-web-dev'),
  stableHome = process.env.CODEX_CHATGPT_WEB_HOME || path.join(os.homedir(), '.codex-chatgpt-web')
} = {}) {
  const home = path.resolve(devHome);
  const stable = path.resolve(stableHome);
  if (home.toLowerCase() === stable.toLowerCase()) {
    throw fail('DEV_UNAVAILABLE', 'DEV profile must be isolated from Stable profile');
  }
  const configPath = path.join(home, 'config.json');
  const config = readJson(configPath, 'DEV config');
  if (config.version !== 3 || config.releaseVersion !== DEV_WEB_HIGH_RELEASE) {
    throw fail('DEV_UNAVAILABLE', 'DEV config is not the supported 6.1.11 schema/release');
  }
  const descriptorPath = path.resolve(config.browserHostDescriptorPath || path.join(home, 'runtime', 'launcher-browser.json'));
  const descriptor = readJson(descriptorPath, 'DEV launcher descriptor');
  const profile = {
    home,
    stableHome: stable,
    codexHome: path.join(home, 'codex-home'),
    configPath,
    descriptorPath,
    descriptor,
    releaseVersion: config.releaseVersion,
    mode: config.mode,
    solAvailable: config.solAvailable,
    appName: 'Codex Native2 DEV'
  };
  assertProfile(profile);
  if (!fs.existsSync(descriptor.helper.executable) || !fs.existsSync(descriptor.helper.script)) {
    throw fail('DEV_UNAVAILABLE', 'DEV launcher helper executable or script is missing');
  }
  return profile;
}

function readGitHead(projectDir) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: projectDir, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw fail('PROVENANCE_FAILURE', 'Could not resolve the project Git HEAD');
  const head = result.stdout.trim();
  if (!HEAD.test(head)) throw fail('PROVENANCE_FAILURE', 'Project Git HEAD is invalid');
  return head;
}

function imageData(image) {
  const extension = path.extname(image.path).toLowerCase();
  const mimeType = MIME_BY_EXTENSION[extension];
  if (!mimeType) throw fail('PROVENANCE_FAILURE', `Unsupported image type for ${image.ref}`);
  const bytes = fs.readFileSync(image.absolutePath);
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw fail('PROVENANCE_FAILURE', `Image ${image.ref} has an invalid byte size`);
  }
  if (mimeType === 'image/png' && !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw fail('PROVENANCE_FAILURE', `Image ${image.ref} is not a valid PNG payload`);
  }
  const actualSha256 = digest(bytes);
  if (actualSha256.toLowerCase() !== image.sha256.toLowerCase()) {
    throw fail('PROVENANCE_FAILURE', `Image ${image.ref} SHA-256 does not match the source-bound manifest`, {
      expectedSha256: image.sha256,
      actualSha256
    });
  }
  return {
    ref: image.ref,
    kind: image.kind,
    path: projectRelative(image.projectDir, image.absolutePath),
    sha256: actualSha256,
    detail: image.detail || 'high',
    imageUrl: `data:${mimeType};base64,${bytes.toString('base64')}`,
    byteLength: bytes.length
  };
}

export function prepareDevWebReviewRequest(request, { projectDir, currentHead } = {}) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw fail('PROVENANCE_FAILURE', 'Review request must be an object');
  if (request.schemaVersion !== 1) throw fail('PROVENANCE_FAILURE', 'Review request schemaVersion must equal 1');
  if (!nonempty(request.sceneId)) throw fail('PROVENANCE_FAILURE', 'sceneId is required');
  if (!HEAD.test(String(request.sourceHead ?? ''))) throw fail('PROVENANCE_FAILURE', 'sourceHead must be a Git SHA');
  if (currentHead && String(request.sourceHead).toLowerCase() !== String(currentHead).toLowerCase()) {
    throw fail('PROVENANCE_FAILURE', `Stale source HEAD: evidence=${request.sourceHead} current=${currentHead}`);
  }
  if (!nonempty(request.context)) throw fail('PROVENANCE_FAILURE', 'source-bound textual context is required');
  if (!Array.isArray(request.images) || request.images.length < 2 || request.images.length > MAX_IMAGES) {
    throw fail('PROVENANCE_FAILURE', 'At least original and runtime images, and at most ten images, are required');
  }
  const refs = new Set();
  const kinds = new Set();
  let totalBytes = 0;
  const images = request.images.map(image => {
    if (!image || !nonempty(image.ref) || refs.has(image.ref)) throw fail('PROVENANCE_FAILURE', 'Image refs must be non-empty and unique');
    if (!['original', 'runtime'].includes(image.kind)) throw fail('PROVENANCE_FAILURE', `Image ${image.ref} must be original or runtime`);
    if (!SHA256.test(String(image.sha256 ?? ''))) throw fail('PROVENANCE_FAILURE', `Image ${image.ref} needs a SHA-256`);
    const absolutePath = assertSafeProjectRelative(projectDir, image.path, `Image ${image.ref} path`);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) throw fail('PROVENANCE_FAILURE', `Image ${image.ref} is missing`);
    refs.add(image.ref);
    kinds.add(image.kind);
    const prepared = imageData({ ...image, absolutePath, projectDir });
    totalBytes += prepared.byteLength;
    return prepared;
  });
  if (!kinds.has('original') || !kinds.has('runtime')) throw fail('PROVENANCE_FAILURE', 'Both original and runtime pixel evidence are required');
  if (totalBytes > MAX_TURN_IMAGE_BYTES) throw fail('PROVENANCE_FAILURE', 'DEV Web High images exceed the 50 MB per-turn limit');
  const profile = request.artAcceptanceProfile ?? NARRATIVE_ART_ACCEPTANCE_V2;
  if (![NARRATIVE_ART_ACCEPTANCE_V2,NARRATIVE_ART_ACCEPTANCE_V3].includes(profile))
    throw fail('PROVENANCE_FAILURE', 'Unknown requested art acceptance profile');
  const cast=request.requiredCast;
  if (profile===NARRATIVE_ART_ACCEPTANCE_V3 &&
      (!Array.isArray(cast) || cast.some(x=>!nonempty(x)) || new Set(cast).size!==cast.length))
    throw fail('PROVENANCE_FAILURE', 'V3 requires an explicit unique requiredCast array (empty for scenery)');
  return {
    schemaVersion: 1,
    sceneId: request.sceneId,
    sourceHead: request.sourceHead,
    context: request.context,
    images,
    requiredCast: profile===NARRATIVE_ART_ACCEPTANCE_V3 ? cast : undefined,
    artAcceptanceProfile: profile
  };
}

function buildPrompt(request) {
  const manifest = request.images.map(image => ({ ref: image.ref, kind: image.kind, sha256: image.sha256 }));
  const v3=request.artAcceptanceProfile===NARRATIVE_ART_ACCEPTANCE_V3;
  return [
    'You are an independent GPT-6 Sol High reviewer running through the isolated DEV browser-only transport.',
    'You have no local filesystem, terminal, MCP, Stable bridge, or repository access. Review only the supplied text and attached pixels.',
    'Do not claim to have used tools or inspected files. Do not invent missing pixels.',
    `This is a source-bound visual acceptance for ${request.artAcceptanceProfile}.`,
    'First determine whether the complete player-facing story is understandable with the supplied dialogue and runtime frame. Do not treat this as an illustration checklist.',
    ...(v3 ? ART_V3_REVIEW_GUIDANCE : NARRATIVE_ART_STORY_FIRST_GUIDANCE),
    `Scene ID: ${request.sceneId}`,
    `Source HEAD: ${request.sourceHead}`,
    'Source-bound context:',
    request.context,
    'Attached evidence manifest (the images themselves are authoritative):',
    JSON.stringify(manifest),
    'Return exactly one JSON object, with no Markdown fence and no prose before or after it, using this exact shape:',
    JSON.stringify({
      schemaVersion: 1,
      sceneId: request.sceneId,
      sourceHead: request.sourceHead,
      status: v3 ? 'PASS | PASS_WITH_NOTES | REWORK' : 'PASS | REWORK | BLOCKED',
      reviewedItems: [request.sceneId],
      evidenceRefs: request.images.map(image => image.ref),
      receivedEvidenceRefs: request.images.map(image => image.ref),
      actualPixelsReceived: true,
      decision: 'substantive scene decision',
      artAcceptanceProfile: request.artAcceptanceProfile,
      ...(v3 ? {requiredCast:request.requiredCast,wardrobeAssessments:request.requiredCast.map(characterId=>({characterId,identityObservation:'visible face, age and hair observation',wardrobeObservation:'costume and time-context observation',actionObservation:'authored action observation',identityStatus:'PASS',wardrobeStatus:'PASS',storyActionStatus:'PASS',dualFormatStatus:'PASS',evidenceRefs:request.images.map(image=>image.ref)}))} : {}),
      visualEvidence: request.images.map(image => ({
        ref: image.ref,
        path: image.path,
        sha256: image.sha256,
        observation: 'specific independent pixel observation of at least 20 characters'
      })),
      findings: [],
      unresolved: []
    }),
    v3 ? 'Observe original and runtime pixels separately. P2/P3 imperfections go in findings and require PASS_WITH_NOTES; only independently substantiated P0/P1 material contradictions require REWORK. Fill each requiredCast wardrobeAssessments entry with real observations and linked image refs. Do not make up evidence or translate historical REWORK into PASS.' : 'Observe both the original PNG and the runtime capture separately. Copy the supplied sourceHead, refs, paths and SHA-256 values exactly; never invent or infer an observation for pixels you did not actually see. For any finding use the NARRATIVE_ART_ACCEPTANCE_V2 fields: id, severity, status, impactCode, authoredCue, observation, playerImpact, evidenceRef, actualPixelsReceived, visualRequired (if directly relevant), and materialPlayerImpact when relevant. If the visuals do not need to depict a narrated action, classify that absence as nonblocking, not as a visual contradiction.'
  ].join('\n');
}

function scanTopLevelJsonObjects(text) {
  const objects = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return objects;
}

function parseJsonObjectCandidate(candidate) {
  try {
    const parsed = JSON.parse(candidate);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON response must be an object');
    return { parsed, markdownEscaped: false };
  } catch {
    // ChatGPT may escape Markdown punctuation while rendering an otherwise
    // complete JSON object. Remove only invalid JSON escapes that are known
    // Markdown punctuation; never repair arbitrary malformed content.
    const normalized = candidate.replace(/(?<!\\)\\([\[\]_])/g, '$1');
    if (normalized === candidate) return null;
    try {
      const parsed = JSON.parse(normalized);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON response must be an object');
      return { parsed, markdownEscaped: true };
    } catch {
      return null;
    }
  }
}

export function extractStructuredResponse(text) {
  const raw = String(text ?? '').trim();
  const fencedBlocks = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)].map(match => match[1].trim());
  const candidates = scanTopLevelJsonObjects(raw);
  if (fencedBlocks.length > 1 || candidates.length > 1) {
    return { parsed: null, format: null, candidateCount: Math.max(fencedBlocks.length, candidates.length), error: 'MULTIPLE_JSON_OBJECTS' };
  }
  if (fencedBlocks.length === 1) {
    const parsedCandidate = parseJsonObjectCandidate(fencedBlocks[0]);
    if (parsedCandidate) {
      return {
        parsed: parsedCandidate.parsed,
        format: parsedCandidate.markdownEscaped ? 'fenced-markdown-escaped-json' : 'fenced-json',
        candidateCount: 1,
        error: null
      };
    } else {
      return { parsed: null, format: 'fenced-json', candidateCount: 1, error: 'RESPONSE_JSON_PARSE_ERROR' };
    }
  }
  if (candidates.length === 1) {
    const parsedCandidate = parseJsonObjectCandidate(candidates[0]);
    if (parsedCandidate) {
      return {
        parsed: parsedCandidate.parsed,
        format: parsedCandidate.markdownEscaped
          ? 'markdown-escaped-json'
          : raw === candidates[0] ? 'json' : 'embedded-json',
        candidateCount: 1,
        error: null
      };
    } else {
      return { parsed: null, format: 'json', candidateCount: 1, error: 'RESPONSE_JSON_PARSE_ERROR' };
    }
  }
  return { parsed: null, format: null, candidateCount: 0, error: 'RESPONSE_JSON_PARSE_ERROR' };
}

function sameStringList(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function validateReviewerEnvelope(request, parsed) {
  const refs = request.images.map(image => image.ref);
  const errors = [];
  if (parsed?.schemaVersion !== 1) errors.push('schemaVersion must equal 1');
  if (parsed?.sceneId !== request.sceneId) errors.push('sceneId does not match the request');
  if (parsed?.sourceHead !== request.sourceHead) errors.push('sourceHead does not match the request');
  if (!(request.artAcceptanceProfile===NARRATIVE_ART_ACCEPTANCE_V3 ? ['PASS','PASS_WITH_NOTES','REWORK'].includes(parsed?.status) : ['PASS','REWORK','BLOCKED'].includes(parsed?.status))) errors.push('status not valid for requested art profile');
  if (!sameStringList(parsed?.reviewedItems, [request.sceneId])) errors.push('reviewedItems must contain exactly the scene ID');
  if (!sameStringList(parsed?.evidenceRefs, refs)) errors.push('evidenceRefs must match the supplied image refs');
  if (!sameStringList(parsed?.receivedEvidenceRefs, refs)) errors.push('receivedEvidenceRefs must match the supplied image refs');
  if (parsed?.actualPixelsReceived !== true) errors.push('actualPixelsReceived must be true');
  if (!nonempty(parsed?.decision)) errors.push('decision is required');
  if (parsed?.artAcceptanceProfile !== request.artAcceptanceProfile) errors.push('artAcceptanceProfile must match the requested review');
  if (!Array.isArray(parsed?.findings)) errors.push('findings must be an array');
  if (!Array.isArray(parsed?.unresolved)) errors.push('unresolved must be an array');
  if (['PASS','PASS_WITH_NOTES'].includes(parsed?.status) && Array.isArray(parsed.unresolved) && parsed.unresolved.length > 0) {
    errors.push('PASS cannot contain unresolved observations');
  }

  const pixelErrors = [];
  const visualEvidence = parsed?.visualEvidence;
  if (!Array.isArray(visualEvidence) || visualEvidence.length !== refs.length) {
    pixelErrors.push('visualEvidence must contain one entry for every supplied image');
  } else {
    const seen = new Set();
    for (const image of request.images) {
      const item = visualEvidence.find(value => value?.ref === image.ref);
      if (!item || seen.has(item.ref)) {
        pixelErrors.push(`visualEvidence is missing a unique observation for ${image.ref}`);
        continue;
      }
      seen.add(item.ref);
      if (item.path !== image.path) pixelErrors.push(`visualEvidence path does not match ${image.ref}`);
      if (String(item.sha256 ?? '').toLowerCase() !== image.sha256.toLowerCase()) pixelErrors.push(`visualEvidence SHA-256 does not match ${image.ref}`);
      if (!nonempty(item.observation) || item.observation.trim().length < 20) pixelErrors.push(`visualEvidence observation is not substantive for ${image.ref}`);
    }
    for (const item of visualEvidence) {
      if (!refs.includes(item?.ref)) pixelErrors.push(`visualEvidence contains an unknown ref ${item?.ref ?? ''}`);
    }
  }
  return { errors, pixelErrors };
}

function completeLegacyObservations(request, parsed) {
  const refs = request.images.map(image => image.ref);
  if (!Array.isArray(parsed?.observations) || parsed.observations.length !== refs.length) return false;
  const seen = new Set();
  return parsed.observations.every(item => {
    const observation = item?.observation ?? item?.text;
    if (!refs.includes(item?.ref) || seen.has(item.ref) || !nonempty(observation) || observation.trim().length < 20) return false;
    seen.add(item.ref);
    return true;
  }) && seen.size === refs.length;
}

function schemaRepairEligible(request, parsed, validation) {
  if (!parsed || !['PASS', 'REWORK', 'BLOCKED'].includes(parsed.status)
      || parsed.sceneId !== request.sceneId || parsed.sourceHead !== request.sourceHead
      || parsed.actualPixelsReceived !== true || !nonempty(parsed.decision)
      || !Array.isArray(parsed.findings) || !Array.isArray(parsed.unresolved)) return false;
  if (validation.pixelErrors.length > 0) return completeLegacyObservations(request, parsed);
  return validation.errors.length > 0;
}

function malformedResponseRepairEligible(request, responseText) {
  const raw = String(responseText ?? '');
  if (!raw || !/"visualEvidence"\s*:/i.test(raw) || !/"actualPixelsReceived"\s*:\s*true/i.test(raw)
      || !/"status"\s*:\s*"(?:PASS|REWORK|BLOCKED)"/i.test(raw)) return false;
  if (!request.images.every(image => raw.includes(image.ref))) return false;
  const observationCount = (raw.match(/"observation"\s*:/gi) || []).length;
  return observationCount >= request.images.length;
}

function notVerified(request, reasonCode, responseText, transportEvidence, {
  validationErrors = [],
  extraction = null,
  normalization = {},
  rawResponseArtifacts = []
} = {}) {
  return {
    schemaVersion: 1,
    status: 'NOT_VERIFIED',
    reasonCode,
    sceneId: request.sceneId,
    sourceHead: request.sourceHead,
    transport: {
      status: 'COMPLETED',
      provider: 'codex-chatgpt-web-dev',
      releaseVersion: DEV_WEB_HIGH_RELEASE,
      mode: 'browser-only',
      model: DEV_WEB_HIGH_MODEL,
      reasoning: 'high',
      stableBridgeUsed: false,
      attachmentRefs: request.images.map(image => image.ref),
      ...transportEvidence
    },
    responseSha256: digest(String(responseText ?? '')),
    validationErrors,
    responseFormat: extraction?.format ?? null,
    candidateCount: extraction?.candidateCount ?? 0,
    rawResponseArtifacts,
    normalization: {
      schemaRepairAttempted: false,
      ...normalization
    }
  };
}

function buildReceipt(request, parsed, responseText, delivery, evidenceArtifact) {
  const actualPixelsReceived = delivery.submitted === true && delivery.attachmentAccepted !== false && parsed.actualPixelsReceived === true;
  return {
    schemaVersion: 1,
    phase: 'acceptance',
    agent: DEV_WEB_HIGH_AGENT,
    taskId: `dev-web-${request.sceneId}-${request.sourceHead.slice(0, 12)}`,
    reviewTraceId: null,
    sourceHead: request.sourceHead,
    status: parsed.status,
    model: DEV_WEB_HIGH_MODEL,
    reasoning: 'high',
    provider: 'codex-chatgpt-web-dev',
    stableBridgeUsed: false,
    reviewedItems: parsed.reviewedItems,
    evidenceRefs: parsed.evidenceRefs,
    receivedEvidenceRefs: parsed.receivedEvidenceRefs,
    actualPixelsReceived,
    decision: parsed.decision,
    findings: parsed.findings,
    unresolved: parsed.unresolved,
    artAcceptanceProfile: parsed.artAcceptanceProfile,
    ...(parsed.artAcceptanceProfile===NARRATIVE_ART_ACCEPTANCE_V3 ? {requiredCast:parsed.requiredCast,wardrobeAssessments:parsed.wardrobeAssessments} : {}),
    evidenceArtifact,
    visualEvidence: parsed.visualEvidence,
    normalization: parsed.normalization,
    transport: {
      provider: 'codex-chatgpt-web-dev',
      releaseVersion: DEV_WEB_HIGH_RELEASE,
      mode: 'browser-only',
      model: DEV_WEB_HIGH_MODEL,
      reasoning: 'high',
      stableBridgeUsed: false,
      actualProjectHead: delivery.actualProjectHead ?? request.sourceHead,
      responseSha256: digest(String(responseText ?? '')),
      attachmentRefs: request.images.map(image => image.ref),
      submitted: delivery.submitted === true,
      attachmentAccepted: delivery.attachmentAccepted !== false,
      transportTraceId: delivery.traceId
    }
  };
}

function parseResponse(request, response, { evidenceArtifact, rawResponseArtifacts = [], schemaRepairAttempted = false } = {}) {
  const responseText = response?.text;
  const transportEvidence = {
    traceId: response?.traceId ?? null,
    actualProjectHead: response?.actualProjectHead ?? request.sourceHead,
    submitted: response?.submitted === true,
    attachmentAccepted: response?.attachmentAccepted !== false
  };
  const extraction = extractStructuredResponse(responseText);
  if (extraction.error) {
    return notVerified(request, extraction.error, responseText, transportEvidence, {
      extraction,
      rawResponseArtifacts,
      normalization: { schemaRepairAttempted }
    });
  }
  const parsed = extraction.parsed;
  const validation = validateReviewerEnvelope(request, parsed);
  if (validation.errors.length) {
    return notVerified(request, 'REVIEW_ENVELOPE_INVALID', responseText, transportEvidence, {
      validationErrors: validation.errors,
      extraction,
      rawResponseArtifacts,
      normalization: { schemaRepairAttempted }
    });
  }
  if (validation.pixelErrors.length) {
    return notVerified(request, 'PIXEL_OBSERVATIONS_INVALID', responseText, transportEvidence, {
      validationErrors: validation.pixelErrors,
      extraction,
      rawResponseArtifacts,
      normalization: { schemaRepairAttempted }
    });
  }
  if (request.artAcceptanceProfile===NARRATIVE_ART_ACCEPTANCE_V3) {
    const evaluation=validateArtReviewV3(parsed);
    if (!evaluation.ok) return notVerified(request, 'NARRATIVE_V3_REVIEW_INVALID', responseText, transportEvidence, {
      validationErrors:evaluation.errors, extraction,rawResponseArtifacts,normalization:{schemaRepairAttempted}
    });
    if (JSON.stringify(parsed.requiredCast)!==JSON.stringify(request.requiredCast))
      return notVerified(request,'NARRATIVE_V3_CAST_MISMATCH',responseText,transportEvidence,{
        validationErrors:['requiredCast must equal the source-bound request cast'],extraction,rawResponseArtifacts,normalization:{schemaRepairAttempted}
      });
  } else {
    const findingCheck = assessNarrativeArtFindings(parsed.findings);
    if (!findingCheck.ok) return notVerified(request, 'NARRATIVE_FINDINGS_INVALID', responseText, transportEvidence, {
      validationErrors:findingCheck.errors,extraction,rawResponseArtifacts,normalization:{schemaRepairAttempted}
    });
    if (parsed.status === 'PASS' && findingCheck.blockingFindings.length > 0)
      return notVerified(request, 'NARRATIVE_VERDICT_CONTRADICTION', responseText, transportEvidence, {
        validationErrors:['PASS cannot contain open blocking NARRATIVE_ART_ACCEPTANCE_V2 findings'],
        extraction,rawResponseArtifacts,normalization:{schemaRepairAttempted}
      });
  }
  const normalized = {
    ...parsed,
    normalization: {
      schemaRepairAttempted,
      responseFormat: extraction.format,
      rawResponseArtifacts,
      rawResponseSha256: digest(String(responseText ?? '')),
      sourceHead: request.sourceHead,
      imageSha256: request.images.map(image => ({ ref: image.ref, sha256: image.sha256 }))
    }
  };
  const receipt = buildReceipt(request, normalized, responseText, response, evidenceArtifact);
  if (!receipt.actualPixelsReceived) return notVerified(request, 'PIXEL_DELIVERY_NOT_CONFIRMED', responseText, transportEvidence, {
    extraction,
    rawResponseArtifacts,
    normalization: { schemaRepairAttempted }
  });
  return {
    schemaVersion: 1,
    status: parsed.status,
    sceneId: request.sceneId,
    sourceHead: request.sourceHead,
    transport: { status: 'COMPLETED', ...transportEvidence },
    receipt
  };
}

function deriveRawResponseArtifact(evidenceArtifact, suffix = '') {
  const extension = path.extname(evidenceArtifact);
  const stem = extension ? evidenceArtifact.slice(0, -extension.length) : evidenceArtifact;
  return `${stem}${suffix}.raw.txt`;
}

export function writeDevWebRawResponse(projectDir, file, responseText) {
  const absolute = assertSafeProjectRelative(projectDir, file, 'Raw reviewer response path');
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, String(responseText ?? ''), { encoding: 'utf8', flag: 'wx' });
  return absolute;
}

function normalizeFailure(error) {
  const value = asError(error);
  const classified = classifyWebTransportFailure({
    message: value.message,
    code: value.code || '',
    httpStatus: value.status ?? null
  });
  if (value.code === 'DEV_UNAVAILABLE') return { classification: 'DEV_UNAVAILABLE', retryAllowed: false, detail: value.message };
  if (value.code === 'PROVENANCE_FAILURE') return { classification: 'PROVENANCE_FAILURE', retryAllowed: false, detail: value.message };
  if (value.code === 'DEV_ATTACHMENT_PACING_BLOCKED') return { classification: 'ATTACHMENT_PACING_BLOCKED', retryAllowed: false, detail: value.message };
  return { ...classified, detail: value.message };
}

export class DevWebHighTransport {
  constructor({
    projectDir,
    devHome,
    stableHome,
    profile,
    profileLoader,
    helperFactory,
    stableRoutingEnabled = false,
    sleep = sleepDefault,
    now = () => Date.now(),
    minAttachmentIntervalMs = DEFAULT_DEV_WEB_HIGH_INTERVAL_MS,
    retryDelaysMs = DEFAULT_DEV_WEB_HIGH_RETRY_DELAYS_MS,
    headResolver = null,
    attachmentPacingDir = null,
    attachmentLeaseTtlMs = DEFAULT_DEV_WEB_HIGH_LEASE_TTL_MS,
    attachmentPacingWaitTimeoutMs = DEFAULT_DEV_WEB_HIGH_PACING_WAIT_TIMEOUT_MS
  } = {}) {
    this.projectDir = path.resolve(projectDir || process.cwd());
    this.profile = profile;
    this.profileLoader = profileLoader || (() => loadDevWebProfile({ devHome, stableHome }));
    this.helperFactory = helperFactory;
    this.stableRoutingEnabled = Boolean(stableRoutingEnabled);
    this.sleep = sleep;
    this.now = now;
    this.minAttachmentIntervalMs = Number.isInteger(minAttachmentIntervalMs) && minAttachmentIntervalMs >= 0
      ? minAttachmentIntervalMs : DEFAULT_DEV_WEB_HIGH_INTERVAL_MS;
    this.retryDelaysMs = [...retryDelaysMs];
    this.headResolver = headResolver || (() => readGitHead(this.projectDir));
    this.attachmentPacingDir = attachmentPacingDir ? path.resolve(attachmentPacingDir) : null;
    this.attachmentLeaseTtlMs = Number.isInteger(attachmentLeaseTtlMs) && attachmentLeaseTtlMs >= 1_000
      ? attachmentLeaseTtlMs : DEFAULT_DEV_WEB_HIGH_LEASE_TTL_MS;
    this.attachmentPacingWaitTimeoutMs = Number.isInteger(attachmentPacingWaitTimeoutMs) && attachmentPacingWaitTimeoutMs >= 0
      ? attachmentPacingWaitTimeoutMs : DEFAULT_DEV_WEB_HIGH_PACING_WAIT_TIMEOUT_MS;
    this.helper = null;
  }

  async getProfile() {
    if (!this.profile) this.profile = this.profileLoader();
    assertProfile(this.profile);
    return this.profile;
  }

  async getHelper() {
    if (!this.helper) {
      const profile = await this.getProfile();
      this.helper = this.helperFactory ? this.helperFactory(profile) : new DevBrowserHelperClient(profile);
    }
    return this.helper;
  }

  pacingPaths(profile) {
    const directory = this.attachmentPacingDir || path.join(profile.home, 'runtime', 'dev-chat');
    return {
      directory,
      lease: path.join(directory, DEV_WEB_HIGH_ATTACHMENT_LEASE_FILE),
      state: path.join(directory, DEV_WEB_HIGH_ATTACHMENT_STATE_FILE)
    };
  }

  async acquireAttachmentLease(profile) {
    const paths = this.pacingPaths(profile);
    fs.mkdirSync(paths.directory, { recursive: true });
    const startedAt = this.now();
    const deadline = startedAt + this.attachmentPacingWaitTimeoutMs;
    const token = crypto.randomUUID();
    for (;;) {
      const now = this.now();
      if (now > deadline) {
        throw fail('DEV_ATTACHMENT_PACING_BLOCKED', 'Timed out waiting for the global DEV attachment pacing lease');
      }
      let descriptor = null;
      try {
        descriptor = fs.openSync(paths.lease, 'wx');
        fs.writeFileSync(descriptor, JSON.stringify({
          schemaVersion: 1,
          token,
          pid: process.pid,
          createdAt: now,
          expiresAt: now + this.attachmentLeaseTtlMs
        }) + '\n', 'utf8');
        fs.closeSync(descriptor);
        descriptor = null;

        const pacing = readOptionalJson(paths.state);
        const lastAttachmentTurnAt = Number.isFinite(pacing?.lastAttachmentTurnAt)
          ? pacing.lastAttachmentTurnAt : null;
        const waitMs = lastAttachmentTurnAt === null
          ? 0 : Math.max(0, lastAttachmentTurnAt + this.minAttachmentIntervalMs - this.now());
        if (waitMs > 0) await this.sleep(waitMs);
        writeAtomicJson(paths.state, {
          schemaVersion: 1,
          lastAttachmentTurnAt: this.now(),
          lastLeaseToken: token
        });
        let released = false;
        const renew = () => {
          if (released) return;
          const current = readOptionalJson(paths.lease);
          if (current?.token !== token) return;
          try {
            writeAtomicJson(paths.lease, {
              ...current,
              renewedAt: this.now(),
              expiresAt: this.now() + this.attachmentLeaseTtlMs
            });
          } catch {}
        };
        const heartbeat = setInterval(renew, Math.max(1_000, Math.floor(this.attachmentLeaseTtlMs / 3)));
        heartbeat.unref?.();
        return {
          async release() {
            if (released) return;
            released = true;
            clearInterval(heartbeat);
            const current = readOptionalJson(paths.lease);
            if (current?.token === token) {
              try { fs.unlinkSync(paths.lease); } catch (error) {
                if (error.code !== 'ENOENT') throw error;
              }
            }
          }
        };
      } catch (error) {
        if (descriptor !== null) {
          try { fs.closeSync(descriptor); } catch {}
        }
        if (error.code !== 'EEXIST') {
          try { fs.unlinkSync(paths.lease); } catch {}
          throw error;
        }
        const current = readOptionalJson(paths.lease);
        const stale = Number.isFinite(current?.expiresAt)
          ? current.expiresAt <= this.now()
          : (() => {
            try { return this.now() - fs.statSync(paths.lease).mtimeMs >= this.attachmentLeaseTtlMs; }
            catch { return true; }
          })();
        if (stale) {
          try { fs.unlinkSync(paths.lease); } catch (unlinkError) {
            if (unlinkError.code !== 'ENOENT') throw unlinkError;
          }
          continue;
        }
        const remaining = Number.isFinite(current?.expiresAt)
          ? Math.max(50, Math.min(current.expiresAt - this.now(), 1_000)) : 250;
        await this.sleep(remaining);
      }
    }
  }

  async runAttachmentTurn(profile, helper, request) {
    const lease = await this.acquireAttachmentLease(profile);
    try {
      return await helper.run(request);
    } finally {
      await lease.release();
    }
  }

  async review(request, {
    currentHead,
    expectedHead,
    evidenceArtifact = 'artifacts/evidence/dev-web-high-review.json',
    rawResponseArtifact = null
  } = {}) {
    let prepared;
    let actualHead = null;
    try {
      const profile = await this.getProfile();
      actualHead = this.headResolver();
      const suppliedHead = expectedHead ?? currentHead;
      if (suppliedHead && String(suppliedHead).toLowerCase() !== String(actualHead).toLowerCase()) {
        throw fail('PROVENANCE_FAILURE', `Supplied HEAD ${suppliedHead} does not match the actual project HEAD ${actualHead}`);
      }
      prepared = prepareDevWebReviewRequest(request, { projectDir: this.projectDir, currentHead: actualHead });
      const helper = await this.getHelper();
      const traceId = `devweb_${crypto.randomUUID().replaceAll('-', '')}`;
      const prompt = buildPrompt(prepared);
      const conversationKey = digest(`ceos-dev-web-high:${this.projectDir}:${prepared.sceneId}:${prepared.sourceHead}:${traceId}`);
      const initialRawArtifact = rawResponseArtifact || deriveRawResponseArtifact(evidenceArtifact, `.${prepared.sceneId}`);
      const persistResponse = (responseText, artifact) => {
        try {
          writeDevWebRawResponse(this.projectDir, artifact, responseText);
          return null;
        } catch (error) {
          return error;
        }
      };
      const rawPersistenceFailure = (error, artifact) => ({
        schemaVersion: 1,
        status: 'BLOCKED',
        failureType: 'INFRA_FAILURE',
        reasonCode: 'RAW_RESPONSE_PERSISTENCE',
        sceneId: prepared.sceneId,
        sourceHead: prepared.sourceHead,
        transport: {
          status: 'BLOCKED',
          provider: 'codex-chatgpt-web-dev',
          releaseVersion: DEV_WEB_HIGH_RELEASE,
          mode: 'browser-only',
          model: DEV_WEB_HIGH_MODEL,
           reasoning: 'high',
           stableBridgeUsed: false,
           actualProjectHead: actualHead,
           classification: 'PROVENANCE_FAILURE',
          detail: `Could not persist raw reviewer response ${artifact}: ${asError(error).message}`,
          attempts: 1
        }
      });
      let attempt = 0;
      for (;;) {
        try {
          const response = await this.runAttachmentTurn(profile, helper, {
            traceId,
            sceneId: prepared.sceneId,
            sourceHead: prepared.sourceHead,
            prompt,
            model: DEV_WEB_HIGH_MODEL,
            reasoning: 'high',
            modelFamily: '6',
            profile,
            images: prepared.images,
            retainConversation: true,
            requireRetainedConversation: false,
            prepareResume: false,
            conversationKey
          });
          const firstResponse = { ...response, traceId, actualProjectHead: actualHead };
          const persistError = persistResponse(firstResponse.text, initialRawArtifact);
          if (persistError) return rawPersistenceFailure(persistError, initialRawArtifact);
          const initialExtraction = extractStructuredResponse(firstResponse.text);
          const initialParsed = initialExtraction.parsed;
          const initialValidation = initialParsed ? validateReviewerEnvelope(prepared, initialParsed) : { errors: [], pixelErrors: [] };
          const initialResult = parseResponse(prepared, firstResponse, {
            evidenceArtifact,
            rawResponseArtifacts: [initialRawArtifact]
          });
          const repairEligible = initialParsed
            ? schemaRepairEligible(prepared, initialParsed, initialValidation)
            : malformedResponseRepairEligible(prepared, firstResponse.text);
          if (initialResult.status !== 'NOT_VERIFIED' || !repairEligible) return initialResult;

          const repairTraceId = `${traceId}_schema_repair`;
          const repairRawArtifact = rawResponseArtifact
            ? `${rawResponseArtifact}.repair.txt`
            : deriveRawResponseArtifact(evidenceArtifact, `.${prepared.sceneId}.repair`);
          let repairResponse;
          try {
            repairResponse = await helper.run({
            traceId: repairTraceId,
            sceneId: prepared.sceneId,
            sourceHead: prepared.sourceHead,
            prompt: [
              'Formatting correction only. Stay in the same reviewer conversation and use only the pixels already attached in the previous turn.',
              'Return exactly one JSON object matching the requested schema. Do not add, remove, or change any visual observation or verdict.',
              'If either image was not actually visible, return NOT_VERIFIED in the explanation rather than inventing pixel observations.'
            ].join('\n'),
            model: DEV_WEB_HIGH_MODEL,
            reasoning: 'high',
            modelFamily: '6',
            profile,
            images: [],
            retainConversation: true,
            requireRetainedConversation: true,
            prepareResume: true,
            conversationKey
            });
          } catch (error) {
            const value = asError(error);
            return {
              schemaVersion: 1,
              status: 'BLOCKED',
              failureType: 'INFRA_FAILURE',
              reasonCode: 'RETAINED_CONVERSATION_UNAVAILABLE',
              sceneId: prepared.sceneId,
              sourceHead: prepared.sourceHead,
              transport: {
                status: 'BLOCKED',
                provider: 'codex-chatgpt-web-dev',
                releaseVersion: DEV_WEB_HIGH_RELEASE,
                mode: 'browser-only',
                model: DEV_WEB_HIGH_MODEL,
                reasoning: 'high',
                stableBridgeUsed: false,
                actualProjectHead: actualHead,
                attachmentRefs: prepared.images.map(image => image.ref),
                classification: 'RETAINED_CONVERSATION_UNAVAILABLE',
                detail: `DEV retained conversation could not be resumed: ${value.message}`,
                schemaRepairAttempted: true,
                replacementImageReviewStarted: false,
                initialReviewStatus: initialResult.status,
                initialReasonCode: initialResult.reasonCode ?? null,
                responseSha256: digest(String(firstResponse.text ?? '')),
                rawResponseArtifacts: [initialRawArtifact]
              }
            };
          }
          const finalResponse = { ...repairResponse, traceId: repairTraceId, actualProjectHead: actualHead };
          const repairPersistError = persistResponse(finalResponse.text, repairRawArtifact);
          if (repairPersistError) return rawPersistenceFailure(repairPersistError, repairRawArtifact);
          return parseResponse(prepared, finalResponse, {
            evidenceArtifact,
            rawResponseArtifacts: [initialRawArtifact, repairRawArtifact],
            schemaRepairAttempted: true
          });
        } catch (error) {
          const failure = normalizeFailure(error);
          if (failure.classification !== 'ATTACHMENT_TRANSPORT' || attempt >= this.retryDelaysMs.length) {
            return {
              schemaVersion: 1,
              status: 'BLOCKED',
              failureType: 'INFRA_FAILURE',
              sceneId: prepared.sceneId,
              sourceHead: prepared.sourceHead,
              transport: {
                status: 'BLOCKED',
                provider: 'codex-chatgpt-web-dev',
                releaseVersion: DEV_WEB_HIGH_RELEASE,
                mode: 'browser-only',
                model: DEV_WEB_HIGH_MODEL,
                 reasoning: 'high',
                 stableBridgeUsed: false,
                 actualProjectHead: actualHead,
                 attachmentRefs: prepared.images.map(image => image.ref),
                classification: failure.classification,
                detail: failure.detail,
                attempts: attempt + 1,
                retryDelaysMs: this.retryDelaysMs.slice(0, attempt)
              }
            };
          }
          await this.sleep(this.retryDelaysMs[attempt]);
          attempt += 1;
        }
      }
    } catch (error) {
      const failure = normalizeFailure(error);
      return {
        schemaVersion: 1,
        status: 'BLOCKED',
        failureType: failure.classification === 'PROVENANCE_FAILURE' ? 'PROVENANCE_FAILURE' : 'CAPABILITY_BLOCKER',
        sceneId: request?.sceneId ?? null,
        sourceHead: request?.sourceHead ?? null,
        transport: {
          status: 'BLOCKED',
          provider: 'codex-chatgpt-web-dev',
          releaseVersion: DEV_WEB_HIGH_RELEASE,
          mode: 'browser-only',
          model: DEV_WEB_HIGH_MODEL,
           reasoning: 'high',
           stableBridgeUsed: false,
           actualProjectHead: actualHead,
           classification: failure.classification,
          detail: failure.detail,
          attempts: 0
        }
      };
    }
  }

  async reviewBatch(requests, options = {}) {
    if (!Array.isArray(requests) || requests.length === 0) throw new Error('reviewBatch requires at least one request');
    const results = [];
    for (const request of requests) {
      const result = await this.review(request, options);
      results.push(result);
      if (result.status !== 'PASS') break;
    }
    return results;
  }

  async close() {
    if (this.helper?.close) await this.helper.close();
    this.helper = null;
  }
}

export class DevBrowserHelperClient {
  constructor(profile, { spawnImpl = spawn } = {}) {
    this.profile = profile;
    this.spawnImpl = spawnImpl;
    this.child = null;
    this.ready = null;
    this.pending = new Map();
    this.active = false;
  }

  async ensureChild() {
    if (this.child && this.child.exitCode === null && this.ready) return this.ready;
    assertProfile(this.profile);
    const descriptor = this.profile.descriptor;
    const child = this.spawnImpl(descriptor.helper.executable, [descriptor.helper.script], {
      env: {
        ...process.env,
        CODEX_WEB_GPT_DEV_HOME: this.profile.home,
        CODEX_CHATGPT_WEB_HOME: this.profile.home,
        CODEX_HOME: this.profile.codexHome,
        ELECTRON_RUN_AS_NODE: '1',
        CODEX_CHATGPT_WEB_BROWSER_HELPER_PROCESS: '1'
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });
    this.child = child;
    this.ready = new Promise((resolve, reject) => {
      const output = createInterface({ input: child.stdout });
      output.on('line', line => this.handleLine(line, resolve, reject));
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        const error = fail('DEV_UNAVAILABLE', `DEV browser helper exited ${signal ? `from ${signal}` : `with status ${code ?? 1}`}`);
        if (this.ready) reject(error);
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
        this.child = null;
      });
    });
    await this.ready;
  }

  handleLine(line, readyResolve, readyReject) {
    let message;
    try { message = JSON.parse(line); } catch (error) {
      readyReject(fail('DEV_UNAVAILABLE', `DEV helper emitted invalid protocol data: ${asError(error).message}`));
      return;
    }
    if (message.type === 'ready') {
      readyResolve();
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    if (message.type === 'event') {
      if (message.event === 'prepared_selected') {
        this.send({
          type: 'prepared_selected_ack',
          id: message.id,
          prepared: {
            text: pending.prompt,
            images: pending.images.map(({ ref, imageUrl, detail }) => ({ ref, imageUrl, detail }))
          }
        }).catch(error => pending.reject(error));
      } else if (message.event === 'send_activated') {
        this.send({
          type: 'send_activation_ack',
          id: message.id
        }).catch(error => pending.reject(error));
      } else if (message.event === 'submitted') {
        pending.submitted = true;
        pending.attachmentAccepted = true;
      }
      return;
    }
    this.pending.delete(message.id);
    if (message.type === 'result') pending.resolve({
      text: message.text,
      submitted: pending.submitted,
      attachmentAccepted: pending.attachmentAccepted
    });
    else if (message.type === 'error') {
      const error = fail(message.code || 'DEV_UNAVAILABLE', message.message || 'DEV browser helper failed', {
        status: message.status,
        retryable: message.retryable
      });
      pending.reject(error);
    }
  }

  async send(message) {
    if (!this.child || this.child.stdin.destroyed || this.child.stdin.writableEnded) throw fail('DEV_UNAVAILABLE', 'DEV browser helper is not running');
    await new Promise((resolve, reject) => this.child.stdin.write(`${JSON.stringify(message)}\n`, error => error ? reject(error) : resolve()));
  }

  async run({
    traceId,
    prompt,
    model,
    reasoning,
    modelFamily,
    images,
    retainConversation = false,
    requireRetainedConversation = false,
    prepareResume = false,
    conversationKey = null
  }) {
    if (this.active) throw fail('DEV_UNAVAILABLE', 'DEV browser-only transport does not allow concurrent turns');
    this.active = true;
    try {
      await this.ensureChild();
      return await new Promise((resolve, reject) => {
        this.pending.set(traceId, { resolve, reject, prompt, images, submitted: false, attachmentAccepted: false });
        this.send({
          type: 'run',
          id: traceId,
          config: {
            appName: this.profile.appName,
            browserHostDescriptorPath: this.profile.descriptorPath,
            browserDiagnosticsPath: path.join(this.profile.home, 'runtime', 'dev-chat', 'diagnostics'),
            turnTimeoutMs: 1_800_000,
            autoApproveToolCalls: false,
            useSavedChats: false
          },
          turn: {
            traceId,
            modelId: 'gpt-5.6-sol',
            requestedModel: DEV_WEB_HIGH_MODEL,
            reasoning,
            modelFamily,
            capabilities: {
              solAvailable: true,
              extraHighAvailable: false,
              proAvailable: false,
              localToolsEnabled: false
            },
            ...(prepareResume ? { resumeAvailable: true } : {}),
            ...(retainConversation ? { retainConversation: true } : {}),
            ...(requireRetainedConversation ? { requireRetainedConversation: true } : {}),
            ...(conversationKey ? { conversationKey } : {})
          }
        }).catch(error => {
          this.pending.delete(traceId);
          reject(error);
        });
      });
    } finally {
      this.active = false;
    }
  }

  async close() {
    const child = this.child;
    this.child = null;
    this.ready = null;
    for (const pending of this.pending.values()) pending.reject(fail('DEV_UNAVAILABLE', 'DEV browser helper closed'));
    this.pending.clear();
    if (!child) return;
    try { await new Promise(resolve => child.stdin.end(resolve)); } catch {}
    if (child.exitCode === null) child.kill();
  }
}

export function writeDevWebReceipt(projectDir, file, receipt) {
  const absolute = assertSafeProjectRelative(projectDir, file, 'Receipt path');
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  return absolute;
}
