import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { decodeProductionPng } from './art-output-gate.mjs';
import { inspectArtProgress } from './art-progress.mjs';
import { validateWebReview } from './web-delegation.mjs';
import { NARRATIVE_ART_ACCEPTANCE_V2 } from './narrative-art-acceptance.mjs';

export const EPISODE_ART_FINALIZATION_V1 = 'EPISODE_ART_FINALIZATION_V1';
const SHA = /^[a-f0-9]{64}$/i;
const HEAD = /^[a-f0-9]{40}$/i;
const SCENE = /^S\d{2,3}$/;
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,79}$/;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const unique = list => new Set(list).size === list.length;
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const ownArray = value => Array.isArray(value) && value.length > 0 && value.length <= 500;

function safePath(value) {
  return nonempty(value) && !path.isAbsolute(value) &&
    !/^[A-Za-z]:[\\/]/.test(value) && !value.includes('\\') &&
    !value.includes('\0') && value.split('/').every(segment => segment && segment !== '.' && segment !== '..');
}

function readPinned(project, ref, problems, name, { json = true } = {}) {
  if (!ref || !safePath(ref.path) || !SHA.test(String(ref.sha256 ?? ''))) {
    problems.push(name + '_INVALID_REFERENCE');
    return null;
  }
  try {
    const file = fs.realpathSync(path.resolve(project, ref.path));
    if (!file.startsWith(project + path.sep) || !fs.statSync(file).isFile())
      throw new Error('path outside project');
    const bytes = fs.readFileSync(file);
    if (digest(bytes) !== ref.sha256.toLowerCase()) {
      problems.push(name + '_HASH_MISMATCH');
      return null;
    }
    if (!json) return bytes;
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    problems.push(name + '_UNREADABLE');
    return null;
  }
}

