import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveCodexHome } from './ceos.mjs';
import { resolveRun } from './execution-engine.mjs';

const PRESENCE = new Set(['PRESENT', 'ABSENT']);
const SERVICE = new Set(['UNKNOWN', 'AVAILABLE', 'UNAVAILABLE', 'RATE_LIMITED', 'USAGE_LIMIT_REACHED']);
const CAPABILITY = 'image-generation';
export const IMAGE_GENERATION_TOOL = 'image_gen.imagegen';
const MAX_RUNTIME_CONTEXT_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CHALLENGE_TTL_SECONDS = 30 * 60;

function now() {
  return new Date().toISOString();
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function runtimeContextPaths({ homeDir = os.homedir(), codexHome } = {}) {
  const resolvedCodexHome = resolveCodexHome({ homeDir, codexHome });
  const root = path.join(resolvedCodexHome, 'ceos', 'runtime');
  return {
    codexHome: resolvedCodexHome,
    root,
    sessionFile: path.join(root, 'current-session.json'),
    turnFile: path.join(root, 'current-turn.json')
  };
}

export function readRuntimeContext(options = {}) {
  const paths = runtimeContextPaths(options);
  let session = null;
  let turn = null;
  try { session = readJson(paths.sessionFile); } catch {}
  try { turn = readJson(paths.turnFile); } catch {}
  return { ...paths, session, turn };
}

function currentContext(options = {}) {
  const context = readRuntimeContext(options);
  if (!context.session?.sessionId) throw new Error('CEOS SessionStart freshness marker is missing; ensure the CEOS Codex hooks are installed and trusted');
  if (!context.turn?.turnId) throw new Error('CEOS UserPromptSubmit freshness marker is missing; start the capability challenge from an active user turn');
  if (context.turn.sessionId !== context.session.sessionId) throw new Error('CEOS runtime session/turn markers disagree; refuse stale capability evidence');
  const age = Date.now() - Date.parse(context.turn.observedAt || 0);
  if (!Number.isFinite(age) || age < 0 || age > MAX_RUNTIME_CONTEXT_AGE_MS) {
    throw new Error('CEOS runtime turn marker is stale; refuse capability attestation');
  }
  return context;
}

function challengeRoot(runDir) {
  return path.join(runDir, 'capability-attestation');
}

function challengeFile(runDir, challengeId) {
  return path.join(challengeRoot(runDir), 'challenges', `${challengeId}.json`);
}

function attestationFile(runDir) {
  return path.join(challengeRoot(runDir), `${CAPABILITY}.json`);
}

function normalizePresence(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!PRESENCE.has(normalized)) throw new Error(`presence must be one of: ${[...PRESENCE].join(', ')}`);
  return normalized;
}

function normalizeServiceAvailability(value) {
  const normalized = String(value || 'UNKNOWN').trim().toUpperCase();
  if (!SERVICE.has(normalized)) throw new Error(`serviceAvailability must be one of: ${[...SERVICE].join(', ')}`);
  return normalized;
}

export function beginCapabilityChallenge(projectDir, runRef = 'latest', {
  homeDir = os.homedir(),
  codexHome,
  capability = CAPABILITY,
  ttlSeconds = DEFAULT_CHALLENGE_TTL_SECONDS
} = {}) {
  if (capability !== CAPABILITY) throw new Error(`unsupported capability: ${capability}`);
  const ttl = Number(ttlSeconds);
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 6 * 60 * 60) throw new Error('ttlSeconds must be an integer from 60 to 21600');

  const context = currentContext({ homeDir, codexHome });
  const resolved = resolveRun(projectDir, runRef);
  if (resolved.run.pipeline !== 'production-art') throw new Error('native image capability challenges are only valid for production-art runs');
  if (resolved.run.verdict) throw new Error(`run is already terminal: ${resolved.run.verdict}`);
  if (resolved.run.nextStage !== 'GENERATING') throw new Error(`capability challenge is valid only immediately before GENERATING; current next stage is ${resolved.run.nextStage}`);

  const challengeId = `cap-${crypto.randomBytes(10).toString('hex')}`;
  const nonce = crypto.randomBytes(24).toString('base64url');
  const createdAt = now();
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  const stored = {
    schemaVersion: 1,
    challengeId,
    runId: resolved.run.runId,
    capability,
    sessionId: context.session.sessionId,
    turnId: context.turn.turnId,
    createdAt,
    expiresAt,
    nonceSha256: sha256(nonce),
    status: 'OPEN',
    source: 'ceos-in-session-challenge'
  };
  atomicWriteJson(challengeFile(resolved.runDir, challengeId), stored);
  return {
    schemaVersion: 1,
    challengeId,
    runId: stored.runId,
    capability,
    sessionId: stored.sessionId,
    turnId: stored.turnId,
    createdAt,
    expiresAt,
    nonce,
    instruction: `Inspect only the callable tools exposed to this current Codex turn. Do not invoke image generation as a probe. If ${IMAGE_GENERATION_TOOL} is callable, attest PRESENT with serviceAvailability UNKNOWN. If it is not callable, attest ABSENT with serviceAvailability UNKNOWN.`
  };
}

