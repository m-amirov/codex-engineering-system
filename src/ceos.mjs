import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseYamlLite } from './yaml-lite.mjs';

export const CEOS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VERSION = fs.readFileSync(path.join(CEOS_ROOT, 'VERSION'), 'utf8').trim();
export const SUPPORTED_PROFILES = ['generic', 'node-web', 'yandex-games', 'twork-desktop', 'platibridge'];
export const SKILL_NAMES = ['audit', 'audit-repair-loop', 'fix', 'verification', 'release', 'visual-qa', 'romance-narrative', 'production-art', 'prod-check', 'incident-analysis'];

export const GLOBAL_INSTRUCTIONS_BEGIN = '<!-- CEOS:GLOBAL:BEGIN -->';
export const GLOBAL_INSTRUCTIONS_END = '<!-- CEOS:GLOBAL:END -->';
export const GLOBAL_AGENT_FILES = [
  { file: 'ceos-bulk-checker.toml', name: 'ceos_bulk_checker', model: 'gpt-5.6-luna', effort: 'low', workload: 'high-volume deterministic checks' },
  { file: 'ceos-explorer.toml', name: 'ceos_explorer', model: 'gpt-5.6-terra', effort: 'medium', workload: 'read-heavy exploration and evidence mapping' },
  { file: 'ceos-implementer.toml', name: 'ceos_implementer', model: 'gpt-5.6', effort: 'medium', workload: 'bounded implementation and refactoring' },
  { file: 'ceos-asset-generator.toml', name: 'ceos_asset_generator', model: 'gpt-5.6', effort: 'medium', workload: 'bounded native image generation and asset integration' },
  { file: 'ceos-debugger.toml', name: 'ceos_debugger', model: 'gpt-5.6', effort: 'high', workload: 'ambiguous or cross-component debugging' },
  { file: 'ceos-reviewer.toml', name: 'ceos_reviewer', model: 'gpt-5.6', effort: 'high', workload: 'correctness, security, architecture and production-risk review' },
  { file: 'ceos-verifier.toml', name: 'ceos_verifier', model: 'gpt-5.6', effort: 'high', workload: 'independent acceptance and release verification' }
];

const SKILL_POLICY_MAP = {
  audit: ['safety', 'evidence', 'git', 'testing', 'stop-conditions'],
  'audit-repair-loop': ['safety', 'evidence', 'git', 'testing', 'production', 'native-delegation', 'stop-conditions'],
  fix: ['safety', 'evidence', 'git', 'testing', 'stop-conditions'],
  verification: ['safety', 'evidence', 'testing', 'stop-conditions'],
  release: ['safety', 'evidence', 'git', 'testing', 'stop-conditions'],
  'visual-qa': ['safety', 'evidence', 'testing', 'stop-conditions'],
  'romance-narrative': ['safety', 'evidence', 'native-delegation', 'stop-conditions'],
  'production-art': ['safety', 'evidence', 'git', 'testing', 'stop-conditions'],
  'prod-check': ['safety', 'evidence', 'production', 'stop-conditions'],
  'incident-analysis': ['safety', 'evidence', 'testing', 'stop-conditions']
};

const PROFILE_SCRIPT_CANDIDATES = {
  generic: {
    lint: ['lint'], test: ['test'], build: ['build']
  },
  'node-web': {
    lint: ['lint'], test: ['test'], build: ['build']
  },
  'yandex-games': {
    lint: ['lint'],
    test: ['test'],
    e2e: ['test:e2e', 'e2e', 'test:browser', 'test:playwright', 'test:e2e:prod'],
    build: ['build'],
    starter_kit_self_test: ['starter-kit:self-test']
  },
  'twork-desktop': {
    lint: ['lint'],
    test: ['test'],
    integration: ['test:integration', 'integration', 'test:e2e', 'e2e', 'test:browser', 'test:playwright'],
    build: ['build']
  },
  platibridge: {
    lint: ['lint'], test: ['test'], build: ['build']
  }
};

export function resolveProject(projectArg = process.cwd()) {
  return path.resolve(projectArg);
}

export function manifestCandidates(projectDir) {
  return [path.join(projectDir, '.codex-os', 'project.yml'), path.join(projectDir, '.codex-os', 'project.yaml'), path.join(projectDir, '.codex-os', 'project.json')];
}

export function loadManifest(projectDir) {
  const file = manifestCandidates(projectDir).find(fs.existsSync);
  if (!file) throw new Error(`CEOS manifest not found under ${path.join(projectDir, '.codex-os')}`);
  const text = fs.readFileSync(file, 'utf8');
  const data = file.endsWith('.json') ? JSON.parse(text) : parseYamlLite(text);
  validateManifest(data);
  return { file, data };
}

