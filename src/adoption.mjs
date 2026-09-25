import fs from 'node:fs';
import path from 'node:path';
import { detectManifestForProject, gitState, loadPackageJson, manifestCandidates, SUPPORTED_PROFILES } from './ceos.mjs';

const MANAGED_DIR = '.codex-os';
const MANAGED_MANIFEST = `${MANAGED_DIR}/project.yml`;
const REPORT_FILE = `${MANAGED_DIR}/adoption-report.json`;
const STARTER_KIT_MARKERS = ['game-spec.yaml', 'config/skill-policy.json', '.starter-kit'];

function exists(project, relative) { return fs.existsSync(path.join(project, relative)); }
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
function hasScript(pkg, names) { return names.some(name => typeof pkg?.scripts?.[name] === 'string'); }

export function detectAdoptionProfile(projectDir) {
  const project = path.resolve(projectDir);
  const pkg = loadPackageJson(project);
  const notes = [];
  const signals = [];
  if (STARTER_KIT_MARKERS.some(marker => exists(project, marker))) signals.push('starter-kit');
  if (exists(project, 'src') || exists(project, 'public')) signals.push('web-source');
  if (hasScript(pkg.data, ['starter-kit:self-test']) || signals.includes('starter-kit')) {
    return { profile: 'yandex-games', confidence: 'high', signals, notes: ['Detected Yandex/Starter Kit project markers.'] };
  }
  if (hasScript(pkg.data, ['test', 'build']) && (exists(project, 'src') || exists(project, 'public'))) {
    return { profile: 'node-web', confidence: 'medium', signals, notes: ['Detected Node web project from source directory and npm scripts.'] };
  }
  return { profile: null, confidence: 'none', signals, notes: ['Profile is not determinable from the project; pass --profile explicitly.'] };
}

function serialize(value, indent = 0) {
  const pad = ' '.repeat(indent);
  return Object.entries(value).map(([key, item]) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) return `${pad}${key}:\n${serialize(item, indent + 2)}`;
    if (Array.isArray(item)) return `${pad}${key}: [${item.map(x => JSON.stringify(x)).join(', ')}]`;
    return `${pad}${key}: ${JSON.stringify(item)}`;
  }).join('\n');
}

function manifestText(manifest) { return `${serialize(manifest)}\n`; }

export function planAdoption(projectDir, { profile, force = false } = {}) {
  const project = path.resolve(projectDir);
  if (!fs.existsSync(project) || !fs.statSync(project).isDirectory()) throw new Error(`Project directory not found: ${project}`);
  const detection = profile ? { profile, confidence: 'explicit', signals: [], notes: ['Profile supplied explicitly.'] } : detectAdoptionProfile(project);
  if (!detection.profile || !SUPPORTED_PROFILES.includes(detection.profile)) {
    return { status: 'BLOCKED', project, detection, conflicts: ['Profile is missing or cannot be determined safely.'], changes: [], writes: [] };
  }
  const manifestFile = path.join(project, ...MANAGED_MANIFEST.split('/'));
  const reportFile = path.join(project, ...REPORT_FILE.split('/'));
  let detected;
  try { detected = detectManifestForProject(project, detection.profile); }
  catch (error) { return { status: 'BLOCKED', project, detection, conflicts: [error.message], changes: [], writes: [] }; }
  const current = fs.existsSync(manifestFile) ? fs.readFileSync(manifestFile, 'utf8') : null;
  const proposed = manifestText(detected.manifest);
  const conflicts = [];
  if (current !== null && !fs.existsSync(reportFile) && current !== proposed) {
    conflicts.push(`Existing CEOS manifest is not adoption-managed: ${manifestFile}`);
  }
  const changes = [];
  if (current === null) changes.push({ action: 'create', path: MANAGED_MANIFEST });
  else if (current !== proposed) changes.push({ action: 'update', path: MANAGED_MANIFEST });
  const report = {
    schemaVersion: 1,
    operation: 'adoption',
    profile: detection.profile,
    detection,
    managedFiles: [MANAGED_MANIFEST, REPORT_FILE],
    projectOwnedPreserved: ['package.json', 'src/', 'public/', 'assets/', 'scripts/', 'tests/', 'game-spec.yaml'],
    manifest: detected.manifest
  };
  if (!fs.existsSync(reportFile)) changes.push({ action: 'create', path: REPORT_FILE });
  else if (fs.readFileSync(reportFile, 'utf8') !== `${JSON.stringify(report, null, 2)}\n`) changes.push({ action: 'update', path: REPORT_FILE });
  return { status: conflicts.length ? 'CONFLICT' : (changes.length ? 'READY' : 'IN_SYNC'), project, profile: detection.profile, detection, manifest: detected.manifest, conflicts, changes, writes: changes.map(x => x.path), report };
}

export function applyAdoption(plan) {
  if (!['READY', 'IN_SYNC'].includes(plan.status)) throw new Error(`Adoption is not applicable: ${plan.status}`);
  if (plan.status === 'IN_SYNC') return { ...plan, applied: false };
  const root = path.join(plan.project, MANAGED_DIR);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(plan.project, ...MANAGED_MANIFEST.split('/')), manifestText(plan.manifest), 'utf8');
  fs.writeFileSync(path.join(plan.project, ...REPORT_FILE.split('/')), `${JSON.stringify(plan.report, null, 2)}\n`, 'utf8');
  return { ...plan, applied: true, status: 'APPLIED' };
}

export function adoptionStatus(projectDir) {
  const state = gitState(path.resolve(projectDir));
  return { project: path.resolve(projectDir), git: state, manifestCandidates: manifestCandidates(path.resolve(projectDir)) };
}
