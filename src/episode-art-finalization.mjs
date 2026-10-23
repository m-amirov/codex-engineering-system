import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { decodeProductionPng } from './art-output-gate.mjs';
import { resolveEpisodeIdentity, expectedEpisodePath } from './narrative-source-resolver.mjs';
import { inspectArtProgress } from './art-progress.mjs';
import { validateWebReview } from './web-delegation.mjs';
import { extractStructuredResponse } from './dev-web-high-transport.mjs';
import { NARRATIVE_ART_ACCEPTANCE_V2 } from './narrative-art-acceptance.mjs';
import { NARRATIVE_ART_ACCEPTANCE_V3, validateArtReviewV3, isArtV3Accepted } from './narrative-art-acceptance-v3.mjs';

export const EPISODE_ART_FINALIZATION_V1 = 'EPISODE_ART_FINALIZATION_V1';
const SHA = /^[a-f0-9]{64}$/i;
const HEAD = /^[a-f0-9]{40}$/i;
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,119}$/;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const unique = list => new Set(list).size === list.length;
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const ownArray = value => Array.isArray(value) && value.length > 0 && value.length <= 500;

function safePath(value) {
  return nonempty(value) && !path.isAbsolute(value) &&
    !/^[A-Za-z]:[\\/]/.test(value) && !value.includes('\\') &&
    !value.includes('\0') && value.split('/').every(segment => segment && segment !== '.' && segment !== '..');
}

function normalizeAssetPath(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/^\/+/, '');
  return safePath(normalized) ? normalized : null;
}

