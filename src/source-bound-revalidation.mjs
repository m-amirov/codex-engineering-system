import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { decodeProductionPng } from './art-output-gate.mjs';
import { executionStatus } from './execution-engine.mjs';
import { NARRATIVE_ART_ACCEPTANCE_V2 } from './narrative-art-acceptance.mjs';
import { NARRATIVE_ART_ACCEPTANCE_V3 } from './narrative-art-acceptance-v3.mjs';
import { validateWebReview } from './web-delegation.mjs';

const HASH = /^[a-f0-9]{64}$/i;
const HEAD = /^[a-f0-9]{40}$/i;
const safeId = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,60}$/.test(value);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const stable = value => JSON.stringify(value);
const unique = values => new Set(values).size === values.length;
const text = value => typeof value === 'string' && value.trim().length > 0;

function safeRelative(relative) {
  return typeof relative === 'string' && relative && !path.isAbsolute(relative) &&
    !/^[A-Za-z]:[\\/]/.test(relative) && !relative.includes('\\') && !relative.includes('\0') &&
    !relative.split('/').some(part => !part || part === '.' || part === '..');
}

function normalizeAssetPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) return null;
  const relative = value.slice(1);
  return safeRelative(relative) ? relative : null;
}

function projectBytes(project, relative) {
  if (!safeRelative(relative)) throw new Error(`UNSAFE_PROJECT_PATH:${relative}`);
  const resolved = fs.realpathSync(path.resolve(project, relative));
  const root = fs.realpathSync(project) + path.sep;
  if (!resolved.startsWith(root) || !fs.statSync(resolved).isFile()) throw new Error(`PROJECT_FILE_INVALID:${relative}`);
  return fs.readFileSync(resolved);
}

function historicalBytes(project, ref, relative) {
  if (!HEAD.test(String(ref)) || !safeRelative(relative)) throw new Error(`UNSAFE_HISTORICAL_SOURCE:${ref}:${relative}`);
  return execFileSync('git', ['show', `${ref}:${relative}`], { cwd: project });
}

function currentHead(project) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: project, encoding: 'utf8' }).trim();
  if (!HEAD.test(head)) throw new Error('CURRENT_HEAD_INVALID');
  return head;
}

function normalizedProjectPath(project, value) {
  if (!text(value)) return null;
  const absolute = path.resolve(project, value);
  const relative = path.relative(path.resolve(project), absolute).split(path.sep).join('/');
  return safeRelative(relative) ? relative : null;
}

function artifactPathFromReview(review) {
  const artifact = review?.evidenceArtifact;
  return typeof artifact === 'string' ? artifact : artifact?.path;
}

function visualContentRunContext(project, receiptPath, review) {
  const artifactPath = artifactPathFromReview(review);
  const candidatePaths = [...new Set([receiptPath, artifactPath].filter(text))];
  const runIds = new Set();
  for (const candidate of candidatePaths) {
    const relative = normalizedProjectPath(project, candidate);
    const match = relative && /^\.ceos-runs\/([A-Za-z0-9][A-Za-z0-9._-]*)\/evidence\/.+/.exec(relative);
    if (match) runIds.add(match[1]);
  }
  if (runIds.size > 1) return { error: 'WEB_HIGH_RUN_REFERENCE_MISMATCH' };
  if (!runIds.size) return { run: null, runId: null, reviewPath: null, integrity: null };

  const runId = [...runIds][0];
  let status;
  try { status = executionStatus(project, runId); }
  catch { return { error: 'WEB_HIGH_RUN_INTEGRITY_INVALID' }; }
  if (!status.integrity?.ok) return { error: 'WEB_HIGH_RUN_INTEGRITY_INVALID' };

  const reviewRelative = normalizedProjectPath(project, artifactPath || receiptPath);
  if (!reviewRelative || !reviewRelative.startsWith(`.ceos-runs/${runId}/evidence/`))
    return { error: 'WEB_HIGH_RUN_REFERENCE_MISMATCH' };
  const reviewSha256 = digest(projectBytes(project, reviewRelative));
  const linked = (status.run.routingTrace?.webReviews ?? []).filter(item => {
    const eventPath = normalizedProjectPath(project, item?.evidenceArtifact?.path);
    return eventPath === reviewRelative && String(item?.evidenceArtifact?.sha256 ?? '').toLowerCase() === reviewSha256;
  });
  if (linked.length !== 1) return { error: 'WEB_HIGH_RUN_TRACE_MISMATCH', run: status.run,
    runId, runDir: status.runDir, scopePath: `.ceos-runs/${runId}/scope.json`,
    reviewPath: reviewRelative, reviewSha256, integrity: status.integrity };

  const trackedFields = [
    'phase', 'agent', 'taskId', 'reviewTraceId', 'sourceHead', 'status',
    'artAcceptanceProfile', 'reviewedItems', 'evidenceRefs', 'receivedEvidenceRefs',
    'actualPixelsReceived', 'decision', 'findings', 'unresolved', 'resolvedFindings', 'visualEvidence'
  ];
  for (const key of trackedFields) {
    if (Object.hasOwn(review, key) && stable(review[key]) !== stable(linked[0][key]))
      return { error: 'WEB_HIGH_RUN_TRACE_MISMATCH' };
  }
  return { run: status.run, runId, runDir: status.runDir, scopePath: `.ceos-runs/${runId}/scope.json`,
    reviewPath: reviewRelative, reviewSha256, linkedReview: linked[0], integrity: status.integrity };
}

