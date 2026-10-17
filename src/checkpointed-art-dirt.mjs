import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { inspectArtBatch } from './art-output-gate.mjs';
import { inspectSourceBoundRevalidation } from './source-bound-revalidation.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const pngPath = /^assets\/production\/(?:[^/]+\/)*[^/]+\.png$/i;
const receiptPath = /^artifacts\/production-art\/(?:[^/]+\/)*output-receipts\/[^/]+\.json$/i;
// Only ledger files directly pinned by a completed GENERATING checkpoint may
// be treated as production evidence. A matching directory name alone is not
// authority to exclude an arbitrary JSON file from source-dirt inspection.
const producerLedgerPath = /^artifacts\/production-art\/(?:[^/]+\/)*producer-batches\/[a-z0-9][a-z0-9._-]*\.json$/i;
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const posix = p => p.split(path.sep).join('/');

function scopedArtifact(project, record) {
  if (record?.type !== 'file' || typeof record?.projectRelativePath !== 'string' ||
      !SHA256.test(record.sha256 ?? '') || !Number.isInteger(record.size) || record.size < 1) return null;
  const relative = record.projectRelativePath;
  if (!pngPath.test(relative) && !receiptPath.test(relative) && !producerLedgerPath.test(relative)) return null;
  const full = path.resolve(project,relative);
  const fromRoot = posix(path.relative(project,full));
  if (fromRoot !== relative || path.resolve(record.path ?? '') !== full) return null;
  if (!fs.existsSync(full) || !fs.lstatSync(full).isFile() ||
      fs.lstatSync(full).isSymbolicLink() || fs.realpathSync(full) !== full) return null;
  const stat = fs.statSync(full);
  if (stat.size !== record.size || digest(full) !== record.sha256) return null;
  return {relative,full,sha256:record.sha256};
}

function passReceiptFor(receipt, output) {
  try {
    const data = JSON.parse(fs.readFileSync(receipt,'utf8'));
    return data.status === 'PASS_ART_OUTPUT_MECHANICAL' &&
      data.path === output.full && data.sha256 === output.sha256 &&
      data.visualAcceptance === 'NOT_VERIFIED' &&
      Array.isArray(data.issues) && data.issues.length === 0;
  } catch { return false; }
}

function persistedEvidence(project,runDir) {
  const approved = new Set();
  const checkpoints=path.join(runDir,'checkpoints');
  if (!fs.existsSync(checkpoints)) return approved;
  const names=fs.readdirSync(checkpoints).filter(x=>/^\d{3,}-[a-z0-9-]+\.json$/.test(x));
  if (names.length>1000) return approved;
  for(const name of names) {
    let checkpoint;
    try { checkpoint = JSON.parse(fs.readFileSync(path.join(checkpoints,name),'utf8')); }
    catch { continue; }
    const files=new Map();
    for(const artifact of checkpoint.artifacts ?? []) {
      const scoped=scopedArtifact(project,artifact);
      if (scoped) files.set(scoped.relative,scoped);
    }
    if (checkpoint.stage === 'RUN_REOPENED') {
      const r=checkpoint.artOutputRecovery;
      if (r?.status==='PASS_ART_OUTPUT_TRANSPORT_RECOVERY' &&
          r.visualAcceptance==='NOT_VERIFIED' && r.generationInvokedAgain===false &&
          SHA256.test(r.sha256 ?? '') && r.sourceSha256===r.sha256 &&
          pngPath.test(r.targetPath ?? '') &&
          receiptPath.test(r.failedReceipt ?? '') &&
          receiptPath.test(r.passReceipt ?? '') &&
          files.get(r.targetPath)?.sha256 === r.sha256 &&
          files.has(r.failedReceipt) && files.has(r.passReceipt)) {
        try {
          const prior=JSON.parse(fs.readFileSync(files.get(r.failedReceipt).full,'utf8'));
          const success=JSON.parse(fs.readFileSync(files.get(r.passReceipt).full,'utf8'));
          if (prior.status==='BLOCKED_ART_OUTPUT' &&
              prior.issues?.length===1 && prior.issues[0]==='ART_FILE_NOT_FOUND' &&
              path.resolve(prior.path??'')===files.get(r.targetPath).full &&
              passReceiptFor(files.get(r.passReceipt).full,files.get(r.targetPath)) &&
              success.bytes===r.bytes) {
            for(const rel of [r.targetPath,r.failedReceipt,r.passReceipt]) approved.add(rel);
          }
        } catch { /* no evidence-based exemption */ }
      }
    }
    if (checkpoint.stage === 'GENERATING' &&
        checkpoint.metadata?.artOutputGate?.status === 'PASS_ART_BATCH_MECHANICAL') {
      const checks=checkpoint.metadata.artOutputGate.checks ?? [];
      const boundOutputs=[];
      for(const check of checks) {
        const output=[...files.values()].find(f=>pngPath.test(f.relative) &&
          f.full===check.path && f.sha256===check.sha256);
        if (!output) continue;
        boundOutputs.push(output);
        approved.add(output.relative);
        for(const receipt of files.values()) if (receiptPath.test(receipt.relative) &&
            passReceiptFor(receipt.full,output)) approved.add(receipt.relative);
      }
      // A producer ledger has to be listed as a SHA-pinned artifact in
      // this *same* successful generation checkpoint. All output checks
      // must correspond to real, matching project PNG bytes. This does
      // not infer a vendor-specific ledger schema or certify art quality.
      if (['CONTINUE','PASS'].includes(checkpoint.outcome) &&
          checks.length>0 && boundOutputs.length===checks.length) {
        for(const ledger of files.values()) {
          if (!producerLedgerPath.test(ledger.relative)) continue;
          try {
            const document=JSON.parse(fs.readFileSync(ledger.full,'utf8'));
            if (document && typeof document==='object' &&
                !Array.isArray(document) && Object.keys(document).length>0)
              approved.add(ledger.relative);
          } catch { /* malformed or non-JSON ledger cannot be exempted */ }
        }
      }
    }
  }
  return approved;
}


