#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CEOS_ROOT, VERSION, SUPPORTED_PROFILES, SKILL_NAMES, resolveProject, loadManifest, doctor, gitState, resolveGates, runVerification, validateEvidence, createManifest, detectManifestForProject, latestEvidenceDir, readFailures, renderContext, installSkills, installGlobal, globalStatus, routingTable } from '../src/ceos.mjs';
import { webPreflight } from '../src/web-preflight.mjs';
import { collectCapabilities } from '../src/capabilities.mjs';
import { createRun, recordCheckpoint, refreshRunCapabilities, resumeRun, executionStatus, recordRoutingTrace, EXECUTION_PIPELINES } from '../src/execution-engine.mjs';
import { planAdoption, applyAdoption } from '../src/adoption.mjs';

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) out._.push(a);
    else {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; }
      else out[key] = true;
    }
  }
  return out;
}
function print(obj, json = false) {
  if (json) console.log(JSON.stringify(obj, null, 2));
  else if (typeof obj === 'string') console.log(obj);
  else console.log(JSON.stringify(obj, null, 2));
}
function listArg(value) {
  if (value === undefined || value === null || value === true) return [];
  return String(value).split(';').map(x => x.trim()).filter(Boolean);
}
function metadataArg(args) {
  let metadata = {};
  if (args['metadata-json']) {
    try { metadata = JSON.parse(String(args['metadata-json'])); }
    catch (e) { throw new Error(`--metadata-json must be valid JSON: ${e.message}`); }
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('--metadata-json must be a JSON object');
  }
  if (args['defect-count'] !== undefined) {
    const count = Number(args['defect-count']);
    if (!Number.isInteger(count) || count < 0) throw new Error('--defect-count must be a non-negative integer');
    metadata.defectCount = count;
  }
  return metadata;
}
function timeoutArg(args) {
  const timeoutMs = args['timeout-ms'] ? Number(args['timeout-ms']) : 1200;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10000) throw new Error('--timeout-ms must be an integer from 100 to 10000');
  return timeoutMs;
}
async function capabilitySnapshot(args, project) {
  const web = await webPreflight({
    codexHome: args['codex-home'] || undefined,
    healthUrl: args.url || undefined,
    timeoutMs: timeoutArg(args)
  });
  return collectCapabilities(project, {
    codexHome: args['codex-home'] || undefined,
    webPreflightResult: web,
    imageGeneration: args['image-generation'] === true ? undefined : args['image-generation']
  });
}
function executionExitCode(run, integrity = { ok: true }) {
  if (!integrity.ok) return 2;
  if (run.verdict === 'FAIL') return 1;
  if (run.verdict === 'BLOCKED') return 2;
  if (run.verdict === 'ESCALATE') return 3;
  return 0;
}
function printExecution(result) {
  const run = result.run;
  console.log(`Run: ${run.runId}`);
  console.log(`Pipeline: ${run.pipeline}`);
  console.log(`State: ${run.state}`);
  console.log(`Cycle: ${run.cycle}/${run.maxCycles}`);
  if (result.integrity) console.log(`Integrity: ${result.integrity.ok ? 'PASS' : 'FAIL'}`);
  if (result.nextAction?.terminal) {
    console.log(`VERDICT: ${result.nextAction.verdict}`);
    if (result.nextAction.reason) console.log(`Reason: ${JSON.stringify(result.nextAction.reason)}`);
  } else if (result.nextAction) {
    console.log(`Next: ${result.nextAction.stage}`);
    console.log(result.nextAction.description);
    for (const requirement of result.nextAction.requirements ?? []) console.log(`- ${requirement}`);
  }
  console.log(`State: ${result.runDir}/run.json`);
}
function usage() {
  console.log(`Codex Engineering OS ${VERSION}

Usage:
  ceos init --profile <profile> [--project dir]
  ceos adopt --project dir [--profile profile] [--dry-run] [--force] [--json]
  ceos status [--project dir] [--json]
  ceos doctor [--project dir] [--json]
  ceos gates [--mode verification|release] [--project dir] [--json]
  ceos verify [--mode verification|release] [--project dir] [--evidence dir] [--dry-run] [--json]
  ceos evidence [--path dir | --project dir] [--json]
  ceos failures [--path dir | --project dir] [--tail lines] [--json]
  ceos profile [--project dir]
  ceos context --skill <name> [--project dir]
  ceos web-preflight [--codex-home dir] [--url http://127.0.0.1:17841/healthz] [--timeout-ms 1200] [--json]
  ceos capabilities [--project dir] [--image-generation available|unavailable|unknown] [--json]
  ceos run <audit-repair-loop|production-art> --target <text> --in-scope <a;b> --acceptance <text> --mutation-boundary <text> [--out-of-scope <a;b>] [--web-required] [--max-cycles N] [--image-generation state] [--json]
  ceos checkpoint [run-id|latest] --stage <stage> [--artifact <path;path>] [--outcome CONTINUE|PASS|FAIL|BLOCKED|ESCALATE] [--metadata-json json] [--defect-count N] [--skip] [--note text] [--json]
  ceos resume [run-id|latest] [--refresh-capabilities] [--image-generation state] [--json]
  ceos run-status [run-id|latest] [--json]
  ceos routing-trace [run-id|latest] [--web-agents <a;b>] [--native-fallback] [--fallback-reason text] [--json]
  ceos install-skills --scope repo|user [--mode copy|link] [--project dir] [--force]
  ceos install-global [--mode copy|link] [--force] [--dry-run] [--codex-home dir] [--json]
  ceos global-status [--codex-home dir] [--json]
  ceos routing [--json]
  ceos self-test

Pipelines: ${Object.keys(EXECUTION_PIPELINES).join(', ')}
Profiles: ${SUPPORTED_PROFILES.join(', ')}
Skills: ${SKILL_NAMES.join(', ')}`);
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] ?? 'help';
const project = resolveProject(args.project || process.cwd());
try {
  switch (cmd) {
    case 'help': case '--help': case '-h': usage(); break;
    case 'version': console.log(VERSION); break;
    case 'init': {
      const profile = args.profile || 'generic';
      const detection = detectManifestForProject(project, profile);
      const file = createManifest(project, profile, Boolean(args.force));
      console.log(`Created ${file}`);
      if (detection.detected) {
        const selected = Object.entries(detection.selectedScripts ?? {}).map(([gate, script]) => `${gate}=${script}`);
        if (selected.length) console.log(`Detected npm scripts: ${selected.join(', ')}`);
        if (detection.missing?.length) console.log(`Not configured (no known npm script): ${detection.missing.join(', ')}`);
      } else for (const note of detection.notes ?? []) console.log(`Note: ${note}`);
      break;
    }
    case 'adopt': {
      if (args.help) {
        console.log('Usage: ceos adopt --project <dir> [--profile <profile>] [--dry-run] [--force] [--json]');
        console.log('Adds only CEOS-owned .codex-os adoption files; dry-run plans without writes.');
        break;
      }
      const plan = planAdoption(project, { profile: args.profile, force: Boolean(args.force) });
      if (args['dry-run']) {
        print(plan, Boolean(args.json));
      } else if (!args.json) {
        console.log(`Adoption ${plan.status}: ${plan.project}`);
        console.log(`Profile: ${plan.profile ?? '(undetermined)'}`);
        for (const change of plan.changes) console.log(`${change.action}: ${change.path}`);
        for (const conflict of plan.conflicts) console.log(`CONFLICT: ${conflict}`);
      }
      if (!args['dry-run'] && plan.status === 'READY') {
        const applied = applyAdoption(plan);
        if (args.json) print(applied, true); else console.log('VERDICT: APPLIED');
      } else if (!args['dry-run'] && args.json) print(plan, true);
      process.exitCode = ['READY', 'IN_SYNC', 'APPLIED'].includes(plan.status) ? 0 : 2;
      break;
    }
    case 'status': {
      const loaded = loadManifest(project); const git = gitState(project);
      const data = { ceosVersion: VERSION, project, manifest: loaded.file, profile: loaded.data.profile, productionAccess: loaded.data.production?.access ?? 'read-only', git };
      if (args.json) print(data, true); else {
        console.log(`CEOS ${VERSION}\nProject: ${project}\nProfile: ${data.profile}\nProduction: ${data.productionAccess}\nGit: ${git.isRepo ? `${git.branch || '(detached)'} ${git.head.slice(0,12)} ${git.dirty ? 'dirty' : 'clean'}` : 'not a repository'}`);
      }
      break;
    }
    case 'doctor': {
      const d = doctor(project);
      if (args.json) print(d, true); else {
        for (const c of d.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.id}  ${c.detail}`);
        console.log(`\nVERDICT: ${d.ok ? 'PASS' : 'FAIL'}`);
      }
      process.exitCode = d.ok ? 0 : 1; break;
    }
    case 'gates': {
      const { data } = loadManifest(project); const mode = args.mode || 'verification'; const gates = resolveGates(data, mode);
      if (args.json) print({ mode, gates }, true); else gates.forEach(g => console.log(`${g.id}: ${g.command}`));
      break;
    }
    case 'verify': {
      const result = runVerification(project, { mode: args.mode || 'verification', evidenceDir: args.evidence, dryRun: Boolean(args['dry-run']) });
      if (args.json) print({ outputDir: result.outputDir, summary: result.summary }, true); else {
        result.records.forEach(r => console.log(`${r.status.padEnd(19)} ${r.id} [${r.risk}]${r.exitCode === null ? '' : ` exit=${r.exitCode}`}${r.failureType ? ` ${r.failureType}` : ''}${r.reason && r.status === 'CONFIGURATION_ERROR' ? ` — ${r.reason}` : ''}`));
        console.log(`\nEvidence: ${result.outputDir}\nVERDICT: ${result.summary.verdict}`);
      }
      process.exitCode = result.summary.verdict === 'PASS' ? 0 : result.summary.verdict === 'FAIL' ? 1 : result.summary.verdict === 'BLOCKED' ? 2 : 3; break;
    }
    case 'evidence': {
      const dir = args.path ? path.resolve(args.path) : latestEvidenceDir(project);
      if (!dir) throw new Error('No evidence directory found');
      const r = validateEvidence(dir);
      if (args.json) print({ path: dir, ...r }, true); else {
        console.log(`Evidence: ${dir}`); console.log(r.ok ? 'VALID' : `INVALID\n- ${r.errors.join('\n- ')}`);
        if (r.summary) console.log(`VERDICT: ${r.summary.verdict}`);
      }
      process.exitCode = r.ok ? 0 : 1; break;
    }
    case 'failures': {
      const tail = args.tail ? Number(args.tail) : 80;
      if (!Number.isInteger(tail) || tail < 1 || tail > 5000) throw new Error('--tail must be an integer from 1 to 5000');
      const result = readFailures(project, { evidenceDir: args.path, tail });
      if (args.json) print(result, true); else {
        console.log(`Evidence: ${result.evidenceDir}`);
        if (!result.failures.length) console.log('No non-PASS gates found.');
        for (const f of result.failures) {
          console.log(`\n${f.failureType || f.status}  ${f.id}${f.exitCode === null ? '' : ` exit=${f.exitCode}`}`);
          if (f.command) console.log(`Command: ${f.command}`);
          if (f.reason) console.log(`Reason: ${f.reason}`);
          if (f.stdout) console.log(`--- stdout (last ${tail} lines) ---\n${f.stdout}`);
          if (f.stderr) console.log(`--- stderr (last ${tail} lines) ---\n${f.stderr}`);
        }
        console.log(`\nVERDICT: ${result.verdict}`);
      }
      process.exitCode = result.failures.length ? 1 : 0; break;
    }
    case 'profile': {
      const { data } = loadManifest(project); console.log(data.profile); break;
    }
    case 'context': {
      if (!args.skill) throw new Error('--skill is required');
      process.stdout.write(renderContext(project, args.skill)); break;
    }
    case 'web-preflight': {
      const result = await webPreflight({ codexHome: args['codex-home'] || undefined, healthUrl: args.url || undefined, timeoutMs: timeoutArg(args) });
      if (args.json) print(result, true); else {
        console.log(`WEB ${result.status}  ${result.reason}`);
        console.log(`Manifest: ${result.manifestFile}`);
        console.log(`Health: ${result.healthUrl}`);
        if (result.activity) console.log(`Activity: ${JSON.stringify(result.activity)}`);
        if (result.retryAfterSeconds != null) console.log(`Retry-After: ${result.retryAfterSeconds}s`);
      }
      process.exitCode = ['UNAVAILABLE', 'NOT_ACCEPTING_TURNS', 'RATE_LIMITED'].includes(result.status) ? 2 : 0;
      break;
    }
    case 'capabilities': {
      const result = await capabilitySnapshot(args, project);
      if (args.json) print(result, true); else {
        console.log(`CEOS ${VERSION} capabilities`);
        console.log(`Filesystem: read=${result.filesystem.readable} write=${result.filesystem.writable}`);
        console.log(`Git: ${result.executables.git.available ? 'available' : 'unavailable'}`);
        console.log(`Web: ${result.web.status}`);
        console.log(`Image generation: ${result.imageGeneration.status} (${result.imageGeneration.source})`);
        console.log(`Project manifest: ${result.project.manifest.available ? result.project.manifest.profile : 'not resolved'}`);
        for (const limitation of result.limitations) console.log(`LIMITATION: ${limitation}`);
      }
      break;
    }
    case 'run': {
      const pipeline = args._[1];
      if (!pipeline) throw new Error('pipeline is required');
      const capabilities = await capabilitySnapshot(args, project);
      const result = createRun(project, pipeline, {
        scope: {
          target: args.target,
          inScope: listArg(args['in-scope']),
          outOfScope: listArg(args['out-of-scope']),
          acceptanceContract: args.acceptance,
          mutationBoundary: args['mutation-boundary']
        },
        capabilities,
        webRequired: Boolean(args['web-required']),
        maxCycles: args['max-cycles']
      });
      if (args.json) print(result, true); else printExecution(result);
      process.exitCode = executionExitCode(result.run);
      break;
    }
    case 'checkpoint': {
      const runRef = args._[1] || 'latest';
      if (!args.stage) throw new Error('--stage is required');
      const result = recordCheckpoint(project, runRef, {
        stage: String(args.stage).toUpperCase(),
        artifacts: listArg(args.artifact),
        outcome: args.outcome || 'CONTINUE',
        metadata: metadataArg(args),
        note: args.note === true ? null : args.note,
        skipped: Boolean(args.skip)
      });
      if (args.json) print(result, true); else printExecution(result);
      process.exitCode = executionExitCode(result.run, result.integrity);
      break;
    }
    case 'resume': {
      const runRef = args._[1] || 'latest';
      let result;
      if (args['refresh-capabilities']) {
        const capabilities = await capabilitySnapshot(args, project);
        result = refreshRunCapabilities(project, runRef, capabilities);
      } else result = resumeRun(project, runRef);
      if (args.json) print(result, true); else printExecution(result);
      process.exitCode = executionExitCode(result.run, result.integrity);
      break;
    }
    case 'run-status': {
      const result = executionStatus(project, args._[1] || 'latest');
      if (args.json) print(result, true); else printExecution(result);
      process.exitCode = executionExitCode(result.run, result.integrity);
      break;
    }
    case 'routing-trace': {
      const result = recordRoutingTrace(project, args._[1] || 'latest', {
        webAgentsUsed: args['web-agents'] === undefined ? undefined : listArg(args['web-agents']),
        nativeFallbackUsed: args['native-fallback'] === undefined ? undefined : Boolean(args['native-fallback']),
        fallbackReason: args['fallback-reason'] === true ? null : args['fallback-reason']
      });
      if (args.json) print(result, true); else {
        console.log(`Run: ${result.run.runId}`);
        console.log(`Web agents: ${result.run.routingTrace.webAgentsUsed.join(', ') || '(none)'}`);
        console.log(`Native fallback: ${result.run.routingTrace.nativeFallbackUsed}`);
        if (result.run.routingTrace.fallbackReason) console.log(`Fallback reason: ${result.run.routingTrace.fallbackReason}`);
      }
      break;
    }
    case 'install-skills': {
      const result = installSkills({ projectDir: project, scope: args.scope || 'repo', mode: args.mode || 'copy', force: Boolean(args.force) });
      if (args.json) print(result, true); else {
        console.log(`Installed ${result.installed.length} skills → ${result.targetRoot} (${result.mode})`);
        result.installed.forEach(x => console.log(`- ${x.name}`));
      }
      break;
    }
    case 'install-global': {
      const result = installGlobal({ homeDir: args.home || undefined, codexHome: args['codex-home'] || undefined, mode: args.mode || 'copy', force: Boolean(args.force), dryRun: Boolean(args['dry-run']) });
      if (args.json) print(result, true); else {
        console.log(`CEOS ${VERSION} global install ${result.dryRun ? 'plan' : result.alreadyCurrent ? 'already current' : 'complete'}`);
        console.log(`Codex home: ${result.codexHome}`);
        console.log(`Instructions: ${result.instructionsFile}`);
        console.log(`Agents: ${result.agentsRoot}`);
        console.log(`Skills: ${result.skillsRoot}`);
        console.log(`Changes: ${result.changes.length}`);
        for (const change of result.changes) console.log(`- ${change.action} ${change.type}${change.name ? `:${change.name}` : ''} → ${change.target}`);
        if (result.backupRoot) console.log(`Backups: ${result.backupRoot}`);
        if (!result.dryRun) console.log(`VERDICT: ${result.status?.ok ? 'PASS' : 'FAIL'}`);
      }
      process.exitCode = result.dryRun || result.status?.ok ? 0 : 1;
      break;
    }
    case 'global-status': {
      const result = globalStatus({ homeDir: args.home || undefined, codexHome: args['codex-home'] || undefined });
      if (args.json) print(result, true); else {
        for (const check of result.checks) console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${check.id}  ${check.path}`);
        console.log(`\nVERDICT: ${result.ok ? 'PASS' : 'FAIL'}`);
      }
      process.exitCode = result.ok ? 0 : 1;
      break;
    }
    case 'routing': {
      const routes = routingTable();
      if (args.json) print({ version: VERSION, routes }, true); else {
        console.log(`CEOS ${VERSION} automatic model routing`);
        for (const route of routes) console.log(`${route.name.padEnd(20)} ${route.model.padEnd(16)} ${route.reasoningEffort.padEnd(6)} ${route.workload}`);
      }
      break;
    }
    case 'self-test': {
      const r = spawnSync(process.execPath, ['--test'], { cwd: CEOS_ROOT, stdio: 'inherit' });
      process.exitCode = r.status ?? 1; break;
    }
    default: usage(); process.exitCode = 1;
  }
} catch (e) {
  console.error(`CEOS_ERROR: ${e.message}`);
  process.exitCode = 1;
}