/**
 * Validate a persisted Web acceptance without conflating provider-attested strict
 * reviews with visual-content reviews. Trace-free visual reviews are accepted
 * only when the receipt is the exact review artifact of an intact, scope-locked
 * CEOS production-art run whose persisted review mode was visual-content.
 */
export function inspectWebHighAcceptance(projectDir, receiptRef, review, {
  expectedSourceHead = null,
  expectedScopeGroups = [],
  expectedAssets = []
} = {}) {
  const project = fs.realpathSync(path.resolve(projectDir));
  const receiptPath = typeof receiptRef === 'string' ? receiptRef : receiptRef?.path;
  const errors = [];
  if (!review || typeof review !== 'object' || Array.isArray(review))
    return { ok: false, assurance: null, identity: null, errors: ['WEB_HIGH_RECEIPT_INVALID'] };

  const linked = visualContentRunContext(project, receiptPath, review);
  if (linked.error) errors.push(linked.error);
  const run = linked.run;
  const assurance = run?.webReviewAssurance ?? review.assurance ?? review.webReviewAssurance ?? 'strict';
  const explicitlyVisualContent = review.assurance === 'visual-content' || review.webReviewAssurance === 'visual-content';
  if (!['strict', 'visual-content'].includes(assurance)) errors.push('WEB_HIGH_ASSURANCE_INVALID');
  if (explicitlyVisualContent && assurance !== 'visual-content') errors.push('WEB_HIGH_ASSURANCE_MISMATCH');
  if (assurance === 'visual-content' && !run) errors.push('WEB_HIGH_CONTENT_RUN_REQUIRED');

  if (!(review.artAcceptanceProfile===NARRATIVE_ART_ACCEPTANCE_V3 ? ['PASS','PASS_WITH_NOTES'].includes(review.status) : review.status==='PASS') || review.actualPixelsReceived !== true ||
      !HEAD.test(String(review.sourceHead ?? '')) ||
      (expectedSourceHead && review.sourceHead !== expectedSourceHead) ||
      !Array.isArray(review.evidenceRefs) || !review.evidenceRefs.length ||
      !Array.isArray(review.receivedEvidenceRefs) ||
      !review.evidenceRefs.every(reference => review.receivedEvidenceRefs.includes(reference)))
    errors.push('WEB_HIGH_RECEIPT_INCOMPLETE');

  if (assurance === 'strict') {
    if (!text(review.reviewTraceId) || !text(review.taskId)) errors.push('WEB_HIGH_TRACE_OR_TASK_ID_MISSING');
  } else if (assurance === 'visual-content' && run) {
    let scope = null;
    try { scope = JSON.parse(projectBytes(project, linked.scopePath).toString('utf8')); }
    catch { errors.push('WEB_HIGH_ASSURANCE_NOT_SCOPE_LOCKED'); }
    if (run.pipeline !== 'production-art' || run.webReviewMode !== 'enhanced' ||
        run.webDelegationPlan?.pipeline !== 'production-art' ||
        run.webDelegationPlan?.visual !== true || run.webDelegationPlan?.assurance !== 'visual-content' ||
        scope?.webReviewMode !== 'enhanced' || scope?.webReviewAssurance !== 'visual-content')
      errors.push('WEB_HIGH_ASSURANCE_NOT_SCOPE_LOCKED');
    if (review.phase !== 'acceptance' || ![NARRATIVE_ART_ACCEPTANCE_V2,NARRATIVE_ART_ACCEPTANCE_V3].includes(review.artAcceptanceProfile))
      errors.push('WEB_HIGH_ART_ACCEPTANCE_PROFILE_INVALID');
    const validation = validateWebReview(review, {
      pipeline: 'production-art', phase: 'acceptance',
      currentHead: expectedSourceHead ?? run.sourceAtStart?.head ?? null,
      visual: true, assurance: 'visual-content',
      artAcceptanceProfile: review.artAcceptanceProfile
    });
    for (const issue of validation) errors.push(`WEB_HIGH_REVIEW_INVALID:${issue}`);

    const inScope = new Set(Array.isArray(scope?.inScope) ? scope.inScope : []);
    if (!expectedScopeGroups.length || expectedScopeGroups.some(group =>
      !Array.isArray(group) || !group.length || !group.some(id => inScope.has(id))))
      errors.push('WEB_HIGH_SCOPE_MISMATCH');

    const frames = Array.isArray(review.visualEvidence) ? review.visualEvidence : [];
    const frameByPath = new Map(frames.map(frame => [normalizedProjectPath(project, frame?.path), frame]));
    for (const frame of frames) {
      const relative = normalizedProjectPath(project, frame?.path);
      if (!relative || !HASH.test(String(frame?.sha256 ?? '')) || !text(frame?.observation) ||
          frame.observation.trim().length < 20) {
        errors.push('WEB_HIGH_PIXEL_OBSERVATION_INVALID');
        continue;
      }
      try {
        if (digest(projectBytes(project, relative)) !== frame.sha256.toLowerCase())
          errors.push('WEB_HIGH_PIXEL_HASH_MISMATCH');
      } catch { errors.push('WEB_HIGH_PIXEL_SOURCE_MISSING'); }
    }
    for (const asset of expectedAssets) {
      const relative = normalizedProjectPath(project, asset?.path);
      const frame = relative && frameByPath.get(relative);
      if (!frame || String(frame.sha256).toLowerCase() !== String(asset?.sha256 ?? '').toLowerCase())
        errors.push('WEB_HIGH_PIXEL_SOURCE_MISMATCH');
    }
  }

  if (run && !linked.error) {
    if (assurance === 'visual-content' &&
        (run.webReviewAssurance !== 'visual-content' || run.webDelegationPlan?.assurance !== 'visual-content'))
      errors.push('WEB_HIGH_ASSURANCE_MISMATCH');
    if (assurance === 'strict' && run.webReviewAssurance && run.webReviewAssurance !== 'strict')
      errors.push('WEB_HIGH_ASSURANCE_MISMATCH');
  }

  const identity = assurance === 'visual-content' && linked.runId
    ? `${linked.runId}:${linked.reviewPath}:${linked.reviewSha256}`
    : text(review.reviewTraceId) ? review.reviewTraceId : null;
  return { ok: errors.length === 0, assurance, identity, runId: linked.runId ?? null,
    errors: [...new Set(errors)] };
}

