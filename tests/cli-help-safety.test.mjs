import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const CLI = fileURLToPath(new URL('../bin/ceos.mjs', import.meta.url));

function runHelp(t, command, extraArgs = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-help-readonly-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  fs.mkdirSync(home);
  fs.mkdirSync(project);

  const result = spawnSync(process.execPath, [CLI, ...command, ...extraArgs, '--home', home,
    '--codex-home', path.join(home, '.codex'), '--project', project], {
    cwd: project,
    encoding: 'utf8',
    timeout: 20000,
    env: { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: path.join(home, '.codex') }
  });

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Usage:|Usage\s*:/);
  assert.deepEqual(fs.readdirSync(home), [], 'help must not install global agents, skills, hooks, backups or manifests');
  assert.deepEqual(fs.readdirSync(project), [], 'help must not create project files');
}

test('install-global --help is read-only, including --force', t => {
  runHelp(t, ['install-global', '--help'], ['--mode', 'copy', '--force']);
});

test('install-global -h is also read-only', t => {
  runHelp(t, ['install-global', '-h']);
});

test('other mutating commands handle --help before any operation', async t => {
  for (const command of [['init', '--help'], ['install-skills', '--help'], ['worktrees', 'cleanup', '--help']]) {
    await t.test(command.join(' '), subtest => runHelp(subtest, command));
  }
});
