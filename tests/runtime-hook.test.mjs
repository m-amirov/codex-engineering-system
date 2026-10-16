import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'hooks', 'ceos-runtime-context.mjs');
import { diagnoseRuntimeContext, readRuntimeContext } from '../src/runtime-context.mjs';
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

function key(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function removeLifecycleRecord(home, cwd, sessionId) {
  const worktreeKey=key(fs.realpathSync(path.resolve(cwd)));
  const sessionKey=key(sessionId);
  fs.rmSync(path.join(home,'ceos','runtime','lifecycle',worktreeKey,`${sessionKey}.json`),{force:true});
}

function writeCompletedRollout(home, sessionId) {
  const dir=path.join(home,'sessions','2026','10','16');
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,`rollout-2026-10-16T09-34-58-${sessionId}.jsonl`),
    JSON.stringify({timestamp:'2026-10-16T09:34:58.100Z',type:'event_msg',payload:{type:'task_complete'}})+'\n');
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

test('same-worktree old active lifecycle is history, current host-bound turn can execute',t=>{
  const x=setupWorktrees(t);
  x.send('SessionStart','session-A',x.a);
  x.send('UserPromptSubmit','session-A',x.a,'turn-A');
  x.send('SessionStart','session-B',x.a);
  x.send('UserPromptSubmit','session-B',x.a,'turn-B');
  const current=readRuntimeContext({codexHome:x.home,projectDir:x.a});
  assert.equal(current.selectionError,null);
  assert.equal(current.session.sessionId,'session-B');
  assert.equal(current.turn.turnId,'turn-B');
  assert.equal(nativeProducerParentContext({codexHome:x.home,projectDir:x.a}),'session-B');
  const diagnostic=diagnoseRuntimeContext({codexHome:x.home,projectDir:x.a});
  assert.equal(diagnostic.status,'PASS');
  assert.equal(diagnostic.candidates.find(c=>c.sessionId==='session-A').classification,
    'HISTORICAL_ACTIVE_NOT_CURRENT');
  x.send('SessionEnd','session-A',x.a);
  const ended=JSON.parse(fs.readFileSync(path.join(x.home,'ceos','runtime','lifecycle',
    key(fs.realpathSync(path.resolve(x.a))),`${key('session-A')}.json`)));
  assert.equal(ended.state,'ended');
  assert.equal(ended.lastEvent,'SessionEnd');
  assert.equal(readRuntimeContext({codexHome:x.home,projectDir:x.a}).session.sessionId,'session-B');
});

test('compact SessionStart preserves the trusted current turn',t=>{
  const x=setupWorktrees(t);
  x.send('SessionStart','session-A',x.a);
  x.send('UserPromptSubmit','session-A',x.a,'turn-A');
  const compact=runHook(x.home,{hook_event_name:'SessionStart',session_id:'session-A',
    source:'compact',model:'m',cwd:x.a});
  assert.equal(compact.status,0,compact.stderr);
  const ctx=readRuntimeContext({codexHome:x.home,projectDir:x.a});
  assert.equal(ctx.session.sessionId,'session-A');
  assert.equal(ctx.turn.turnId,'turn-A');
});

test('active lifecycle cannot become trusted producer parent without current host turn binding',t=>{
  const x=setupWorktrees(t);
  const selectedSessionId='01a14440-1fcb-4f2f-9b58-000000000001';
  const actualSessionId='01a14440-07d6-4f2f-9b58-000000000002';
  assert.equal(runHook(x.home,{hook_event_name:'SessionStart',session_id:selectedSessionId,
    source:'startup',model:'m',cwd:x.a}).status,0);
  assert.equal(runHook(x.home,{hook_event_name:'UserPromptSubmit',session_id:selectedSessionId,
    turn_id:'selected-turn',model:'m',cwd:x.a}).status,0);

  // A new client entry clears the global current turn, but the prior scoped
  // lifecycle and turn remain as host-observed history.
  assert.equal(runHook(x.home,{hook_event_name:'SessionStart',session_id:actualSessionId,
    source:'resume',model:'m',cwd:x.a,client:'codex'}).status,0);
  assert.equal(fs.existsSync(path.join(x.home,'ceos','runtime','current-turn.json')),false);

  const diagnostics=diagnoseRuntimeContext({codexHome:x.home,projectDir:x.a});
  assert.equal(diagnostics.status,'BLOCKED',JSON.stringify(diagnostics));
  assert.equal(diagnostics.trustedHost,null);
  assert.equal(diagnostics.selectedSessionId,null);
  assert.equal(diagnostics.candidates.find(c=>c.sessionId===selectedSessionId).classification,
    'ACTIVE_LIFECYCLE_CURRENT_TURN_UNBOUND');
  assert.equal(nativeProducerParentContext({codexHome:x.home,projectDir:x.a}),null);
});