function readJson(bytes, label) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch (error) { throw new Error(`${label}_BAD_JSON:${error.message}`); }
}

function diffRecords(before, after, pointer = '', output = []) {
  if (stable(before) === stable(after)) return output;
  const beforeObject = before !== null && typeof before === 'object';
  const afterObject = after !== null && typeof after === 'object';
  if (Array.isArray(before) || Array.isArray(after)) {
    const length = Math.max(Array.isArray(before) ? before.length : 0, Array.isArray(after) ? after.length : 0);
    for (let index = 0; index < length; index++)
      diffRecords(before?.[index], after?.[index], `${pointer}[${index}]`, output);
    return output;
  }
  if (beforeObject || afterObject) {
    const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();
    for (const key of keys)
      diffRecords(before?.[key], after?.[key], pointer ? `${pointer}.${key}` : key, output);
    return output;
  }
  output.push({ pointer, before: before ?? null, after: after ?? null });
  return output;
}

function dependencySnapshot(project, historicalRef, relative, historicalExpected) {
  const oldBytes = historicalBytes(project, historicalRef, relative);
  const newBytes = projectBytes(project, relative);
  const oldSha = digest(oldBytes);
  const newSha = digest(newBytes);
  const oldJson = readJson(oldBytes, `HISTORICAL_${relative}`);
  const newJson = readJson(newBytes, `CURRENT_${relative}`);
  if (oldSha !== String(historicalExpected?.sha256 ?? '').toLowerCase())
    throw new Error(`HISTORICAL_DEPENDENCY_HASH_MISMATCH:${relative}`);
  const changes = diffRecords(oldJson, newJson);
  return {
    path: relative,
    historicalRef,
    historical: { bytes: oldBytes.length, sha256: oldSha },
    current: { bytes: newBytes.length, sha256: newSha },
    changes
  };
}

