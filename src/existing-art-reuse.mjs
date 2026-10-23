import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { decodeProductionPng, inspectArtBatch } from './art-output-gate.mjs';
import { verifyNarrativeDualFormatArt } from './narrative-dual-format-art.mjs';

export const VERIFIED_EXISTING_ART_REUSE = 'VERIFIED_EXISTING_ART_REUSE';
export const DEPENDENCY_BASED_REUSE = 'DEPENDENCY_BASED_REUSE';
export const EXISTING_ART_REUSE_SCHEMA_VERSION = 1;

const SHA = /^[a-f0-9]{64}$/i;
const HEAD = /^[a-f0-9]{40}$/i;
const FORMAT_RATIOS = Object.freeze({ portrait: { ratio: 2 / 3, tolerance: 0.045 }, desktop: { ratio: 16 / 9, tolerance: 0.055 } });
const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function safeRelative(relative) {
  return typeof relative === 'string' && relative.trim() && !path.isAbsolute(relative) &&
    !/^[A-Za-z]:[\\/]/.test(relative) && !relative.split(/[\\/]/).some(part => !part || part === '.' || part === '..');
}

function resolveFile(projectDir, relative, label, issues, artifacts) {
  if (!safeRelative(relative)) {
    issues.push(`${label}_PATH_INVALID`);
    return null;
  }
  const root = fs.realpathSync(projectDir);
  let actual;
  try {
    actual = fs.realpathSync(path.resolve(root, relative));
    if (!actual.startsWith(root + path.sep) || !fs.statSync(actual).isFile()) throw new Error('outside project');
  } catch {
    issues.push(`${label}_FILE_MISSING`);
    return null;
  }
  const bytes = fs.readFileSync(actual);
  const record = {
    path: actual,
    relative: path.relative(root, actual).split(path.sep).join('/'),
    sha256: sha256(bytes),
    size: bytes.length
  };
  artifacts.add(record.relative);
  return { ...record, bytes };
}

function expectedHash(record, expected, label, issues) {
  if (!SHA.test(String(expected ?? ''))) issues.push(`${label}_HASH_INVALID`);
  else if (String(expected).toLowerCase() !== record.sha256) issues.push(`${label}_HASH_MISMATCH`);
}

function readJsonFile(projectDir, relative, label, issues, artifacts) {
  const file = resolveFile(projectDir, relative, label, issues, artifacts);
  if (!file) return null;
  try {
    return { ...file, value: JSON.parse(file.bytes.toString('utf8')) };
  } catch {
    issues.push(`${label}_INVALID`);
    return null;
  }
}

function checkEvidence(projectDir, section, label, currentHead, sourceHead, issues, artifacts, {
  status,
  requirePixels = false,
  dependencyBased = false
} = {}) {
  if (!isRecord(section)) {
    issues.push(`${label}_MISSING`);
    return;
  }
  if (section.status !== status) issues.push(`${label}_STATUS`);
  const current = section.sourceHead === currentHead ||
    (dependencyBased && section.sourceHead === sourceHead);
  if (!current) issues.push(`${label}_CURRENTNESS`);
  if (requirePixels && section.actualPixelsReceived !== true) issues.push(`${label}_PIXELS_MISSING`);
  const evidence = resolveFile(projectDir, section.evidence, `${label}_EVIDENCE`, issues, artifacts);
  if (evidence && section.evidenceSha256 === undefined) issues.push(`${label}_EVIDENCE_HASH_MISSING`);
  else if (evidence) expectedHash(evidence, section.evidenceSha256, `${label}_EVIDENCE`, issues);
}

function checkReceipts(projectDir, receipts, issues, artifacts) {
  if (!Array.isArray(receipts) || receipts.length < 1) {
    issues.push('EXISTING_ART_RECEIPTS_MISSING');
    return;
  }
  for (const [index, receipt] of receipts.entries()) {
    const entry = typeof receipt === 'string' ? { path: receipt } : receipt;
    const file = resolveFile(projectDir, entry?.path, `EXISTING_ART_RECEIPT_${index}`, issues, artifacts);
    if (file && entry.sha256 === undefined) issues.push(`EXISTING_ART_RECEIPT_${index}_HASH_MISSING`);
    else if (file) expectedHash(file, entry.sha256, `EXISTING_ART_RECEIPT_${index}`, issues);
  }
}

function checkDependencies(projectDir, dependencies, currentHead, issues, artifacts) {
  if (!Array.isArray(dependencies) || dependencies.length < 1) {
    issues.push('EXISTING_ART_DEPENDENCIES_MISSING');
    return;
  }
  if (!HEAD.test(currentHead ?? '')) issues.push('EXISTING_ART_CURRENT_HEAD_MISSING');
  for (const [index, dependency] of dependencies.entries()) {
    const file = resolveFile(projectDir, dependency?.path, `EXISTING_ART_DEPENDENCY_${index}`, issues, artifacts);
    if (file) expectedHash(file, dependency.sha256, `EXISTING_ART_DEPENDENCY_${index}`, issues);
  }
}