export function validateManifest(m) {
  const errors = [];
  if (!m || typeof m !== 'object' || Array.isArray(m)) errors.push('manifest must be an object');
  if (m?.version !== 1) errors.push('version must equal 1');
  if (typeof m?.profile !== 'string' || !SUPPORTED_PROFILES.includes(m.profile)) errors.push(`profile must be one of: ${SUPPORTED_PROFILES.join(', ')}`);
  if (!m?.commands || typeof m.commands !== 'object' || Array.isArray(m.commands)) errors.push('commands must be a map');
  else for (const [k, v] of Object.entries(m.commands)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(k) || k === '.' || k === '..') errors.push(`commands key '${k}' is not a safe gate id`);
    if (typeof v !== 'string' || !v.trim()) errors.push(`commands.${k} must be a non-empty string`);
  }
  if (m?.gates !== undefined) {
    if (!m.gates || typeof m.gates !== 'object' || Array.isArray(m.gates)) errors.push('gates must be a map');
    else for (const [mode, list] of Object.entries(m.gates)) {
      if (!Array.isArray(list) || list.some(x => typeof x !== 'string')) errors.push(`gates.${mode} must be an inline array of command ids`);
      else for (const id of list) if (!m.commands?.[id]) errors.push(`gates.${mode} references unknown command '${id}'`);
    }
  }
  if (m?.production?.access && !['read-only', 'controlled', 'write'].includes(m.production.access)) errors.push('production.access must be read-only, controlled, or write');
  if (m?.browser?.required === true) {
    if (typeof m.browser.gate !== 'string' || !m.commands?.[m.browser.gate]) errors.push('browser.required=true requires browser.gate referencing a command');
    else if (m.gates?.verification && !m.gates.verification.includes(m.browser.gate)) errors.push('browser.gate must be included in gates.verification');
  }
  if (errors.length) throw new Error(`Invalid CEOS manifest:\n- ${errors.join('\n- ')}`);
  return true;
}

export function gitState(projectDir) {
  const inside = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: projectDir, encoding: 'utf8' });
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') return { isRepo: false };
  const branch = spawnSync('git', ['branch', '--show-current'], { cwd: projectDir, encoding: 'utf8' }).stdout.trim();
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: projectDir, encoding: 'utf8' }).stdout.trim();
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: projectDir, encoding: 'utf8' }).stdout;
  return { isRepo: true, branch, head, dirty: Boolean(status.trim()), porcelain: status.trimEnd() };
}

export function classifyCommandRisk(command) {
  const c = ` ${command.toLowerCase()} `;
  const r3 = [
    /\bbuy\b/, /\bpayment\b/, /\bpublish\b/, /npm\s+publish/, /\bdelete\s+from\b/, /\btruncate\b/, /\bdrop\s+(table|database)\b/,
    /curl[^\n]*(--request|-x)\s*(post|put|patch|delete)/, /\bprovider[_ -]?buy\b/
  ];
  const r2 = [
    /\bgit\s+push\b/, /\bdeploy\b/, /\bsystemctl\s+(restart|stop|start|enable|disable)\b/, /\bdocker\s+push\b/,
    /\bkubectl\s+(apply|delete|rollout|scale)\b/, /\bssh\b/, /\brm\s+-rf\b/, /curl[^\n]*(-d|--data|--form)\b/
  ];
  if (r3.some(rx => rx.test(c))) return 'R3';
  if (r2.some(rx => rx.test(c))) return 'R2';
  return 'R0';
}

export function npmScriptForCommand(command) {
  const c = command.trim();
  if (/^npm(?:\.cmd)?\s+test(?:\s|$)/i.test(c)) return 'test';
  const run = c.match(/^npm(?:\.cmd)?\s+(?:run|run-script)\s+([^\s]+)(?:\s|$)/i);
  return run?.[1] ?? null;
}

export function loadPackageJson(projectDir) {
  const file = path.join(projectDir, 'package.json');
  if (!fs.existsSync(file)) return { file, exists: false, data: null, error: null };
  try {
    return { file, exists: true, data: JSON.parse(fs.readFileSync(file, 'utf8')), error: null };
  } catch (e) {
    return { file, exists: true, data: null, error: e.message };
  }
}

export function checkCommandConfiguration(projectDir, command) {
  const script = npmScriptForCommand(command);
  if (!script) return { ok: true, kind: 'external-command', detail: 'not an npm script command' };
  const pkg = loadPackageJson(projectDir);
  if (!pkg.exists) return { ok: false, kind: 'npm-script', script, detail: `package.json not found: ${pkg.file}` };
  if (pkg.error) return { ok: false, kind: 'npm-script', script, detail: `package.json is invalid JSON: ${pkg.error}` };
  const scripts = pkg.data?.scripts;
  if (!scripts || typeof scripts !== 'object' || typeof scripts[script] !== 'string') {
    return { ok: false, kind: 'npm-script', script, detail: `package.json has no script "${script}"` };
  }
  return { ok: true, kind: 'npm-script', script, detail: script };
}

export function resolveGates(manifest, mode = 'verification') {
  const explicit = manifest.gates?.[mode];
  if (explicit) return explicit.map(id => ({ id, command: manifest.commands[id], required: true }));
  if (mode === 'verification') return Object.entries(manifest.commands).map(([id, command]) => ({ id, command, required: true }));
  return [];
}

