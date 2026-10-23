import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('ceos web-preflight reports NOT_CONFIGURED without treating it as CLI failure', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-cli-web-preflight-'));
  const codexHome = path.join(home, '.codex');
  const result = spawnSync(process.execPath, ['./bin/ceos.mjs', 'web-preflight', '--codex-home', codexHome, '--json'], {
    cwd: root,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, 'NOT_CONFIGURED');
  assert.equal(payload.ready, false);
  assert.equal(payload.fallbackAllowed, true);
});

test('ceos help advertises web-preflight', () => {
  const result = spawnSync(process.execPath, ['./bin/ceos.mjs', 'help'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ceos web-preflight/);
});