function sameRef(left, right) {
  return !!left && !!right && normalizeAssetPath(left.path) === normalizeAssetPath(right.path) &&
    String(left.sha256 ?? '').toLowerCase() === String(right.sha256 ?? '').toLowerCase();
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
  const dirty = spawnSync('git', ['status','--porcelain=v1','-z','--untracked-files=all',
    '--','.',':(exclude)artifacts',':(exclude).ceos-runs'], {
    cwd:project,timeout:15000,windowsHide:true
  });
  if (dirty.status !== 0) problems.push('SOURCE_WORKTREE_INSPECTION_FAILED');
  else if (dirty.stdout.length) problems.push('SOURCE_WORKTREE_DIRTY');
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

function assetRecordEntries(assetsDocument) {
  if (assetsDocument?.assets && !Array.isArray(assetsDocument.assets) &&
      typeof assetsDocument.assets === 'object')
    return Object.entries(assetsDocument.assets).map(([id, record]) => [id, record]);
  if (Array.isArray(assetsDocument?.assets))
    return assetsDocument.assets.map(record => [record?.id, record]);
  return [];
}

function canonicalVariant(record, format) {
  const variant = format === 'landscape' ? (record?.variants?.landscape ?? record?.variants?.desktop) :
    record?.variants?.portrait;
  const assetPath = normalizeAssetPath(variant?.src ?? variant?.path);
  if (!assetPath || !SHA.test(String(variant?.sha256 ?? ''))) return null;
  return {
    path: assetPath,
    sha256: String(variant.sha256).toLowerCase(),
    dimensions: variant.dimensions ?? null
  };
}

function readAuthoritativeInventory(project, manifest, sourceDependencies, problems) {
  const inventory = manifest.authoritativeInventory;
  const expectedPaths = { episode: expectedEpisodePath(manifest.episodeId), graph: 'narrative/graph.json', assets: 'narrative/assets.json' };
  const documents = {};
  if (!inventory || typeof inventory !== 'object') {
    problems.push('AUTHORITATIVE_INVENTORY_REQUIRED');
    return null;
  }
  const dependencyMap = new Map((sourceDependencies ?? []).map(ref => [ref?.path, ref]));
  for (const [key, expectedPath] of Object.entries(expectedPaths)) {
    const ref = inventory[key];
    if (!ref || ref.path !== expectedPath) problems.push('AUTHORITATIVE_' + key.toUpperCase() + '_REFERENCE_INVALID');
    const dependency = dependencyMap.get(expectedPath);
    if (!dependency || !sameRef(dependency, ref))
      problems.push('AUTHORITATIVE_' + key.toUpperCase() + '_SOURCE_DEPENDENCY_MISMATCH');
    documents[key] = readPinned(project, ref, problems, 'AUTHORITATIVE_' + key.toUpperCase());
  }
  if (!documents.episode || !documents.graph || !documents.assets) return null;
  const episodeIdentity = resolveEpisodeIdentity(manifest.episodeId, documents.episode, documents.graph);
  if (!episodeIdentity.ok) problems.push(episodeIdentity.code);
  const episodeScenes = Array.isArray(documents.episode.scenes) ? documents.episode.scenes : [];
  const graphScenes = Array.isArray(documents.graph.scenes) ? documents.graph.scenes : [];
  if (!ownArray(episodeScenes) || !ownArray(graphScenes)) {
    problems.push('AUTHORITATIVE_SCENES_INVALID');
    return null;
  }
  const episodeIds = new Set(episodeScenes.map(scene => scene?.id));
  const graphById = new Map();
  for (const scene of graphScenes) {
    if (!ID.test(scene?.id)) problems.push('AUTHORITATIVE_GRAPH_SCENE_INVALID');
    else if (episodeIds.has(scene.id)) {
      if (graphById.has(scene.id)) problems.push('AUTHORITATIVE_GRAPH_SCENE_INVALID');
      else graphById.set(scene.id, scene);
    }
  }
  const assetMap = new Map(assetRecordEntries(documents.assets));
  const scenes = [];
  const sceneIds = new Set();
  for (const scene of episodeScenes) {
    if (!ID.test(scene?.id) || sceneIds.has(scene.id) || !ID.test(scene?.assetId)) {
      problems.push('AUTHORITATIVE_EPISODE_SCENE_INVALID');
      continue;
    }
    sceneIds.add(scene.id);
    const graphScene = graphById.get(scene.id);
    if (!graphScene || graphScene.assetId !== scene.assetId)
      problems.push('AUTHORITATIVE_SCENE_GRAPH_MAPPING_MISMATCH_' + scene.id);
    const record = assetMap.get(scene.assetId);
    if (!record) {
      problems.push('AUTHORITATIVE_ASSET_MISSING_' + scene.assetId);
      continue;
    }
    const portrait = canonicalVariant(record, 'portrait');
    const landscape = canonicalVariant(record, 'landscape');
    if (!portrait || !landscape) {
      problems.push('AUTHORITATIVE_ASSET_VARIANTS_INVALID_' + scene.assetId);
      continue;
    }
    scenes.push({id:scene.id,assetId:scene.assetId,portrait,landscape});
  }
  if (graphById.size !== sceneIds.size || [...graphById.keys()].some(id => !sceneIds.has(id)))
    problems.push('AUTHORITATIVE_GRAPH_COVERAGE_MISMATCH');
  const groups = new Map();
  for (const scene of scenes) {
    const key = scene.portrait.sha256 + ':' + scene.landscape.sha256;
    const group = groups.get(key) ?? {key,assetIds:new Set(),scenes:[],portrait:scene.portrait,landscape:scene.landscape};
    group.assetIds.add(scene.assetId);
    group.scenes.push(scene.id);
    groups.set(key, group);
  }
  return {documents, scenes, groups:[...groups.values()].map(group => ({...group,assetIds:[...group.assetIds].sort(),scenes:group.scenes.sort()})), assetMap};
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

function verifyManifestInventory(project, manifest, authoritative, problems) {
  const scenes = Array.isArray(manifest.scenes) ? manifest.scenes : [];
  const pairs = Array.isArray(manifest.pairs) ? manifest.pairs : [];
  const sceneIds = scenes.map(item => item?.id);
  const pairIds = pairs.map(item => item?.id);
  if (!ownArray(manifest.scenes) || !ownArray(manifest.pairs) ||
      !sceneIds.every(id => ID.test(id)) || !unique(sceneIds) ||
      !pairIds.every(id => ID.test(id)) || !unique(pairIds) ||
      manifest.expectedScenes !== sceneIds.length || manifest.expectedPairs !== pairIds.length ||
      manifest.expectedScenes !== authoritative.scenes.length || manifest.expectedPairs !== authoritative.groups.length)
    problems.push('INVENTORY_INVALID');
  const manifestByScene = new Map(scenes.map(scene => [scene?.id, scene]));
  const authoritativeByScene = new Map(authoritative.scenes.map(scene => [scene.id, scene]));
  if (sceneIds.length !== authoritativeByScene.size || [...authoritativeByScene.keys()].some(id => !manifestByScene.has(id)))
    problems.push('MANIFEST_SCENE_INVENTORY_MISMATCH');
  for (const expected of authoritative.scenes) {
    const actual = manifestByScene.get(expected.id);
    if (!actual || actual.assetId !== expected.assetId)
      problems.push('MANIFEST_SCENE_ASSET_MAPPING_MISMATCH_' + expected.id);
  }
  const pairById = new Map(pairs.map(pair => [pair?.id, pair]));
  if (pairIds.length !== authoritative.groups.length) problems.push('MANIFEST_PAIR_INVENTORY_MISMATCH');
  const groupByAssets = new Map(authoritative.groups.map(group => [group.assetIds.join('|'), group]));
  for (const pair of pairs) {
    if (!Array.isArray(pair?.assetIds) || !unique(pair.assetIds) || pair.assetIds.length < 1) {
      problems.push('MANIFEST_PAIR_ASSET_IDS_INVALID_' + String(pair?.id));
      continue;
    }
    const group = groupByAssets.get([...pair.assetIds].sort().join('|'));
    if (!group) {
      problems.push('MANIFEST_PAIR_INVENTORY_MISMATCH_' + String(pair?.id));
      continue;
    }
    if (!sameRef(pair.portrait, group.portrait) || !sameRef(pair.landscape, group.landscape))
      problems.push('MANIFEST_PAIR_SOURCE_MAPPING_MISMATCH_' + pair.id);
    for (const sceneId of group.scenes) {
      const scene = manifestByScene.get(sceneId);
      if (!scene || scene.pairId !== pair.id) problems.push('MANIFEST_SCENE_PAIR_MAPPING_MISMATCH_' + sceneId);
    }
  }
  for (const expected of authoritative.groups) {
    const matching = pairs.filter(pair => [...(pair?.assetIds ?? [])].sort().join('|') === expected.assetIds.join('|'));
    if (matching.length !== 1) problems.push('MANIFEST_PAIR_GROUP_MISSING_' + expected.assetIds.join('_'));
  }
  if (pairs.length) verifyImages(project, pairs, problems);
  return {scenes,pairs,sceneIds,pairIds,pairById,manifestByScene,authoritativeByScene};
}

function verifyRights(project, manifest, authoritative, problems) {
  const rights = readPinned(project, manifest.rightsManifest, problems, 'RIGHTS_MANIFEST');
  if (!rights) return;
  if (!Array.isArray(rights.entries)) {
    problems.push('RIGHTS_ENTRIES_INVALID');
    return;
  }
  const entries = new Map(rights.entries.map(entry => [normalizeAssetPath(entry?.path) + ':' + String(entry?.sha256 ?? '').toLowerCase(), entry]));
  for (const group of authoritative.groups) {
    for (const format of ['portrait','landscape']) {
      const ref = group[format];
      const entry = entries.get(ref.path + ':' + ref.sha256);
      if (!entry) {
        problems.push('RIGHTS_ENTRY_MISSING_' + ref.path);
        continue;
      }
      if (!nonempty(entry.licenseOrPermission) || /denied|blocked|revoked|invalid|missing/i.test(String(entry.approvalStatus ?? '')))
        problems.push('RIGHTS_ENTRY_INVALID_' + ref.path);
    }
  }
}

function verifySourceBoundArtifact(project, index, sourceHead, problems, label) {
  const start = problems.length;
  if (index?.kind !== 'STAGE9_4_SOURCE_BOUND_REVALIDATION' || index.status !== 'SOURCE_CURRENTNESS_REVALIDATED')
    problems.push(label + '_SOURCE_BOUND_SCHEMA_INVALID');
  if (index?.sourceHeads?.current !== sourceHead)
    problems.push(label + '_SOURCE_BOUND_HEAD_MISMATCH');
  if (index?.currentness?.historicalLedgerImmutable !== true ||
      index.currentness.acceptedPngsMutated !== false || index.currentness.generationInvoked !== false)
    problems.push(label + '_SOURCE_BOUND_MUTATION_OR_GENERATION');
  if (index?.visualReevaluation?.status !== 'NOT_REQUIRED' || index?.impact?.acceptedPairsUnaffected !== true ||
      index?.impact?.visualResultChangedPairs?.length || index?.impact?.deferredPairsRemainSeparate !== true)
    problems.push(label + '_SOURCE_BOUND_VISUAL_REEVALUATION_REQUIRED');
  if (!Array.isArray(index?.acceptedPairs) || !Array.isArray(index?.historicalLedger?.acceptedPairIds) ||
      index.acceptedPairs.length !== index.historicalLedger.acceptedPairIds.length ||
      !unique(index.historicalLedger.acceptedPairIds))
    problems.push(label + '_SOURCE_BOUND_ACCEPTED_SCOPE_INVALID');
  if (index?.historicalLedger?.path) {
    const ledger = readPinned(project, {path:index.historicalLedger.path,sha256:index.historicalLedger.sha256},
      problems, label + '_HISTORICAL_LEDGER');
    if (ledger?.boundary?.episodeFinalAcceptance === true || ledger?.boundary?.releaseReady === true)
      problems.push(label + '_HISTORICAL_LEDGER_PROMOTION_FORBIDDEN');
  } else problems.push(label + '_HISTORICAL_LEDGER_MISSING');
  for (const [i, dependency] of (index?.dependencyComparisons ?? []).entries()) {
    if (!dependency?.path || !dependency.current?.sha256 || !readPinned(project,
      {path:dependency.path,sha256:dependency.current.sha256}, problems,
      label + '_DEPENDENCY_' + i)) problems.push(label + '_DEPENDENCY_INVALID_' + i);
  }
  const mechanical = index?.mechanicalRevalidation;
  const mechanicalReceipt = mechanical?.path && readPinned(project,
    {path:mechanical.path,sha256:mechanical.sha256}, problems, label + '_MECHANICAL_RECEIPT');
  if (!mechanicalReceipt || mechanical.status !== 'PASS_ART_BATCH_MECHANICAL' ||
      mechanicalReceipt.status !== 'PASS_ART_BATCH_MECHANICAL' || !Array.isArray(mechanicalReceipt.inspected))
    problems.push(label + '_MECHANICAL_REVALIDATION_INVALID');
  for (const [i, accepted] of (index?.acceptedPairs ?? []).entries()) {
    if (!accepted?.pairId || !index.historicalLedger.acceptedPairIds.includes(accepted.pairId) ||
        accepted.visualResultChanged !== false || accepted.runtimeMappingUnchanged !== true ||
        !Array.isArray(accepted.assets) || accepted.assets.length !== 2)
      problems.push(label + '_ACCEPTED_PAIR_INVALID_' + i);
    for (const [j, asset] of (accepted?.assets ?? []).entries()) {
      if (!readPinned(project, {path:asset.path,sha256:asset.sha256}, problems,
        label + '_ACCEPTED_PAIR_' + i + '_ASSET_' + j, {json:false}))
        problems.push(label + '_ACCEPTED_ASSET_INVALID_' + i + '_' + j);
    }
  }
  return {valid:problems.length === start, acceptedPairs: new Set((index?.acceptedPairs ?? []).map(item => item.pairId))};
}

function verifyProgress(project, manifest, problems) {
  const acceptedPairs = new Set();
  if (!Array.isArray(manifest.progressIndexes) || manifest.progressIndexes.length > 50)
    problems.push('PROGRESS_INDEXES_INVALID');
  else for (const [i, ref] of manifest.progressIndexes.entries()) {
    if (!readPinned(project, ref, problems, 'PROGRESS_INDEX_' + i)) continue;
    let progress;
    try { progress = inspectArtProgress(project, ref.path); }
    catch { problems.push('PROGRESS_INDEX_' + i + '_INSPECTION_FAILED'); continue; }
    if (progress.status !== 'PASS_ART_PROGRESS_REVALIDATED' || progress.problems?.length) {
      const index = readPinned(project, ref, problems, 'PROGRESS_INDEX_' + i + '_SOURCE_BOUND', {json:true});
      const fallback = verifySourceBoundArtifact(project, index, manifest.sourceHead, problems, 'PROGRESS_INDEX_' + i);
      if (!fallback.valid) {
        problems.push('PROGRESS_INDEX_' + i + '_NOT_REVALIDATED');
        continue;
      }
      for (const pair of fallback.acceptedPairs) acceptedPairs.add(pair);
      continue;
    }
    for (const batch of progress.batches ?? []) {
      if (batch.status === 'PASS_BATCH_ACCEPTANCE_REVALIDATED')
        for (const id of batch.pairs ?? []) acceptedPairs.add(id);
    }
  }
  return acceptedPairs;
}

function normalizePixelEvidence(review) {
  if (!Array.isArray(review?.pixelEvidence)) return review;
  const visualEvidence = review.pixelEvidence.map(item => ({
    ref: item?.itemId,
    path: item?.path,
    sha256: item?.sha256,
    observation: Array.isArray(item?.observations) ? item.observations.join(' ') : item?.observation
  }));
  return {
    ...review,
    artAcceptanceProfile: review.artAcceptanceProfile ?? review.profile,
    visualEvidence,
    evidenceRefs: visualEvidence.map(item => item.ref),
    receivedEvidenceRefs: visualEvidence.map(item => item.ref)
  };
}

function legacyReviewIsStructurallyAccepted(review) {
  return review?.status === 'PASS' && review?.phase === 'acceptance' &&
    nonempty(review?.agent) &&
    (review?.artAcceptanceProfile === NARRATIVE_ART_ACCEPTANCE_V2 || review?.profile === NARRATIVE_ART_ACCEPTANCE_V2) &&
    review?.actualPixelsReceived === true && review?.episodeFinalAcceptance !== true &&
    review?.releaseReady !== true && review?.requiredRegeneration !== true &&
    Array.isArray(review?.unresolved) && review.unresolved.length === 0;
}

function verifyReview(project, descriptor, sourceHead, reconciliationByScene, problems, index) {
  const label = 'REVIEW_' + index;
  const review = readPinned(project, descriptor?.receipt, problems, label);
  if (!review) return [];
  const sceneIds = Array.isArray(descriptor?.sceneIds) ? descriptor.sceneIds :
    (Array.isArray(review.reviewedItems) ? review.reviewedItems.filter(id => ID.test(id)) : []);
  if (!ownArray(sceneIds) || !unique(sceneIds)) {
    problems.push(label + '_SCENE_SCOPE_INVALID');
    return [];
  }
  for (const sceneId of sceneIds) {
    const reconciliation = reconciliationByScene.get(sceneId);
    if (!reconciliation || reconciliation.receipt !== descriptor.receipt.path ||
        reconciliation.receiptSha256 !== descriptor.receipt.sha256)
      problems.push(label + '_RECONCILIATION_LINK_MISMATCH_' + sceneId);
  }
  const legacy = sceneIds.every(sceneId => reconciliationByScene.get(sceneId)?.receiptSourceHead !== sourceHead);
  if (legacy && !sceneIds.every(sceneId => reconciliationByScene.get(sceneId)?.provenance))
    problems.push(label + '_LEGACY_PROVENANCE_MISSING');
  const normalized = normalizePixelEvidence(review);
  const v3 = normalized.artAcceptanceProfile === NARRATIVE_ART_ACCEPTANCE_V3;
  if (Array.isArray(review.pixelEvidence)) for (const [i, item] of review.pixelEvidence.entries()) {
    const acceptedItem = v3 ? isArtV3Accepted(item?.acceptanceVerdict) : item?.acceptanceVerdict === 'PASS';
    if (String(item?.sourceReviewOverallStatus ?? '').startsWith('BLOCKED') &&
        !acceptedItem && item?.sourceVerdict !== 'PASS_SOURCE_PIXELS')
      problems.push(label + '_PIXEL_' + i + '_BLOCKED_ITEM_NOT_ACCEPTED');
    if (item?.actualPixelsReceivedInSourceReview !== true || !acceptedItem)
      problems.push(label + '_PIXEL_' + i + '_ACCEPTANCE_NOT_PASS');
  }
  const hasVisual = Array.isArray(normalized.visualEvidence) && normalized.visualEvidence.length > 0;
  if (hasVisual) {
    const checks = validateWebReview(normalized, {
      pipeline: 'production-art', phase: 'acceptance', currentHead: legacy ? null : sourceHead,
      visual: true, assurance: 'visual-content', artAcceptanceProfile: v3 ? NARRATIVE_ART_ACCEPTANCE_V3 : NARRATIVE_ART_ACCEPTANCE_V2
    });
    if (checks.length) {
      problems.push(label + '_WEB_INVALID:' + checks.join('; '));
      return [];
    }
  } else if (!legacyReviewIsStructurallyAccepted(review)) {
    problems.push(label + '_LEGACY_RECEIPT_NOT_ACCEPTED');
    return [];
  }
  if (!(v3 ? isArtV3Accepted(review.status) : review.status==='PASS') || review.actualPixelsReceived !== true ||
      !Array.isArray(review.unresolved) || review.unresolved.length)
    problems.push(label + '_NON_PASS_OR_UNRESOLVED');
  const framePaths = new Set();
  for (const [frameIndex, frame] of (hasVisual ? normalized.visualEvidence : []).entries()) {
    if (!safePath(frame?.path) || !SHA.test(String(frame?.sha256 ?? '')))
      problems.push(label + '_PIXEL_' + frameIndex + '_REFERENCE_INVALID');
    else {
      readPinned(project, frame, problems, label + '_PIXEL_' + frameIndex, {json:false});
      if (!nonempty(frame.observation) || frame.observation.trim().length < 20)
        problems.push(label + '_OBSERVATION_INVALID');
      framePaths.add(normalizeAssetPath(frame.path) + ':' + String(frame.sha256).toLowerCase());
    }
  }
  if (!hasVisual) for (const ref of (review.evidenceRefs ?? [])) framePaths.add(normalizeAssetPath(ref));
  for (const sceneId of sceneIds) {
    const canonical = reconciliationByScene.get(sceneId)?.canonical;
    if (!canonical) continue;
    const productionRefs = [canonical.portrait,canonical.landscape];
    if (!productionRefs.some(ref => framePaths.has(ref.path + ':' + ref.sha256) || framePaths.has(ref.path)))
      problems.push(label + '_PRODUCTION_PIXEL_LINK_MISSING_' + sceneId);
  }
  const raw = descriptor?.raw && readPinned(project, descriptor.raw, problems, label + '_RAW', {json:false});
  // The current S30-S34 receipt is an existing aggregate pixelEvidence
  // artifact without a raw transport file. Direct DEV receipts still require
  // their raw response; this exception is limited to the hash-pinned native
  // aggregate format, which is validated item by item above.
  if (!legacy && !raw && !Array.isArray(review.pixelEvidence)) {
    problems.push(label + '_RAW_RESPONSE_REQUIRED');
    return [];
  }
  if (!legacy && raw) {
    const extraction = extractStructuredResponse(raw.toString('utf8'));
    if (extraction.error || !extraction.parsed ||
        ['status','sourceHead','reviewedItems','evidenceRefs','receivedEvidenceRefs',
         'actualPixelsReceived','decision','findings','unresolved','visualEvidence',
         ...(v3 ? ['requiredCast','wardrobeAssessments'] : [])].some(
          key => JSON.stringify(extraction.parsed[key]) !== JSON.stringify(review[key]))) {
      problems.push(label + '_RAW_RECEIPT_MISMATCH');
      return [];
    }
    if (review.normalization?.rawResponseSha256 && review.normalization.rawResponseSha256 !== digest(raw))
      problems.push(label + '_RAW_DIGEST_MISMATCH');
  }
  return [...new Set(sceneIds)];
}

function verifyRuntime(project, manifest, inventory, mapping, problems) {
  const runtime = readPinned(project, manifest.runtimeReport, problems, 'RUNTIME_REPORT');
  let captureCount = 0;
  const capturedScenes = new Set();
  if (!runtime) return captureCount;
  if (!String(runtime.status ?? '').startsWith('PASS') || runtime.sourceHead !== manifest.sourceHead ||
      !Array.isArray(runtime.captures) ||
      ![runtime.consoleErrors, runtime.requestFailures, runtime.httpErrors].every(
        list => Array.isArray(list) && list.length === 0))
    problems.push('RUNTIME_REPORT_INVALID');
  const captureIds = new Set();
  for (const [i, cap] of (Array.isArray(runtime.captures) ? runtime.captures : []).entries()) {
    if (!cap?.sceneId || !cap?.assetId || !['portrait','landscape'].includes(cap?.format) || !cap?.source)
      problems.push('RUNTIME_CAPTURE_' + i + '_MAPPING_MISSING');
    else {
      const authored = inventory.authoritativeByScene.get(cap.sceneId);
      const expectedPair = authored && mapping.manifestByScene.get(cap.sceneId)?.pairId &&
        mapping.pairById.get(mapping.manifestByScene.get(cap.sceneId).pairId);
      const expectedRef = authored?.[cap.format];
      if (!authored || cap.assetId !== authored.assetId)
        problems.push('RUNTIME_CAPTURE_' + i + '_ASSET_MAPPING_MISMATCH');
      if (!expectedPair || !expectedRef || normalizeAssetPath(cap.source) !== expectedRef.path)
        problems.push('RUNTIME_CAPTURE_' + i + '_SOURCE_MAPPING_MISMATCH');
      if (authored) capturedScenes.add(cap.sceneId);
    }
    if (!cap?.screenshot || !cap?.screenshotSha256) {
      problems.push('RUNTIME_CAPTURE_' + i + '_REFERENCE_MISSING');
      continue;
    }
    if (captureIds.has(cap.screenshot)) problems.push('RUNTIME_CAPTURE_DUPLICATE_' + i);
    captureIds.add(cap.screenshot);
    const screenshot = readPinned(project, {path:cap.screenshot,sha256:cap.screenshotSha256}, problems,
      'RUNTIME_CAPTURE_' + i, {json:false});
    if (screenshot && !screenshot.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))
      problems.push('RUNTIME_CAPTURE_' + i + '_NOT_PNG');
    captureCount++;
  }
  for (const scene of inventory.scenes) if (!capturedScenes.has(scene.id))
    problems.push('RUNTIME_SCENE_CAPTURE_MISSING_' + scene.id);
  if (!Number.isInteger(manifest.expectedRuntimeCaptures) || manifest.expectedRuntimeCaptures < 1 ||
      captureCount !== manifest.expectedRuntimeCaptures)
    problems.push('RUNTIME_COVERAGE_INCOMPLETE');
  return captureCount;
}

function verifyNarrative(project, manifest, mapping, problems) {
  const narrative = readPinned(project, manifest.narrativeReport, problems, 'NARRATIVE_REPORT');
  if (!narrative) return;
  const directPass = narrative.status === 'PASS' && narrative.sourceHead === manifest.sourceHead &&
    Array.isArray(narrative.validatedScenes) && unique(narrative.validatedScenes) &&
    narrative.validatedScenes.length === mapping.sceneIds.length &&
    mapping.sceneIds.every(scene => narrative.validatedScenes.includes(scene)) &&
    Array.isArray(narrative.errors) && narrative.errors.length === 0;
  const reconciliationPass = narrative.sourceHead === manifest.sourceHead &&
    narrative.technicalEvidence?.narrative?.sceneCount === mapping.sceneIds.length &&
    narrative.technicalEvidence.narrative.sceneMapping === 'PASS';
  if (!directPass && !reconciliationPass) problems.push('NARRATIVE_COVERAGE_INCOMPLETE');
}

function verifyReconciliation(project, manifest, inventory, problems) {
  const reconciliation = readPinned(project, manifest.reconciliation, problems, 'RECONCILIATION');
  const byScene = new Map();
  if (!reconciliation) return byScene;
  const allowed = ['PASS','PASS_ART_PROGRESS_REVALIDATED',
    'SCENE_LEVEL_ACCEPTANCE_COMPLETE_EPISODE_WIDE_NOT_VERIFIED'];
  const episodeReconciliation = typeof reconciliation.status === 'string' &&
    /^PASS_EP\d+_ART_RECONCILIATION$/i.test(reconciliation.status);
  if ((!allowed.includes(reconciliation.status) && !episodeReconciliation) ||
      reconciliation.sourceHead !== manifest.sourceHead)
    problems.push('RECONCILIATION_NOT_PASSED');
  if (!Array.isArray(reconciliation.acceptedScenes) ||
      reconciliation.acceptedScenes.length !== inventory.scenes.length)
    problems.push('RECONCILIATION_SCENE_COVERAGE_INVALID');
  for (const entry of reconciliation.acceptedScenes ?? []) {
    if (!ID.test(entry?.sceneId) || byScene.has(entry.sceneId)) {
      problems.push('RECONCILIATION_SCENE_ENTRY_INVALID');
      continue;
    }
    const authored = inventory.scenes.find(scene => scene.id === entry.sceneId);
    if (!authored || entry.assetId !== authored.assetId) {
      problems.push('RECONCILIATION_SCENE_ASSET_MISMATCH_' + entry?.sceneId);
      continue;
    }
    if (!safePath(entry.receipt) || !SHA.test(String(entry.receiptSha256 ?? '')) ||
        !HEAD.test(String(entry.receiptSourceHead ?? '')) || !nonempty(entry.provenance)) {
      problems.push('RECONCILIATION_RECEIPT_LINK_INVALID_' + entry.sceneId);
      continue;
    }
    readPinned(project, {path:entry.receipt,sha256:entry.receiptSha256}, problems,
      'RECONCILIATION_RECEIPT_' + entry.sceneId);
    byScene.set(entry.sceneId, {...entry,canonical:authored});
  }
  if (byScene.size !== inventory.scenes.length || inventory.scenes.some(scene => !byScene.has(scene.id)))
    problems.push('RECONCILIATION_SCENE_COVERAGE_INVALID');
  return byScene;
}

function verifySupportingEvidence(project, manifest, problems) {
  if (!manifest.supportingEvidence) return;
  if (!Array.isArray(manifest.supportingEvidence) || manifest.supportingEvidence.length > 100) {
    problems.push('SUPPORTING_EVIDENCE_INVALID');
    return;
  }
  for (const [i, ref] of manifest.supportingEvidence.entries())
    readPinned(project, ref, problems, 'SUPPORTING_EVIDENCE_' + i, {json:false});
}

/**
 * Read-only art finalization based on current source and existing evidence.
 * It does not select/resume historical runs or waive damaged scope/checkpoints.
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
  const sourceDependencies = Array.isArray(manifest.sourceDependencies) ? manifest.sourceDependencies : [];
  if (!ownArray(manifest.sourceDependencies)) problems.push('SOURCE_DEPENDENCIES_INCOMPLETE');
  for (const [i, ref] of sourceDependencies.entries())
    readPinned(project, ref, problems, 'SOURCE_DEPENDENCY_' + i, {json:false});
  const authoritative = readAuthoritativeInventory(project, manifest, sourceDependencies, problems);
  if (!authoritative) return finish({episodeId:manifest.episodeId,sourceHead:manifest.sourceHead,currentHead,
    coverage:{scenes:0,reviewedScenes:0,pairs:0,acceptedPairs:0,productionPng:0,runtimeCaptures:0},
    historicalRunsSelected:false,historicalRunsModified:false});
  const mapping = verifyManifestInventory(project, manifest, authoritative, problems);
  if (!manifest.rightsManifest) problems.push('RIGHTS_MANIFEST_REQUIRED');
  else verifyRights(project, manifest, authoritative, problems);
  const historicalAcceptedPairs = verifyProgress(project, manifest, problems);
  const reconciliationByScene = verifyReconciliation(project, manifest, authoritative, problems);
  verifySupportingEvidence(project, manifest, problems);
  const independentScenes = new Set();
  if (!ownArray(manifest.reviews)) problems.push('INDEPENDENT_REVIEWS_REQUIRED');
  else for (const [i, descriptor] of manifest.reviews.entries()) {
    const reviewed = verifyReview(project, descriptor, manifest.sourceHead, reconciliationByScene, problems, i);
    for (const id of reviewed) {
      if (!mapping.sceneIds.includes(id)) problems.push('REVIEW_' + i + '_UNKNOWN_SCENE_' + id);
      else independentScenes.add(id);
    }
  }
  for (const scene of authoritative.scenes) {
    const reconciliation = reconciliationByScene.get(scene.id);
    if (!reconciliation || !independentScenes.has(scene.id))
      problems.push('SCENE_MISSING_INDEPENDENT_ACCEPTANCE_' + scene.id);
  }
  const acceptedPairs = new Set();
  for (const scene of authoritative.scenes) if (independentScenes.has(scene.id))
    acceptedPairs.add(mapping.manifestByScene.get(scene.id)?.pairId);
  for (const id of mapping.pairIds) if (!acceptedPairs.has(id)) problems.push('PAIR_NOT_ACCEPTED_' + id);
  const captureCount = verifyRuntime(project, manifest,
    {scenes:authoritative.scenes,authoritativeByScene:mapping.authoritativeByScene}, mapping, problems);
  verifyNarrative(project, manifest, mapping, problems);
  return finish({
    episodeId:manifest.episodeId,sourceHead:manifest.sourceHead,currentHead,
    coverage:{scenes:mapping.sceneIds.length,reviewedScenes:independentScenes.size,
      pairs:mapping.pairIds.length,acceptedPairs:acceptedPairs.size,
      productionPng:mapping.pairIds.length * 2,runtimeCaptures:captureCount},
    sourceBoundProgress:{acceptedPairs:[...historicalAcceptedPairs].sort(),validated:manifest.progressIndexes.length > 0},
    historicalRunsSelected:false,historicalRunsModified:false
  });
}
