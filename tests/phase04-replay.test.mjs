import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runVerification } from '../src/ceos.mjs';
import { validateVerificationReplay } from '../src/verification-replay.mjs';

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}
function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-phase04-replay-'));
  git(dir, 'init', '--initial-branch=main');
  git(dir, 'config', 'user.name', 'CEOS fixture');
  git(dir, 'config', 'user.email', 'ceos@example.invalid');
  fs.mkdirSync(path.join(dir, '.codex-os'));
  fs.writeFileSync(path.join(dir, '.codex-os', 'project.yml'), 'version: 1\nprofile: generic\ncommands:\n  test: node check.mjs\ngates:\n  verification: [test]\n');
  fs.writeFileSync(path.join(dir, 'check.mjs'), "process.stdout.write('real-run')\n");
  fs.writeFileSync(path.join(dir, '.gitignore'), '.ceos-evidence/\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-m', 'base');
  return dir;
}

test('same source and same worktree permit fresh replay that invokes real gates', async () => {
  const dir = project();
  const first = await runVerification(dir, { evidenceDir: path.join(dir, '.ceos-evidence', 'first') });
  const check = validateVerificationReplay(dir, first.outputDir);
  assert.equal(check.ok, true);
  const second = await runVerification(dir, { evidenceDir: path.join(dir, '.ceos-evidence', 'second'), replayFrom: first.outputDir });
  assert.equal(second.summary.verdict, 'PASS');
  assert.equal(second.summary.replayFrom.sourceHead, git(dir, 'rev-parse', 'HEAD'));
  assert.match(fs.readFileSync(path.join(second.outputDir, 'logs', 'test.stdout.log'), 'utf8'), /real-run/);
});

test('source HEAD changes block reuse even when old gates are PASS', async () => {
  const dir = project();
  const first = await runVerification(dir);
  git(dir, 'commit', '--allow-empty', '-m', 'source drift');
  const check = validateVerificationReplay(dir, first.outputDir);
  assert.equal(check.ok, false);
  assert.equal(check.reasonCode, 'REPLAY_SOURCE_HEAD_MISMATCH');
  await assert.rejects(runVerification(dir, { replayFrom: first.outputDir }), /REPLAY_SOURCE_HEAD_MISMATCH/);
});

test('another worktree with identical HEAD cannot replay original checkout evidence', async () => {
  const dir = project();
  const first = await runVerification(dir);
  const sibling = path.join(path.dirname(dir), `${path.basename(dir)}-sibling`);
  git(dir, 'worktree', 'add', '-b', 'feature/other', sibling, 'HEAD');
  const check = validateVerificationReplay(sibling, first.outputDir);
  assert.equal(check.ok, false);
  assert.equal(check.reasonCode, 'REPLAY_WORKTREE_MISMATCH');
});

test('tampered prior summary never grants replay', async () => {
  const dir = project();
  const first = await runVerification(dir);
  const summary = path.join(first.outputDir, 'summary.json');
  fs.writeFileSync(summary, '{broken json');
  const check = validateVerificationReplay(dir, first.outputDir);
  assert.equal(check.ok, false);
  assert.equal(check.reasonCode, 'REPLAY_EVIDENCE_INVALID');
});

test('replay with fabricated non-existing previous checkout path is a typed blocker, not an uncaught crash', async () => {
  const dir = project();
  const first = await runVerification(dir);
  const file = path.join(first.outputDir, 'summary.json');
  const summary = JSON.parse(fs.readFileSync(file, 'utf8'));
  summary.projectDir = path.join(dir, 'deleted-nonexistent-checkout');
  fs.writeFileSync(file, JSON.stringify(summary));
  const check = validateVerificationReplay(dir, first.outputDir);
  assert.equal(check.ok, false);
  assert.equal(check.reasonCode, 'REPLAY_EVIDENCE_INVALID');
});

test('replay detects different dirty file bytes even when porcelain names and HEAD are unchanged', async () => {
  const dir = project();
  fs.writeFileSync(path.join(dir, 'check.mjs'), "process.stdout.write('dirty-first')\n");
  const first = await runVerification(dir);
  fs.writeFileSync(path.join(dir, 'check.mjs'), "process.stdout.write('dirty-second')\n");
  const check = validateVerificationReplay(dir, first.outputDir);
  assert.equal(check.ok, false);
  assert.equal(check.reasonCode, 'REPLAY_SOURCE_FINGERPRINT_MISMATCH');
});

test('changing bytes of a previously dirty tracked file during gate execution blocks PASS', async () => {
  const dir = project();
  fs.writeFileSync(path.join(dir, 'source.txt'), 'first');
  const script = "import fs from 'node:fs'; fs.writeFileSync('source.txt','second')\n";
  fs.writeFileSync(path.join(dir, 'check.mjs'), script);
  git(dir, 'add', 'check.mjs', 'source.txt');
  git(dir, 'commit', '-m', 'fixture script');
  fs.writeFileSync(path.join(dir, 'source.txt'), 'before');
  const r = await runVerification(dir);
  assert.equal(r.summary.verdict, 'BLOCKED');
  assert.equal(r.records.find(item => item.id === 'ceos.source_integrity.end')?.failureCode, 'SOURCE_DRIFT_DURING_GATES');
});

test('gate mutating Git HEAD during execution blocks source-bound verification despite exit zero', async () => {
  const dir = project();
  fs.writeFileSync(path.join(dir, 'check.mjs'), "import {spawnSync} from 'node:child_process'; spawnSync('git', ['commit','--allow-empty','-m','drift'], {cwd:process.cwd()});\n");
  git(dir, 'add', 'check.mjs');
  git(dir, 'commit', '-m', 'prepare drift test');
  const r = await runVerification(dir);
  assert.equal(r.summary.verdict, 'BLOCKED');
  assert.equal(r.records.find(item => item.id === 'ceos.source_integrity.end')?.failureCode, 'SOURCE_DRIFT_DURING_GATES');
});
