import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { decodeProductionPng } from './art-output-gate.mjs';
import { inspectSourceBoundRevalidation, inspectWebHighAcceptance } from './source-bound-revalidation.mjs';

const HASH = /^[a-f0-9]{64}$/i;
const safeId = x => typeof x === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,60}$/.test(x);
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const unique = arr => new Set(arr).size === arr.length;
const text = value => typeof value === 'string' && value.trim().length > 0;

function safeProjectRelative(relative) {
  return typeof relative === 'string' && relative && !path.isAbsolute(relative) &&
    !/^[A-Za-z]:[\\/]/.test(relative) && !relative.includes('\\') &&
    !relative.includes('\0') && !relative.split('/').some(part => !part || part === '.' || part === '..');
}

function readProjectFile(project, relative, expectedHash, problems, context) {
  if (!safeProjectRelative(relative)) {
    problems.push(context + '_UNSAFE_PATH');
    return null;
  }
  try {
    const actual = fs.realpathSync(path.resolve(project, relative));
    if (!actual.startsWith(project + path.sep) || !fs.statSync(actual).isFile()) throw new Error('not confined file');
    const bytes = fs.readFileSync(actual);
    const sha256 = digest(bytes);
    if (!HASH.test(String(expectedHash ?? '')) || sha256 !== String(expectedHash).toLowerCase())
      problems.push(context + '_HASH_MISMATCH');
    return {bytes,sha256,path:relative};
  } catch {
    problems.push(context + '_MISSING');
    return null;
  }
}

function readProjectJson(project, relative, expectedHash, problems, context) {
  const file = readProjectFile(project, relative, expectedHash, problems, context);
  if (!file) return null;
  try { return JSON.parse(file.bytes.toString('utf8')); }
  catch { problems.push(context + '_BAD_JSON'); return null; }
}

function parseDimensions(value) {
  const match = /^(\d+)x(\d+)$/.exec(String(value ?? ''));
  return match ? {width:Number(match[1]),height:Number(match[2])} : null;
}

