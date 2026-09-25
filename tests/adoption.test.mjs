import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planAdoption, applyAdoption, detectAdoptionProfile } from '../src/adoption.mjs';

function project({ starter = false, scripts = { test: 'node --test', build: 'node build.mjs' } } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-adopt-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts }));
  fs.writeFileSync(path.join(root, 'src', 'app.js'), 'export {};\n');
  if (starter) fs.writeFileSync(path.join(root, 'game-spec.yaml'), 'title: test\n');
  return root;
}

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

test('fails closed on an existing unmanaged CEOS manifest', () => {
  const root = project();
  fs.mkdirSync(path.join(root, '.codex-os'));
  fs.writeFileSync(path.join(root, '.codex-os', 'project.yml'), 'user: owned\n');
  const plan = planAdoption(root, { profile: 'node-web' });
  assert.equal(plan.status, 'CONFLICT');
  assert.match(plan.conflicts[0], /not adoption-managed/);
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
  assert.equal(plan.status, 'READY');
  applyAdoption(plan);
  assert.equal(planAdoption(root, { profile: 'node-web' }).status, 'IN_SYNC');
});