test('re-entry through ChatGPT and Codex clients cannot reuse active scoped session without UserPromptSubmit',t=>{
  for (const client of ['chatgpt','codex']) {
    const x=setupWorktrees(t);
    const selectedSessionId=`${client}-selected`;
    const actualSessionId=`${client}-actual`;
    assert.equal(runHook(x.home,{hook_event_name:'SessionStart',session_id:selectedSessionId,
      source:'startup',model:'m',cwd:x.a,client}).status,0);
    assert.equal(runHook(x.home,{hook_event_name:'UserPromptSubmit',session_id:selectedSessionId,
      turn_id:`${client}-turn`,model:'m',cwd:x.a,client}).status,0);
    assert.equal(runHook(x.home,{hook_event_name:'SessionStart',session_id:actualSessionId,
      source:'resume',model:'m',cwd:x.a,client}).status,0);

    const diagnostics=diagnoseRuntimeContext({codexHome:x.home,projectDir:x.a});
    assert.equal(diagnostics.status,'BLOCKED',`${client}: ${JSON.stringify(diagnostics)}`);
    assert.equal(diagnostics.selectionError,'BLOCKED_ACTIVE_LIFECYCLE_CURRENT_TURN_UNBOUND');
    assert.equal(nativeProducerParentContext({codexHome:x.home,projectDir:x.a}),null);
  }
});

test('missing UserPromptSubmit leaves a new SessionStart blocked even with one active lifecycle marker',t=>{
  const x=setupWorktrees(t);
  assert.equal(runHook(x.home,{hook_event_name:'SessionStart',session_id:'session-without-prompt',
    source:'startup',model:'m',cwd:x.a,client:'codex'}).status,0);
  const diagnostics=diagnoseRuntimeContext({codexHome:x.home,projectDir:x.a});
  assert.equal(diagnostics.status,'BLOCKED',JSON.stringify(diagnostics));
  assert.equal(diagnostics.selectionError,'BLOCKED_ACTIVE_LIFECYCLE_CURRENT_TURN_UNBOUND');
  assert.equal(diagnostics.selectedSessionId,null);
  assert.equal(nativeProducerParentContext({codexHome:x.home,projectDir:x.a}),null);
});