function git(project, args) {
  const result = spawnSync('git', args, { cwd: project, encoding: 'utf8', timeout: 15000, windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : null;
}

function sourceCurrentness(project, baseline, problems) {
  const actualHead = git(project, ['rev-parse', 'HEAD']);
  if (!HEAD.test(String(actualHead ?? ''))) {
    problems.push('CURRENT_GIT_HEAD_UNAVAILABLE');
    return null;
  }
  if (!HEAD.test(String(baseline ?? ''))) {
    problems.push('SOURCE_HEAD_INVALID');
    return actualHead;
  }
  if (actualHead !== baseline) {
    const ancestry = spawnSync('git', ['merge-base', '--is-ancestor', baseline, actualHead],
      { cwd: project, encoding: 'utf8', timeout: 15000, windowsHide: true });
    if (ancestry.status !== 0) {
      problems.push('SOURCE_HEAD_NOT_ANCESTOR');
      return actualHead;
    }
    const diff = spawnSync('git', ['diff', '--name-only', '-z', baseline, actualHead, '--'],
      { cwd: project, timeout: 15000, windowsHide: true });
    if (diff.status !== 0) problems.push('SOURCE_DIFF_UNAVAILABLE');
    else {
      const changed = diff.stdout.toString('utf8').split('\0').filter(Boolean);
      if (changed.some(file => !file.startsWith('artifacts/')))
        problems.push('SOURCE_DRIFT_OUTSIDE_EVIDENCE');
    }
  }
  return actualHead;
}

function verifyImages(project, pairs, problems) {
  const seenPaths = new Set();
  for (const pair of pairs) {
    for (const [format, minW, minH, ratio] of [['portrait',768,1152,2/3], ['landscape',1280,720,16/9]]) {
      const label = 'PAIR_' + pair.id + '_' + format.toUpperCase();
      const ref = pair[format];
      if (ref?.path && seenPaths.has(ref.path)) problems.push(label + '_DUPLICATE_PATH');
      if (ref?.path) seenPaths.add(ref.path);
      const bytes = readPinned(project, ref, problems, label, { json:false });
      if (!bytes) continue;
      try {
        const dimensions = decodeProductionPng(bytes);
        if (dimensions.width < minW || dimensions.height < minH ||
            Math.abs(dimensions.width / dimensions.height - ratio) > 0.055)
          problems.push(label + '_DIMENSIONS_INVALID');
      } catch { problems.push(label + '_PNG_INVALID'); }
    }
  }
}

function verifyReview(project, descriptor, sourceHead, problems, index) {
  const label = 'REVIEW_' + index;
  const review = readPinned(project, descriptor?.receipt, problems, label);
  if (!review) return [];
  // No manifest-supplied PASS, status or pixel flag can replace reviewer content.
  const checks = validateWebReview(review, {
    pipeline: 'production-art', phase: 'acceptance', currentHead: sourceHead,
    visual: true, assurance: 'visual-content',
    artAcceptanceProfile: NARRATIVE_ART_ACCEPTANCE_V2
  });
  if (checks.length) {
    problems.push(label + '_WEB_INVALID:' + checks.join('; '));
    return [];
  }
  if (!ownArray(review.visualEvidence)) {
    problems.push(label + '_VISUAL_EVIDENCE_MISSING');
    return [];
  }
  for (const [frameIndex, frame] of review.visualEvidence.entries()) {
    readPinned(project, frame, problems, label + '_PIXEL_' + frameIndex, { json: false });
    if (!nonempty(frame.observation) || frame.observation.trim().length < 20)
      problems.push(label + '_OBSERVATION_INVALID');
  }
  if (!descriptor?.raw || !readPinned(project, descriptor.raw, problems, label + '_RAW', { json:false }))
    problems.push(label + '_RAW_RESPONSE_REQUIRED');
  // Reviewer receipts can cover multiple scenes. Do not accept arbitrary claims
  // about which scenes were reviewed from the user-authored finalization manifest.
  return review.reviewedItems.filter(scene => SCENE.test(scene));
}

/**
 * Read-only art finalization based on current source and existing evidence.
 * Does not select/resume historical runs or waive damaged scope/checkpoints.
 * Its PASS is for episode ART only; platform/release acceptance stays separate.
 */
export function inspectEpisodeArtFinalization(projectDir, manifestPath) {
  const problems = [];
  const finish = (extra = {}) => ({
    schemaVersion: 1,
    status: problems.length ? 'NOT_VERIFIED' : 'PASS_EPISODE_ART_FINALIZATION',
    kind: EPISODE_ART_FINALIZATION_V1,
    problems: [...new Set(problems)],
    releaseReady: false,
    ...extra
  });
  let project;
  try { project = fs.realpathSync(path.resolve(projectDir)); }
  catch { return {schemaVersion:1,kind:EPISODE_ART_FINALIZATION_V1,status:'NOT_VERIFIED',
    releaseReady:false,problems:['PROJECT_UNAVAILABLE']}; }
  if (!safePath(manifestPath)) {
    problems.push('MANIFEST_UNSAFE_PATH');
    return finish();
  }
  let manifest;
  try {
    const file = fs.realpathSync(path.resolve(project, manifestPath));
    if (!file.startsWith(project + path.sep)) throw new Error('manifest outside project');
    manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    problems.push('MANIFEST_UNREADABLE');
    return finish();
  }
  if (manifest?.schemaVersion !== 1 || manifest?.kind !== EPISODE_ART_FINALIZATION_V1 ||
      !nonempty(manifest.episodeId)) {
    problems.push('MANIFEST_SCHEMA_INVALID');
    return finish();
  }
  const currentHead = sourceCurrentness(project, manifest.sourceHead, problems);
  if (!ownArray(manifest.sourceDependencies) ||
      !manifest.sourceDependencies.some(ref => ref?.path === 'narrative/assets.json'))
    problems.push('SOURCE_DEPENDENCIES_INCOMPLETE');
  else for (const [i, ref] of manifest.sourceDependencies.entries())
    readPinned(project, ref, problems, 'SOURCE_DEPENDENCY_' + i, {json:false});

  const scenes = Array.isArray(manifest.scenes) ? manifest.scenes : [];
  const pairs = Array.isArray(manifest.pairs) ? manifest.pairs : [];
  const sceneIds = scenes.map(item => item?.id);
  const pairIds = pairs.map(item => item?.id);
  if (!ownArray(manifest.scenes) || !ownArray(manifest.pairs) ||
      !sceneIds.every(id => SCENE.test(id)) || !unique(sceneIds) ||
      !pairIds.every(id => ID.test(id)) || !unique(pairIds) ||
      manifest.expectedScenes !== sceneIds.length || manifest.expectedPairs !== pairIds.length ||
      manifest.expectedPairs < 1) problems.push('INVENTORY_INVALID');
  const pairSet = new Set(pairIds);
  if (!scenes.every(item => item && pairSet.has(item.pairId)) ||
      pairIds.some(id => !scenes.some(scene => scene?.pairId === id)))
    problems.push('SCENE_PAIR_MAPPING_INCOMPLETE');
  if (ownArray(manifest.pairs)) verifyImages(project, manifest.pairs, problems);

  const historicalAcceptedPairs = new Set();
  if (!Array.isArray(manifest.progressIndexes) || manifest.progressIndexes.length > 50)
    problems.push('PROGRESS_INDEXES_INVALID');
  else for (const [i, ref] of manifest.progressIndexes.entries()) {
    if (!readPinned(project, ref, problems, 'PROGRESS_INDEX_' + i)) continue;
    let progress;
    try { progress = inspectArtProgress(project, ref.path); }
    catch { problems.push('PROGRESS_INDEX_' + i + '_INSPECTION_FAILED'); continue; }
    if (progress.status !== 'PASS_ART_PROGRESS_REVALIDATED' || progress.problems?.length) {
      problems.push('PROGRESS_INDEX_' + i + '_NOT_REVALIDATED');
      continue;
    }
    for (const batch of progress.batches ?? []) {
      if (batch.status !== 'PASS_BATCH_ACCEPTANCE_REVALIDATED') continue;
      for (const id of batch.pairs ?? []) {
        if (historicalAcceptedPairs.has(id)) problems.push('HISTORICAL_PAIR_DUPLICATED_' + id);
        historicalAcceptedPairs.add(id);
      }
    }
  }

  const independentScenes = new Set();
  if (!ownArray(manifest.reviews)) problems.push('INDEPENDENT_REVIEWS_REQUIRED');
  else for (const [i, ref] of manifest.reviews.entries()) {
    const reviewed = verifyReview(project, ref, manifest.sourceHead, problems, i);
    for (const id of reviewed) {
      if (!sceneIds.includes(id)) problems.push('REVIEW_' + i + '_UNKNOWN_SCENE_' + id);
      else independentScenes.add(id);
    }
  }
  const acceptedPairs = new Set(historicalAcceptedPairs);
  for (const scene of scenes) {
    if (independentScenes.has(scene.id)) acceptedPairs.add(scene.pairId);
    else if (!historicalAcceptedPairs.has(scene.pairId))
      problems.push('SCENE_MISSING_INDEPENDENT_ACCEPTANCE_' + String(scene.id));
  }
  for (const id of pairIds) if (!acceptedPairs.has(id)) problems.push('PAIR_NOT_ACCEPTED_' + id);
  for (const id of historicalAcceptedPairs) if (!pairSet.has(id))
    problems.push('HISTORICAL_PAIR_OUTSIDE_EPISODE_' + id);

  const runtime = readPinned(project, manifest.runtimeReport, problems, 'RUNTIME_REPORT');
  let captureCount = 0;
  if (runtime) {
    if (!String(runtime.status ?? '').startsWith('PASS') ||
        runtime.sourceHead !== manifest.sourceHead ||
        !Array.isArray(runtime.captures) ||
        ![runtime.consoleErrors, runtime.requestFailures, runtime.httpErrors].every(
          list => Array.isArray(list) && list.length === 0))
      problems.push('RUNTIME_REPORT_INVALID');
    const captureIds = new Set();
    for (const [i, cap] of (Array.isArray(runtime.captures) ? runtime.captures : []).entries()) {
      if (!cap?.screenshot || !cap?.screenshotSha256) {
        problems.push('RUNTIME_CAPTURE_' + i + '_REFERENCE_MISSING');
        continue;
      }
      if (captureIds.has(cap.screenshot)) problems.push('RUNTIME_CAPTURE_DUPLICATE_' + i);
      captureIds.add(cap.screenshot);
      readPinned(project, {path:cap.screenshot,sha256:cap.screenshotSha256}, problems,
        'RUNTIME_CAPTURE_' + i, {json:false});
      captureCount++;
    }
    if (!Number.isInteger(manifest.expectedRuntimeCaptures) ||
        manifest.expectedRuntimeCaptures < 1 || captureCount !== manifest.expectedRuntimeCaptures)
      problems.push('RUNTIME_COVERAGE_INCOMPLETE');
  }

  const narrative = readPinned(project, manifest.narrativeReport, problems, 'NARRATIVE_REPORT');
  if (narrative && (narrative.status !== 'PASS' || narrative.sourceHead !== manifest.sourceHead ||
      !Array.isArray(narrative.validatedScenes) || !unique(narrative.validatedScenes) ||
      narrative.validatedScenes.length !== sceneIds.length ||
      sceneIds.some(scene => !narrative.validatedScenes.includes(scene)) ||
      !Array.isArray(narrative.errors) || narrative.errors.length))
    problems.push('NARRATIVE_COVERAGE_INCOMPLETE');

  const reconciliation = readPinned(project, manifest.reconciliation, problems, 'RECONCILIATION');
  if (reconciliation && !(reconciliation.status === 'PASS' ||
      reconciliation.status === 'PASS_EP2_ART_RECONCILIATION' ||
      reconciliation.status === 'PASS_ART_PROGRESS_REVALIDATED'))
    problems.push('RECONCILIATION_NOT_PASSED');
  return finish({
    episodeId:manifest.episodeId,sourceHead:manifest.sourceHead,currentHead,
    coverage:{scenes:sceneIds.length,reviewedScenes:sceneIds.filter(id=>independentScenes.has(id) ||
      historicalAcceptedPairs.has(scenes.find(s=>s?.id===id)?.pairId)).length,
      pairs:pairIds.length,acceptedPairs:pairIds.filter(id=>acceptedPairs.has(id)).length,
      productionPng:pairIds.length * 2,runtimeCaptures:captureCount},
    historicalRunsSelected:false,historicalRunsModified:false
  });
}
