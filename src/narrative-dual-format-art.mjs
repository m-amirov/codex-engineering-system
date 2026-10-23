import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { decodeProductionPng } from './art-output-gate.mjs';

const SHA = /^[a-f0-9]{64}$/i;
const HEAD = /^[a-f0-9]{40}$/i;
const FORMATS = Object.freeze({
  portrait: { ratio: 2 / 3, tolerance: 0.045, minWidth: 768, minHeight: 1152 },
  desktop: { ratio: 16 / 9, tolerance: 0.055, minWidth: 1280, minHeight: 720 }
});

const isRecord = x => x && typeof x === 'object' && !Array.isArray(x);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const safeName = s => typeof s === 'string' && /^[A-Za-z0-9_.:-]+$/.test(s);

/** The narrative-game profile belongs to the project, never to unrelated games. */
export function narrativeDualFormatEnabled(projectDir) {
  const config = path.join(projectDir, 'config', 'narrative-game.local.json');
  if (!fs.existsSync(config)) return false;
  try {
    const p = JSON.parse(fs.readFileSync(config, 'utf8'));
    return p?.profile === 'narrative-game' && p?.enabled === true;
  } catch {
    // A broken opt-in must not silently downgrade an illustrated narrative to a generic game.
    throw new Error('NARRATIVE_GAME_PROFILE_INVALID');
  }
}

function readConfinedFile(projectDir, relative, errors, id) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) ||
      /^[A-Za-z]:[\\/]/.test(relative) || relative.includes('\\') ||
      relative.split('/').some(x => !x || x === '.' || x === '..')) {
    errors.push({code:'ART_UNSAFE_PATH', id}); return null;
  }
  try {
    const root = fs.realpathSync(projectDir);
    const actual = fs.realpathSync(path.resolve(root, relative));
    if (!actual.startsWith(root + path.sep) || !fs.statSync(actual).isFile()) {
      errors.push({code:'ART_PATH_ESCAPE', id}); return null;
    }
    return fs.readFileSync(actual);
  } catch {
    errors.push({code:'ART_FILE_MISSING', id}); return null;
  }
}

function pngDimensions(bytes) {
  try {
    const {width,height} = decodeProductionPng(bytes);
    return {width,height};
  } catch { return null; }
}

