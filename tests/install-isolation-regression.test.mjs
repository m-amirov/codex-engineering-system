import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('Windows global installer packages an isolated tarball instead of globally linking the source worktree', () => {
  const installer = read('scripts/install-global.ps1');
  assert.match(installer, /npm pack \$Root --pack-destination \$PackRoot --json/);
  assert.match(installer, /npm install -g \$PackagePath/);
  assert.match(installer, /System\.Guid\]::NewGuid/);
  assert.match(installer, /Remove-Item -LiteralPath \$PackRoot -Recurse -Force/);
  assert.doesNotMatch(installer, /npm install -g \$Root(?:\s|$)/m);
});

test('source checkout has deterministic LF policy for executable and source text files', () => {
  const attrs = read('.gitattributes');
  for (const extension of ['mjs', 'js', 'json', 'md', 'yml', 'yaml', 'toml', 'ps1']) {
    assert.match(attrs, new RegExp('\\*\\.' + extension + '\\s+text\\s+eol=lf'));
  }
});

test('installer validates npm pack metadata and archive existence before global install', () => {
  const installer = read('scripts/install-global.ps1');
  assert.match(installer, /ConvertFrom-Json/);
  assert.match(installer, /npm pack returned no package metadata/i);
  assert.match(installer, /npm pack metadata did not contain filename/i);
  assert.match(installer, /npm pack archive not found/i);
  assert.match(installer, /Test-Path -LiteralPath \$PackagePath -PathType Leaf/);
});
