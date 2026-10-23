import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 15_000 });
  if (result.error || result.status !== 0) throw new Error(`Git worktree inspection failed: ${(result.stderr || result.error?.message || result.stdout || '').trim()}`);
  return result.stdout;
}

function gitExitStatus(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 15_000 });
  if (result.error || ![0, 1].includes(result.status)) throw new Error('Git worktree ancestry check was inconclusive');
  return result.status;
}

function parseWorktreeList(text) {
  return text.trim().split(/\r?\n\r?\n/).filter(Boolean).map(item => {
    const fields = item.split(/\r?\n/);
    const selected = name => fields.find(line => line.startsWith(name + ' '))?.slice(name.length + 1) ?? null;
    return { path: selected('worktree'), head: selected('HEAD'), branch: selected('branch')?.replace(/^refs\/heads\//, '') ?? null,
      locked: fields.some(line => line === 'locked' || line.startsWith('locked ')),
      prunable: fields.some(line => line === 'prunable' || line.startsWith('prunable ')) };
  });
}

function hasRunEvidence(worktree) {
  return ['.ceos-runs', '.ceos-evidence', 'artifacts/evidence'].some(relative => {
    const dir = path.join(worktree, relative);
    try { return fs.statSync(dir).isDirectory() && fs.readdirSync(dir).length > 0; }
    catch { return false; }
  });
}

function hashPlan(item, mainHead) {
  return crypto.createHash('sha256').update(JSON.stringify({
    path: item.path, head: item.head, branch: item.branch, mainHead,
    reasonCodes: item.reasonCodes, eligible: item.eligible
  })).digest('hex');
}

/** Read-only inventory; neither worktree metadata nor local branches are pruned. */
export function inspectWorktrees(projectDir, { includeLegacy = false } = {}) {
  const current = fs.realpathSync(path.resolve(projectDir));
  const primary = parseWorktreeList(git(current, ['worktree', 'list', '--porcelain']))[0];
  if (!primary?.path) throw new Error('No registered Git worktree');
  const mainRef = spawnSync('git', ['rev-parse', '--verify', 'refs/heads/main'], {
    cwd: current, encoding: 'utf8', windowsHide: true, timeout: 15_000
  });
  const mainHead = mainRef.status === 0 ? mainRef.stdout.trim() : null;
  const trees = parseWorktreeList(git(current, ['worktree', 'list', '--porcelain']));
  const worktrees = trees.map((tree, index) => {
    const reasons = [];
    const absolute = path.resolve(tree.path);
    if (index === 0) reasons.push('PRIMARY_CHECKOUT');
    if (tree.branch === 'main' || tree.branch === 'master') reasons.push('PROTECTED_BRANCH');
    if (absolute === current) reasons.push('ACTIVE_CHECKOUT');
    if (!tree.branch?.startsWith('ceos/task/') && !includeLegacy) reasons.push('UNMANAGED_BRANCH');
    if (!mainHead) reasons.push('MAIN_REF_MISSING');
    if (tree.locked || tree.prunable) reasons.push('GIT_WORKTREE_LOCKED_OR_MISSING');
    if (!fs.existsSync(absolute)) reasons.push('MISSING_DIRECTORY');
    else {
      const info = fs.lstatSync(absolute);
      if (info.isSymbolicLink() || !info.isDirectory()) reasons.push('UNTRUSTED_DIRECTORY');
      else {
        const status = git(absolute, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
        if (status.length) reasons.push('DIRTY_WORKTREE');
        const ignored = git(absolute, ['status', '--porcelain=v1', '-z', '--ignored=matching', '--untracked-files=all']);
        if (ignored.split('\0').some(line => line.startsWith('!! '))) reasons.push('IGNORED_USER_DATA');
        if (hasRunEvidence(absolute)) reasons.push('RUN_EVIDENCE_PRESENT');
      }
    }
    const isMerged = Boolean(mainHead && tree.head && gitExitStatus(current, ['merge-base', '--is-ancestor', tree.head, mainHead]) === 0);
    // Exit 1 for an unmerged branch is a normal verdict, not a Git failure.
    if (!isMerged && mainHead) reasons.push('UNMERGED_HEAD');
    const row = { ...tree, path: absolute, reasonCodes: [...new Set(reasons)], eligible: reasons.length === 0 };
    return { ...row, planToken: hashPlan(row, mainHead) };
  });
  return { schemaVersion: 1, status: 'INSPECTED', checkout: current, primary: path.resolve(primary.path),
    mainHead, includeLegacy: Boolean(includeLegacy), worktrees, eligible: worktrees.filter(item => item.eligible).length };
}

/** Exact, reviewable local cleanup. Never removes main, remote branches, or user data. */
export function cleanupWorktree(projectDir, { targetPath, expectedHead, planToken, allowLegacy = false } = {}) {
  if (!targetPath || !expectedHead || !planToken || !path.isAbsolute(targetPath)) {
    throw new Error('Exact absolute target path, expected HEAD and inspection confirmation token are required');
  }
  const source = fs.realpathSync(path.resolve(projectDir));
  const common = git(source, ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim();
  const lockPath = path.join(common, 'ceos-worktree-cleanup.lock');
  let lock;
  try { lock = fs.openSync(lockPath, 'wx'); }
  catch { throw new Error('Concurrent worktree cleanup lock is already held'); }
  try {
    const inventory = inspectWorktrees(source, { includeLegacy: allowLegacy });
    const target = inventory.worktrees.find(item => item.path === path.resolve(targetPath));
    if (!target || !target.eligible) throw new Error('Worktree is protected or not eligible for cleanup');
    if (target.head !== expectedHead || target.planToken !== planToken) throw new Error('Worktree confirmation mismatch; refresh inspection');
    git(source, ['worktree', 'remove', '--', target.path]);
    try { git(source, ['branch', '-d', target.branch]); }
    catch (error) { return { status: 'WORKTREE_REMOVED_BRANCH_RETAINED', path: target.path, branch: target.branch, reason: error.message }; }
    return { status: 'REMOVED', path: target.path, branch: target.branch, head: target.head, remoteBranchesUntouched: true };
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  }
}