function checkAssetManifest(projectDir, contract, issues, artifacts) {
  const manifestFile = readJsonFile(projectDir, contract.assetManifest, 'EXISTING_ART_MANIFEST', issues, artifacts);
  if (!manifestFile) return null;
  if (contract.assetManifestSha256 !== undefined) expectedHash(manifestFile, contract.assetManifestSha256, 'EXISTING_ART_MANIFEST', issues);
  const assets = manifestFile.value?.assets;
  if (!Array.isArray(assets) || assets.length < 1) {
    issues.push('EXISTING_ART_MANIFEST_SCHEMA');
    return null;
  }
  const formats = new Set();
  const variants = new Map();
  const gateAssets = [];
  for (const [index, asset] of assets.entries()) {
    const label = `EXISTING_ART_ASSET_${index}`;
    if (!isRecord(asset) || !['portrait', 'desktop'].includes(asset.format)) {
      issues.push(`${label}_FORMAT_INVALID`);
      continue;
    }
    formats.add(asset.format);
    const file = resolveFile(projectDir, asset.path, label, issues, artifacts);
    if (!file) continue;
    variants.set(asset.format, file);
    expectedHash(file, asset.sha256, label, issues);
    let image;
    try { image = decodeProductionPng(file.bytes); }
    catch { issues.push(`${label}_PNG_INVALID`); continue; }
    if (image.width !== asset.width || image.height !== asset.height) issues.push(`${label}_DIMENSIONS_MISMATCH`);
    const format = FORMAT_RATIOS[asset.format];
    if (format && Math.abs(image.width / image.height - format.ratio) > format.tolerance) issues.push(`${label}_ASPECT_RATIO_INVALID`);
    gateAssets.push({ path: asset.path, kind: asset.kind || 'background', width: asset.width, height: asset.height });
  }
  if (!formats.has('portrait') || !formats.has('desktop')) issues.push('EXISTING_ART_FORMAT_COVERAGE');
  if (variants.get('portrait') && variants.get('desktop') &&
      (variants.get('portrait').relative === variants.get('desktop').relative ||
       variants.get('portrait').sha256 === variants.get('desktop').sha256)) {
    issues.push('EXISTING_ART_VARIANTS_NOT_INDEPENDENT');
  }
  const gate = inspectArtBatch({ assets: gateAssets }, { projectDir });
  if (gate.status !== 'PASS_ART_BATCH_MECHANICAL') issues.push(`EXISTING_ART_OUTPUT_GATE:${gate.issues.join(',')}`);
  return { manifestFile, assets, gate };
}

function checkRuntimePixels(projectDir, section, issues, artifacts) {
  if (!Array.isArray(section?.screenshots) || section.screenshots.length < 1) {
    issues.push('EXISTING_ART_RUNTIME_PIXELS_MISSING');
    return;
  }
  for (const [index, screenshot] of section.screenshots.entries()) {
    const entry = typeof screenshot === 'string' ? { path: screenshot } : screenshot;
    const file = resolveFile(projectDir, entry?.path, `EXISTING_ART_RUNTIME_SCREENSHOT_${index}`, issues, artifacts);
    if (!file) continue;
    if (entry.sha256 === undefined) issues.push(`EXISTING_ART_RUNTIME_SCREENSHOT_${index}_HASH_MISSING`);
    else expectedHash(file, entry.sha256, `EXISTING_ART_RUNTIME_SCREENSHOT_${index}`, issues);
    try { decodeProductionPng(file.bytes); }
    catch { issues.push(`EXISTING_ART_RUNTIME_SCREENSHOT_${index}_PNG_INVALID`); }
  }
}