function inspectLegacyStage9Ledger(project, ledger) {
  const problems = [];
  const batches = [];
  const accepted = new Set();
  const declaredPairs = ledger.progress?.plannedPairs;
  const declaredPng = ledger.progress?.plannedPngs;
  const declaredAcceptedPairs = ledger.progress?.acceptedPairs;
  const declaredAcceptedPng = ledger.progress?.acceptedPngs;
  const globalErrors = [];
  if (ledger.schemaVersion !== 1 || ledger.kind !== 'STAGE9_4_SOURCE_BOUND_ACCEPTANCE_LEDGER')
    problems.push('LEDGER_SCHEMA_INVALID');
  if (!Number.isInteger(declaredPairs) || declaredPairs < 1 ||
      declaredPng !== declaredPairs * 2 || !Number.isInteger(declaredAcceptedPairs) ||
      declaredAcceptedPairs < 0 || declaredAcceptedPairs > declaredPairs ||
      declaredAcceptedPng !== declaredAcceptedPairs * 2 ||
      !Array.isArray(ledger.progress?.acceptedPairIds) ||
      ledger.progress.acceptedPairIds.length !== declaredAcceptedPairs ||
      !unique(ledger.progress.acceptedPairIds))
    problems.push('LEDGER_PROGRESS_INVALID');
  if (ledger.currentness?.mode !== 'DEPENDENCY_BASED_REUSE' || ledger.currentness?.productInputsUnchanged !== true)
    globalErrors.push('LEDGER_SOURCE_CURRENTNESS_INVALID');

  const staleDependencies=[];
  for (const [index, dependency] of (Array.isArray(ledger.dependencyEvidence)
    ? ledger.dependencyEvidence : []).entries()) {
    const observed=readProjectFile(project, dependency?.path, dependency?.sha256,
      problems,`DEPENDENCY_${index}`);
    if (observed && observed.sha256 !== String(dependency?.sha256??'').toLowerCase())
      staleDependencies.push({index,path:observed.path,
        previousSha256:dependency.sha256,currentSha256:observed.sha256,
        status:'HISTORICAL_DEPENDENCY_DRIFT_REVALIDATION_REQUIRED'});
  }
  if (!Array.isArray(ledger.dependencyEvidence) || !ledger.dependencyEvidence.length)
    globalErrors.push('LEDGER_DEPENDENCIES_MISSING');

  const mechanical = ledger.mechanicalRevalidation;
  if (mechanical?.status !== 'PASS_ART_BATCH_MECHANICAL') globalErrors.push('MECHANICAL_REVALIDATION_NOT_ACCEPTED');
  readProjectJson(project, mechanical?.manifest, mechanical?.manifestSha256, problems, 'MECHANICAL_MANIFEST');
  readProjectJson(project, mechanical?.receipt, mechanical?.receiptSha256, problems, 'MECHANICAL_RECEIPT');
  if (!mechanical?.manifest || !mechanical?.receipt) globalErrors.push('MECHANICAL_REVALIDATION_MISSING');
  if (ledger.boundary?.releaseReady === true || ledger.boundary?.episodeFinalAcceptance === true)
    globalErrors.push('RELEASE_PROMOTION_FORBIDDEN');

  const claimed = new Set();
  const usedEvidence = new Set();
  for (const [index, group] of (Array.isArray(ledger.groups) ? ledger.groups : []).entries()) {
    const tag = `GROUP_${index}`;
    const pairs = group?.pairs;
    const details = new Map((Array.isArray(group?.pairsDetail) ? group.pairsDetail : []).map(item => [item?.id,item]));
    const start = problems.length;
    if (!Array.isArray(pairs) || !pairs.length || !pairs.every(safeId) || !unique(pairs)) {
      problems.push(tag + '_SCOPE_INVALID');
      batches.push({id:tag,status:'NOT_VERIFIED',pairs:[]});
      continue;
    }
    for (const pair of pairs) {
      if (claimed.has(pair)) problems.push(tag + '_DUPLICATE_PAIR_' + pair);
      claimed.add(pair);
      const detail = details.get(pair);
      if (!detail || !Array.isArray(detail.assets) || detail.assets.length !== 2) {
        problems.push(tag + '_ASSETS_MISSING_' + pair);
        continue;
      }
      for (const [assetIndex, asset] of detail.assets.entries()) {
        if (usedEvidence.has(asset?.path)) problems.push(`${tag}_DUPLICATE_ASSET_PATH_${pair}`);
        usedEvidence.add(asset?.path);
        const file = readProjectFile(project, asset?.path, asset?.sha256, problems, `${tag}_ASSET_${pair}_${assetIndex}`);
        if (!file) continue;
        if (Number.isInteger(asset.bytes) && file.bytes.length !== asset.bytes)
          problems.push(`${tag}_ASSET_${pair}_${assetIndex}_SIZE_MISMATCH`);
        try {
          const actual = decodeProductionPng(file.bytes);
          const expected = parseDimensions(asset.dimensions);
          if (!expected || actual.width !== expected.width || actual.height !== expected.height)
            problems.push(`${tag}_ASSET_${pair}_${assetIndex}_DIMENSIONS_MISMATCH`);
        } catch { problems.push(`${tag}_ASSET_${pair}_${assetIndex}_INVALID_PNG`); }
      }
    }

    if (usedEvidence.has(group?.webReceipt?.path)) problems.push(tag + '_DUPLICATE_WEB_HIGH_RECEIPT');
    usedEvidence.add(group?.webReceipt?.path);
    const web = readProjectJson(project, group?.webReceipt?.path, group?.webReceipt?.sha256, problems, tag + '_WEB_HIGH');
    if (!web) problems.push(tag + '_WEB_HIGH_MISSING');
    else {
      const webCheck = inspectWebHighAcceptance(project, group.webReceipt, web, {
        expectedSourceHead: ledger.currentHead,
        expectedScopeGroups: (group.pairs ?? []).map(pair => [pair,
          group.pairsDetail?.find(item => item?.id === pair)?.sceneId].filter(text)),
        expectedAssets: (group.pairsDetail ?? []).flatMap(detail => detail?.assets ?? [])
      });
      if (!webCheck.ok)
        problems.push(tag + '_WEB_HIGH_NOT_ACCEPTED', ...webCheck.errors.map(error => tag + '_' + error));
    }

    if (usedEvidence.has(group?.runtimeReceipt?.path)) problems.push(tag + '_DUPLICATE_RUNTIME_RECEIPT');
    usedEvidence.add(group?.runtimeReceipt?.path);
    const runtime = readProjectJson(project, group?.runtimeReceipt?.path, group?.runtimeReceipt?.sha256, problems, tag + '_RUNTIME');
    if (!runtime) problems.push(tag + '_RUNTIME_MISSING');
    else if (!String(runtime.status).startsWith('PASS') || !text(runtime.sourceHead) ||
        (runtime.consoleErrors?.length ?? 0) || (runtime.requestFailures?.length ?? 0) ||
        (runtime.httpErrors?.length ?? 0))
      problems.push(tag + '_RUNTIME_NOT_ACCEPTED');

    const issues = problems.slice(start);
    const status = issues.length ? 'NOT_VERIFIED' : 'PASS_BATCH_ACCEPTANCE_REVALIDATED';
    if (!issues.length) pairs.forEach(pair => accepted.add(pair));
    batches.push({id:`stage9-group-${index}`,status,pairs,issues:[...new Set(issues)]});
  }
  const declaredIds = new Set(Array.isArray(ledger.progress?.acceptedPairIds) ? ledger.progress.acceptedPairIds : []);
  if (claimed.size > declaredPairs || claimed.size !== declaredIds.size ||
      [...declaredIds].some(pair => !claimed.has(pair)))
    globalErrors.push('LEDGER_PROGRESS_SCOPE_MISMATCH');
  problems.push(...globalErrors);
  const globalInvalid = globalErrors.length || problems.some(problem => /^DEPENDENCY_|^MECHANICAL_/.test(problem));
  const acceptedCount = globalInvalid ? 0 : accepted.size;
  return {
    schemaVersion:1,
    status:problems.length ? 'BLOCKED_ART_PROGRESS' : 'PASS_ART_PROGRESS_REVALIDATED',
    acceptanceSource:ledger.kind,
    declaredPairs:Number.isInteger(declaredPairs) ? declaredPairs : null,
    declaredPng:Number.isInteger(declaredPng) ? declaredPng : null,
    declaredAcceptedPairs:Number.isInteger(declaredAcceptedPairs) ? declaredAcceptedPairs : null,
    declaredAcceptedPng:Number.isInteger(declaredAcceptedPng) ? declaredAcceptedPng : null,
    plannedPairs:Number.isInteger(declaredPairs) ? declaredPairs : null,
    acceptedPairs:acceptedCount,
    remainingPairs:Number.isInteger(declaredPairs) ? declaredPairs - acceptedCount : null,
    acceptedPng:acceptedCount * 2,
    remainingPng:Number.isInteger(declaredPairs) ? (declaredPairs - acceptedCount) * 2 : null,
    batches,problems:[...new Set(problems)],
    staleDependencies,
    ...(staleDependencies.length ? {revalidation:{
      status:'REVALIDATION_REQUIRED',
      instruction:'Do not rewrite the historical ledger. Compare the old accepted scene mappings and source dependencies against current narrative assets; create separately verified acceptance/currentness evidence or rerun affected runtime/independent pixel checks. No accepted count is carried forward until validated.'
    }} : {}),
    finalEpisodeAcceptance:ledger.boundary?.episodeFinalAcceptance === true ? 'VERIFIED' : 'NOT_VERIFIED',
    releaseReady:false
  };
}