export function doctor(projectDir) {
  const checks = [];
  checks.push({ id: 'project-dir', ok: fs.existsSync(projectDir), detail: projectDir });
  let loaded;
  try { loaded = loadManifest(projectDir); checks.push({ id: 'manifest', ok: true, detail: loaded.file }); }
  catch (e) { checks.push({ id: 'manifest', ok: false, detail: e.message }); return { ok: false, checks }; }
  const profileFile = path.join(CEOS_ROOT, 'profiles', loaded.data.profile, 'PROFILE.md');
  checks.push({ id: 'profile', ok: fs.existsSync(profileFile), detail: `${loaded.data.profile} → ${profileFile}` });
  const gs = gitState(projectDir);
  checks.push({ id: 'git', ok: true, detail: gs.isRepo ? `${gs.branch || '(detached)'} ${gs.head.slice(0, 12)}${gs.dirty ? ' dirty' : ' clean'}` : 'not a git repository (allowed)' });
  for (const [id, command] of Object.entries(loaded.data.commands)) {
    const risk = classifyCommandRisk(command);
    checks.push({ id: `command-risk:${id}`, ok: risk === 'R0', detail: `${risk} ${command}` });
    const config = checkCommandConfiguration(projectDir, command);
    if (config.kind === 'npm-script') checks.push({ id: `npm-script:${id}`, ok: config.ok, detail: config.detail });
  }
  return { ok: checks.every(c => c.ok), checks, manifest: loaded.data, git: gs };
}

function safeStamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }
function truncate(s, n = 8000) { return s.length <= n ? s : `${s.slice(0, n)}\n...[truncated ${s.length - n} chars]`; }
function failureTypeForGate(id) { return /(^|[_.-])(test|e2e|integration|browser|playwright|smoke)([_.-]|$)/i.test(id) ? 'TEST_FAILURE' : 'COMMAND_FAILURE'; }

export function runVerification(projectDir, { mode = 'verification', evidenceDir, dryRun = false } = {}) {
  const { file: manifestFile, data: manifest } = loadManifest(projectDir);
  const gates = resolveGates(manifest, mode);
  if (!gates.length) throw new Error(`No gates configured for mode '${mode}'`);

  const outputDir = evidenceDir ? path.resolve(evidenceDir) : path.join(projectDir, '.ceos-evidence', `${safeStamp()}-${mode}`);
  fs.mkdirSync(path.join(outputDir, 'gates'), { recursive: true });
  fs.mkdirSync(path.join(outputDir, 'logs'), { recursive: true });
  const startGit = gitState(projectDir);
  fs.writeFileSync(path.join(outputDir, 'manifest.snapshot.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outputDir, 'git.start.json'), JSON.stringify(startGit, null, 2));

  const records = [];
  if (mode === 'release' && manifest.release?.clean_worktree === true) {
    const startedAt = new Date().toISOString();
    const status = startGit.isRepo && !startGit.dirty ? 'PASS' : 'BLOCKED';
    const record = { id: 'ceos.clean_worktree.start', command: 'git status --porcelain', required: true, risk: 'R0', status, startedAt, completedAt: new Date().toISOString(), exitCode: status === 'PASS' ? 0 : null, reason: status === 'PASS' ? undefined : (startGit.isRepo ? 'release.clean_worktree=true but worktree is dirty' : 'release.clean_worktree=true but project is not a git repository') };
    records.push(record);
    fs.writeFileSync(path.join(outputDir, 'gates', 'ceos.clean_worktree.start.json'), JSON.stringify(record, null, 2));
  }

  for (const gate of gates) {
    const risk = classifyCommandRisk(gate.command);
    const startedAt = new Date().toISOString();
    const config = checkCommandConfiguration(projectDir, gate.command);
    let record;
    if (risk !== 'R0') {
      record = { ...gate, risk, status: 'BLOCKED', startedAt, completedAt: new Date().toISOString(), exitCode: null, reason: `Verification runner blocks ${risk} commands` };
    } else if (!config.ok) {
      record = { ...gate, risk, status: 'CONFIGURATION_ERROR', failureType: 'CONFIGURATION_ERROR', startedAt, completedAt: new Date().toISOString(), exitCode: null, reason: config.detail, configuration: config };
    } else if (dryRun) {
      record = { ...gate, risk, status: 'SKIP', startedAt, completedAt: new Date().toISOString(), exitCode: null, reason: 'dry-run' };
    } else {
      const result = spawnSync(gate.command, { cwd: projectDir, shell: true, encoding: 'utf8', env: { ...process.env, CEOS_MODE: mode, CEOS_EVIDENCE_DIR: outputDir }, maxBuffer: 20 * 1024 * 1024 });
      const stdout = result.stdout ?? '';
      const stderr = result.stderr ?? '';
      fs.writeFileSync(path.join(outputDir, 'logs', `${gate.id}.stdout.log`), stdout);
      fs.writeFileSync(path.join(outputDir, 'logs', `${gate.id}.stderr.log`), stderr);
      record = {
        ...gate,
        risk,
        status: result.status === 0 ? 'PASS' : 'FAIL',
        failureType: result.status === 0 ? undefined : failureTypeForGate(gate.id),
        startedAt,
        completedAt: new Date().toISOString(),
        exitCode: result.status,
        stdout: truncate(stdout),
        stderr: truncate(stderr),
        signal: result.signal ?? null,
        error: result.error?.message ?? null
      };
    }
    records.push(record);
    fs.writeFileSync(path.join(outputDir, 'gates', `${gate.id}.json`), JSON.stringify(record, null, 2));
  }

  const endGit = gitState(projectDir);
  if (mode === 'release' && manifest.release?.clean_worktree === true) {
    const startedAt = new Date().toISOString();
    const status = endGit.isRepo && !endGit.dirty ? 'PASS' : 'BLOCKED';
    const record = { id: 'ceos.clean_worktree.end', command: 'git status --porcelain', required: true, risk: 'R0', status, startedAt, completedAt: new Date().toISOString(), exitCode: status === 'PASS' ? 0 : null, reason: status === 'PASS' ? undefined : (endGit.isRepo ? 'release gates left the worktree dirty' : 'release.clean_worktree=true but project is not a git repository') };
    records.push(record);
    fs.writeFileSync(path.join(outputDir, 'gates', 'ceos.clean_worktree.end.json'), JSON.stringify(record, null, 2));
  }

  const required = records.filter(r => r.required);
  let verdict = 'PASS';
  if (required.some(r => r.status === 'FAIL')) verdict = 'FAIL';
  else if (required.some(r => r.status === 'CONFIGURATION_ERROR')) verdict = 'CONFIGURATION_ERROR';
  else if (required.some(r => ['BLOCKED', 'SKIP'].includes(r.status))) verdict = 'BLOCKED';
  const statuses = ['PASS', 'FAIL', 'CONFIGURATION_ERROR', 'BLOCKED', 'SKIP'];
  const summary = {
    schemaVersion: 1,
    ceosVersion: VERSION,
    mode,
    projectDir,
    manifestFile,
    startedAt: records[0]?.startedAt ?? new Date().toISOString(),
    completedAt: new Date().toISOString(),
    host: { platform: process.platform, arch: process.arch, node: process.version, hostname: os.hostname() },
    verdict,
    counts: Object.fromEntries(statuses.map(s => [s, records.filter(r => r.status === s).length])),
    gates: records.map(r => ({ id: r.id, status: r.status, required: r.required, risk: r.risk, exitCode: r.exitCode, failureType: r.failureType, reason: r.reason }))
  };
  fs.writeFileSync(path.join(outputDir, 'git.end.json'), JSON.stringify(endGit, null, 2));
  fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2));
  return { outputDir, summary, records };
}

