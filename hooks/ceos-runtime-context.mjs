#!/usr/bin/env node
// CEOS-managed hook; session/turn freshness only. It does not attest native tool presence.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

const stdin = fs.readFileSync(0, 'utf8').trim();
const input = stdin ? JSON.parse(stdin) : {};
const defaultCodexHome = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const codexHome = path.resolve(arg('--codex-home') || defaultCodexHome);
const runtimeRoot = path.join(codexHome, 'ceos', 'runtime');
const sessionFile = path.join(runtimeRoot, 'current-session.json');
const turnFile = path.join(runtimeRoot, 'current-turn.json');
const legacyCapabilityFile = path.join(codexHome, 'ceos', 'native-capabilities.json');
const observedAt = new Date().toISOString();

if (input.hook_event_name === 'SessionStart') {
  const prior = readJson(sessionFile);
  const changedSession = Boolean(prior?.sessionId && prior.sessionId !== input.session_id);
  const hardReset = ['startup', 'clear', 'fork'].includes(input.source);
  if (changedSession || hardReset) {
    fs.rmSync(turnFile, { force: true });
    const legacy = readJson(legacyCapabilityFile);
    if (!legacy?.sessionId || legacy.sessionId !== input.session_id) fs.rmSync(legacyCapabilityFile, { force: true });
  }
  atomicWriteJson(sessionFile, {
    schemaVersion: 1,
    sessionId: input.session_id,
    source: input.source,
    model: input.model,
    cwd: input.cwd,
    observedAt
  });
  process.stdout.write(JSON.stringify({
    continue: true,
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: 'CEOS session freshness is active. Native image capability must be proven with a run-scoped CEOS capability challenge from the current turn; manual/env/stale capability state is not trusted for production generation.'
    }
  }));
} else if (input.hook_event_name === 'UserPromptSubmit') {
  const session = readJson(sessionFile);
  if (!session?.sessionId || session.sessionId !== input.session_id) {
    fs.rmSync(turnFile, { force: true });
    fs.rmSync(legacyCapabilityFile, { force: true });
    atomicWriteJson(sessionFile, {
      schemaVersion: 1,
      sessionId: input.session_id,
      source: 'user-prompt-recovery',
      model: input.model,
      cwd: input.cwd,
      observedAt
    });
  }
  atomicWriteJson(turnFile, {
    schemaVersion: 1,
    sessionId: input.session_id,
    turnId: input.turn_id,
    model: input.model,
    cwd: input.cwd,
    observedAt
  });
  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }));
} else if (input.hook_event_name === 'SessionEnd') {
  const session = readJson(sessionFile);
  if (!session?.sessionId || session.sessionId === input.session_id) {
    fs.rmSync(turnFile, { force: true });
    fs.rmSync(sessionFile, { force: true });
    fs.rmSync(legacyCapabilityFile, { force: true });
  }
  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }));
} else {
  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }));
}
