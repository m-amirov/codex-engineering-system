import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectWorktrees, cleanupWorktree, sameWorktreePath } from '../src/worktree-hygiene.mjs';

function git(dir, ...args) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}
function repo() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-phase04-tree-'));
  const main = path.join(parent, 'my main checkout');
  const feature = path.join(parent, 'codex task with spaces');
  fs.mkdirSync(main);
  git(main, 'init', '--initial-branch=main');
  git(main, 'config', 'user.name', 'CEOS fixture');
  git(main, 'config', 'user.email', 'ceos@example.invalid');
  fs.writeFileSync(path.join(main, 'readme.txt'), 'original\n');
  git(main, 'add', 'readme.txt');
  git(main, 'commit', '-m', 'baseline');
  git(main, 'worktree', 'add', '-b', 'ceos/task/example', feature, 'HEAD');
  return { parent, main, feature, head: git(main, 'rev-parse', 'HEAD') };
}
function candidate(x) { return inspectWorktrees(x.main).worktrees.find(w => sameWorktreePath(w.path, x.feature)); }

test('worktree identity accepts Git/Node path forms but rejects a different directory', () => {
  const x = repo();
  const slashPath = x.feature.replaceAll('\\', '/');
  assert.equal(sameWorktreePath(slashPath, x.feature), true);
  assert.equal(sameWorktreePath(path.resolve(slashPath), x.feature), true);
  const similar = path.join(x.parent, 'codex task with spaces-copy');
  fs.mkdirSync(similar);
  assert.equal(sameWorktreePath(similar, x.feature), false);
  if (process.platform === 'win32') assert.equal(sameWorktreePath(x.feature.toUpperCase(), x.feature), true);
});

test('the main checkout is protected and a clean merged temporary task is identified without mutation', () => {
  const x = repo();
  const inspection = inspectWorktrees(x.main);
  assert.equal(inspection.worktrees.length, 2);
  assert.equal(inspection.worktrees.find(w => sameWorktreePath(w.path, x.main)).eligible, false);
  assert.equal(candidate(x).eligible, true);
  assert.equal(fs.existsSync(x.feature), true);
});

test('no cleanup occurs without exact HEAD and inventory-bound confirmation', () => {
  const x = repo();
  const before = candidate(x);
  assert.throws(() => cleanupWorktree(x.main, {
    targetPath: x.feature, expectedHead: x.head, planToken: 'wrong'
  }), /confirmation|mismatch/i);
  assert.equal(fs.existsSync(x.feature), true);
  assert.throws(() => cleanupWorktree(x.main, {
    targetPath: x.main, expectedHead: x.head, planToken: before.planToken
  }), /protected|not eligible/i);
  assert.equal(fs.existsSync(x.main), true);
});

test('dirty, ignored, unmerged, and evidence-bound siblings are never eligible', () => {
  const x = repo();
  fs.writeFileSync(path.join(x.feature, 'notes.txt'), 'unique');
  assert.match(candidate(x).reasonCodes.join(','), /DIRTY/);
  fs.unlinkSync(path.join(x.feature, 'notes.txt'));
  fs.writeFileSync(path.join(x.feature, '.gitignore'), 'valuable.bin\n');
  git(x.feature, 'add', '.gitignore');
  git(x.feature, 'commit', '-m', 'unmerged ignore rule');
  fs.writeFileSync(path.join(x.feature, 'valuable.bin'), 'unique-user-data');
  assert.match(candidate(x).reasonCodes.join(','), /UNMERGED|IGNORED/);
  git(x.main, 'merge', '--no-ff', 'ceos/task/example', '-m', 'merged');
  assert.match(candidate(x).reasonCodes.join(','), /IGNORED/);
  fs.unlinkSync(path.join(x.feature, 'valuable.bin'));
  fs.mkdirSync(path.join(x.feature, '.ceos-runs'));
  fs.writeFileSync(path.join(x.feature, '.ceos-runs', 'state.json'), '{}');
  assert.match(candidate(x).reasonCodes.join(','), /RUN_EVIDENCE/);
});

test('cleanup removes only confirmed integrated clean task worktree and its local branch', () => {
  const x = repo();
  const before = candidate(x);
  const result = cleanupWorktree(x.main, {
    targetPath: x.feature, expectedHead: before.head, planToken: before.planToken
  });
  assert.equal(result.status, 'REMOVED');
  assert.equal(fs.existsSync(x.feature), false);
  assert.equal(git(x.main, 'branch', '--list', 'ceos/task/example'), '');
  assert.equal(fs.readFileSync(path.join(x.main, 'readme.txt'), 'utf8'), 'original\n');
});

test('an active competing cleanup lock prevents local deletion', () => {
  const x = repo();
  const before = candidate(x);
  const lock = path.join(x.main, '.git', 'ceos-worktree-cleanup.lock');
  fs.writeFileSync(lock, 'someone else is cleaning');
  assert.throws(() => cleanupWorktree(x.main, {
    targetPath: x.feature, expectedHead: before.head, planToken: before.planToken
  }), /lock|concurrent/i);
  assert.equal(fs.existsSync(x.feature), true);
});

test('CLI inventory is read-only and explicit cleanup requires --apply', () => {
  const x = repo();
  const cli = path.resolve('bin/ceos.mjs');
  const inspect = spawnSync(process.execPath, [cli, 'worktrees', 'inspect', '--project', x.main, '--json'], {
    encoding: 'utf8', windowsHide: true
  });
  assert.equal(inspect.status, 0, inspect.stderr);
  const view = JSON.parse(inspect.stdout);
  assert.equal(view.worktrees.find(item => sameWorktreePath(item.path, x.feature)).eligible, true);
  const cleanup = spawnSync(process.execPath, [cli, 'worktrees', 'cleanup', '--project', x.main,
    '--target', x.feature, '--expect-head', x.head, '--plan-token', candidate(x).planToken, '--json'], {
    encoding: 'utf8', windowsHide: true
  });
  assert.notEqual(cleanup.status, 0);
  assert.equal(fs.existsSync(x.feature), true);
});

test('missing main ref yields a blocked inventory without altering any branch', () => {
  const x = repo();
  git(x.main, 'branch', '-m', 'main', 'master');
  const inventory = inspectWorktrees(x.main);
  assert.equal(inventory.eligible, 0);
  assert.match(candidate(x).reasonCodes.join(','), /MAIN_REF_MISSING/);
  assert.equal(fs.existsSync(x.feature), true);
});

test('legacy branch cleanup requires explicit opt-in in both inventory and apply', () => {
  const x = repo();
  const legacyPath = path.join(x.parent, 'old phase branch');
  git(x.main, 'worktree', 'add', '-b', 'feature/old-draft', legacyPath, 'HEAD');
  const ordinary = inspectWorktrees(x.main).worktrees.find(row => sameWorktreePath(row.path, legacyPath));
  assert.equal(ordinary.eligible, false);
  assert.match(ordinary.reasonCodes.join(','), /UNMANAGED_BRANCH/);
  const opted = inspectWorktrees(x.main, { includeLegacy: true }).worktrees.find(row => sameWorktreePath(row.path, legacyPath));
  assert.equal(opted.eligible, true);
  assert.throws(() => cleanupWorktree(x.main, {
    targetPath: legacyPath, expectedHead: opted.head, planToken: opted.planToken
  }), /not eligible|confirmation/i);
  const result = cleanupWorktree(x.main, {
    targetPath: legacyPath, expectedHead: opted.head, planToken: opted.planToken, allowLegacy: true
  });
  assert.equal(result.status, 'REMOVED');
  assert.equal(fs.existsSync(legacyPath), false);
});