export function validateEvidence(dir) {
  const root = path.resolve(dir);
  const summaryFile = path.join(root, 'summary.json');
  if (!fs.existsSync(summaryFile)) return { ok: false, errors: ['summary.json missing'] };
  let summary;
  try { summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8')); } catch (e) { return { ok: false, errors: [`summary.json invalid: ${e.message}`] }; }
  const errors = [];
  if (![1].includes(summary.schemaVersion)) errors.push('unsupported/missing schemaVersion');
  if (!['PASS', 'FAIL', 'CONFIGURATION_ERROR', 'BLOCKED'].includes(summary.verdict)) errors.push('invalid verdict');
  if (!Array.isArray(summary.gates) || !summary.gates.length) errors.push('no gate records in summary');
  for (const gate of summary.gates ?? []) {
    const f = path.join(root, 'gates', `${gate.id}.json`);
    if (!fs.existsSync(f)) errors.push(`missing gate evidence: ${gate.id}`);
    else {
      try {
        const g = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (g.status !== gate.status) errors.push(`status mismatch for ${gate.id}`);
      } catch (e) { errors.push(`invalid gate evidence ${gate.id}: ${e.message}`); }
    }
  }
  if (summary.verdict === 'PASS' && summary.gates?.some(g => g.required && g.status !== 'PASS')) errors.push('PASS verdict contains non-PASS required gate');
  return { ok: errors.length === 0, errors, summary };
}

function yamlScalar(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(yamlScalar).join(', ')}]`;
  throw new Error(`Unsupported manifest scalar: ${typeof value}`);
}

function serializeManifestObject(obj, indent = 0) {
  const pad = ' '.repeat(indent);
  const lines = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      lines.push(`${pad}${key}:`);
      lines.push(serializeManifestObject(value, indent + 2));
    } else lines.push(`${pad}${key}: ${yamlScalar(value)}`);
  }
  return lines.filter(Boolean).join('\n');
}

function commandForScript(script) {
  return script === 'test' ? 'npm test' : `npm run ${script}`;
}

export function detectManifestForProject(projectDir, profile) {
  if (!SUPPORTED_PROFILES.includes(profile)) throw new Error(`Unknown profile '${profile}'`);
  const templateFile = path.join(CEOS_ROOT, 'examples', profile, 'project.yml');
  if (!fs.existsSync(templateFile)) throw new Error(`Manifest template missing for profile '${profile}'`);
  const template = parseYamlLite(fs.readFileSync(templateFile, 'utf8'));
  const pkg = loadPackageJson(projectDir);
  if (!pkg.exists || pkg.error || !pkg.data?.scripts || typeof pkg.data.scripts !== 'object') {
    return { manifest: template, detected: false, packageFile: pkg.file, notes: pkg.error ? [`package.json invalid: ${pkg.error}`] : ['package.json/scripts unavailable; used profile template'] };
  }

  const scripts = pkg.data.scripts;
  const candidates = PROFILE_SCRIPT_CANDIDATES[profile] ?? {};
  const commands = {};
  const selectedScripts = {};
  for (const [gateId, names] of Object.entries(candidates)) {
    const selected = names.find(name => typeof scripts[name] === 'string');
    if (selected) {
      commands[gateId] = commandForScript(selected);
      selectedScripts[gateId] = selected;
    }
  }

  const manifest = { ...template, commands };
  if (template.gates) {
    manifest.gates = {};
    for (const [mode, ids] of Object.entries(template.gates)) manifest.gates[mode] = ids.filter(id => commands[id]);
  }
  if (template.browser?.required === true) {
    const gate = template.browser.gate;
    if (commands[gate]) manifest.browser = { ...template.browser };
    else delete manifest.browser;
  }
  validateManifest(manifest);
  const missing = Object.keys(candidates).filter(id => !commands[id]);
  const notes = missing.length ? [`No known npm script detected for: ${missing.join(', ')}`] : [];
  return { manifest, detected: true, packageFile: pkg.file, selectedScripts, missing, notes };
}

export function createManifest(projectDir, profile = 'generic', force = false) {
  if (!SUPPORTED_PROFILES.includes(profile)) throw new Error(`Unknown profile '${profile}'`);
  const dir = path.join(projectDir, '.codex-os');
  const file = path.join(dir, 'project.yml');
  if (fs.existsSync(file) && !force) throw new Error(`${file} already exists (use --force to replace)`);
  fs.mkdirSync(dir, { recursive: true });
  const detection = detectManifestForProject(projectDir, profile);
  fs.writeFileSync(file, `${serializeManifestObject(detection.manifest)}\n`);
  return file;
}

export function latestEvidenceDir(projectDir) {
  const root = path.join(projectDir, '.ceos-evidence');
  if (!fs.existsSync(root)) return null;
  const dirs = fs.readdirSync(root, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => ({ name: d.name, path: path.join(root, d.name), mtime: fs.statSync(path.join(root, d.name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return dirs[0]?.path ?? null;
}

function tailFile(file, lineCount) {
  if (!fs.existsSync(file)) return '';
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  while (lines.length && lines.at(-1) === '') lines.pop();
  return lines.slice(Math.max(0, lines.length - lineCount)).join('\n').trimEnd();
}

export function readFailures(projectDir, { evidenceDir, tail = 80 } = {}) {
  const dir = evidenceDir ? path.resolve(evidenceDir) : latestEvidenceDir(projectDir);
  if (!dir) throw new Error('No evidence directory found');
  const summaryFile = path.join(dir, 'summary.json');
  if (!fs.existsSync(summaryFile)) throw new Error(`summary.json missing under ${dir}`);
  const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
  const failures = [];
  for (const gate of summary.gates ?? []) {
    if (gate.status === 'PASS') continue;
    const gateFile = path.join(dir, 'gates', `${gate.id}.json`);
    const detail = fs.existsSync(gateFile) ? JSON.parse(fs.readFileSync(gateFile, 'utf8')) : gate;
    failures.push({
      id: gate.id,
      status: gate.status,
      failureType: detail.failureType ?? (gate.status === 'CONFIGURATION_ERROR' ? 'CONFIGURATION_ERROR' : gate.status),
      command: detail.command ?? null,
      exitCode: detail.exitCode ?? null,
      reason: detail.reason ?? null,
      stdout: tailFile(path.join(dir, 'logs', `${gate.id}.stdout.log`), tail),
      stderr: tailFile(path.join(dir, 'logs', `${gate.id}.stderr.log`), tail)
    });
  }
  return { evidenceDir: dir, verdict: summary.verdict, failures };
}

export function renderContext(projectDir, skillName) {
  if (!SKILL_NAMES.includes(skillName)) throw new Error(`Unknown skill '${skillName}'`);
  const { data: manifest } = loadManifest(projectDir);
  const sections = [];
  sections.push(`# CEOS resolved context\n\nSkill: ${skillName}\nProfile: ${manifest.profile}\nProduction access: ${manifest.production?.access ?? 'read-only'}\n`);
  const profileFile = path.join(CEOS_ROOT, 'profiles', manifest.profile, 'PROFILE.md');
  sections.push(fs.readFileSync(profileFile, 'utf8').trim());
  for (const policy of SKILL_POLICY_MAP[skillName]) {
    const f = path.join(CEOS_ROOT, 'policies', `${policy}.md`);
    sections.push(fs.readFileSync(f, 'utf8').trim());
  }
  sections.push(`# Project manifest\n\n\`\`\`json\n${JSON.stringify(manifest, null, 2)}\n\`\`\``);
  return sections.join('\n\n---\n\n') + '\n';
}

