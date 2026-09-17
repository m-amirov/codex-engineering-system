import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { webPreflight } from '../src/web-preflight.mjs';

function makeHome(manifest) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-web-preflight-'));
  const dir = path.join(home, '.codex', 'ceos');
  fs.mkdirSync(dir, { recursive: true });
  if (manifest !== undefined) fs.writeFileSync(path.join(dir, 'hybrid-routing.json'), JSON.stringify(manifest));
  return home;
}

test('Web preflight degrades cleanly when hybrid routing is not configured', async () => {
  const homeDir = makeHome(undefined);
  const result = await webPreflight({ homeDir, fetchImpl: async () => { throw new Error('must not fetch'); } });
  assert.equal(result.status, 'NOT_CONFIGURED');
  assert.equal(result.ready, false);
  assert.equal(result.fallbackAllowed, true);
});

test('Web preflight does not probe runtime when Web routing is disabled', async () => {
  const homeDir = makeHome({ schemaVersion: 2, enabled: false });
  let called = false;
  const result = await webPreflight({ homeDir, fetchImpl: async () => { called = true; throw new Error('unexpected'); } });
  assert.equal(called, false);
  assert.equal(result.status, 'DISABLED');
  assert.equal(result.ready, false);
  assert.equal(result.fallbackAllowed, true);
});

test('Web preflight reports READY only for a healthy bridge accepting turns', async () => {
  const homeDir = makeHome({ schemaVersion: 2, enabled: true });
  const result = await webPreflight({
    homeDir,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', accepting_turns: true, active_http_turns: 0, active_browser_turns: 0 })
    })
  });
  assert.equal(result.status, 'READY');
  assert.equal(result.ready, true);
  assert.equal(result.fallbackAllowed, false);
});

test('Web preflight converts bridge transport failure into explicit fallback state', async () => {
  const homeDir = makeHome({ schemaVersion: 2, enabled: true });
  const result = await webPreflight({ homeDir, fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.ready, false);
  assert.equal(result.fallbackAllowed, true);
  assert.match(result.reason, /ECONNREFUSED/);
});
