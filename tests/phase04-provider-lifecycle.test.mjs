import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DevBrowserHelperClient } from '../src/dev-web-high-transport.mjs';

const HELPER = path.resolve('tests/fixtures/phase04-browser-helper.cjs');
function profile() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-phase04-provider-'));
  return {
    home: path.join(root, 'dev'), stableHome: path.join(root, 'stable'), codexHome: path.join(root, 'codex'),
    descriptorPath: path.join(root, 'descriptor.json'),
    descriptor: { profile: 'development', kind: 'codex-web-gpt-launcher', helper: { executable: process.execPath, script: HELPER } },
    releaseVersion: '6.1.11', mode: 'browser-only', appName: 'CEOS provider fixture'
  };
}
function client(mode, { marker } = {}) {
  return new DevBrowserHelperClient(profile(), {
    startupTimeoutMs: 150, turnTimeoutMs: 170, closeGraceMs: 150,
    spawnImpl: (_executable, _args, options) => spawn(process.execPath, [HELPER, mode, ...(marker ? [marker] : [])], options)
  });
}
function run(clientValue) {
  return clientValue.run({ traceId: 'provider-call-1', prompt: 'review actual pixels', model: 'chatgpt-web/gpt-6-sol',
    reasoning: 'high', images: [] });
}

test('real helper process completes protocol turn and closes without a browser', async () => {
  const helper = client('reply');
  const response = await run(helper);
  assert.equal(response.text, 'fake-provider-response');
  assert.equal(response.submitted, true);
  await helper.close();
  assert.equal(helper.child, null);
});

test('unresponsive helper startup returns a bounded capability failure', async () => {
  const helper = client('no-ready');
  const start = Date.now();
  await assert.rejects(run(helper), error => error.code === 'DEV_HELPER_START_TIMEOUT');
  assert.ok(Date.now() - start < 1_200);
  await helper.close();
});

test('provider turn timeout is bounded and pending trace is removed', async () => {
  const helper = client('no-result');
  await assert.rejects(run(helper), error => error.code === 'DEV_HELPER_TURN_TIMEOUT');
  assert.equal(helper.pending.size, 0);
  await helper.close();
});

test('stubborn helper without ready signal is forcibly reaped after startup timeout', async () => {
  const marker = path.join(os.tmpdir(), `ceos-provider-start-orphan-${process.pid}-${Date.now()}`);
  const helper = client('stubborn-start', { marker });
  try {
    await assert.rejects(run(helper), error => error.code === 'DEV_HELPER_START_TIMEOUT');
    await new Promise(resolve => setTimeout(resolve, 930));
    assert.equal(fs.existsSync(marker), false, 'startup timeout left a stubborn provider process alive');
  } finally { await helper.close(); }
});

test('close stops a stubborn helper before delayed side effects and does not hang', async () => {
  const marker = path.join(os.tmpdir(), `ceos-provider-orphan-${process.pid}-${Date.now()}`);
  const helper = client('stubborn', { marker });
  await helper.ensureChild();
  const started = Date.now();
  await helper.close();
  assert.ok(Date.now() - started < 1_500);
  await new Promise(resolve => setTimeout(resolve, 900));
  assert.equal(fs.existsSync(marker), false, 'stubborn helper kept running after close');
});
