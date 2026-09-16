import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkCommandConfiguration, classifyCommandRisk, createManifest, detectManifestForProject, doctor, loadManifest, npmScriptForCommand, readFailures, resolveGates, runVerification, validateEvidence, validateManifest } from '../src/ceos.mjs';

function tempProject() { return fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-test-')); }
function writeManifest(dir, text) { fs.mkdirSync(path.join(dir, '.codex-os'), { recursive: true }); fs.writeFileSync(path.join(dir, '.codex-os', 'project.yml'), text); }

const base = (commands, gates = '[ok]') => `version: 1\nprofile: generic\ncommands:\n${commands}\ngates:\n  verification: ${gates}\nproduction:\n  access: read-only\n`;

test('risk classifier separates verification from external mutation', () => {
  assert.equal(classifyCommandRisk('npm test'), 'R0');
  assert.equal(classifyCommandRisk('git push origin main'), 'R2');
  assert.equal(classifyCommandRisk('systemctl restart app'), 'R2');
  assert.equal(classifyCommandRisk('npm publish'), 'R3');
  assert.equal(classifyCommandRisk('curl -X POST https://example.com'), 'R3');
  assert.equal(classifyCommandRisk('provider_buy invoice=1'), 'R3');
});

test('manifest validation catches unknown gate command', () => {
  assert.throws(() => validateManifest({ version: 1, profile: 'generic', commands: { ok: 'npm test' }, gates: { verification: ['missing'] } }), /unknown command/);
});

test('init creates a valid manifest', () => {
  const dir = tempProject();
  const file = createManifest(dir, 'generic');
  assert.ok(fs.existsSync(file));
  const { data } = loadManifest(dir);
  assert.equal(data.profile, 'generic');
  assert.deepEqual(resolveGates(data, 'verification').map(g => g.id), ['lint', 'test', 'build']);
});

test('doctor passes safe commands and reports profile', () => {
  const dir = tempProject();
  writeManifest(dir, base('  ok: node -e "process.exit(0)"'));
  const d = doctor(dir);
  assert.equal(d.ok, true);
  assert.equal(d.manifest.profile, 'generic');
});

test('doctor flags risky command', () => {
  const dir = tempProject();
  writeManifest(dir, base('  ok: git push origin main'));
  const d = doctor(dir);
  assert.equal(d.ok, false);
  assert.match(d.checks.find(c => c.id === 'command-risk:ok').detail, /^R2/);
});

test('verification PASS creates valid evidence', () => {
  const dir = tempProject();
  writeManifest(dir, base('  ok: node -e "console.log(123)"'));
  const r = runVerification(dir);
  assert.equal(r.summary.verdict, 'PASS');
  assert.equal(r.records[0].status, 'PASS');
  const ev = validateEvidence(r.outputDir);
  assert.equal(ev.ok, true);
});

test('verification FAIL propagates failing gate', () => {
  const dir = tempProject();
  writeManifest(dir, base('  ok: node -e "process.exit(7)"'));
  const r = runVerification(dir);
  assert.equal(r.summary.verdict, 'FAIL');
  assert.equal(r.records[0].exitCode, 7);
});

test('verification BLOCKED never executes R2/R3 command', () => {
  const dir = tempProject();
  const marker = path.join(dir, 'SHOULD_NOT_EXIST');
  // The command contains a risky token and would create a marker if actually executed.
  writeManifest(dir, base(`  ok: node -e "require('fs').writeFileSync('${marker.replaceAll('\\','\\\\')}','x')" && git push origin main`));
  const r = runVerification(dir);
  assert.equal(r.summary.verdict, 'BLOCKED');
  assert.equal(r.records[0].status, 'BLOCKED');
  assert.equal(fs.existsSync(marker), false);
});

test('dry-run becomes BLOCKED because required gates were not proven', () => {
  const dir = tempProject();
  writeManifest(dir, base('  ok: node -e "process.exit(0)"'));
  const r = runVerification(dir, { dryRun: true });
  assert.equal(r.summary.verdict, 'BLOCKED');
  assert.equal(r.records[0].status, 'SKIP');
});

test('evidence validator rejects forged PASS with non-PASS gate', () => {
  const dir = tempProject();
  const ev = path.join(dir, 'evidence');
  fs.mkdirSync(path.join(ev, 'gates'), { recursive: true });
  fs.writeFileSync(path.join(ev, 'summary.json'), JSON.stringify({ schemaVersion: 1, verdict: 'PASS', gates: [{ id: 'x', status: 'BLOCKED', required: true, risk: 'R0' }] }));
  fs.writeFileSync(path.join(ev, 'gates', 'x.json'), JSON.stringify({ id: 'x', status: 'BLOCKED' }));
  const r = validateEvidence(ev);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(x => x.includes('PASS verdict')));
});

test('manifest rejects unsafe gate ids used as evidence filenames', () => {
  assert.throws(() => validateManifest({ version: 1, profile: 'generic', commands: { '../escape': 'npm test' } }), /safe gate id/);
});

test('browser-required manifest requires an explicit verification gate', () => {
  assert.throws(() => validateManifest({ version: 1, profile: 'generic', commands: { ok: 'npm test' }, gates: { verification: ['ok'] }, browser: { required: true } }), /browser.gate/);
});

