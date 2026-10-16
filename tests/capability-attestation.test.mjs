import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRun, recordCheckpoint } from '../src/execution-engine.mjs';
import {
  beginCapabilityChallenge,
  respondCapabilityChallenge,
  readRunCapabilityAttestation
} from '../src/capability-attestation.mjs';
import { collectCapabilities } from '../src/capabilities.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function tempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-cap-attest-'));
}

function caps(project) {
  return {
    schemaVersion: 1,
    ceosVersion: 'test',
    observedAt: new Date().toISOString(),
    projectDir: project,
    filesystem: { exists: true, readable: true, writable: true },
    executables: {},
    project: { manifest: { available: false }, browser: { configured: false } },
    web: { status: 'NOT_CONFIGURED', ready: false, source: 'test' },
    imageGeneration: {
      status: 'unknown',
      capabilityPresence: 'UNKNOWN',
      serviceAvailability: 'unknown',
      trustedForGeneration: false,
      generationAllowed: false,
      source: 'test'
    },
    nativeAgents: { present: [], missing: [] },
    limitations: []
  };
}

function scope() {
  return {
    target: 'asset generation',
    inScope: ['assets'],
    outOfScope: ['game logic'],
    acceptanceContract: 'fresh visual assets',
    mutationBoundary: 'asset files'
  };
}

function writeRuntime(home, project, sessionId = 'session-1', turnId = 'turn-1') {
  const root = path.join(home, 'ceos', 'runtime');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'current-session.json'), JSON.stringify({ sessionId, cwd: project, observedAt: new Date().toISOString() }));
  fs.writeFileSync(path.join(root, 'current-turn.json'), JSON.stringify({ sessionId, turnId, cwd: project, observedAt: new Date().toISOString() }));
}

function reachGeneration(project, id) {
  const inventory = path.join(project, 'inventory.json');
  const canon = path.join(project, 'canon.json');
  fs.writeFileSync(inventory, '{}');
  fs.writeFileSync(canon, '{}');
  recordCheckpoint(project, id, { stage: 'INVENTORIED', artifacts: [inventory] });
  recordCheckpoint(project, id, { stage: 'CANON_READY', artifacts: [canon] });
}

test('run-scoped challenge binds session, turn and single-use nonce', () => {
  const project = tempProject();
  const codexHome = path.join(project, '.codex');
  writeRuntime(codexHome, project);
  const run = createRun(project, 'production-art', { scope: scope(), capabilities: caps(project) });
  reachGeneration(project, run.run.runId);

  const challenge = beginCapabilityChallenge(project, run.run.runId, { codexHome });
  assert.equal(challenge.sessionId, 'session-1');
  assert.equal(challenge.turnId, 'turn-1');
  const persisted = JSON.parse(fs.readFileSync(path.join(run.runDir, 'capability-attestation', 'challenges', `${challenge.challengeId}.json`), 'utf8'));
  assert.equal(persisted.nonce, undefined);
  assert.ok(persisted.nonceSha256);

  const response = respondCapabilityChallenge(project, run.run.runId, {
    codexHome,
    challengeId: challenge.challengeId,
    nonce: challenge.nonce,
    presence: 'PRESENT',
    serviceAvailability: 'UNKNOWN'
  });
  assert.equal(response.attestation.presence, 'PRESENT');
  assert.equal(response.attestation.serviceAvailability, 'UNKNOWN');
  assert.throws(() => respondCapabilityChallenge(project, run.run.runId, {
    codexHome,
    challengeId: challenge.challengeId,
    nonce: challenge.nonce,
    presence: 'PRESENT'
  }), /not open/);

  const observed = readRunCapabilityAttestation(project, run.run.runId, { codexHome });
  assert.equal(observed.valid, true);
  const snapshot = collectCapabilities(project, { codexHome, imageGenerationAttestation: observed });
  assert.equal(snapshot.imageGeneration.capabilityPresence, 'PRESENT');
  assert.equal(snapshot.imageGeneration.serviceAvailability, 'unknown');
  assert.equal(snapshot.imageGeneration.trustedForGeneration, true);
  assert.equal(snapshot.imageGeneration.generationAllowed, true);
});