function acceptedPairsFromLedger(ledger) {
  const ids = ledger.progress?.acceptedPairIds;
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length)
    throw new Error('HISTORICAL_LEDGER_ACCEPTED_SCOPE_INVALID');
  const details = new Map();
  for (const group of ledger.groups ?? []) {
    for (const detail of group.pairsDetail ?? []) {
      if (!safeId(detail?.id) || details.has(detail.id)) throw new Error('HISTORICAL_LEDGER_PAIR_DETAILS_INVALID');
      details.set(detail.id, detail);
    }
  }
  return ids.map(id => {
    const detail = details.get(id);
    if (!detail || !Array.isArray(detail.assets) || detail.assets.length !== 2)
      throw new Error(`HISTORICAL_LEDGER_PAIR_MISSING:${id}`);
    return { id, detail };
  });
}

function findAssetId(manifest, detail) {
  const expected = new Map(detail.assets.map(asset => [asset.path.includes('-landscape.') ? 'landscape' : 'portrait', asset]));
  const matches = [];
  for (const [assetId, asset] of Object.entries(manifest.assets ?? {})) {
    const portrait = asset?.variants?.portrait;
    const landscape = asset?.variants?.landscape;
    const portraitPath = normalizeAssetPath(portrait?.src);
    const landscapePath = normalizeAssetPath(landscape?.src);
    if (portraitPath === expected.get('portrait')?.path && portrait?.sha256 === expected.get('portrait')?.sha256 &&
        landscapePath === expected.get('landscape')?.path && landscape?.sha256 === expected.get('landscape')?.sha256)
      matches.push(assetId);
  }
  if (matches.length !== 1) throw new Error(`ACCEPTED_ASSET_MAPPING_AMBIGUOUS:${matches.join(',')}`);
  return matches[0];
}

function sceneForAsset(graph, assetId) {
  const matches = (graph.scenes ?? []).filter(scene => scene?.assetId === assetId);
  if (matches.length !== 1 || !safeId(matches[0]?.id)) throw new Error(`RUNTIME_SCENE_MAPPING_AMBIGUOUS:${assetId}`);
  return matches[0];
}

function pngRecord(project, format, descriptor) {
  const relative = normalizeAssetPath(descriptor?.src);
  if (!relative) throw new Error(`RUNTIME_ASSET_PATH_INVALID:${format}`);
  const bytes = projectBytes(project, relative);
  const decoded = decodeProductionPng(bytes);
  const dimensions = descriptor?.dimensions;
  if (!dimensions || decoded.width !== dimensions.width || decoded.height !== dimensions.height)
    throw new Error(`RUNTIME_ASSET_DIMENSIONS_MISMATCH:${relative}`);
  const sha256 = digest(bytes);
  if (sha256 !== String(descriptor?.sha256 ?? '').toLowerCase())
    throw new Error(`RUNTIME_ASSET_HASH_MISMATCH:${relative}`);
  return { format, path: relative, sha256, bytes: bytes.length, dimensions: { width: decoded.width, height: decoded.height } };
}

