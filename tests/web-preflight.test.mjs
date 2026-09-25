import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { webPreflight } from '../src/web-preflight.mjs';

function makeHome(manifest, { bom = false } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-web-preflight-'));
  const dir = path.join(home, '.codex', 'ceos');
  fs.mkdirSync(dir, { recursive: true });
  if (manifest !== undefined) {
    const json = JSON.stringify(manifest);
    fs.writeFileSync(path.join(dir, 'hybrid-routing.json'), bom ? `\uFEFF${json}` : json, 'utf8');
  }
  return home;
}

test('Web preflight degrades cleanly when hybrid routing is not configured', async () => {
  const homeDir = makeHome(undefined);
  const result = await webPreflight({ homeDir, fetchImpl: async () => { throw new Error('must not fetch'); } });
  assert.equal(result.status, 'NOT_CONFIGURED');
  assert.equal(result.ready, false);
  assert.equal(result.fallbackAllowed, true);
});

test('Web preflight accepts Windows PowerShell UTF-8 BOM manifests', async () => {
  const homeDir = makeHome({ schemaVersion: 2, enabled: true }, { bom: true });
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

test('Web preflight refuses stale non-High CEOS Web model mapping', async () => {
  const homeDir = makeHome({
    schemaVersion: 2,
    enabled: true,
    webAgents: [
      { name: 'ceos_bulk_checker_web', model: 'chatgpt-web/light' },
      { name: 'ceos_reasoner_web', model: 'chatgpt-web/high' },
      { name: 'ceos_art_director_web', model: 'chatgpt-web/high' }
    ]
  });
  let probed = false;
  const result = await webPreflight({
    homeDir,
    fetchImpl: async () => { probed = true; throw new Error('should not probe stale Web config'); }
  });
  assert.equal(result.status, 'NOT_CONFIGURED');
  assert.equal(result.ready, false);
  assert.equal(probed, false);
  assert.match(result.reason, /non-High/);
});

test('Web preflight accepts the all-High CEOS routing manifest', async () => {
  const homeDir = makeHome({
    schemaVersion: 2,
    enabled: true,
    webAgents: [
      { name: 'ceos_bulk_checker_web', model: 'chatgpt-web/high' },
      { name: 'ceos_reasoner_web', model: 'chatgpt-web/high' },
      { name: 'ceos_art_director_web', model: 'chatgpt-web/high' }
    ]
  });
  const result = await webPreflight({
    homeDir,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ status: 'ok', accepting_turns: true }) })
  });
  assert.equal(result.status, 'READY');
});


test('Web preflight classifies HTTP 429 as RATE_LIMITED and preserves Retry-After', async () => {
  const homeDir = makeHome({ schemaVersion: 2, enabled: true });
  const result = await webPreflight({
    homeDir,
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      headers: { get: name => name.toLowerCase() === 'retry-after' ? '180' : null },
      json: async () => ({ message: 'Too many requests' })
    })
  });
  assert.equal(result.status, 'RATE_LIMITED');
  assert.equal(result.ready, false);
  assert.equal(result.fallbackAllowed, true);
  assert.equal(result.retryAfterSeconds, 180);
});

test('Web preflight classifies explicit bridge cooldown body as RATE_LIMITED', async () => {
  const homeDir = makeHome({ schemaVersion: 2, enabled: true });
  const result = await webPreflight({
    homeDir,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ status: 'ok', accepting_turns: false, rate_limited: true, retry_after_ms: 125000 })
    })
  });
  assert.equal(result.status, 'RATE_LIMITED');
  assert.equal(result.retryAfterSeconds, 125);
});