test('attestation survives a new turn in the same session but not a different session', () => {
  const project = tempProject();
  const codexHome = path.join(project, '.codex');
  writeRuntime(codexHome, project);
  const run = createRun(project, 'production-art', { scope: scope(), capabilities: caps(project) });
  reachGeneration(project, run.run.runId);
  const challenge = beginCapabilityChallenge(project, run.run.runId, { codexHome });
  respondCapabilityChallenge(project, run.run.runId, {
    codexHome,
    challengeId: challenge.challengeId,
    nonce: challenge.nonce,
    presence: 'PRESENT'
  });

  writeRuntime(codexHome, project, 'session-1', 'turn-2');
  const observed = readRunCapabilityAttestation(project, run.run.runId, { codexHome });
  assert.equal(observed.valid, true, observed.reason);
  writeRuntime(codexHome, project, 'different-session', 'turn-3');
  const wrongSession = readRunCapabilityAttestation(project, run.run.runId, { codexHome });
  assert.equal(wrongSession.valid, false);
  assert.equal(wrongSession.reason, 'session mismatch');
});

test('service availability cannot be asserted without real-invocation evidence', () => {
  const project = tempProject();
  const codexHome = path.join(project, '.codex');
  writeRuntime(codexHome, project);
  const run = createRun(project, 'production-art', { scope: scope(), capabilities: caps(project) });
  reachGeneration(project, run.run.runId);
  const challenge = beginCapabilityChallenge(project, run.run.runId, { codexHome });
  assert.throws(() => respondCapabilityChallenge(project, run.run.runId, {
    codexHome,
    challengeId: challenge.challengeId,
    nonce: challenge.nonce,
    presence: 'PRESENT',
    serviceAvailability: 'AVAILABLE'
  }), /requires explicit serviceEvidence/);
});

test('current trusted host may attest after an older active lifecycle lacks SessionEnd',t=>{
  const project=tempProject();
  t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
  const codexHome=path.join(project,'.codex');
  const hook=fileURLToPath(new URL('../hooks/ceos-runtime-context.mjs',import.meta.url));
  function send(event,sessionId,turnId) {
    const eventData={hook_event_name:event,session_id:sessionId,
      ...(turnId ? {turn_id:turnId} : {source:'startup'}),
      cwd:project,model:'gpt-6'};
    const res=spawnSync(process.execPath,[hook,'--codex-home',codexHome],{
      input:JSON.stringify(eventData),encoding:'utf8'
    });
    assert.equal(res.status,0,res.stderr);
  }
  const old='01a145d1-0d8b-74a0-8ecd-c552581a8de7';
  const current='01a14601-674e-76d0-b0fe-37285946d264';
  const turn='01a14601-6b7e-7681-b0e8-cc4bb0f288f0';
  send('SessionStart',old);
  send('UserPromptSubmit',old,'old-turn');
  send('SessionStart',current);
  send('UserPromptSubmit',current,turn);
  const run=createRun(project,'production-art',{scope:scope(),capabilities:caps(project)});
  reachGeneration(project,run.run.runId);
  const challenge=beginCapabilityChallenge(project,run.run.runId,{codexHome});
  assert.equal(challenge.sessionId,current);
  assert.equal(challenge.turnId,turn);
  const answer=respondCapabilityChallenge(project,run.run.runId,{
    codexHome,challengeId:challenge.challengeId,nonce:challenge.nonce,
    presence:'PRESENT',serviceAvailability:'UNKNOWN'
  });
  assert.equal(answer.attestation.sessionId,current);
  assert.equal(readRunCapabilityAttestation(project,run.run.runId,{codexHome}).valid,true);
  // A fresh UserPromptSubmit for the older session changes the live host:
  // it cannot borrow the attestation for the previous turn.
  send('UserPromptSubmit',old,'new-old-turn');
  const reused=readRunCapabilityAttestation(project,run.run.runId,{codexHome});
  assert.equal(reused.valid,false);
  assert.match(reused.reason,/session mismatch/);
});

