import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin', 'ceos.mjs');

function tempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-cli-engine-'));
}

function run(args, cwd) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CODEX_HOME: path.join(cwd, '.fake-codex-home') }
  });
}

test('ceos capabilities returns a machine-readable capability snapshot', () => {
  const project = tempProject();
  const r = run(['capabilities', '--project', project, '--image-generation', 'available', '--json'], project);
  assert.equal(r.status, 0, r.stderr);
  const data = JSON.parse(r.stdout);
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.filesystem.readable, true);
  assert.equal(data.imageGeneration.status, 'available');
  assert.equal(data.web.status, 'NOT_CONFIGURED');
});

test('ceos run + checkpoint + resume persists deterministic workflow state', () => {
  const project = tempProject();
  fs.writeFileSync(path.join(project, 'evidence.txt'), 'fresh evidence');
  const created = run([
    'run', 'audit-repair-loop',
    '--project', project,
    '--target', 'reader experience',
    '--in-scope', 'continuity;pacing',
    '--out-of-scope', 'release',
    '--acceptance', 'fresh re-audit passes',
    '--mutation-boundary', 'scenario files only',
    '--json'
  ], project);
  assert.equal(created.status, 0, created.stderr);
  const start = JSON.parse(created.stdout);
  assert.equal(start.run.nextStage, 'EVIDENCE_COLLECTED');

  const checkpoint = run([
    'checkpoint', start.run.runId,
    '--project', project,
    '--stage', 'EVIDENCE_COLLECTED',
    '--artifact', 'evidence.txt',
    '--json'
  ], project);
  assert.equal(checkpoint.status, 0, checkpoint.stderr);
  const after = JSON.parse(checkpoint.stdout);
  assert.equal(after.run.nextStage, 'AUDITED');

  const resumed = run(['resume', start.run.runId, '--project', project, '--json'], project);
  assert.equal(resumed.status, 0, resumed.stderr);
  const state = JSON.parse(resumed.stdout);
  assert.equal(state.integrity.ok, true);
  assert.equal(state.nextAction.stage, 'AUDITED');
});

test('ceos run fails closed when deterministic scope lock is incomplete', () => {
  const project = tempProject();
  const r = run([
    'run', 'audit-repair-loop',
    '--project', project,
    '--target', 'x',
    '--in-scope', 'x',
    '--acceptance', 'pass'
  ], project);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /mutationBoundary is required/);
});
