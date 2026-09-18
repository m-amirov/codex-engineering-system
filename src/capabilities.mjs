import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { VERSION, loadManifest, loadPackageJson, resolveCodexHome } from './ceos.mjs';

const IMAGE_STATES = new Set(['available', 'unavailable', 'unknown']);

function commandProbe(command, args = ['--version']) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 1500,
    windowsHide: true
  });
  return {
    available: result.status === 0,
    exitCode: result.status,
    version: (result.stdout || result.stderr || '').trim().split(/\r?\n/)[0] || null,
    error: result.error?.message ?? null
  };
}

function access(pathname, mode) {
  try {
    fs.accessSync(pathname, mode);
    return true;
  } catch {
    return false;
  }
}

function normalizeImageGeneration(value) {
  const fromOption = value == null ? null : String(value).trim().toLowerCase();
  const fromEnv = process.env.CEOS_IMAGE_GENERATION_CAPABILITY?.trim().toLowerCase() || null;
  const selected = fromOption || fromEnv || 'unknown';
  if (!IMAGE_STATES.has(selected)) {
    throw new Error(`image-generation capability must be one of: ${[...IMAGE_STATES].join(', ')}`);
  }
  return {
    status: selected,
    source: fromOption ? 'cli-attestation' : fromEnv ? 'environment-attestation' : 'unobserved'
  };
}

function projectBrowserCapability(projectDir, manifest, pkg) {
  const scripts = pkg?.data?.scripts && typeof pkg.data.scripts === 'object' ? Object.keys(pkg.data.scripts) : [];
  const deps = {
    ...(pkg?.data?.dependencies || {}),
    ...(pkg?.data?.devDependencies || {})
  };
  const scriptDetected = scripts.some(name => /(e2e|browser|playwright)/i.test(name));
  const dependencyDetected = Boolean(deps.playwright || deps['@playwright/test'] || deps.puppeteer);
  const configured = Boolean(manifest?.browser?.required || manifest?.browser?.gate || scriptDetected || dependencyDetected);
  return {
    configured,
    requiredByManifest: manifest?.browser?.required === true,
    gate: manifest?.browser?.gate ?? null,
    source: manifest?.browser ? 'manifest' : scriptDetected ? 'npm-script' : dependencyDetected ? 'dependency' : 'none'
  };
}

function installedNativeAgents(codexHome) {
  const root = path.join(codexHome, 'agents');
  const required = [
    'ceos-bulk-checker.toml',
    'ceos-explorer.toml',
    'ceos-implementer.toml',
    'ceos-asset-generator.toml',
    'ceos-debugger.toml',
    'ceos-reviewer.toml',
    'ceos-verifier.toml'
  ];
  return {
    root,
    present: required.filter(file => fs.existsSync(path.join(root, file))),
    missing: required.filter(file => !fs.existsSync(path.join(root, file)))
  };
}

export function collectCapabilities(projectDir, {
  codexHome,
  webPreflightResult = null,
  imageGeneration
} = {}) {
  const resolvedProject = path.resolve(projectDir);
  const resolvedCodexHome = resolveCodexHome({ homeDir: os.homedir(), codexHome });

  let manifest = null;
  let manifestFile = null;
  let manifestError = null;
  try {
    const loaded = loadManifest(resolvedProject);
    manifest = loaded.data;
    manifestFile = loaded.file;
  } catch (error) {
    manifestError = error.message;
  }

  const pkg = loadPackageJson(resolvedProject);
  const nodeProbe = { available: true, exitCode: 0, version: process.version, error: null };
  const npmProbe = commandProbe(process.platform === 'win32' ? 'npm.cmd' : 'npm');
  const gitProbe = commandProbe('git');
  const image = normalizeImageGeneration(imageGeneration);
  const nativeAgents = installedNativeAgents(resolvedCodexHome);

  const web = webPreflightResult ? {
    status: webPreflightResult.status,
    ready: webPreflightResult.status === 'READY',
    reason: webPreflightResult.reason ?? null,
    manifestFile: webPreflightResult.manifestFile ?? null,
    healthUrl: webPreflightResult.healthUrl ?? null,
    source: 'live-preflight'
  } : {
    status: 'UNKNOWN',
    ready: false,
    reason: 'web preflight was not supplied',
    manifestFile: null,
    healthUrl: null,
    source: 'unobserved'
  };

  return {
    schemaVersion: 1,
    ceosVersion: VERSION,
    observedAt: new Date().toISOString(),
    projectDir: resolvedProject,
    codexHome: resolvedCodexHome,
    filesystem: {
      exists: fs.existsSync(resolvedProject),
      readable: access(resolvedProject, fs.constants.R_OK),
      writable: access(resolvedProject, fs.constants.W_OK)
    },
    executables: {
      node: nodeProbe,
      npm: npmProbe,
      git: gitProbe
    },
    project: {
      manifest: {
        available: Boolean(manifest),
        file: manifestFile,
        profile: manifest?.profile ?? null,
        productionAccess: manifest?.production?.access ?? 'read-only',
        error: manifestError
      },
      packageJson: {
        available: pkg.exists && !pkg.error,
        file: pkg.file,
        error: pkg.error
      },
      browser: projectBrowserCapability(resolvedProject, manifest, pkg)
    },
    web,
    imageGeneration: image,
    nativeAgents,
    limitations: [
      ...(image.status === 'unknown' ? ['Native image generation cannot be introspected by the standalone Node CLI; the host must attest availability with --image-generation or CEOS_IMAGE_GENERATION_CAPABILITY.'] : []),
      ...(!manifest ? ['No CEOS project manifest was resolved; project-native gate discovery is limited.'] : [])
    ]
  };
}

export function capabilityBlockers(capabilities, { pipeline, webRequired = false } = {}) {
  const blockers = [];
  if (!capabilities?.filesystem?.exists) blockers.push({ code: 'PROJECT_MISSING', reason: 'project directory does not exist' });
  if (!capabilities?.filesystem?.readable) blockers.push({ code: 'PROJECT_NOT_READABLE', reason: 'project directory is not readable' });
  if (!capabilities?.filesystem?.writable) blockers.push({ code: 'PROJECT_NOT_WRITABLE', reason: 'project directory is not writable' });
  if (webRequired && capabilities?.web?.status !== 'READY') {
    blockers.push({ code: 'WEB_REQUIRED_NOT_READY', reason: `Web review required but preflight is ${capabilities?.web?.status ?? 'UNKNOWN'}` });
  }
  if (pipeline === 'production-art' && capabilities?.imageGeneration?.status === 'unavailable') {
    blockers.push({ code: 'IMAGE_GENERATION_UNAVAILABLE', reason: 'native image generation is explicitly unavailable' });
  }
  return blockers;
}
