import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('0.3.0 hybrid Web agents are bounded read-only routes', () => {
  assert.equal(read('VERSION').trim(), '0.3.0');
  const bulk = read('agents/ceos-bulk-checker-web.toml');
  const explorer = read('agents/ceos-explorer-web.toml');
  assert.match(bulk, /name = "ceos_bulk_checker_web"/);
  assert.match(bulk, /model = "chatgpt-web\/light"/);
  assert.match(bulk, /sandbox_mode = "read-only"/);
  assert.match(explorer, /name = "ceos_explorer_web"/);
  assert.match(explorer, /model = "chatgpt-web\/medium"/);
  assert.match(explorer, /sandbox_mode = "read-only"/);
});

test('hybrid policy permits only one transport-failure fallback and keeps critical path native', () => {
  const global = read('global/AGENTS.md');
  const policy = read('policies/model-routing.md');
  assert.match(global, /fallback is allowed at most once/i);
  assert.match(global, /only when the selected Web model\/backend\/transport cannot run/i);
  assert.match(global, /Keep `ceos_implementer`, `ceos_debugger`, `ceos_reviewer`, and `ceos_verifier` on their native models/i);
  assert.match(policy, /Semantic outcomes[\s\S]*must not trigger a second model run/i);
});

test('Windows hybrid installer uses capability detection and fail-closed ownership checks', () => {
  const installer = read('scripts/install-hybrid.ps1');
  assert.match(installer, /Get-Command 'codex-chatgpt-web'/);
  assert.match(installer, /Refusing to replace non-CEOS agent target/);
  assert.match(installer, /hybrid-routing\.json/);
  assert.match(installer, /single-native-fallback-on-transport-backend-failure-only/);
});
