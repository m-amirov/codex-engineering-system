import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function git(cwd, args, timeout = 20000) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', timeout, windowsHide: true });
  if (result.error || result.status !== 0) {
    return { ok: false, output: (result.stderr || result.error?.message || result.stdout || 'git failed').trim(), code: result.status };
  }
  return { ok: true, output: result.stdout.trim() };
}
function safeRef(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) &&
    !value.includes('..') && !value.includes('//') && !value.endsWith('/') &&
    !value.split('/').some(part => part.startsWith('.') || part.endsWith('.lock'));
}
function remoteSlug(url) {
  const match = String(url).match(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i);
  return match?.[1]?.toLowerCase() ?? null;
}

/**
 * Opt-in GitHub synchronization preflight.
 * Default behavior is READ ONLY. --fetch updates remote tracking refs;
 * --apply performs a fast-forward only on an exact, clean target branch.
 * This function never commits, stashes, resets, cleans, rebases or pushes.
 */
export function gitPreflight(projectDir, { remote = 'origin', branch = 'main', expectRepo = null, fetch = false, apply = false } = {}) {
  const project = path.resolve(projectDir);
  const result = { project, remote, branch, expectedRepo: expectRepo, fetchRequested: Boolean(fetch), applyRequested: Boolean(apply),
    status: 'BLOCKED', reason: null, localHead: null, remoteHead: null, ahead: null, behind: null, dirty: null, remoteUrl: null, actions: [] };
  const stop = (status, reason) => ({ ...result, status, reason });
  if (!safeRef(remote) || remote.includes('/')) return stop('BLOCKED_CONFIG', 'Invalid remote name');
  if (!safeRef(branch)) return stop('BLOCKED_CONFIG', 'Invalid branch name');
  if (apply && !fetch) return stop('BLOCKED_CONFIG', '--apply requires --fetch to avoid stale tracking refs');
  if (expectRepo && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(expectRepo)) return stop('BLOCKED_CONFIG', 'Invalid --expect-repo');

  const root = git(project, ['rev-parse', '--show-toplevel']);
  if (!root.ok) return stop('BLOCKED_NOT_REPO', root.output);
  const actualRoot = fs.realpathSync(root.output);
  if (fs.realpathSync(project) !== actualRoot) return stop('BLOCKED_WRONG_ROOT', 'Run preflight from the exact repository root');
  const url = git(project, ['remote', 'get-url', remote]);
  if (!url.ok) return stop('BLOCKED_REMOTE', url.output);
  result.remoteUrl = url.output;
  if (expectRepo && remoteSlug(url.output) !== expectRepo.toLowerCase()) return stop('BLOCKED_REMOTE_MISMATCH', 'Remote URL does not match expected GitHub repository');

  const currentBranch = git(project, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (!currentBranch.ok || currentBranch.output !== branch) return stop('BLOCKED_BRANCH', `Current branch ${currentBranch.output || '(detached)'} is not ${branch}`);
  const head = git(project, ['rev-parse', 'HEAD']);
  if (!head.ok) return stop('BLOCKED_GIT', head.output);
  result.localHead = head.output;
  const dirty = git(project, ['status', '--porcelain=v1', '--untracked-files=normal']);
  if (!dirty.ok) return stop('BLOCKED_GIT', dirty.output);
  result.dirty = Boolean(dirty.output);

  if (fetch) {
    const fetched = git(project, ['fetch', '--no-tags', remote, `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`], 60000);
    if (!fetched.ok) return stop('BLOCKED_FETCH', fetched.output);
    result.actions.push('fetch');
  }
  const ref = `refs/remotes/${remote}/${branch}`;
  const target = git(project, ['rev-parse', '--verify', ref]);
  if (!target.ok) return stop('BLOCKED_NO_TRACKING_REF', 'Remote tracking ref missing; rerun with --fetch');
  result.remoteHead = target.output;
  const counts = git(project, ['rev-list', '--left-right', '--count', `HEAD...${ref}`]);
  if (!counts.ok) return stop('BLOCKED_GIT', counts.output);
  const parts = counts.output.split(/\s+/).map(Number);
  if (parts.length !== 2 || parts.some(x => !Number.isInteger(x))) return stop('BLOCKED_GIT', 'Cannot parse ahead/behind');
  [result.ahead, result.behind] = parts;
  if (result.ahead && result.behind) return stop('BLOCKED_DIVERGED', 'Both local and remote contain unique commits; never overwrite either history');
  if (result.ahead) return stop('AHEAD_LOCAL', 'Local commits not on origin; do not discard or overwrite');
  if (!result.behind) return stop(result.dirty ? 'IN_SYNC_DIRTY' : 'IN_SYNC', result.dirty ? 'Remote synchronized; existing local changes must be preserved' : null);
  if (result.dirty) return stop('BLOCKED_DIRTY', 'Cannot fast-forward a dirty worktree automatically; preserve and reconcile changes');
  if (!apply) return stop('BEHIND_FAST_FORWARD_AVAILABLE', 'Run with --fetch --apply to fast-forward safely');

  const merged = git(project, ['merge', '--ff-only', ref]);
  if (!merged.ok) return stop('BLOCKED_FAST_FORWARD', merged.output);
  result.actions.push('fast-forward');
  const after = git(project, ['rev-parse', 'HEAD']);
  if (!after.ok || after.output !== result.remoteHead) return stop('BLOCKED_VERIFY', 'Updated local HEAD does not match remote tracking HEAD');
  result.localHead = after.output;
  result.ahead = 0;
  result.behind = 0;
  return stop('FAST_FORWARDED', null);
}