test('root capability attestation remains valid after a child UserPromptSubmit hook',t=>{
  const project=tempProject();
  t.after(()=>fs.rmSync(project,{force:true,recursive:true}));
  const codexHome=path.join(project,'.codex');
  const hook=fileURLToPath(new URL('../hooks/ceos-runtime-context.mjs',import.meta.url));
  const parent='parent-123',child='child-456';
  function dispatch(payload) {
    const result=spawnSync(process.execPath,[hook,'--codex-home',codexHome],{
      input:JSON.stringify({cwd:project,model:'gpt-5.6-terra',...payload}),
      encoding:'utf8'
    });
    assert.equal(result.status,0,result.stderr);
  }
  dispatch({hook_event_name:'SessionStart',session_id:parent,source:'startup'});
  dispatch({hook_event_name:'UserPromptSubmit',session_id:parent,turn_id:'parent-turn'});
  const run=createRun(project,'production-art',{scope:scope(),capabilities:caps(project)});
  reachGeneration(project,run.run.runId);
  const ch=beginCapabilityChallenge(project,run.run.runId,{codexHome});
  respondCapabilityChallenge(project,run.run.runId,{
    codexHome,challengeId:ch.challengeId,nonce:ch.nonce,presence:'PRESENT',
    serviceAvailability:'UNKNOWN'
  });
  assert.equal(readRunCapabilityAttestation(project,run.run.runId,{codexHome}).valid,true);
  dispatch({hook_event_name:'UserPromptSubmit',session_id:child,turn_id:'child-turn',
    subagent:{agent_id:child,agent_type:'ceos_asset_generator',parent_session_id:parent}});
  assert.equal(readRunCapabilityAttestation(project,run.run.runId,{codexHome}).valid,true);
  dispatch({hook_event_name:'UserPromptSubmit',session_id:parent,turn_id:'new-parent-turn'});
  const carried=readRunCapabilityAttestation(project,run.run.runId,{codexHome});
  assert.equal(carried.valid,true,carried.reason);
  dispatch({hook_event_name:'SessionStart',session_id:'another-root',source:'startup'});
  dispatch({hook_event_name:'UserPromptSubmit',session_id:'another-root',turn_id:'other-turn'});
  const stale=readRunCapabilityAttestation(project,run.run.runId,{codexHome});
  assert.equal(stale.valid,false);
  assert.equal(stale.reason,'session mismatch');
});

test('expired bounded session capability requires a fresh challenge even when parent session matches',()=>{
  const project=tempProject(),codexHome=path.join(project,'.codex');
  writeRuntime(codexHome,project);
  const run=createRun(project,'production-art',{scope:scope(),capabilities:caps(project)});
  reachGeneration(project,run.run.runId);
  const challenge=beginCapabilityChallenge(project,run.run.runId,{codexHome});
  respondCapabilityChallenge(project,run.run.runId,{
    codexHome,challengeId:challenge.challengeId,nonce:challenge.nonce,
    presence:'PRESENT'
  });
  const realtime=Date.now;
  try {
    const future=realtime()+31*60*1000;
    Date.now=()=>future;
    const observed=readRunCapabilityAttestation(project,run.run.runId,{codexHome});
    assert.equal(observed.valid,false);
    assert.equal(observed.reason,'capability attestation expired');
  } finally { Date.now=realtime; }
});

test('a challenge cannot be consumed after a turn switch even within the same session',()=>{
  const project=tempProject(),codexHome=path.join(project,'.codex');
  writeRuntime(codexHome,project);
  const run=createRun(project,'production-art',{scope:scope(),capabilities:caps(project)});
  reachGeneration(project,run.run.runId);
  const challenge=beginCapabilityChallenge(project,run.run.runId,{codexHome});
  writeRuntime(codexHome,project,'session-1','later-turn');
  assert.throws(()=>respondCapabilityChallenge(project,run.run.runId,{
    codexHome,challengeId:challenge.challengeId,nonce:challenge.nonce,
    presence:'PRESENT'
  }),/different Codex session\/turn/);
});