test('legacy rollout without SessionEnd is diagnostic history with a current trusted host turn',t=>{
  const x=setupWorktrees(t);
  x.send('SessionStart','current-session',x.a);
  x.send('UserPromptSubmit','current-session',x.a,'current-turn');
  x.send('SessionStart','completed-session',x.a);
  x.send('UserPromptSubmit','completed-session',x.a,'completed-turn');
  removeLifecycleRecord(x.home,x.a,'completed-session');
  writeCompletedRollout(x.home,'completed-session');
  x.send('UserPromptSubmit','current-session',x.a,'current-turn-2');

  const before=fs.readFileSync(path.join(x.home,'ceos','runtime','worktrees',
    key(fs.realpathSync(path.resolve(x.a))),key('completed-session'),'turn.json'),'utf8');
  const diagnostics=diagnoseRuntimeContext({codexHome:x.home,projectDir:x.a});
  assert.equal(diagnostics.status,'PASS',JSON.stringify(diagnostics));
  assert.equal(diagnostics.selectionError,null);
  assert.equal(diagnostics.selectedSessionId,'current-session');
  assert.equal(diagnostics.candidates.find(c=>c.sessionId==='completed-session').classification,
    'HISTORICAL_UNBOUND_LEGACY');
  const after=fs.readFileSync(path.join(x.home,'ceos','runtime','worktrees',
    key(fs.realpathSync(path.resolve(x.a))),key('completed-session'),'turn.json'),'utf8');
  assert.equal(after,before);
  const selected=readRuntimeContext({codexHome:x.home,projectDir:x.a});
  assert.equal(selected.session.sessionId,'current-session');
  assert.equal(selected.turn.turnId,'current-turn-2');
  assert.equal(selected.selectionError,null);
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

test('real-world old active lifecycle does not block freshly host-bound Codex turn',t=>{
  const x=setupWorktrees(t);
  const oldSession='01a145d1-0d8b-74a0-8ecd-c552581a8de7';
  const currentSession='01a14601-674e-76d0-b0fe-37285946d264';
  x.send('SessionStart',oldSession,x.a);
  x.send('UserPromptSubmit',oldSession,x.a,'01a145ee-3672-7fa1-a6f5-23e5f338e9f4');
  x.send('SessionStart',currentSession,x.a);
  x.send('UserPromptSubmit',currentSession,x.a,'01a14601-6b7e-7681-b0e8-cc4bb0f288f0');
  const before=JSON.stringify(diagnoseRuntimeContext({codexHome:x.home,projectDir:x.a}).candidates);
  const current=readRuntimeContext({codexHome:x.home,projectDir:x.a});
  assert.equal(current.session.sessionId,currentSession);
  assert.equal(current.turn.turnId,'01a14601-6b7e-7681-b0e8-cc4bb0f288f0');
  assert.equal(nativeProducerParentContext({codexHome:x.home,projectDir:x.a}),currentSession);
  const diag=diagnoseRuntimeContext({codexHome:x.home,projectDir:x.a});
  assert.equal(diag.status,'PASS');
  assert.equal(diag.trustedHost.sessionId,currentSession);
  assert.equal(diag.candidates.length,2);
  assert.equal(diag.candidates.find(v=>v.sessionId===oldSession).classification,
    'HISTORICAL_ACTIVE_NOT_CURRENT');
  assert.equal(JSON.stringify(diag.candidates),before,'read-only diagnostic cannot rewrite lifecycle history');
});

test('switch to SessionStart without UserPromptSubmit revokes old current-turn authority',t=>{
  const x=setupWorktrees(t);
  x.send('SessionStart','session-A',x.a);
  x.send('UserPromptSubmit','session-A',x.a,'turn-A');
  x.send('SessionStart','session-B',x.a);
  const d=diagnoseRuntimeContext({codexHome:x.home,projectDir:x.a});
  assert.equal(d.status,'BLOCKED');
  assert.equal(d.selectedSessionId,null);
  assert.equal(d.trustedHost,null);
  assert.equal(nativeProducerParentContext({codexHome:x.home,projectDir:x.a}),null);
});

test('current scoped turn mismatch cannot borrow a valid host session or old scoped turn',t=>{
  const x=setupWorktrees(t);
  x.send('SessionStart','session-A',x.a);
  x.send('UserPromptSubmit','session-A',x.a,'turn-A');
  const scoped=path.join(x.home,'ceos','runtime','worktrees',
    key(fs.realpathSync(path.resolve(x.a))),key('session-A'),'turn.json');
  fs.writeFileSync(scoped,JSON.stringify({sessionId:'session-A',turnId:'different-turn',
    cwd:x.a,observedAt:new Date().toISOString()}));
  const diagnostic=diagnoseRuntimeContext({codexHome:x.home,projectDir:x.a});
  assert.equal(diagnostic.status,'BLOCKED');
  assert.equal(readRuntimeContext({codexHome:x.home,projectDir:x.a}).session,null);
  assert.equal(nativeProducerParentContext({codexHome:x.home,projectDir:x.a}),null);
});

test('wrong worktree current host does not authorize a different checkout',t=>{
  const x=setupWorktrees(t);
  x.send('SessionStart','session-A',x.a);
  x.send('UserPromptSubmit','session-A',x.a,'turn-A');
  x.send('SessionStart','session-B',x.b);
  x.send('UserPromptSubmit','session-B',x.b,'turn-B');
  const ctx=readRuntimeContext({codexHome:x.home,projectDir:x.a});
  assert.equal(ctx.session.sessionId,'session-A');
  assert.equal(ctx.turn.turnId,'turn-A');
  assert.equal(nativeProducerParentContext({codexHome:x.home,projectDir:x.a}),'session-A');
});