function discoverProgressFiles(project) {
  const root = path.join(project,'artifacts');
  if (!fs.existsSync(root)) return [];
  const found = [];
  const visit = (current, depth) => {
    if (depth > 5 || found.length > 256) return;
    for (const entry of fs.readdirSync(current,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      const full = path.join(current,entry.name);
      if (entry.isDirectory()) visit(full,depth+1);
      else if (entry.isFile() && entry.name.endsWith('.json') &&
          /(?:art-progress-index|acceptance[_-]ledger)/i.test(entry.name))
        found.push(path.relative(project,full).split(path.sep).join('/'));
    }
  };
  visit(root,0);
  return found;
}

export function discoverArtProgress(projectDir, requestedPath = null) {
  const project = fs.realpathSync(path.resolve(projectDir));
  if (requestedPath !== null && requestedPath !== undefined) return {indexPath:String(requestedPath),candidates:[String(requestedPath)]};
  const candidates = discoverProgressFiles(project);
  const revalidations = candidates.filter(candidate => {
    try {
      const bytes = fs.readFileSync(path.resolve(project, candidate));
      return JSON.parse(bytes.toString('utf8'))?.kind === 'STAGE9_4_SOURCE_BOUND_REVALIDATION';
    } catch { return false; }
  });
  if (revalidations.length === 1) return { indexPath: revalidations[0], candidates };
  return {indexPath:candidates.length === 1 ? candidates[0] : null,candidates};
}

/**
 * A read-only VIEW of existing evidence, not a second acceptance store.
 * The index only names original receipts. It cannot manufacture PASS.
 */
export function inspectArtProgress(projectDir, indexPath) {
  const project = fs.realpathSync(path.resolve(projectDir));
  const problems = [];
  const accepted = new Set();
  const batches = [];
  const file = (relative, expectedHash, context) => readProjectFile(project,relative,expectedHash,problems,context);
  const json = (relative, hash, context) => readProjectJson(project,relative,hash,problems,context);
  const block = (status = 'BLOCKED_ART_PROGRESS') => ({
    schemaVersion: 1, status, acceptedPairs: accepted.size, acceptedPng: accepted.size * 2,
    plannedPairs: null, remainingPairs: null, batches, problems: [...new Set(problems)]
  });

  // Index is a discovery aid, never acceptance evidence. It may be edited,
  // but all referenced receipts/assets are SHA-pinned and checked afresh.
  if (typeof indexPath !== 'string' || !indexPath ||
      path.isAbsolute(indexPath) || indexPath.includes('\\') ||
      indexPath.split('/').some(p => !p || p === '.' || p === '..')) {
    problems.push('INDEX_UNSAFE_PATH');
    return block();
  }
  let index;
  try {
    const indexFile = fs.realpathSync(path.resolve(project, indexPath));
    if (!indexFile.startsWith(project + path.sep)) throw new Error('out of project');
    index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  } catch { problems.push('INDEX_UNREADABLE'); return block(); }
  if (index?.kind === 'STAGE9_4_SOURCE_BOUND_REVALIDATION')
    return inspectSourceBoundRevalidation(project, indexPath);
  if (index?.schemaVersion !== 1 || !index.plan || !Array.isArray(index.batches)) {
    if (index?.kind === 'STAGE9_4_SOURCE_BOUND_ACCEPTANCE_LEDGER')
      return inspectLegacyStage9Ledger(project,index);
    problems.push('INDEX_SCHEMA_INVALID'); return block();
  }
  const plan = json(index.plan.path, index.plan.sha256, 'PLAN');
  const total = plan?.summary?.productionPairsPlanned;
  const pngTotal = plan?.summary?.plannedPngFiles;
  if (!Number.isInteger(total) || total < 1 || total > 2000 ||
      pngTotal !== total * 2) problems.push('PLAN_PAIR_TOTAL_INVALID');
  // Invalidate any evidence after the canonical narrative inputs changed.
  const deps = plan?.sourceHashes;
  if (!deps || typeof deps !== 'object' || Array.isArray(deps) ||
      !Object.keys(deps).length) problems.push('PLAN_DEPENDENCIES_MISSING');
  else for (const [name, hash] of Object.entries(deps))
    file(name, hash, 'PLAN_DEPENDENCY_' + name);

  if (index.batches.length > 500) problems.push('INDEX_BATCH_LIMIT_EXCEEDED');
  const usedPaths = new Set();
  const usedWebReviewIds = new Set();
  const claimed = new Set();
  for (const [n, batch] of index.batches.slice(0, 500).entries()) {
    const errorsStart = problems.length;
    const tag = 'BATCH_' + n;
    const pairs = batch?.pairs;
    if (!safeId(batch?.id) || !Array.isArray(pairs) || pairs.length < 1 ||
        pairs.length > 50 || !pairs.every(safeId) || !unique(pairs)) {
      problems.push(tag + '_SCOPE_INVALID');
      batches.push({ id: batch?.id ?? null, status:'NOT_VERIFIED', pairs:[] });
      continue;
    }
    for (const pair of pairs) {
      if (claimed.has(pair)) problems.push(tag + '_DUPLICATE_PAIR_' + pair);
      claimed.add(pair);
    }
    if (!batch.receipt || !batch.receipt.path || usedPaths.has(batch.receipt.path))
      problems.push(tag + '_RECEIPT_DUPLICATED_OR_MISSING');
    usedPaths.add(batch.receipt?.path);
    const receipt = json(batch.receipt?.path, batch.receipt?.sha256, tag + '_RECEIPT');
    if (receipt) {
      if (receipt.status !== 'PASS' || receipt.profile !== 'NARRATIVE_ART_ACCEPTANCE_V2' ||
          receipt.actualPixelsReceived !== true || receipt.acceptanceScope !== 'BATCH_ONLY' ||
          receipt.releaseReady !== false || receipt.episodeFinalAcceptance !== false ||
          receipt.requiredRegeneration !== false ||
           !Array.isArray(receipt.unresolvedFindings) || receipt.unresolvedFindings.length)
        problems.push(tag + '_ART_ACCEPTANCE_INCOMPLETE');
      const web = receipt.webHighAcceptance;
      const scoped = receipt.scope?.map(s => s.pair);
      if (!Array.isArray(scoped) || scoped.length !== pairs.length ||
          !unique(scoped) || scoped.some(x => !pairs.includes(x)))
        problems.push(tag + '_RECEIPT_SCOPE_MISMATCH');
      const verified = receipt.reviewedItems;
      const images = receipt.pixels?.assets;
      const webCheck = inspectWebHighAcceptance(project, batch.receipt, web, {
        expectedSourceHead: receipt.sourceBase,
        expectedScopeGroups: Array.isArray(receipt.scope)
          ? receipt.scope.map(item => [item?.sceneId, item?.pair].filter(text)) : [],
        expectedAssets: Array.isArray(images) ? images : []
      });
      if (webCheck.identity && usedWebReviewIds.has(webCheck.identity))
        problems.push(tag + '_WEB_HIGH_REVIEW_DUPLICATED');
      if (webCheck.identity) usedWebReviewIds.add(webCheck.identity);
      if (!webCheck.ok)
        problems.push(tag + '_INDEPENDENT_WEB_HIGH_MISSING', ...webCheck.errors.map(error => tag + '_' + error));
      if (!Array.isArray(verified) || !Array.isArray(images)) {
        problems.push(tag + '_PIXEL_EVIDENCE_MISSING');
      } else {
        const reviewed = new Map(verified.map(item => [item.id, item.status]));
        for (const pair of pairs) {
          const formats = [
            {name:'portrait',ratio:2/3,minWidth:768,minHeight:1152},
            {name:'landscape',ratio:16/9,minWidth:1280,minHeight:720}
          ];
          const seenPaths = new Set();
          for (const format of formats) {
            const ref = pair + '-' + format.name;
            const records = images.filter(im => im.id === ref);
            if (records.length !== 1 || !['PASS','PASS_WITH_ADVISORY'].includes(reviewed.get(ref))) {
              problems.push(tag + '_MISSING_ACCEPTED_FORMAT_' + ref); continue;
            }
            const asset = records[0];
            if (seenPaths.has(asset.path)) problems.push(tag + '_DUPLICATE_ASSET_' + pair);
            seenPaths.add(asset.path);
            const img = file(asset.path, asset.sha256, tag + '_ASSET_' + ref);
            if (img) {
              try {
                const decoded = decodeProductionPng(img.bytes);
                if (decoded.width < format.minWidth || decoded.height < format.minHeight ||
                    Math.abs(decoded.width/decoded.height-format.ratio) > 0.055)
                  problems.push(tag + '_FORMAT_DIMENSIONS_' + ref);
              } catch { problems.push(tag + '_INVALID_PNG_' + ref); }
            }
          }
        }
        for (const pair of pairs)
          for (const viewport of ['desktop','mobile'])
            if (!['PASS','PASS_WITH_ADVISORY'].includes(reviewed.get(pair + '-' + viewport + '-runtime')))
              problems.push(tag + '_RUNTIME_REVIEW_MISSING_' + pair + '_' + viewport);
      }

      const runtimeRel = receipt.pixels?.runtimeEvidence;
      // Same source head is mandatory: a receipt for old runtime cannot
      // certify another game's pixels after a content update.
      if (!runtimeRel) problems.push(tag + '_RUNTIME_RECEIPT_MISSING');
      else {
        const runtime = file(runtimeRel, batch.runtimeSha256, tag + '_RUNTIME');
        if (runtime) {
          let report;
          try { report=JSON.parse(runtime.bytes.toString('utf8')); }
          catch { problems.push(tag + '_RUNTIME_JSON_INVALID'); }
          if (report) {
            if (!String(report.status).startsWith('PASS') ||
                receipt.sourceBase !== report.sourceHead ||
                !Array.isArray(report.captures) ||
                (report.consoleErrors?.length ?? 1) > 0 ||
                (report.requestFailures?.length ?? 1) > 0 ||
                (report.httpErrors?.length ?? 1) > 0)
              problems.push(tag + '_RUNTIME_NOT_ACCEPTED');
            for (const pair of pairs) {
              const captures = report.captures?.filter(cap=>cap.tag===pair) ?? [];
              if (captures.length !== 2 ||
                  !captures.some(c=>c.assetFormat==='portrait') ||
                  !captures.some(c=>c.assetFormat==='landscape') ||
                  captures.some(c=>c.noHorizontalOverflow!==true || c.noVerticalOverflow!==true))
                problems.push(tag + '_RUNTIME_COVERAGE_' + pair);
              for (const c of captures)
                file(c.screenshot,c.screenshotSha256,tag+'_SCREENSHOT_'+pair+'_'+c.assetFormat);
            }
          }
        }
      }
    }
    const issues = problems.slice(errorsStart);
    const status = issues.length ? 'NOT_VERIFIED' : 'PASS_BATCH_ACCEPTANCE_REVALIDATED';
    if (!issues.length) pairs.forEach(id => accepted.add(id));
    batches.push({ id: batch.id, status, pairs, issues });
  }
  if (Number.isInteger(total) && claimed.size > total) problems.push('ACCEPTANCE_EXCEEDS_PLAN');
  // A stale/invalid plan cannot provide any trustworthy accepted count.
  // Keep all derived numeric fields consistent in this case.
  const planValid=!problems.some(x=>x.startsWith('PLAN_') || x==='ACCEPTANCE_EXCEEDS_PLAN');
  const count=planValid ? accepted.size : 0;
  return {
    schemaVersion:1,
    status: problems.length ? 'BLOCKED_ART_PROGRESS' : 'PASS_ART_PROGRESS_REVALIDATED',
    plannedPairs: Number.isInteger(total)?total:null,
    acceptedPairs: count,
    remainingPairs: Number.isInteger(total) ? total - count : null,
    acceptedPng: count * 2,
    remainingPng: Number.isInteger(total) ? (total - count) * 2 : null,
    batches,problems:[...new Set(problems)],
    finalEpisodeAcceptance:'NOT_VERIFIED',
    releaseReady:false
  };
}