/**
 * A successful source-bound revalidation may produce *untracked* evidence
 * while keeping the product HEAD unchanged. Recheck its complete historical
 * proof before exempting the exact contract and its hash-bound mechanical
 * receipt from the source-dirty guard. This is not an artistic PASS.
 */
function confinedEvidenceJson(project, relative) {
  if (typeof relative !== 'string' || !relative.startsWith('artifacts/') ||
      !relative.endsWith('.json') || relative.includes('\\') ||
      relative.split('/').some(part => !part || part === '.' || part === '..')) return null;
  const full=path.resolve(project,relative);
  if (posix(path.relative(project,full))!==relative) return null;
  try {
    const stat=fs.lstatSync(full);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 ||
        stat.size > 8*1024*1024 || fs.realpathSync(full)!==full) return null;
    return {full,relative};
  } catch { return null; }
}

function verifiedRevalidationManifest(project, relative, contract) {
  if (!/^(?:artifacts\/)(?:[^/]+\/)*[^/]*REVALIDATION_BATCH_MANIFEST[^/]*\.json$/i.test(relative))
    return false;
  const file=confinedEvidenceJson(project,relative);
  if (!file) return false;
  try {
    const doc=JSON.parse(fs.readFileSync(file.full,'utf8'));
    if (doc.sourceHead !== undefined && doc.sourceHead !== contract.sourceHeads.current) return false;
    const reference=contract.mechanicalRevalidation.inspected;
    if (!Array.isArray(doc.assets) || !Array.isArray(reference) ||
        doc.assets.length!==reference.length || !reference.length) return false;
    const accepted=inspectArtBatch(doc,{projectDir:project});
    if (accepted.status!=='PASS_ART_BATCH_MECHANICAL' ||
        accepted.inspected.length!==reference.length) return false;
    const expected=new Map();
    for (const item of reference) {
      const absolute=path.resolve(item.path);
      if (expected.has(absolute) || item.status!=='PASS_ART_OUTPUT_MECHANICAL') return false;
      expected.set(absolute,item);
    }
    for (const item of accepted.inspected) {
      const original=expected.get(path.resolve(item.path));
      if (!original || original.sha256!==item.sha256 ||
          original.bytes!==item.bytes ||
          original.dimensions?.width!==item.dimensions?.width ||
          original.dimensions?.height!==item.dimensions?.height) return false;
      expected.delete(path.resolve(item.path));
    }
    return expected.size===0;
  } catch { return false; }
}

function verifiedRevalidationDirt(project, indexPath, entries) {
  const allowed=new Set();
  const contractFile=confinedEvidenceJson(project,indexPath);
  if (!contractFile) return allowed;
  // The validator recomputes SHA-256, HEAD, mappings and all original
  // Web/runtime/PNG receipts; never trust a status field in the JSON alone.
  const verified=inspectSourceBoundRevalidation(project,indexPath);
  if (verified.status!=='PASS_ART_PROGRESS_REVALIDATED') return allowed;
  try {
    const contract=JSON.parse(fs.readFileSync(contractFile.full,'utf8'));
    if (contract.kind!=='STAGE9_4_SOURCE_BOUND_REVALIDATION') return allowed;
    const receipt=confinedEvidenceJson(project,contract.mechanicalRevalidation?.path);
    if (!receipt || digest(receipt.full)!==contract.mechanicalRevalidation.sha256) return allowed;
    allowed.add(indexPath);
    allowed.add(receipt.relative);
    for (const entry of entries) {
      if (!entry.startsWith('?? ')) continue;
      const relative=entry.slice(3);
      if (verifiedRevalidationManifest(project,relative,contract)) allowed.add(relative);
    }
    return allowed;
  } catch { return new Set(); }
}

/**
 * A clean *source* tree can carry untracked project-owned production evidence.
 * Only exact SHA-pinned artifacts from an immutable successful checkpoint are
 * exempted. Edited/staged/tracked product files and uncheckpointed PNGs still
 * block, as do arbitrary files inside art directories.
 *
 * Input is git status --porcelain=v1 -z --untracked-files=all, excluding
 * .ceos-runs. Returning evidenceOnlyDirty never modifies the Git index/files.
 */
export function inspectCheckpointedArtDirt(projectDir,runDir,rawStatus,{progressIndex=null}={}) {
  const entries=String(rawStatus??'').split('\0').filter(Boolean);
  if (!entries.length) return {evidenceOnlyDirty:false,allowedEvidencePaths:[],blockedPaths:[]};
  if (entries.length>1000) return {evidenceOnlyDirty:false,allowedEvidencePaths:[],blockedPaths:['TOO_MANY_CHANGES']};
  const root=fs.realpathSync(projectDir);
  const approved=persistedEvidence(root,runDir);
  const revalidated=progressIndex ? verifiedRevalidationDirt(root,progressIndex,entries) : new Set();
  const allowed=[],blocked=[];
  for(const entry of entries) {
    const status=entry.slice(0,2),relative=entry.slice(3);
    if (status==='??' && ((approved.has(relative) &&
        (pngPath.test(relative) || receiptPath.test(relative) || producerLedgerPath.test(relative))) ||
        revalidated.has(relative))) {
      allowed.push(relative);
    } else {
      blocked.push(relative || 'UNRECOGNIZED_GIT_STATUS');
    }
  }
  return {evidenceOnlyDirty:allowed.length>0 && blocked.length===0,
    allowedEvidencePaths:allowed,blockedPaths:blocked};
}
