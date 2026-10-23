import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolveAuthoredSceneId } from './narrative-source-resolver.mjs';
import { authorizeArtCandidate } from './art-candidate-ledger.mjs';

const SHA256 = /^[a-f0-9]{64}$/i;
const HEAD = /^[a-f0-9]{40}$/i;
const VIEWPORTS = ['desktop', 'portrait'];
const MAX_CANDIDATES = 2;
const SOURCE_BOUND_BRIEF = /SOURCE_BOUND_(?:REPAIR_)?BRIEF$/;

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
  if (image && (!/\.(png|jpe?g|webp)$/i.test(candidate) ||
      !hasImageHeader(real, candidate)))
    issues.push(`${field} must reference a PNG, JPEG or WebP with a valid image header`);
  if (typeof expectedHash !== 'string' || !SHA256.test(expectedHash) ||
      digest(real) !== expectedHash.toLowerCase())
    issues.push(`${field} SHA-256 missing or does not match actual file bytes`);
}

function safeProjectPath(candidate) {
  return typeof candidate === 'string' && candidate.length > 0 && !path.isAbsolute(candidate) &&
    !candidate.includes('\\') && candidate.split('/').every(part => part && part !== '.' && part !== '..');
}

function existingProjectFile(projectDir, candidate, issues, field) {
  if (!safeProjectPath(candidate)) {
    issues.push(`${field} must be a project-relative path without traversal`);
    return;
  }
  const root = fs.realpathSync(projectDir);
  const absolute = path.resolve(root, candidate);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    issues.push(`${field} does not refer to an existing file`);
    return;
  }
  if (!fs.realpathSync(absolute).startsWith(root + path.sep))
    issues.push(`${field} escapes project directory`);
}

function sourceBoundBriefIssues(projectDir, brief) {
  const issues = [];
  if (typeof brief.kind !== 'string' || !SOURCE_BOUND_BRIEF.test(brief.kind))
    issues.push('kind must identify a source-bound production brief');
  if (!hasText(brief.status) || !hasText(brief.narrativeCue) || !hasText(brief.locationTime))
    issues.push('source-bound brief status, narrativeCue and locationTime are required');
  existingProjectFile(projectDir, brief.narrativeSource, issues, 'narrativeSource');
  const cast = brief.requiredCast;
  if (!Array.isArray(cast) || cast.length === 0 || cast.some(x => typeof x !== 'string' || !x.trim()) ||
      new Set(cast).size !== cast.length)
    issues.push('requiredCast must be a nonempty list of unique character IDs');
  const validCast = Array.isArray(cast) ? cast.filter(x => typeof x === 'string') : [];
  const refs = brief.characterReferences;
  if (!Array.isArray(refs) || refs.length !== validCast.length)
    issues.push('characterReferences must provide one real reference pixel set per cast member');
  else {
    const seen = new Set();
    for (const [i, ref] of refs.entries()) {
      const character = ref?.id ?? ref?.character;
      if (!validCast.includes(character)) issues.push(`characterReferences[${i}] has unknown character`);
      if (seen.has(character)) issues.push(`characterReferences[${i}] duplicates a character`);
      seen.add(character);
      verifiedFile(projectDir, ref?.path, ref?.sha256, issues, `characterReferences[${i}]`, true);
    }
    for (const character of validCast)
      if (!seen.has(character)) issues.push(`character ${character} has no actual reference image`);
  }
  if (!Array.isArray(brief.priorFailureEvidence) || brief.priorFailureEvidence.length === 0)
    issues.push('priorFailureEvidence must contain existing source-bound failure evidence');
  else for (const [i, evidence] of brief.priorFailureEvidence.entries())
    existingProjectFile(projectDir, evidence, issues, `priorFailureEvidence[${i}]`);
  const repair = brief.repairIntent;
  if (!repair || typeof repair !== 'object' ||
      !Object.values(repair).some(value => Array.isArray(value) ? value.some(hasText) : hasText(value)))
    issues.push('repairIntent must contain substantive repair requirements');
  for (const viewport of ['portrait', 'landscape']) {
    const item = brief.dualFormat?.[viewport];
    if (!Number.isInteger(item?.width) || item.width < 1 || !Number.isInteger(item?.height) || item.height < 1 ||
        !hasText(item?.composition))
      issues.push(`dualFormat.${viewport} must specify dimensions and substantive composition`);
  }
  if (!Array.isArray(brief.forbidden) || brief.forbidden.some(x => typeof x !== 'string'))
    issues.push('forbidden must be an array of strings');
  if (!Array.isArray(brief.acceptance) || brief.acceptance.length < 3 || brief.acceptance.some(x => !hasText(x)))
    issues.push('acceptance must specify at least 3 substantive acceptance checks');
  const outputs = brief.outputPaths;
  if (!outputs || !safeProjectPath(outputs.portrait) || !safeProjectPath(outputs.landscape) ||
      outputs.portrait === outputs.landscape || !/\.png$/i.test(outputs.portrait) || !/\.png$/i.test(outputs.landscape))
    issues.push('outputPaths must contain distinct project-relative portrait and landscape PNG targets');
  else {
    for (const [format, output] of Object.entries(outputs)) {
      const root = fs.realpathSync(projectDir);
      const absolute = path.resolve(root, output);
      if (fs.existsSync(absolute)) issues.push(`outputPaths.${format} already exists and cannot be overwritten`);
    }
  }
  return issues;
}