export function verifyExistingArtReuse(projectDir, contract, {
  currentHead,
  narrativeDualFormatRequired = false
} = {}) {
  const issues = [];
  const artifacts = new Set();
  const resolvedProject = path.resolve(projectDir);
  if (!isRecord(contract) || contract.schemaVersion !== EXISTING_ART_REUSE_SCHEMA_VERSION) {
    return { status: 'BLOCKED_VERIFIED_EXISTING_ART_REUSE', errors: ['EXISTING_ART_CONTRACT_INVALID'], artifacts: [] };
  }
  if (contract.mode !== VERIFIED_EXISTING_ART_REUSE) issues.push('EXISTING_ART_MODE_INVALID');
  if (contract.generationInvoked !== false) issues.push('EXISTING_ART_GENERATION_NOT_FALSE');
  const dependencyBased = contract.currentness?.mode === DEPENDENCY_BASED_REUSE;
  const sourceHead = contract.sourceHead;
  if (!HEAD.test(currentHead ?? '') || !HEAD.test(sourceHead ?? '')) issues.push('EXISTING_ART_CURRENTNESS');
  if (dependencyBased) {
    if (contract.currentness.baseHead !== sourceHead) issues.push('EXISTING_ART_CURRENTNESS_BASE');
  } else if (sourceHead !== currentHead) {
    issues.push('EXISTING_ART_CURRENTNESS');
  }
  checkDependencies(resolvedProject, contract.dependencies, currentHead, issues, artifacts);
  const manifest = checkAssetManifest(resolvedProject, contract, issues, artifacts);

  if (narrativeDualFormatRequired || contract.dualFormatManifest !== undefined) {
    if (typeof contract.dualFormatManifest !== 'string' || !contract.dualFormatManifest.trim()) {
      issues.push('EXISTING_ART_DUAL_FORMAT_MANIFEST_MISSING');
    } else {
      // REUSE_SCOPE is backed by the exact real PNG set already checked against
      // the SHA-pinned reuse manifest, never by a fabricated GENERATING batch.
      const expectedReuseOutputs=(manifest?.assets ?? []).map(asset=>({
        path:path.resolve(resolvedProject,asset.path),sha256:asset.sha256
      }));
      const dual = verifyNarrativeDualFormatArt(resolvedProject, contract.dualFormatManifest, {
        currentHead, baseHead: sourceHead, dependencyBased,
        coverageMode:'REUSE_SCOPE', expectedReuseOutputs
      });
      artifacts.add(contract.dualFormatManifest);
      if (dual.status !== 'PASS_DUAL_FORMAT_ART_MECHANICAL') {
        for (const error of dual.errors ?? []) issues.push(`EXISTING_ART_DUAL_FORMAT:${error.code}:${error.id}`);
      }
    }
  }

  if (contract.provenance?.status !== 'DOCUMENTED') issues.push('EXISTING_ART_PROVENANCE_UNKNOWN');
  checkEvidence(resolvedProject, contract.provenance, 'EXISTING_ART_PROVENANCE', currentHead, sourceHead, issues, artifacts, { status: 'DOCUMENTED', dependencyBased });
  const artProfile = contract.artAcceptance?.profile;
  const acceptedV3 = artProfile==='NARRATIVE_ART_ACCEPTANCE_V3' &&
    ['PASS','PASS_WITH_NOTES'].includes(contract.artAcceptance?.status);
  checkEvidence(resolvedProject, contract.artAcceptance, 'EXISTING_ART_ACCEPTANCE', currentHead, sourceHead, issues, artifacts, {
    status: acceptedV3 ? contract.artAcceptance.status : 'PASS', requirePixels: true, dependencyBased
  });
  if (![ 'NARRATIVE_ART_ACCEPTANCE_V2','NARRATIVE_ART_ACCEPTANCE_V3'].includes(artProfile) ||
      !Array.isArray(contract.artAcceptance?.reviewedItems) ||
      contract.artAcceptance.reviewedItems.length < (manifest?.assets?.length ?? 1) ||
      !Array.isArray(contract.artAcceptance?.unresolved) || contract.artAcceptance.unresolved.length > 0) {
    issues.push('EXISTING_ART_ACCEPTANCE_INCOMPLETE');
  }
  checkEvidence(resolvedProject, contract.runtimeEvidence, 'EXISTING_ART_RUNTIME', currentHead, sourceHead, issues, artifacts, {
    status: 'PASS', requirePixels: true, dependencyBased
  });
  checkRuntimePixels(resolvedProject, contract.runtimeEvidence, issues, artifacts);
  if (Array.isArray(contract.runtimeEvidence?.screenshots) &&
      contract.runtimeEvidence.screenshots.length < (manifest?.assets?.length ?? 1)) {
    issues.push('EXISTING_ART_RUNTIME_COVERAGE_INCOMPLETE');
  }
  checkEvidence(resolvedProject, contract.canon, 'EXISTING_ART_CANON', currentHead, sourceHead, issues, artifacts, { status: 'CURRENT', dependencyBased });
  checkReceipts(resolvedProject, contract.receipts, issues, artifacts);

  const summary = contract.issueSummary;
  if (!isRecord(summary) || summary.openP0 !== 0 || summary.openP1 !== 0 || summary.openMaterialP2 !== 0) {
    issues.push('EXISTING_ART_OPEN_BLOCKING_FINDINGS');
  }
  return {
    status: issues.length ? 'BLOCKED_VERIFIED_EXISTING_ART_REUSE' : 'PASS_VERIFIED_EXISTING_ART_REUSE',
    errors: issues,
    artifacts: [...artifacts],
    assetCount: manifest?.assets?.length ?? 0,
    visualAcceptance: issues.length ? 'NOT_VERIFIED' : 'PASS',
    verifiedOutputs: issues.length ? [] : (manifest?.assets ?? []).map(asset=>({
      path:path.resolve(resolvedProject,asset.path),sha256:asset.sha256
    }))
  };
}
