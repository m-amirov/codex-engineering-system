import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const managed = [
  ['ceos-bulk-checker-web.toml', 'ceos_bulk_checker_web'],
  ['ceos-reasoner-web.toml', 'ceos_reasoner_web'],
  ['ceos-art-director-web.toml', 'ceos_art_director_web']
];

test('every CEOS-managed Web agent selects High model and high reasoning effort', () => {
  for (const [file, name] of managed) {
    const toml = fs.readFileSync(path.join(root, 'agents', file), 'utf8');
    assert.match(toml, new RegExp('^name = "' + name + '"$', 'm'));
    assert.match(toml, /^model = "chatgpt-web\/high"$/m, file);
    assert.match(toml, /^model_reasoning_effort = "high"$/m, file);
  }
});

test('hybrid installer records High mode for all managed Web routes', () => {
  const installer = fs.readFileSync(path.join(root, 'scripts', 'install-hybrid.ps1'), 'utf8');
  for (const [, name] of managed) {
    const entry = installer.split(/\r?\n/).find(line => line.includes("Name = '" + name + "';"));
    assert.ok(entry, 'missing installer entry for ' + name);
    assert.match(entry, /Model = 'chatgpt-web\/high'/, name);
  }
});
