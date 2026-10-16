import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { decodeProductionPng } from './art-output-gate.mjs';

const HASH = /^[a-f0-9]{64}$/i;
const safeId = x => typeof x === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,60}$/.test(x);
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const unique = arr => new Set(arr).size === arr.length;

/**
 * A read-only VIEW of existing evidence, not a second acceptance store.
 * The index only names original receipts. It cannot manufacture PASS.
 */
export function inspectArtProgress(projectDir, indexPath) {
  const project = fs.realpathSync(path.resolve(projectDir));
  const problems = [];
  const accepted = new Set();
  const batches = [];
  const file = (relative, expectedHash, context) => {
    if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) ||
        /^[A-Za-z]:[\\/]/.test(relative) || relative.includes('\\') ||
        relative.split('/').some(p => !p || p === '.' || p === '..') ||
        relative.includes('\0')) {
      problems.push(context + '_UNSAFE_PATH');
      return null;
    }
    try {
      const actual = fs.realpathSync(path.resolve(project, relative));
      if (!actual.startsWith(project + path.sep) || !fs.statSync(actual).isFile())
        throw new Error('not confined file');
      const bytes = fs.readFileSync(actual);
      if (!HASH.test(String(expectedHash ?? '')) || digest(bytes) !== expectedHash.toLowerCase())
        problems.push(context + '_HASH_MISMATCH');
      return { bytes, sha256: digest(bytes), path: relative };
    } catch {
      problems.push(context + '_MISSING');
      return null;
    }
  };
  const json = (relative, hash, context) => {
    const found = file(relative, hash, context);
    if (!found) return null;
    try { return JSON.parse(found.bytes.toString('utf8')); }
    catch { problems.push(context + '_BAD_JSON'); return null; }
  };
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
  if (index?.schemaVersion !== 1 || !index.plan || !Array.isArray(index.batches)) {
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
      const scoped = receipt.scope?.map(s => s.pair);
      if (!Array.isArray(scoped) || scoped.length !== pairs.length ||
          !unique(scoped) || scoped.some(x => !pairs.includes(x)))
        problems.push(tag + '_RECEIPT_SCOPE_MISMATCH');
      const verified = receipt.reviewedItems;
      const images = receipt.pixels?.assets;
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
  return {
    schemaVersion:1,
    status: problems.length ? 'BLOCKED_ART_PROGRESS' : 'PASS_ART_PROGRESS_REVALIDATED',
    plannedPairs: Number.isInteger(total)?total:null,
    acceptedPairs: problems.length && problems.some(x=>x.startsWith('PLAN_')) ? 0 : accepted.size,
    remainingPairs: Number.isInteger(total) ? total - accepted.size : null,
    acceptedPng: accepted.size * 2,
    remainingPng: Number.isInteger(total) ? (total - accepted.size) * 2 : null,
    batches,problems:[...new Set(problems)],
    finalEpisodeAcceptance:'NOT_VERIFIED',
    releaseReady:false
  };
}