/**
 * A committed brief cannot contain its own eventual Git HEAD: that is a
 * self-referential hash. Allow precisely the commit(s) which introduced this
 * brief (and sibling Stage 9.4 briefs) after sourceHead, but no change to
 * product code, narrative, references, manifests or other evidence.
 *
 * A sourceHead ancestor alone is insufficient: ALL intervening Git changes
 * must be new, committed brief JSONs with exactly the same sourceHead.
 * No dirty/uncommitted brief bytes can be silently substituted.
 */
function checkBriefOnlyCommitCurrentness(projectDir, brief, head, briefPath) {
  if (typeof briefPath !== 'string' || !briefPath) return false;
  const root = fs.realpathSync(projectDir);
  const full = path.resolve(projectDir, briefPath);
  const rel = path.relative(root, full).split(path.sep).join('/');
  const allowed = /^artifacts\/production-art\/stage\d+(?:\.\d+)?\/briefs\/[A-Za-z0-9._-]+\.json$/;
  if (!allowed.test(rel)) return false;
  try {
    if (!fs.statSync(full).isFile() || fs.realpathSync(full) !== full ||
        !fs.realpathSync(full).startsWith(root + path.sep)) return false;
    if (JSON.stringify(JSON.parse(fs.readFileSync(full, 'utf8'))) !== JSON.stringify(brief))
      return false;
  } catch { return false; }
  const git = (args, opts={}) => spawnSync('git',args,{
    cwd:projectDir,encoding:opts.encoding ?? 'utf8',maxBuffer:8*1024*1024,
    timeout:15000,windowsHide:true
  });
  if (git(['merge-base','--is-ancestor',brief.sourceHead,head]).status !== 0)
    return false;
  const changes = git(['diff','--no-renames','--name-status','-z',
    brief.sourceHead,head,'--']);
  if (changes.status !== 0 || !changes.stdout) return false;
  const records = changes.stdout.split('\0').filter(Boolean);
  if (!records.length || records.length % 2 !== 0) return false;
  let selected = false;
  for (let i=0;i<records.length;i+=2) {
    const status=records[i],candidate=records[i+1];
    if (status !== 'A' || !allowed.test(candidate)) return false;
    const file=path.resolve(root,candidate);
    try {
      if (!fs.statSync(file).isFile() || !fs.realpathSync(file).startsWith(root+path.sep))
        return false;
      const disk=fs.readFileSync(file);
      const committed=git(['show',head+':'+candidate],{encoding:'buffer'});
      if (committed.status !== 0 || !Buffer.isBuffer(committed.stdout) ||
          !disk.equals(committed.stdout)) return false;
      const sibling=JSON.parse(disk.toString('utf8'));
      if (sibling.schemaVersion!==1 || sibling.sourceHead!==brief.sourceHead ||
          !resolveAuthoredSceneId(projectDir, sibling.sceneId).ok) return false;
    } catch { return false; }
    if (candidate===rel) selected=true;
  }
  return selected;
}