function pairMappings(project, historicalAssets, currentAssets, historicalGraph, currentGraph, ledgerPairs) {
  return ledgerPairs.map(({ id, detail }) => {
    const assetId = findAssetId(historicalAssets, detail);
    const currentAssetId = findAssetId(currentAssets, detail);
    if (assetId !== currentAssetId) throw new Error(`ACCEPTED_ASSET_ID_CHANGED:${id}`);
    const oldScene = sceneForAsset(historicalGraph, assetId);
    const newScene = sceneForAsset(currentGraph, currentAssetId);
    const oldRecord = historicalAssets.assets?.[assetId];
    const newRecord = currentAssets.assets?.[currentAssetId];
    const historicalFormats = {
      portrait: oldRecord?.variants?.portrait,
      landscape: oldRecord?.variants?.landscape
    };
    const currentFormats = {
      portrait: newRecord?.variants?.portrait,
      landscape: newRecord?.variants?.landscape
    };
    const visualResultChanged = stable(oldRecord) !== stable(newRecord);
    const runtimeMappingUnchanged = stable({ sceneId: oldScene.id, assetId, formats: historicalFormats }) ===
      stable({ sceneId: newScene.id, assetId: currentAssetId, formats: currentFormats });
    const assets = [pngRecord(project, 'portrait', currentFormats.portrait), pngRecord(project, 'landscape', currentFormats.landscape)];
    return {
      pairId: id,
      sceneId: newScene.id,
      assetId: currentAssetId,
      historical: { sceneId: oldScene.id, assetId, assetRecord: oldRecord, formats: historicalFormats },
      current: { sceneId: newScene.id, assetId: currentAssetId, assetRecord: newRecord, formats: currentFormats },
      visualResultChanged,
      runtimeMappingUnchanged,
      assets
    };
  });
}

function impactForChanges(snapshot, mappings, deferredPairs) {
  const acceptedByAsset = new Map(mappings.map(mapping => [mapping.assetId, mapping.pairId]));
  const accepted = new Set();
  const deferred = new Set();
  for (const change of snapshot.changes) {
    const assetId = snapshot.path === 'narrative/assets.json' ? change.pointer.split('.')[1] : null;
    if (assetId && acceptedByAsset.has(assetId)) accepted.add(acceptedByAsset.get(assetId));
    if (assetId && deferredPairs.includes(assetId)) deferred.add(assetId);
    if (snapshot.path !== 'narrative/assets.json' && change.pointer) mappings.forEach(mapping => accepted.add(mapping.pairId));
  }
  return { acceptedPairs: [...accepted].sort(), deferredAssetIds: [...deferred].sort() };
}

function assertLedger(ledger) {
  if (ledger?.schemaVersion !== 1 || ledger?.kind !== 'STAGE9_4_SOURCE_BOUND_ACCEPTANCE_LEDGER')
    throw new Error('HISTORICAL_LEDGER_SCHEMA_INVALID');
  if (ledger.boundary?.releaseReady === true || ledger.boundary?.episodeFinalAcceptance === true)
    throw new Error('HISTORICAL_LEDGER_RELEASE_PROMOTION_FORBIDDEN');
  if (!Array.isArray(ledger.dependencyEvidence) || !ledger.dependencyEvidence.length)
    throw new Error('HISTORICAL_LEDGER_DEPENDENCIES_MISSING');
  if (!Number.isInteger(ledger.progress?.plannedPairs) || ledger.progress.plannedPngs !== ledger.progress.plannedPairs * 2 ||
      !Number.isInteger(ledger.progress?.acceptedPairs) || ledger.progress.acceptedPngs !== ledger.progress.acceptedPairs * 2 ||
      ledger.progress.acceptedPairs !== ledger.progress.acceptedPairIds?.length)
    throw new Error('HISTORICAL_LEDGER_PROGRESS_INVALID');
}

function readMechanicalReceipt(project, relative) {
  const bytes = projectBytes(project, relative);
  const receipt = readJson(bytes, 'MECHANICAL_RECEIPT');
  if (receipt.status !== 'PASS_ART_BATCH_MECHANICAL' || !Array.isArray(receipt.inspected))
    throw new Error('MECHANICAL_RECEIPT_NOT_ACCEPTED');
  const inspected = receipt.inspected.map(item => ({
    path: item.path,
    status: item.status,
    sha256: item.sha256,
    bytes: item.bytes,
    dimensions: item.dimensions
  }));
  return { path: relative, sha256: digest(bytes), status: receipt.status, inspected };
}

function readEvidenceJson(project, descriptor, label) {
  if (!descriptor || !safeRelative(descriptor.path) || !HASH.test(String(descriptor.sha256 ?? '')))
    throw new Error(`${label}_REFERENCE_INVALID`);
  const bytes = projectBytes(project, descriptor.path);
  const actualSha256 = digest(bytes);
  if (actualSha256 !== String(descriptor.sha256).toLowerCase())
    throw new Error(`${label}_HASH_MISMATCH`);
  return { path: descriptor.path, sha256: actualSha256, value: readJson(bytes, label) };
}

function dimensions(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d+)x(\d+)$/.exec(value);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