test('release clean-worktree policy becomes a mechanical BLOCKED gate', () => {
  const dir = tempProject();
  writeManifest(dir, `version: 1\nprofile: generic\ncommands:\n  ok: node -e "process.exit(0)"\ngates:\n  verification: [ok]\n  release: [ok]\nproduction:\n  access: read-only\nrelease:\n  clean_worktree: true\n`);
  const r = runVerification(dir, { mode: 'release' });
  assert.equal(r.summary.verdict, 'BLOCKED');
  assert.ok(r.records.some(x => x.id === 'ceos.clean_worktree.start' && x.status === 'BLOCKED'));
});

test('renderContext resolves profile and only activated-skill policies', async () => {
  const { renderContext } = await import('../src/ceos.mjs');
  const dir = tempProject();
  writeManifest(dir, base('  ok: node -e "process.exit(0)"'));
  const text = renderContext(dir, 'prod-check');
  assert.match(text, /Profile: generic/);
  assert.match(text, /Production Policy/);
  assert.match(text, /Evidence Policy/);
});

test('installSkills copies discoverable repo-local Agent Skills', async () => {
  const { installSkills, SKILL_NAMES } = await import('../src/ceos.mjs');
  const dir = tempProject();
  const r = installSkills({ projectDir: dir, scope: 'repo', mode: 'copy' });
  assert.equal(r.installed.length, SKILL_NAMES.length);
  for (const name of SKILL_NAMES) assert.ok(fs.existsSync(path.join(dir, '.agents', 'skills', name, 'SKILL.md')));
});


test('npm script parser recognizes npm test and npm run commands', () => {
  assert.equal(npmScriptForCommand('npm test'), 'test');
  assert.equal(npmScriptForCommand('npm run test:e2e'), 'test:e2e');
  assert.equal(npmScriptForCommand('npm run build -- --mode prod'), 'build');
  assert.equal(npmScriptForCommand('node tools/check.mjs'), null);
});

test('doctor reports a configured but missing npm script', () => {
  const dir = tempProject();
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));
  writeManifest(dir, base('  ok: npm run test:e2e'));
  const d = doctor(dir);
  assert.equal(d.ok, false);
  const check = d.checks.find(c => c.id === 'npm-script:ok');
  assert.equal(check.ok, false);
  assert.match(check.detail, /no script "test:e2e"/);
});

test('verification classifies missing npm script as CONFIGURATION_ERROR without spawning it', () => {
  const dir = tempProject();
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));
  writeManifest(dir, base('  e2e: npm run test:e2e', '[e2e]'));
  const r = runVerification(dir);
  assert.equal(r.records[0].status, 'CONFIGURATION_ERROR');
  assert.equal(r.records[0].failureType, 'CONFIGURATION_ERROR');
  assert.match(r.records[0].reason, /no script "test:e2e"/);
  assert.equal(r.summary.verdict, 'CONFIGURATION_ERROR');
  assert.equal(fs.existsSync(path.join(r.outputDir, 'logs', 'e2e.stderr.log')), false);
  assert.equal(validateEvidence(r.outputDir).ok, true);
});

test('real test failure wins overall verdict while configuration error remains separately classified', () => {
  const dir = tempProject();
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'node -e "process.exit(5)"' } }));
  writeManifest(dir, `version: 1\nprofile: generic\ncommands:\n  test: npm test\n  e2e: npm run test:e2e\ngates:\n  verification: [test, e2e]\nproduction:\n  access: read-only\n`);
  const r = runVerification(dir);
  assert.equal(r.summary.verdict, 'FAIL');
  assert.equal(r.records.find(x => x.id === 'test').failureType, 'TEST_FAILURE');
  assert.equal(r.records.find(x => x.id === 'e2e').status, 'CONFIGURATION_ERROR');
});

test('yandex init detects real scripts and does not invent missing e2e', () => {
  const dir = tempProject();
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: {
    lint: 'node -e ""', test: 'node --test', build: 'node -e ""', 'starter-kit:self-test': 'node -e ""'
  } }));
  createManifest(dir, 'yandex-games');
  const { data } = loadManifest(dir);
  assert.equal(data.profile, 'yandex-games');
  assert.equal(data.commands.e2e, undefined);
  assert.deepEqual(data.gates.verification, ['lint', 'test', 'build', 'starter_kit_self_test']);
  assert.equal(data.browser, undefined);
});

test('yandex init maps a known browser-test alias to the e2e gate', () => {
  const dir = tempProject();
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: {
    lint: 'x', test: 'x', build: 'x', 'test:browser': 'x', 'starter-kit:self-test': 'x'
  } }));
  const detected = detectManifestForProject(dir, 'yandex-games');
  assert.equal(detected.manifest.commands.e2e, 'npm run test:browser');
  assert.deepEqual(detected.manifest.browser, { required: true, gate: 'e2e' });
});

test('failures reads only non-PASS gates and tails their logs', () => {
  const dir = tempProject();
  writeManifest(dir, base('  ok: node -e "console.log(\'alpha\'); console.log(\'beta\'); process.exit(7)"'));
  const r = runVerification(dir);
  const f = readFailures(dir, { evidenceDir: r.outputDir, tail: 1 });
  assert.equal(f.failures.length, 1);
  assert.equal(f.failures[0].failureType, 'COMMAND_FAILURE');
  assert.match(f.failures[0].stdout, /beta/);
  assert.doesNotMatch(f.failures[0].stdout, /alpha/);
});

test('command configuration accepts an existing npm script', () => {
  const dir = tempProject();
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { 'test:e2e': 'node x.mjs' } }));
  const r = checkCommandConfiguration(dir, 'npm run test:e2e');
  assert.equal(r.ok, true);
  assert.equal(r.script, 'test:e2e');
});
