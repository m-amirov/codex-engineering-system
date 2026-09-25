import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { planAdoption, applyAdoption, detectAdoptionProfile } from '../src/adoption.mjs';

function project({ starter = false, scripts = { test: 'node --test', build: 'node build.mjs' } } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-adopt-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts }));
  fs.writeFileSync(path.join(root, 'src', 'app.js'), 'export {};\n');
  if (starter) fs.writeFileSync(path.join(root, 'game-spec.yaml'), 'title: test\n');
  return root;
}
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function manifestFile(root) { return path.join(root, '.codex-os', 'project.yml'); }
function reportFile(root) { return path.join(root, '.codex-os', 'adoption-report.json'); }

test('adopts a clean existing Node project in dry-run without writes', () => {
  const root = project();
  const plan = planAdoption(root, { profile: 'node-web' });
  assert.equal(plan.status, 'READY');
  assert.deepEqual(plan.writes.sort(), ['.codex-os/adoption-report.json', '.codex-os/project.yml']);
  assert.equal(fs.existsSync(path.join(root, '.codex-os')), false);
});

test('detects Yandex Games Starter Kit without replacing its files', () => {
  const root = project({ starter: true, scripts: { test: 'npm test', 'starter-kit:self-test': 'node kit.mjs' } });
  const detected = detectAdoptionProfile(root);
  assert.equal(detected.profile, 'yandex-games');
  const plan = planAdoption(root);
  applyAdoption(plan);
  assert.equal(fs.existsSync(path.join(root, 'game-spec.yaml')), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).scripts.test, 'npm test');
});

test('repeated adoption is idempotent', () => {
  const root = project();
  applyAdoption(planAdoption(root, { profile: 'node-web' }));
  const repeat = planAdoption(root, { profile: 'node-web' });
  assert.equal(repeat.status, 'IN_SYNC');
  assert.deepEqual(repeat.changes, []);
});

test('manual manifest edit is managed drift and is blocked without force', () => {
  const root = project();
  applyAdoption(planAdoption(root, { profile: 'node-web' }));
  const before = fs.readFileSync(manifestFile(root));
  fs.appendFileSync(manifestFile(root), '# user edit\n');
  const plan = planAdoption(root, { profile: 'node-web' });
  assert.equal(plan.status, 'CONFLICT');
  assert.match(plan.conflicts[0], /Managed drift/);
  assert.notDeepEqual(fs.readFileSync(manifestFile(root)), before);
  assert.equal(fs.readFileSync(reportFile(root)).includes('manifestSha256'), true);
});

test('force repairs confirmed managed drift and records the new actual checksum', () => {
  const root = project();
  applyAdoption(planAdoption(root, { profile: 'node-web' }));
  fs.appendFileSync(manifestFile(root), '# user edit\n');
  const plan = planAdoption(root, { profile: 'node-web', force: true });
  assert.equal(plan.status, 'READY');
  const applied = applyAdoption(plan);
  assert.equal(applied.status, 'APPLIED');
  assert.equal(JSON.parse(fs.readFileSync(reportFile(root))).manifestSha256, sha256(manifestFile(root)));
  assert.equal(planAdoption(root, { profile: 'node-web' }).status, 'IN_SYNC');
});

test('fails closed on an existing unmanaged CEOS manifest', () => {
  const root = project();
  fs.mkdirSync(path.join(root, '.codex-os'));
  fs.writeFileSync(path.join(root, '.codex-os', 'project.yml'), 'user: owned\n');
  const plan = planAdoption(root, { profile: 'node-web' });
  assert.equal(plan.status, 'CONFLICT');
  assert.match(plan.conflicts[0], /not adoption-managed/);
});

test('force does not take over an unmanaged manifest', () => {
  const root = project();
  fs.mkdirSync(path.join(root, '.codex-os'));
  const file = manifestFile(root);
  fs.writeFileSync(file, 'user: owned\n');
  const before = fs.readFileSync(file);
  const plan = planAdoption(root, { profile: 'node-web', force: true });
  assert.equal(plan.status, 'CONFLICT');
  assert.deepEqual(fs.readFileSync(file), before);
});

test('legacy adoption report without checksum fails closed', () => {
  const root = project();
  applyAdoption(planAdoption(root, { profile: 'node-web' }));
  fs.writeFileSync(reportFile(root), '{"schemaVersion":1}\n');
  const before = fs.readFileSync(manifestFile(root));
  const plan = planAdoption(root, { profile: 'node-web', force: true });
  assert.equal(plan.status, 'CONFLICT');
  assert.match(plan.conflicts[0], /no manifestSha256/);
  assert.deepEqual(fs.readFileSync(manifestFile(root)), before);
});

test('dry-run managed drift performs zero writes', () => {
  const root = project();
  applyAdoption(planAdoption(root, { profile: 'node-web' }));
  fs.appendFileSync(manifestFile(root), '# user edit\n');
  const manifestBefore = fs.readFileSync(manifestFile(root));
  const reportBefore = fs.readFileSync(reportFile(root));
  const plan = planAdoption(root, { profile: 'node-web', force: true });
  assert.equal(plan.status, 'READY');
  assert.deepEqual(fs.readFileSync(manifestFile(root)), manifestBefore);
  assert.deepEqual(fs.readFileSync(reportFile(root)), reportBefore);
});

test('adoption report checksum matches the manifest actually written', () => {
  const root = project();
  applyAdoption(planAdoption(root, { profile: 'node-web' }));
  const report = JSON.parse(fs.readFileSync(reportFile(root)));
  assert.equal(report.manifestSha256, sha256(manifestFile(root)));
});

test('preserves user files and npm scripts', () => {
  const root = project();
  const packageBefore = fs.readFileSync(path.join(root, 'package.json'));
  const sourceBefore = fs.readFileSync(path.join(root, 'src', 'app.js'));
  applyAdoption(planAdoption(root, { profile: 'node-web' }));
  assert.deepEqual(fs.readFileSync(path.join(root, 'package.json')), packageBefore);
  assert.deepEqual(fs.readFileSync(path.join(root, 'src', 'app.js')), sourceBefore);
});

test('blocks an indeterminate profile and supports explicit profile', () => {
  const root = project({ scripts: {} });
  fs.rmSync(path.join(root, 'src'), { recursive: true });
  assert.equal(planAdoption(root).status, 'BLOCKED');
  assert.equal(planAdoption(root, { profile: 'generic' }).status, 'READY');
});

test('partially CEOS-managed project remains safe and converges', () => {
  const root = project();
  fs.mkdirSync(path.join(root, '.codex-os'));
  fs.writeFileSync(path.join(root, '.codex-os', 'project.yml'), 'version: 1\nprofile: node-web\ncommands: {}\n');
  fs.writeFileSync(path.join(root, '.codex-os', 'adoption-report.json'), '{}\n');
  const plan = planAdoption(root, { profile: 'node-web' });
  assert.equal(plan.status, 'CONFLICT');
  assert.match(plan.conflicts[0], /no manifestSha256/);
});
