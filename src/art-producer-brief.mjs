import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const SHA256 = /^[a-f0-9]{64}$/i;
const HEAD = /^[a-f0-9]{40}$/i;
const ID = /^S\d{2,3}$/;
const VIEWPORTS = ['desktop', 'portrait'];
const MAX_CANDIDATES = 2;

const hasText = x => typeof x === 'string' && x.trim().length >= 12;
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Verify real image header bytes, not only path extension. Full decoding is a separate gate. */
function hasImageHeader(file, name) {
  const data = fs.readFileSync(file);
  const ext = path.extname(name).toLowerCase();
  if (ext === '.png') {
    return data.length >= 24 &&
      data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
      data.toString('ascii', 12, 16) === 'IHDR' &&
      data.readUInt32BE(16) > 0 && data.readUInt32BE(20) > 0;
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    return data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 &&
      data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9;
  }
  if (ext === '.webp') {
    return data.length >= 16 &&
      data.toString('ascii', 0, 4) === 'RIFF' &&
      data.toString('ascii', 8, 12) === 'WEBP' &&
      ['VP8 ', 'VP8L', 'VP8X'].includes(data.toString('ascii', 12, 16));
  }
  return false;
}

/** No sandbox escape, symlink escape or fabricated/unreadable reference allowed. */
function verifiedFile(projectDir, candidate, expectedHash, issues, field, image = false) {
  if (typeof candidate !== 'string' || !candidate || path.isAbsolute(candidate) ||
      candidate.includes('\\') || !candidate.split('/').every(part => part && part !== '..' && part !== '.')) {
    issues.push(`${field} must be a project-relative path without traversal`);
    return;
  }
  const root = fs.realpathSync(projectDir);
  const absolute = path.resolve(root, candidate);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    issues.push(`${field} does not refer to an existing file`);
    return;
  }
  const real = fs.realpathSync(absolute);
  if (!real.startsWith(root + path.sep)) {
    issues.push(`${field} escapes project directory`);
    return;
  }
  if (image && (!/\\.(png|jpe?g|webp)$/i.test(candidate) ||
      !hasImageHeader(real, candidate)))
    issues.push(`${field} must reference a PNG, JPEG or WebP with a valid image header`);
  if (typeof expectedHash !== 'string' || !SHA256.test(expectedHash) ||
      digest(real) !== expectedHash.toLowerCase())
    issues.push(`${field} SHA-256 missing or does not match actual file bytes`);
}

/** Read-only source-bound planning guard. Not proof that a subagent has Image Gen. */
export function validateArtProducerBrief(projectDir, brief) {
  const issues = [];
  if (!brief || typeof brief !== 'object' || Array.isArray(brief))
    return { status: 'BLOCKED_ART_BRIEF', issues: ['brief must be a JSON object'] };
  const currentHead = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: projectDir, encoding: 'utf8'
  });
  const head = currentHead.status === 0 ? currentHead.stdout.trim() : null;
  if (!head || !HEAD.test(head)) issues.push('project does not expose a git HEAD');
  if (typeof brief.sourceHead !== 'string' || !HEAD.test(brief.sourceHead) ||
      head !== brief.sourceHead) issues.push('sourceHead must equal current exact git HEAD');
  if (brief.schemaVersion !== 1) issues.push('schemaVersion must be 1');
  if (typeof brief.sceneId !== 'string' || !ID.test(brief.sceneId))
    issues.push('sceneId must be an S-numbered scene');
  if (typeof brief.cue?.id !== 'string' || !brief.cue.id ||
      !Array.isArray(brief.cue.at) || brief.cue.at.length !== 2 ||
      !brief.cue.at.every(n => Number.isInteger(n) && n >= 0))
    issues.push('cue must contain authored id and [chunk, paragraph] position');

  const cast = brief.requiredCast;
  if (!Array.isArray(cast) || cast.length === 0 ||
      cast.some(x => typeof x !== 'string' || !x.trim()) ||
      new Set(cast).size !== cast.length)
    issues.push('requiredCast must be a nonempty list of unique character IDs');
  const validCast = Array.isArray(cast) ? cast.filter(x => typeof x === 'string') : [];
  const actions = brief.narrativeActions;
  if (!Array.isArray(actions) || actions.length === 0 ||
      actions.some(a => !validCast.includes(a?.character) || !hasText(a?.action)))
    issues.push('narrativeActions must describe substantive authored actions for cast members');
  if (!hasText(brief.sceneContinuity))
    issues.push('sceneContinuity must describe preceding/following scene events');

  const refs = brief.characterReferences;
  if (!Array.isArray(refs) || refs.length === 0)
    issues.push('characterReferences must contain real reference pixels');
  else {
    const seen = new Set();
    for (const [i, ref] of refs.entries()) {
      if (!validCast.includes(ref?.character)) issues.push(`characterReferences[${i}] has unknown character`);
      if (seen.has(ref?.character)) issues.push(`characterReferences[${i}] duplicates a character`);
      seen.add(ref?.character);
      verifiedFile(projectDir, ref?.path, ref?.sha256, issues, `characterReferences[${i}]`, true);
    }
    for (const character of validCast)
      if (!seen.has(character)) issues.push(`character ${character} has no actual reference image`);
  }
  if (!Array.isArray(brief.forbiddenProps) || brief.forbiddenProps.some(x => typeof x !== 'string'))
    issues.push('forbiddenProps must be an array of strings (possibly empty)');
  for (const viewport of VIEWPORTS) {
    const item = brief[viewport];
    if (!hasText(item?.composition) || !hasText(item?.framing) ||
        !Array.isArray(item?.requiredVisibleCast) ||
        item.requiredVisibleCast.length !== validCast.length ||
        item.requiredVisibleCast.some(x => !validCast.includes(x)) ||
        new Set(item.requiredVisibleCast).size !== validCast.length)
      issues.push(`${viewport} must specify substantive composition/framing and all required visible cast`);
  }
  if (!Array.isArray(brief.qualityAcceptance) || brief.qualityAcceptance.length < 3 ||
      brief.qualityAcceptance.some(x => !hasText(x)))
    issues.push('qualityAcceptance must specify at least 3 measurable art checks');
  if (!Number.isInteger(brief.candidateNumber) || brief.candidateNumber < 1 ||
      brief.candidateNumber > MAX_CANDIDATES)
    issues.push('candidateNumber exceeds bounded maximum of 2; stop and escalate');
  if (brief.candidateNumber === 2) {
    const prior = brief.priorRejection;
    if (prior?.candidateNumber !== 1 || !hasText(prior?.revision) ||
        !Array.isArray(prior?.findings) || prior.findings.length === 0 ||
        prior.findings.some(x => !hasText(x)))
      issues.push('second candidate needs concrete pixel-backed findings and revised brief');
    verifiedFile(projectDir, prior?.evidencePath, prior?.sha256, issues, 'priorRejection');
  } else if (brief.candidateNumber === 1 && brief.priorRejection != null) {
    issues.push('first candidate cannot claim a previous failed generation');
  }
  return {
    status: issues.length ? 'BLOCKED_ART_BRIEF' : 'READY_TO_GENERATE',
    currentHead: head,
    candidateNumber: brief.candidateNumber ?? null,
    maxCandidatesPerCueVariant: MAX_CANDIDATES,
    toolAvailability: 'NOT_ATTESTED', // Always separate: host capability challenge must pass.
    issues
  };
}