function validateAssetAcceptanceReceipt(project, detail, asset, label) {
  const receipt = readEvidenceJson(project, {
    path: asset.receipt,
    sha256: asset.receiptSha256
  }, label).value;
  const expectedDimensions = dimensions(asset.dimensions);
  if (receipt.status !== 'PASS_ART_OUTPUT_MECHANICAL' ||
      receipt.sha256 !== asset.sha256 || receipt.bytes !== asset.bytes ||
      stable(receipt.dimensions) !== stable(expectedDimensions))
    throw new Error(`${label}_NOT_ACCEPTED`);
  return receipt;
}

function validateRuntimeCapture(project, capture, label) {
  const screenshot = capture?.screenshot;
  if (!safeRelative(screenshot) || !HASH.test(String(capture?.screenshotSha256 ?? '')))
    throw new Error(`${label}_SCREENSHOT_REFERENCE_INVALID`);
  const bytes = projectBytes(project, screenshot);
  const noHorizontalOverflow = capture.noHorizontalOverflow ?? capture.visualRuntime?.noHorizontalOverflow;
  const noVerticalOverflow = capture.noVerticalOverflow ?? capture.visualRuntime?.noVerticalOverflow;
  if (digest(bytes) !== String(capture.screenshotSha256).toLowerCase() ||
      (Number.isInteger(capture.screenshotBytes) && capture.screenshotBytes !== bytes.length) ||
      noHorizontalOverflow !== true || noVerticalOverflow !== true)
    throw new Error(`${label}_SCREENSHOT_NOT_ACCEPTED`);
}

function validateHistoricalAcceptanceReceipts(project, ledger, acceptedPairs) {
  const acceptedIds = new Set(acceptedPairs.map(item => item.id));
  const covered = new Set();
  for (const [groupIndex, group] of (Array.isArray(ledger.groups) ? ledger.groups : []).entries()) {
    const label = `HISTORICAL_GROUP_${groupIndex}`;
    if (!Array.isArray(group?.pairs) || !group.pairs.length || !unique(group.pairs) ||
        group.pairs.some(pair => !acceptedIds.has(pair) || covered.has(pair)))
      throw new Error(`${label}_SCOPE_INVALID`);
    const details = new Map((Array.isArray(group.pairsDetail) ? group.pairsDetail : []).map(item => [item?.id, item]));
    if (details.size !== group.pairs.length || group.pairs.some(pair => !details.has(pair)))
      throw new Error(`${label}_PAIR_DETAILS_INVALID`);

    const web = readEvidenceJson(project, group.webReceipt, `${label}_WEB_HIGH`).value;
    const webCheck = inspectWebHighAcceptance(project, group.webReceipt, web, {
      // The ledger currentHead is the source-bound dependency baseline, not
      // the source HEAD embedded in each immutable historical review. A
      // receipt may legitimately predate the ledger commit when the ledger
      // records the exact receipt hash and dependency revalidation proves
      // that the accepted inputs were unchanged. Current/fresh reviews still
      // require their request, reviewer and project HEADs to match at the
      // DEV transport boundary.
      expectedScopeGroups: group.pairs.map(pair => [pair, details.get(pair)?.sceneId].filter(text)),
      expectedAssets: group.pairs.flatMap(pair => details.get(pair)?.assets ?? [])
    });
    if (!webCheck.ok)
      throw new Error(`${label}_${webCheck.errors[0] ?? 'WEB_HIGH_NOT_ACCEPTED'}`);

    const runtime = readEvidenceJson(project, group.runtimeReceipt, `${label}_RUNTIME`).value;
    if (!String(runtime.status).startsWith('PASS') || !HEAD.test(String(runtime.sourceHead ?? '')) ||
        !Array.isArray(runtime.captures) || (runtime.consoleErrors?.length ?? 1) ||
        (runtime.requestFailures?.length ?? 1) || (runtime.httpErrors?.length ?? 1))
      throw new Error(`${label}_RUNTIME_NOT_ACCEPTED`);

    for (const pair of group.pairs) {
      const detail = details.get(pair);
      const assetPaths = new Set();
      for (const [assetIndex, asset] of detail.assets.entries()) {
        if (!safeRelative(asset?.path) || !HASH.test(String(asset?.sha256 ?? '')) ||
            !Number.isInteger(asset?.bytes) || !dimensions(asset?.dimensions))
          throw new Error(`${label}_ASSET_${pair}_${assetIndex}_REFERENCE_INVALID`);
        assetPaths.add(asset.path);
        validateAssetAcceptanceReceipt(project, detail, asset, `${label}_ASSET_${pair}_${assetIndex}_RECEIPT`);
      }
      const captures = runtime.captures.filter(capture => {
        const source = capture?.source ?? capture?.assetSrc;
        const normalizedSource = normalizeAssetPath(source);
        return capture?.tag === pair || (normalizedSource && assetPaths.has(normalizedSource));
      });
      const formats = new Set();
      for (const [captureIndex, capture] of captures.entries()) {
        const format = capture?.assetFormat ?? capture?.format;
        if (format === 'portrait' || format === 'landscape') formats.add(format);
        validateRuntimeCapture(project, capture, `${label}_RUNTIME_${pair}_${captureIndex}`);
      }
      if (!formats.has('portrait') || !formats.has('landscape'))
        throw new Error(`${label}_RUNTIME_COVERAGE_${pair}`);
      covered.add(pair);
    }
  }
  if (covered.size !== acceptedIds.size) throw new Error('HISTORICAL_ACCEPTANCE_SCOPE_MISMATCH');
}