export function installSkills({ projectDir, scope = 'repo', mode = 'copy', force = false, homeDir = os.homedir() } = {}) {
  if (!['repo', 'user'].includes(scope)) throw new Error('scope must be repo or user');
  if (!['copy', 'link'].includes(mode)) throw new Error('mode must be copy or link');
  if (scope === 'repo' && !projectDir) throw new Error('projectDir is required for repo scope');
  const targetRoot = scope === 'repo' ? path.join(projectDir, '.agents', 'skills') : path.join(homeDir, '.agents', 'skills');
  fs.mkdirSync(targetRoot, { recursive: true });
  const installed = [];
  for (const name of SKILL_NAMES) {
    const source = path.join(CEOS_ROOT, 'skills', name);
    const target = path.join(targetRoot, name);
    if (fs.existsSync(target)) {
      if (!force) throw new Error(`Skill target exists: ${target} (use --force to replace)`);
      fs.rmSync(target, { recursive: true, force: true });
    }
    if (mode === 'copy') fs.cpSync(source, target, { recursive: true });
    else fs.symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir');
    installed.push({ name, source, target, mode });
  }
  return { scope, mode, targetRoot, installed };
}

function sha256Buffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(file) {
  return sha256Buffer(fs.readFileSync(file));
}

function walkFiles(root, current = root, out = []) {
  const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(current, entry.name);
    const rel = path.relative(root, full).split(path.sep).join('/');
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walkFiles(root, full, out);
    else if (stat.isFile()) out.push({ full, rel });
  }
  return out;
}

