import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { gitPreflight } from '../src/git-preflight.mjs';

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, `${args.join(' ')}\n${result.stderr}`);
  return result.stdout.trim();
}
function setup(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-git-preflight-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const remote = path.join(home, 'remote.git'), seed = path.join(home, 'seed'), work = path.join(home, 'work');
  fs.mkdirSync(seed);
  git(home, 'init', '--bare', remote);
  git(seed, 'init', '-b', 'main');
  git(seed, 'config', 'user.email', 'test@example.invalid');
  git(seed, 'config', 'user.name', 'Tests');
  fs.writeFileSync(path.join(seed, 'a.txt'), 'start');
  git(seed, 'add', '.'); git(seed, 'commit', '-m', 'initial');
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', '-u', 'origin', 'main');
  git(home, 'clone', '-b', 'main', remote, work);
  git(work, 'config', 'user.email', 'test@example.invalid');
  git(work, 'config', 'user.name', 'Tests');
  const updateRemote = (message = 'remote update') => {
    fs.appendFileSync(path.join(seed, 'a.txt'), '\n'+message);
    git(seed, 'add', '.'); git(seed, 'commit', '-m', message); git(seed, 'push', 'origin', 'main');
  };
  return { home, seed, work, remote, updateRemote };
}
test('read-only by default: no fetch or local checkout mutation', t => {
  const f = setup(t);
  const before = git(f.work, 'rev-parse', 'HEAD');
  f.updateRemote();
  const r = gitPreflight(f.work);
  assert.equal(r.status, 'IN_SYNC'); // tracking ref remains stale until explicit fetch
  assert.deepEqual(r.actions, []);
  assert.equal(git(f.work, 'rev-parse', 'HEAD'), before);
});
test('explicit fetch discovers behind and explicit apply fast-forwards', t => {
  const f = setup(t);
  f.updateRemote();
  const a = gitPreflight(f.work, { fetch: true });
  assert.equal(a.status, 'BEHIND_FAST_FORWARD_AVAILABLE');
  assert.equal(a.behind, 1);
  assert.equal(git(f.work, 'rev-parse', 'HEAD'), a.localHead);
  const b = gitPreflight(f.work, { fetch: true, apply: true });
  assert.equal(b.status, 'FAST_FORWARDED');
  assert.equal(b.localHead, b.remoteHead);
  assert.equal(git(f.work, 'rev-parse', 'HEAD'), b.remoteHead);
});
test('dirty checkout is preserved and stops automatic fast-forward', t => {
  const f = setup(t);
  f.updateRemote();
  fs.writeFileSync(path.join(f.work, 'local.txt'), 'do not erase');
  const before = git(f.work, 'rev-parse', 'HEAD');
  const a = gitPreflight(f.work, { fetch: true, apply: true });
  assert.equal(a.status, 'BLOCKED_DIRTY');
  assert.equal(git(f.work, 'rev-parse', 'HEAD'), before);
  assert.equal(fs.readFileSync(path.join(f.work, 'local.txt'), 'utf8'), 'do not erase');
});
test('diverged histories stop without history rewrite', t => {
  const f = setup(t);
  fs.writeFileSync(path.join(f.work, 'local.txt'), 'keep');
  git(f.work, 'add', '.');git(f.work, 'commit', '-m', 'local');
  const before = git(f.work, 'rev-parse', 'HEAD');
  f.updateRemote();
  const r = gitPreflight(f.work, { fetch: true, apply: true });
  assert.equal(r.status, 'BLOCKED_DIVERGED');
  assert.equal(git(f.work, 'rev-parse', 'HEAD'), before);
});
test('rejects wrong branch, remote, project root and stale apply', t => {
  const f = setup(t);
  assert.equal(gitPreflight(f.work, { branch: 'not-main' }).status, 'BLOCKED_BRANCH');
  assert.equal(gitPreflight(f.work, { remote: 'missing' }).status, 'BLOCKED_REMOTE');
  assert.equal(gitPreflight(f.work, { apply: true }).status, 'BLOCKED_CONFIG');
  fs.mkdirSync(path.join(f.work, 'sub'));
  assert.equal(gitPreflight(path.join(f.work, 'sub')).status, 'BLOCKED_WRONG_ROOT');
  assert.equal(gitPreflight(f.work, { remote: '../../evil' }).status, 'BLOCKED_CONFIG');
});
test('expected GitHub repository blocks a different remote before fetch', t => {
  const f = setup(t);
  const r = gitPreflight(f.work, { expectRepo: 'm-amirov/Season-of-Broken-Hearts', fetch: true });
  assert.equal(r.status, 'BLOCKED_REMOTE_MISMATCH');
  assert.deepEqual(r.actions, []);
});