export function respondCapabilityChallenge(projectDir, runRef = 'latest', {
  homeDir = os.homedir(),
  codexHome,
  challengeId,
  nonce,
  presence,
  serviceAvailability = 'UNKNOWN',
  serviceEvidence = null,
  observedTool
} = {}) {
  if (!challengeId || !nonce) throw new Error('challengeId and nonce are required');
  const normalizedPresence = normalizePresence(presence);
  const normalizedService = normalizeServiceAvailability(serviceAvailability);
  if (normalizedService !== 'UNKNOWN' && !(typeof serviceEvidence === 'string' && serviceEvidence.trim())) {
    throw new Error('non-UNKNOWN serviceAvailability requires explicit serviceEvidence from a real capability invocation');
  }

  const context = currentContext({ homeDir, codexHome });
  const resolved = resolveRun(projectDir, runRef);
  const file = challengeFile(resolved.runDir, String(challengeId));
  if (!fs.existsSync(file)) throw new Error(`capability challenge not found: ${challengeId}`);
  const challenge = readJson(file);

  if (challenge.status !== 'OPEN') throw new Error(`capability challenge is not open: ${challenge.status}`);
  if (challenge.runId !== resolved.run.runId || challenge.capability !== CAPABILITY) throw new Error('capability challenge does not belong to this run/capability');
  if (challenge.sessionId !== context.session.sessionId || challenge.turnId !== context.turn.turnId) {
    throw new Error('capability challenge belongs to a different Codex session/turn');
  }
  if (Date.now() > Date.parse(challenge.expiresAt || 0)) throw new Error('capability challenge expired');
  if (sha256(String(nonce)) !== challenge.nonceSha256) throw new Error('capability challenge nonce mismatch');

  const canonicalObservedTool = normalizedPresence === 'PRESENT'
    ? (observedTool || IMAGE_GENERATION_TOOL)
    : null;
  if (normalizedPresence === 'PRESENT' && canonicalObservedTool !== IMAGE_GENERATION_TOOL) {
    throw new Error(`PRESENT image-generation attestation must identify ${IMAGE_GENERATION_TOOL}`);
  }

  const observedAt = now();
  const attestation = {
    schemaVersion: 1,
    runId: resolved.run.runId,
    capability: CAPABILITY,
    challengeId: challenge.challengeId,
    sessionId: context.session.sessionId,
    turnId: context.turn.turnId,
    observedAt,
    source: 'in-session-agent-observation',
    trustScope: 'run-session-turn',
    presence: normalizedPresence,
    serviceAvailability: normalizedService,
    observedTool: canonicalObservedTool,
    serviceEvidence: serviceEvidence ? String(serviceEvidence).trim() : null
  };

  atomicWriteJson(attestationFile(resolved.runDir), attestation);
  atomicWriteJson(file, { ...challenge, status: 'CONSUMED', consumedAt: observedAt });
  return { file: attestationFile(resolved.runDir), attestation };
}

export function readRunCapabilityAttestation(projectDir, runRef = 'latest', {
  homeDir = os.homedir(),
  codexHome
} = {}) {
  let context;
  let resolved;
  try {
    context = currentContext({ homeDir, codexHome });
    resolved = resolveRun(projectDir, runRef);
  } catch (error) {
    return { valid: false, reason: error.message, file: null, attestation: null };
  }

  const file = attestationFile(resolved.runDir);
  if (!fs.existsSync(file)) return { valid: false, reason: 'no run-scoped image-generation attestation', file, attestation: null };

  let attestation;
  try { attestation = readJson(file); }
  catch (error) { return { valid: false, reason: `invalid attestation JSON: ${error.message}`, file, attestation: null }; }

  const checks = [
    [attestation.schemaVersion === 1, 'unsupported attestation schema'],
    [attestation.runId === resolved.run.runId, 'run mismatch'],
    [attestation.capability === CAPABILITY, 'capability mismatch'],
    [attestation.source === 'in-session-agent-observation', 'source mismatch'],
    [attestation.sessionId === context.session.sessionId, 'session mismatch'],
    [attestation.turnId === context.turn.turnId, 'turn mismatch'],
    [PRESENCE.has(attestation.presence), 'invalid presence'],
    [SERVICE.has(attestation.serviceAvailability), 'invalid serviceAvailability']
  ];
  const failed = checks.find(([ok]) => !ok);
  if (failed) return { valid: false, reason: failed[1], file, attestation: null };

  const cfile = challengeFile(resolved.runDir, attestation.challengeId);
  let challenge;
  try { challenge = readJson(cfile); }
  catch { return { valid: false, reason: 'challenge evidence missing', file, attestation: null }; }
  if (challenge.status !== 'CONSUMED' || challenge.runId !== resolved.run.runId ||
      challenge.sessionId !== attestation.sessionId || challenge.turnId !== attestation.turnId) {
    return { valid: false, reason: 'challenge consumption/freshness mismatch', file, attestation: null };
  }

  return { valid: true, reason: null, file, attestation };
}