export function sha256Tree(target) {
  if (!fs.existsSync(target)) return null;
  const stat = fs.statSync(target);
  if (stat.isFile()) return sha256File(target);
  if (!stat.isDirectory()) return null;
  const hash = crypto.createHash('sha256');
  for (const { full, rel } of walkFiles(target)) {
    hash.update(rel); hash.update('\0'); hash.update(fs.readFileSync(full)); hash.update('\0');
  }
  return hash.digest('hex');
}

export function resolveCodexHome({ homeDir = os.homedir(), codexHome } = {}) {
  return path.resolve(codexHome || process.env.CODEX_HOME || path.join(homeDir, '.codex'));
}

export function activeGlobalInstructionsFile(codexHome) {
  const override = path.join(codexHome, 'AGENTS.override.md');
  if (fs.existsSync(override) && fs.readFileSync(override, 'utf8').trim()) return override;
  return path.join(codexHome, 'AGENTS.md');
}

export function renderGlobalInstructionsBlock() {
  const body = fs.readFileSync(path.join(CEOS_ROOT, 'global', 'AGENTS.md'), 'utf8').trim();
  return `${GLOBAL_INSTRUCTIONS_BEGIN}\n<!-- CEOS_VERSION: ${VERSION} -->\n${body}\n${GLOBAL_INSTRUCTIONS_END}`;
}

function markerCount(text, marker) {
  return text.split(marker).length - 1;
}

export function mergeGlobalInstructions(existing = '') {
  const beginCount = markerCount(existing, GLOBAL_INSTRUCTIONS_BEGIN);
  const endCount = markerCount(existing, GLOBAL_INSTRUCTIONS_END);
  if (beginCount !== endCount || beginCount > 1) {
    throw new Error(`Malformed CEOS global instructions markers: begin=${beginCount}, end=${endCount}`);
  }
  const block = renderGlobalInstructionsBlock();
  if (beginCount === 0) {
    const prefix = existing.trimEnd();
    return prefix ? `${prefix}\n\n${block}\n` : `${block}\n`;
  }
  const start = existing.indexOf(GLOBAL_INSTRUCTIONS_BEGIN);
  const endStart = existing.indexOf(GLOBAL_INSTRUCTIONS_END, start);
  if (start < 0 || endStart < start) throw new Error('Malformed CEOS global instructions marker order');
  const end = endStart + GLOBAL_INSTRUCTIONS_END.length;
  return `${existing.slice(0, start)}${block}${existing.slice(end)}`;
}

function sameTree(a, b) {
  const ah = sha256Tree(a); const bh = sha256Tree(b);
  return ah !== null && ah === bh;
}

function installModeMatches(target, mode) {
  if (!fs.existsSync(target)) return false;
  const linked = fs.lstatSync(target).isSymbolicLink();
  return mode === 'link' ? linked : !linked;
}

function isCeosAgentTarget(target, agentName) {
  if (!fs.existsSync(target)) return false;
  try {
    const text = fs.readFileSync(target, 'utf8');
    return text.includes('# CEOS-managed agent;') && text.includes(`name = "${agentName}"`);
  } catch { return false; }
}

function isCeosSkillTarget(target, skillName) {
  const file = path.join(target, 'SKILL.md');
  if (!fs.existsSync(file)) return false;
  try {
    const text = fs.readFileSync(file, 'utf8');
    return new RegExp(`^name:\\s*${skillName}\\s*$`, 'm').test(text) && /^\s*ceos-version:\s*["']?[0-9]/m.test(text);
  } catch { return false; }
}

function backupTarget(target, backupRoot, relative) {
  if (!fs.existsSync(target)) return null;
  const backup = path.join(backupRoot, relative);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  const stat = fs.statSync(target);
  if (stat.isDirectory()) fs.cpSync(target, backup, { recursive: true, dereference: true });
  else fs.copyFileSync(target, backup);
  return backup;
}

function replacePath(source, target, { mode = 'copy', kind = 'dir' } = {}) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (mode === 'copy') {
    if (kind === 'dir') fs.cpSync(source, target, { recursive: true });
    else fs.copyFileSync(source, target);
  } else if (kind === 'dir') {
    fs.symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir');
  } else {
    fs.symlinkSync(source, target, 'file');
  }
}

