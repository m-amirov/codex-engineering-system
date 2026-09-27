import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'hooks', 'ceos-runtime-context.mjs');

function runHook(home, input) {
  return spawnSync(process.execPath, [script, '--codex-home', home], {
    input: JSON.stringify(input), encoding: 'utf8'
  });
}

test('runtime hook accepts stdin JSON and creates session and turn freshness files', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-hook-'));
  const session = { hook_event_name: 'SessionStart', session_id: 's1', source: 'startup', model: 'm', cwd: root };
  const turn = { hook_event_name: 'UserPromptSubmit', session_id: 's1', turn_id: 't1', model: 'm', cwd: root };
  assert.equal(runHook(home, session).status, 0);
  assert.equal(runHook(home, turn).status, 0);
  const currentSession = JSON.parse(fs.readFileSync(path.join(home, 'ceos', 'runtime', 'current-session.json')));
  const currentTurn = JSON.parse(fs.readFileSync(path.join(home, 'ceos', 'runtime', 'current-turn.json')));
  assert.equal(currentSession.sessionId, 's1');
  assert.equal(currentTurn.sessionId, 's1');
});

test('runtime hook replaces existing freshness files on repeated live events', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-hook-'));
  const session = { hook_event_name: 'SessionStart', session_id: 's1', source: 'startup', model: 'm', cwd: root };
  const turn = { hook_event_name: 'UserPromptSubmit', session_id: 's1', turn_id: 't1', model: 'm', cwd: root };
  assert.equal(runHook(home, session).status, 0);
  assert.equal(runHook(home, session).status, 0);
  assert.equal(runHook(home, turn).status, 0);
  assert.equal(runHook(home, { ...turn, turn_id: 't2' }).status, 0);
  const currentTurn = JSON.parse(fs.readFileSync(path.join(home, 'ceos', 'runtime', 'current-turn.json')));
  assert.equal(currentTurn.turnId, 't2');
});

test('runtime hook emits useful stderr and fails closed for invalid stdin JSON', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-hook-'));
  const result = spawnSync(process.execPath, [script, '--codex-home', home], { input: '{', encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[CEOS hook\] runtime failure/);
  assert.match(result.stderr, /stdin=non-empty-unparseable/);
  assert.match(result.stderr, /stack=/);
});