function buildDerived(project, ledgerPath, ledger, { deferredPairs, mechanicalReceiptPath }) {
  assertLedger(ledger);
  if (!Array.isArray(deferredPairs) || !deferredPairs.length || !deferredPairs.every(safeId) || new Set(deferredPairs).size !== deferredPairs.length)
    throw new Error('DEFERRED_PAIR_SCOPE_INVALID');
  const acceptedPairs = acceptedPairsFromLedger(ledger);
  if (deferredPairs.some(id => ledger.progress.acceptedPairIds.includes(id)))
    throw new Error('DEFERRED_PAIR_OVERLAPS_ACCEPTED_SCOPE');
  const historicalRef = ledger.currentHead;
  if (!HEAD.test(String(historicalRef))) throw new Error('HISTORICAL_HEAD_INVALID');
  const head = currentHead(project);
  validateHistoricalAcceptanceReceipts(project, ledger, acceptedPairs);
  const dependencyComparisons = ledger.dependencyEvidence.map(dependency => dependencySnapshot(project, historicalRef, dependency.path, dependency));
  const historicalAssets = readJson(historicalBytes(project, historicalRef, 'narrative/assets.json'), 'HISTORICAL_ASSETS');
  const currentAssets = readJson(projectBytes(project, 'narrative/assets.json'), 'CURRENT_ASSETS');
  const historicalGraph = readJson(historicalBytes(project, historicalRef, 'narrative/graph.json'), 'HISTORICAL_GRAPH');
  const currentGraph = readJson(projectBytes(project, 'narrative/graph.json'), 'CURRENT_GRAPH');
  const mappings = pairMappings(project, historicalAssets, currentAssets, historicalGraph, currentGraph, acceptedPairs);
  const impact = dependencyComparisons.map(snapshot => ({
    path: snapshot.path,
    ...impactForChanges(snapshot, mappings, deferredPairs)
  }));
  const affectedAcceptedPairs = [...new Set(impact.flatMap(item => item.acceptedPairs))].sort();
  const visualChanges = mappings.filter(mapping => mapping.visualResultChanged || !mapping.runtimeMappingUnchanged).map(mapping => mapping.pairId).sort();
  const mechanical = readMechanicalReceipt(project, mechanicalReceiptPath);
  const inspected = new Map(mechanical.inspected.map(item => [path.normalize(item.path).replaceAll('\\', '/'), item]));
  for (const mapping of mappings) {
    for (const asset of mapping.assets) {
      const item = inspected.get(path.normalize(path.resolve(project, asset.path)).replaceAll('\\', '/')) ||
        inspected.get(path.normalize(asset.path).replaceAll('\\', '/'));
      if (!item || item.status !== 'PASS_ART_OUTPUT_MECHANICAL' || item.sha256 !== asset.sha256 || item.bytes !== asset.bytes)
        throw new Error(`MECHANICAL_RECEIPT_SCOPE_MISSING:${mapping.pairId}:${asset.format}`);
    }
  }
  const visualReevaluation = visualChanges.length || affectedAcceptedPairs.length
    ? { status: 'REQUIRED', pairs: [...new Set([...visualChanges, ...affectedAcceptedPairs])].sort() }
    : { status: 'NOT_REQUIRED', reason: 'Accepted S19-S23 mappings and PNG bytes are unchanged; current asset-map drift is confined outside the accepted scope.' };
  return {
    schemaVersion: 1,
    kind: 'STAGE9_4_SOURCE_BOUND_REVALIDATION',
    status: 'SOURCE_CURRENTNESS_REVALIDATED',
    historicalLedger: {
      path: ledgerPath,
      sha256: digest(projectBytes(project, ledgerPath)),
      historicalHead: historicalRef,
      plannedPairs: ledger.progress.plannedPairs,
      plannedPngs: ledger.progress.plannedPngs,
      acceptedPairIds: ledger.progress.acceptedPairIds
    },
    sourceHeads: { historical: historicalRef, current: head },
    currentness: {
      mode: 'SOURCE_BOUND_REVALIDATION',
      historicalLedgerImmutable: true,
      acceptedPngsMutated: false,
      generationInvoked: false
    },
    dependencyComparisons,
    acceptedPairs: mappings,
    mechanicalRevalidation: mechanical,
    deferredPairs: deferredPairs.map(id => ({ id, status: 'MECHANICAL_ONLY_NOT_ART_ACCEPTED' })),
    impact: {
      acceptedPairsUnaffected: affectedAcceptedPairs.length === 0,
      affectedAcceptedPairs,
      visualResultChangedPairs: visualChanges,
      deferredPairsRemainSeparate: true
    },
    visualReevaluation,
    generatedAt: new Date().toISOString()
  };
}