export function routingTable() {
  return GLOBAL_AGENT_FILES.map(x => ({ name: x.name, model: x.model, reasoningEffort: x.effort, workload: x.workload }));
}

export function globalStatus({ homeDir = os.homedir(), codexHome } = {}) {
  const resolvedHome = path.resolve(homeDir);
  const resolvedCodexHome = resolveCodexHome({ homeDir: resolvedHome, codexHome });
  const instructionsFile = activeGlobalInstructionsFile(resolvedCodexHome);
  const skillsRoot = path.join(resolvedHome, '.agents', 'skills');
  const agentsRoot = path.join(resolvedCodexHome, 'agents');
  const manifestFile = path.join(resolvedCodexHome, 'ceos', 'installation.json');
  const checks = [];

  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch {}

  const instructionsText = fs.existsSync(instructionsFile) ? fs.readFileSync(instructionsFile, 'utf8') : '';
  const expectedBlock = renderGlobalInstructionsBlock();
  checks.push({ id: 'global-instructions', ok: instructionsText.includes(expectedBlock), path: instructionsFile, expectedVersion: VERSION });

  for (const agent of GLOBAL_AGENT_FILES) {
    const source = path.join(CEOS_ROOT, 'agents', agent.file);
    const target = path.join(agentsRoot, agent.file);
    checks.push({ id: `agent:${agent.name}`, ok: sameTree(source, target), path: target, model: agent.model, reasoningEffort: agent.effort });
  }
  for (const name of SKILL_NAMES) {
    const source = path.join(CEOS_ROOT, 'skills', name);
    const target = path.join(skillsRoot, name);
    const modeOk = manifest?.mode && ['copy', 'link'].includes(manifest.mode) ? installModeMatches(target, manifest.mode) : true;
    checks.push({ id: `skill:${name}`, ok: sameTree(source, target) && modeOk, path: target, mode: manifest?.mode ?? null });
  }

  const manifestOk = Boolean(
    manifest?.schemaVersion === 1 &&
    manifest?.version === VERSION &&
    ['copy', 'link'].includes(manifest?.mode) &&
    manifest?.codexHome === resolvedCodexHome &&
    manifest?.instructionsFile === instructionsFile &&
    manifest?.agentsRoot === agentsRoot &&
    manifest?.skillsRoot === skillsRoot &&
    manifest?.instructionsBlockSha256 === sha256Buffer(expectedBlock) &&
    GLOBAL_AGENT_FILES.every(agent => {
      const entry = manifest?.agents?.[agent.name];
      return entry?.file === agent.file && entry?.model === agent.model && entry?.reasoningEffort === agent.effort && entry?.sha256 === sha256Tree(path.join(CEOS_ROOT, 'agents', agent.file));
    }) &&
    SKILL_NAMES.every(name => manifest?.skills?.[name]?.sha256 === sha256Tree(path.join(CEOS_ROOT, 'skills', name)))
  );
  checks.push({ id: 'installation-manifest', ok: manifestOk, path: manifestFile, foundVersion: manifest?.version ?? null });
  return { ok: checks.every(x => x.ok), version: VERSION, codexHome: resolvedCodexHome, instructionsFile, agentsRoot, skillsRoot, manifestFile, manifest, checks };
}