/** Mechanical contract only; independent Web High must review actual pixels of BOTH variants. */
export function verifyNarrativeDualFormatArt(projectDir, manifestPath, {
  currentHead, baseHead, dependencyBased = false, coverageMode = 'FULL_EPISODE',
  expectedBatchOutputs = null, expectedReuseOutputs = null
} = {}) {
  const errors = [];
  const fail = (code, id = '') => errors.push({code, id});
  const buffer = readConfinedFile(projectDir, manifestPath, errors, 'manifest');
  if (!buffer) return {status:'BLOCKED_DUAL_FORMAT_ART', errors, visualAcceptance:'NOT_VERIFIED'};
  let manifest;
  try { manifest = JSON.parse(buffer.toString('utf8')); } catch { fail('ART_MANIFEST_JSON'); }
  if (!isRecord(manifest) || manifest.schemaVersion !== 1 ||
      manifest.profile !== 'narrative-game' || !Number.isSafeInteger(manifest.episode) ||
      manifest.episode < 1 || !isRecord(manifest.sceneAssets) || !isRecord(manifest.assets))
    return {status:'BLOCKED_DUAL_FORMAT_ART', errors:[...errors,{code:'ART_MANIFEST_SCHEMA',id:''}],visualAcceptance:'NOT_VERIFIED'};
  const head = currentHead ?? spawnSync('git',['rev-parse','HEAD'],{cwd:projectDir,encoding:'utf8'}).stdout?.trim();
  const sourceCurrent = manifest.sourceHead === head ||
    (dependencyBased && manifest.sourceHead === baseHead);
  if (!HEAD.test(head ?? '') || !sourceCurrent) fail('ART_SOURCE_HEAD_MISMATCH');

  if (!['FULL_EPISODE','BATCH_ONLY','REUSE_SCOPE'].includes(coverageMode)) fail('ART_COVERAGE_MODE_INVALID');

  // Inventory is drawn from the real narrative graph. BATCH_ONLY checks a
  // positive set of actual authored scene IDs and all six-ish real outputs
  // already pinned by the GENERATING checkpoint. It NEVER claims episode PASS.
  const profileBytes = readConfinedFile(projectDir,'config/narrative-game.local.json',errors,'profile');
  let profile;
  try { profile = JSON.parse(profileBytes.toString('utf8')); } catch { fail('ART_PROFILE_JSON'); }
  if (profile?.profile !== 'narrative-game' || profile.enabled !== true) fail('ART_PROFILE_NOT_ENABLED');
  const graphBytes = profile?.modelPath
    ? readConfinedFile(projectDir,profile.modelPath,errors,'graph') : null;
  let graph;
  try { graph = JSON.parse(graphBytes.toString('utf8')); } catch { fail('ART_GRAPH_JSON'); }
  const required = (Array.isArray(graph?.scenes) ? graph.scenes : [])
    .filter(s => s?.episode === manifest.episode).map(s=>s.id);
  if (!required.length || new Set(required).size !== required.length) fail('ART_EPISODE_SCENES_MISSING');
  const declaredScenes=Object.keys(manifest.sceneAssets);
  const scoped=coverageMode!=='FULL_EPISODE';
  const reuseScope=coverageMode==='REUSE_SCOPE';
  const scopedOutputs=reuseScope ? expectedReuseOutputs : expectedBatchOutputs;
  if (scoped && (!declaredScenes.length || !Array.isArray(scopedOutputs) ||
      !scopedOutputs.length)) fail(reuseScope?'ART_REUSE_EVIDENCE_REQUIRED':'ART_BATCH_EVIDENCE_REQUIRED');
  for (const id of (scoped?declaredScenes:required))
    if (!safeName(id) || !safeName(manifest.sceneAssets[id]))
      fail('ART_SCENE_UNMAPPED',String(id));
  for (const id of declaredScenes)
    if (!required.includes(id)) fail('ART_SCENE_EXTRA',id);
  const used = new Set((scoped?declaredScenes:required).map(id=>manifest.sceneAssets[id]).filter(safeName));
  for (const id of used) if (!Object.hasOwn(manifest.assets,id)) fail('ART_ASSET_UNDECLARED',id);
  for (const id of Object.keys(manifest.assets)) if (!used.has(id)) fail('ART_ASSET_ORPHAN',id);

  const observedScope=new Map();
  const expected=new Map();
  if (scoped && Array.isArray(scopedOutputs)) {
    for (const output of scopedOutputs) {
      const absolute=path.resolve(String(output?.path ?? ''));
      if (!SHA.test(output?.sha256 ?? '') ||
          expected.has(absolute) || !path.isAbsolute(output?.path ?? ''))
        fail(reuseScope?'ART_REUSE_EVIDENCE_INVALID':'ART_BATCH_EVIDENCE_INVALID',String(output?.path ?? ''));
      expected.set(absolute, String(output.sha256 ?? '').toLowerCase());
    }
  }

  let inspected = 0;
  for (const id of used) {
    const asset = manifest.assets[id];
    if (!isRecord(asset)) { fail('ART_ASSET_SCHEMA',id); continue; }
    const signatures = [];
    for (const [format,shape] of Object.entries(FORMATS)) {
      const variant = asset[format];
      if (!isRecord(variant)) { fail('ART_VARIANT_MISSING',id+':'+format); continue; }
      const bytes = readConfinedFile(projectDir,variant.path,errors,id+':'+format);
      if (!bytes) continue;
      const digest = sha(bytes);
      if (!SHA.test(variant.sha256 ?? '') || variant.sha256.toLowerCase() !== digest)
        fail('ART_VARIANT_HASH_MISMATCH',id+':'+format);
      const size = pngDimensions(bytes);
      if (!size || variant.width !== size.width || variant.height !== size.height ||
          size.width < shape.minWidth || size.height < shape.minHeight ||
          Math.abs(size.width / size.height - shape.ratio) > shape.tolerance)
        fail('ART_VARIANT_FORMAT_INVALID',id+':'+format);
      signatures.push({path:variant.path,sha256:digest});
      if (scoped) {
        const abs=path.resolve(projectDir,variant.path);
        if (!expected.has(abs) || expected.get(abs)!==digest)
          fail(reuseScope?'ART_REUSE_VARIANT_NOT_VERIFIED':'ART_BATCH_VARIANT_NOT_GENERATED',id+':'+format);
        else observedScope.set(abs,digest);
      }
      inspected++;
    }
    if (signatures.length === 2 &&
        (signatures[0].path === signatures[1].path || signatures[0].sha256 === signatures[1].sha256))
      fail('ART_VARIANTS_NOT_INDEPENDENT',id);
  }
  if (scoped && (expected.size!==observedScope.size ||
      [...expected].some(([f,h])=>observedScope.get(f)!==h)))
    fail(reuseScope?'ART_REUSE_OUTPUT_COVERAGE_MISMATCH':'ART_BATCH_OUTPUT_COVERAGE_MISMATCH');
  const fullEpisodeCovered=required.length>0 &&
    required.every(id=>safeName(manifest.sceneAssets[id]) &&
      used.has(manifest.sceneAssets[id])) &&
    declaredScenes.length===required.length;
  return {
    status:errors.length?'BLOCKED_DUAL_FORMAT_ART':'PASS_DUAL_FORMAT_ART_MECHANICAL',
    coverageMode,episode:manifest.episode,requiredScenes:required.length,
    mappedScenes:required.filter(id=>used.has(manifest.sceneAssets[id])).length,
    coveredSceneIds:scoped?declaredScenes.sort():[...required].sort(),
    fullEpisodeCovered,episodeFinalAcceptance:'NOT_VERIFIED',releaseReady:false,
    uniqueAssets:used.size,variantFilesChecked:inspected,visualAcceptance:'NOT_VERIFIED',
    errors,
    disclaimer:'Mechanical verification of authored scenes only. BATCH_ONLY and REUSE_SCOPE are never episode-final acceptance; real runtime/Web High review remains mandatory.'
  };
}