export function createSourceBoundRevalidation(projectDir, ledgerPath, options = {}) {
  const project = fs.realpathSync(path.resolve(projectDir));
  const ledgerBytes = projectBytes(project, ledgerPath);
  const ledger = readJson(ledgerBytes, 'HISTORICAL_LEDGER');
  return buildDerived(project, ledgerPath, ledger, options);
}

export function inspectSourceBoundRevalidation(projectDir, contractPath) {
  const project = fs.realpathSync(path.resolve(projectDir));
  const problems = [];
  let contract;
  try { contract = readJson(projectBytes(project, contractPath), 'REVALIDATION_CONTRACT'); }
  catch (error) { return { schemaVersion: 1, status: 'BLOCKED_ART_PROGRESS', acceptedPairs: 0, acceptedPng: 0, problems: [error.message] }; }
  try {
    if (contract?.schemaVersion !== 1 || contract?.kind !== 'STAGE9_4_SOURCE_BOUND_REVALIDATION') throw new Error('REVALIDATION_CONTRACT_SCHEMA_INVALID');
    const ledgerPath = contract.historicalLedger?.path;
    const deferredPairs = (contract.deferredPairs ?? []).map(item => item?.id);
    const expected = createSourceBoundRevalidation(project, ledgerPath, {
      deferredPairs,
      mechanicalReceiptPath: contract.mechanicalRevalidation?.path
    });
    const actualContract = { ...contract };
    delete actualContract.generatedAt;
    const expectedContract = { ...expected };
    delete expectedContract.generatedAt;
    if (stable(actualContract) !== stable(expectedContract)) throw new Error('REVALIDATION_EVIDENCE_MISMATCH');
    if (contract.visualReevaluation?.status !== 'NOT_REQUIRED') throw new Error('VISUAL_REEVALUATION_REQUIRED');
  } catch (error) { problems.push(error.message); }
  const accepted = problems.length ? 0 : (contract.acceptedPairs?.length ?? 0);
  const planned = Number.isInteger(contract.historicalLedger?.plannedPairs) ? contract.historicalLedger.plannedPairs : null;
  return {
    schemaVersion: 1,
    status: problems.length ? 'BLOCKED_ART_PROGRESS' : 'PASS_ART_PROGRESS_REVALIDATED',
    acceptanceSource: contract?.kind,
    plannedPairs: planned,
    acceptedPairs: accepted,
    remainingPairs: planned === null ? null : planned - accepted,
    acceptedPng: accepted * 2,
    remainingPng: planned === null ? null : (planned - accepted) * 2,
    batches: problems.length ? [] : [{ id: 'source-bound-revalidation-S19-S23', status: 'PASS_BATCH_ACCEPTANCE_REVALIDATED', pairs: contract.acceptedPairs.map(item => item.pairId), issues: [] }],
    problems,
    historicalLedger: contract.historicalLedger,
    impact: contract.impact,
    visualReevaluation: contract.visualReevaluation,
    deferredPairs: contract.deferredPairs,
    finalEpisodeAcceptance: 'NOT_VERIFIED',
    releaseReady: false
  };
}