export function installGlobal({ homeDir = os.homedir(), codexHome, mode = 'copy', force = false, dryRun = false } = {}) {
  if (!['copy', 'link'].includes(mode)) throw new Error('mode must be copy or link');
  const resolvedHome = path.resolve(homeDir);
  const resolvedCodexHome = resolveCodexHome({ homeDir: resolvedHome, codexHome });
  const instructionsFile = activeGlobalInstructionsFile(resolvedCodexHome);
  const skillsRoot = path.join(resolvedHome, '.agents', 'skills');
  const agentsRoot = path.join(resolvedCodexHome, 'agents');
  const stateRoot = path.join(resolvedCodexHome, 'ceos');
  const manifestFile = path.join(stateRoot, 'installation.json');
  const existingInstructions = fs.existsSync(instructionsFile) ? fs.readFileSync(instructionsFile, 'utf8') : '';
  const mergedInstructions = mergeGlobalInstructions(existingInstructions);
  const changes = [];
  const conflicts = [];
  const unmanagedConflicts = [];

  if (existingInstructions !== mergedInstructions) changes.push({ type: 'instructions', action: fs.existsSync(instructionsFile) ? 'update' : 'create', target: instructionsFile });

  for (const agent of GLOBAL_AGENT_FILES) {
    const source = path.join(CEOS_ROOT, 'agents', agent.file);
    const target = path.join(agentsRoot, agent.file);
    if (!fs.existsSync(target)) changes.push({ type: 'agent', name: agent.name, action: 'create', source, target });
    else if (!sameTree(source, target)) {
      const item = { type: 'agent', name: agent.name, action: 'replace', source, target };
      changes.push(item);
      if (isCeosAgentTarget(target, agent.name)) conflicts.push(item); else unmanagedConflicts.push(item);
    }
  }

  for (const name of SKILL_NAMES) {
    const source = path.join(CEOS_ROOT, 'skills', name);
    const target = path.join(skillsRoot, name);
    if (!fs.existsSync(target)) changes.push({ type: 'skill', name, action: 'create', source, target, mode });
    else if (!sameTree(source, target) || !installModeMatches(target, mode)) {
      const item = { type: 'skill', name, action: 'replace', source, target, mode };
      changes.push(item);
      if (isCeosSkillTarget(target, name)) conflicts.push(item); else unmanagedConflicts.push(item);
    }
  }

  let existingManifest = null;
  try { existingManifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch {}
  const manifestCurrent = existingManifest?.schemaVersion === 1 && existingManifest?.version === VERSION && existingManifest?.mode === mode && existingManifest?.instructionsFile === instructionsFile && existingManifest?.agentsRoot === agentsRoot && existingManifest?.skillsRoot === skillsRoot;
  if (!manifestCurrent) changes.push({ type: 'manifest', action: fs.existsSync(manifestFile) ? 'update' : 'create', target: manifestFile });

  if (unmanagedConflicts.length) {
    throw new Error(`Refusing to replace targets that are not CEOS-managed:\n- ${unmanagedConflicts.map(x => x.target).join('\n- ')}\nMove or rename these targets explicitly before installing CEOS.`);
  }
  if (conflicts.length && !force) {
    throw new Error(`Global CEOS targets differ from ${VERSION}:\n- ${conflicts.map(x => x.target).join('\n- ')}\nUse --force to back up and replace only these CEOS-owned targets.`);
  }

  const plan = { version: VERSION, mode, dryRun, force, homeDir: resolvedHome, codexHome: resolvedCodexHome, instructionsFile, agentsRoot, skillsRoot, manifestFile, routes: routingTable(), changes, conflicts: conflicts.map(x => x.target), unmanagedConflicts: unmanagedConflicts.map(x => x.target) };
  if (dryRun) return { ...plan, applied: false, backupRoot: null };
  if (!changes.length) {
    const status = globalStatus({ homeDir: resolvedHome, codexHome: resolvedCodexHome });
    return { ...plan, applied: false, alreadyCurrent: true, backupRoot: null, status };
  }

  const needsBackup = changes.some(x => x.action === 'replace' || (x.type === 'instructions' && fs.existsSync(x.target)));
  const backupRoot = needsBackup ? path.join(stateRoot, 'backups', safeStamp()) : null;
  if (backupRoot) fs.mkdirSync(backupRoot, { recursive: true });

  for (const change of changes) {
    if (change.type === 'instructions') {
      if (backupRoot && fs.existsSync(change.target)) backupTarget(change.target, backupRoot, path.join('instructions', path.basename(change.target)));
      fs.mkdirSync(path.dirname(change.target), { recursive: true });
      fs.writeFileSync(change.target, mergedInstructions, 'utf8');
    } else if (change.type === 'agent') {
      if (backupRoot && fs.existsSync(change.target)) backupTarget(change.target, backupRoot, path.join('agents', path.basename(change.target)));
      replacePath(change.source, change.target, { mode: 'copy', kind: 'file' });
    } else if (change.type === 'skill') {
      if (backupRoot && fs.existsSync(change.target)) backupTarget(change.target, backupRoot, path.join('skills', change.name));
      replacePath(change.source, change.target, { mode, kind: 'dir' });
    }
  }

  fs.mkdirSync(stateRoot, { recursive: true });
  const manifest = {
    schemaVersion: 1,
    version: VERSION,
    installedAt: new Date().toISOString(),
    mode,
    codexHome: resolvedCodexHome,
    instructionsFile,
    agentsRoot,
    skillsRoot,
    sourceRoot: CEOS_ROOT,
    instructionsBlockSha256: sha256Buffer(renderGlobalInstructionsBlock()),
    agents: Object.fromEntries(GLOBAL_AGENT_FILES.map(agent => [agent.name, { file: agent.file, model: agent.model, reasoningEffort: agent.effort, sha256: sha256Tree(path.join(CEOS_ROOT, 'agents', agent.file)) }])),
    skills: Object.fromEntries(SKILL_NAMES.map(name => [name, { sha256: sha256Tree(path.join(CEOS_ROOT, 'skills', name)) }]))
  };
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const status = globalStatus({ homeDir: resolvedHome, codexHome: resolvedCodexHome });
  if (!status.ok) throw new Error(`Global installation verification failed:\n- ${status.checks.filter(x => !x.ok).map(x => `${x.id}: ${x.path}`).join('\n- ')}`);
  return { ...plan, applied: true, backupRoot, status };
}