/** Read-only source-bound planning guard. Not proof that a subagent has Image Gen. */
export function validateArtProducerBrief(projectDir, brief, {briefPath=null, ownerExceptionPath=null, ownerExceptionSha256=null, ownerApprovalObserved=false, candidateLedgerPath=null}={}) {
  const issues = [];
  if (!brief || typeof brief !== 'object' || Array.isArray(brief))
    return { status: 'BLOCKED_ART_BRIEF', issues: ['brief must be a JSON object'] };
  const currentHead = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: projectDir, encoding: 'utf8'
  });
  const head = currentHead.status === 0 ? currentHead.stdout.trim() : null;
  if (!head || !HEAD.test(head)) issues.push('project does not expose a git HEAD');
  const exactHead=typeof brief.sourceHead==='string' && HEAD.test(brief.sourceHead) &&
    head===brief.sourceHead;
  const briefOnlyCommit=!exactHead && head && HEAD.test(head) &&
    typeof brief.sourceHead==='string' && HEAD.test(brief.sourceHead) &&
    checkBriefOnlyCommitCurrentness(projectDir,brief,head,briefPath);
  if (!exactHead && !briefOnlyCommit)
    issues.push('sourceHead must equal current exact git HEAD, or be an ancestor separated only by committed Stage 9.4 brief additions');
  if (brief.schemaVersion !== 1) issues.push('schemaVersion must be 1');
  const sceneResolution = resolveAuthoredSceneId(projectDir, brief.sceneId);
  if (!sceneResolution.ok) issues.push('sceneId must resolve to a canonical narrative scene or legacy S-numbered identifier: ' + sceneResolution.code);
  const sourceBound = typeof brief.kind === 'string' && SOURCE_BOUND_BRIEF.test(brief.kind);
  if (sourceBound) {
    issues.push(...sourceBoundBriefIssues(projectDir, brief));
  } else {
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
  }
  const candidateAuthorization = Number.isInteger(brief.candidateNumber) && brief.candidateNumber > 0
    ? authorizeArtCandidate(projectDir, {
      sceneId: brief.sceneId, variant: brief.variant ?? 'pair',
      candidateNumber: brief.candidateNumber, sourceHead: brief.sourceHead,
      ownerExceptionPath, ownerExceptionSha256, ownerApprovalObserved,
      ledgerPath: candidateLedgerPath
    }) : { status: 'BLOCKED_CANDIDATE_SCOPE_INVALID', authorized: false };
  if (!candidateAuthorization.authorized) {
    issues.push(brief.candidateNumber > MAX_CANDIDATES && !ownerExceptionPath
      ? 'candidateNumber exceeds bounded maximum of 2; stop and escalate'
      : 'candidate authorization failed: ' + candidateAuthorization.status);
  }
  if (brief.candidateNumber >= 2) {
    if (sourceBound) {
      if (!Array.isArray(brief.priorFailureEvidence) || brief.priorFailureEvidence.length === 0)
        issues.push('subsequent source-bound candidate needs concrete prior failure evidence');
    } else {
      const prior = brief.priorRejection;
      if (prior?.candidateNumber !== brief.candidateNumber - 1 || !hasText(prior?.revision) ||
          !Array.isArray(prior?.findings) || prior.findings.length === 0 ||
          prior.findings.some(x => !hasText(x)))
        issues.push((brief.candidateNumber === 2 ? 'second' : 'subsequent') + ' candidate needs concrete pixel-backed findings and a revised brief');
      verifiedFile(projectDir, prior?.evidencePath, prior?.sha256, issues, 'priorRejection');
    }
  } else if (brief.candidateNumber === 1 && brief.priorRejection != null) {
    issues.push('first candidate cannot claim a previous failed generation');
  }
  return {
    status: issues.length ? 'BLOCKED_ART_BRIEF' : 'READY_TO_GENERATE',
    currentHead: head,
    sourceCurrentness: exactHead ? 'EXACT_HEAD' : briefOnlyCommit ? 'BRIEF_ONLY_COMMIT' : 'UNVERIFIED',
    candidateNumber: brief.candidateNumber ?? null,
    maxCandidatesPerCueVariant: candidateAuthorization.maxCandidates ?? MAX_CANDIDATES,
    candidateAuthorization: candidateAuthorization.status,
    toolAvailability: 'NOT_ATTESTED', // Always separate: host capability challenge must pass.
    issues
  };
}
