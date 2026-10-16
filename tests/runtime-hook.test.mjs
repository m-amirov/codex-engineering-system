import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'hooks', 'ceos-runtime-context.mjs');
import { readRuntimeContext } from '../src/runtime-context.mjs';
import { nativeProducerParentContext } from '../src/native-producer-routing.mjs';

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

test('runtime hook fails closed when a live event omits its trusted cwd', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-hook-'));
  const result = runHook(home, { hook_event_name: 'UserPromptSubmit', session_id: 's1', turn_id: 't1' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CEOS hook requires a real cwd and nonempty session_id/);
  assert.equal(fs.existsSync(path.join(home, 'ceos', 'runtime', 'current-turn.json')), false);
});

function setupWorktrees(t) {
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'ceos-scoped-hook-home-'));
  const a=fs.mkdtempSync(path.join(os.tmpdir(),'ceos-scoped-a-'));
  const b=fs.mkdtempSync(path.join(os.tmpdir(),'ceos-scoped-b-'));
  t.after(()=>[home,a,b].forEach(x=>fs.rmSync(x,{force:true,recursive:true})));
  const send=(event,sessionId,cwd,turnId=null)=>{
    const input={hook_event_name:event,session_id:sessionId,
      ...(event==='SessionStart'?{source:'startup'}:{}),
      ...(turnId?{turn_id:turnId}:{}),model:'m',cwd};
    const r=runHook(home,input);
    assert.equal(r.status,0,r.stderr);
  };
  return {home,a,b,send};
}

test('parallel worktree hooks cannot overwrite each other’s scoped native trust context',t=>{
  const x=setupWorktrees(t);
  x.send('SessionStart','session-A',x.a);
  x.send('UserPromptSubmit','session-A',x.a,'turn-A');
  x.send('SessionStart','session-B',x.b);
  x.send('UserPromptSubmit','session-B',x.b,'turn-B');
  const global=JSON.parse(fs.readFileSync(path.join(x.home,'ceos','runtime','current-session.json')));
  assert.equal(global.sessionId,'session-B','legacy global is last-writer-wins');
  const ctxA=readRuntimeContext({codexHome:x.home,projectDir:x.a});
  const ctxB=readRuntimeContext({codexHome:x.home,projectDir:x.b});
  assert.equal(ctxA.origin,'project-scoped');
  assert.equal(ctxA.session.sessionId,'session-A');
  assert.equal(ctxA.turn.turnId,'turn-A');
  assert.equal(ctxB.session.sessionId,'session-B');
  assert.equal(ctxB.turn.turnId,'turn-B');
  assert.equal(nativeProducerParentContext({codexHome:x.home,projectDir:x.a}),'session-A');
  assert.equal(nativeProducerParentContext({codexHome:x.home,projectDir:x.b}),'session-B');
  x.send('SessionEnd','session-B',x.b);
  assert.equal(readRuntimeContext({codexHome:x.home,projectDir:x.a}).session.sessionId,'session-A');
});

test('two simultaneous sessions in the same worktree are blocked until one ends',t=>{
  const x=setupWorktrees(t);
  x.send('SessionStart','session-A',x.a);
  x.send('UserPromptSubmit','session-A',x.a,'turn-A');
  x.send('SessionStart','session-B',x.a);
  x.send('UserPromptSubmit','session-B',x.a,'turn-B');
  assert.equal(readRuntimeContext({codexHome:x.home,projectDir:x.a}).selectionError,
    'BLOCKED_AMBIGUOUS_WORKTREE_SESSIONS');
  assert.equal(nativeProducerParentContext({codexHome:x.home,projectDir:x.a}),null);
  x.send('SessionEnd','session-A',x.a);
  assert.equal(readRuntimeContext({codexHome:x.home,projectDir:x.a}).session.sessionId,'session-B');
});

test('scoped context never borrows a global marker from a different checkout',t=>{
  const x=setupWorktrees(t);
  x.send('SessionStart','session-A',x.a);
  x.send('UserPromptSubmit','session-A',x.a,'turn-A');
  const other=readRuntimeContext({codexHome:x.home,projectDir:x.b});
  assert.equal(other.selectionError,'BLOCKED_SESSION_CONTEXT_UNVERIFIED');
  assert.equal(other.session,null);
  assert.equal(nativeProducerParentContext({codexHome:x.home,projectDir:x.b}),null);
});

test('stale scoped hook turn cannot fall back to a matching global marker',t=>{
  const x=setupWorktrees(t);
  x.send('SessionStart','session-A',x.a);
  x.send('UserPromptSubmit','session-A',x.a,'turn-A');
  const ctx=readRuntimeContext({codexHome:x.home,projectDir:x.a});
  const file=path.join(ctx.root,'turn.json');
  fs.writeFileSync(file,JSON.stringify({...ctx.turn,observedAt:'2020-01-01T00:00:00.000Z'}));
  const observed=readRuntimeContext({codexHome:x.home,projectDir:x.a});
  assert.equal(observed.selectionError,'BLOCKED_SESSION_CONTEXT_UNVERIFIED');
  assert.equal(observed.session,null);
});
