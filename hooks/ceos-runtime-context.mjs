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
  try {
    fs.renameSync(tmp, file);
  } catch (error) {
    // Windows rename does not replace an existing file. Preserve the temp-file
    // write, then replace the destination explicitly and keep the original error
    // if the fallback cannot complete.
    if (!['EEXIST', 'EPERM', 'ENOTEMPTY'].includes(error?.code)) throw error;
    fs.rmSync(file, { force: true });
    fs.renameSync(tmp, file);
  }
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

const diagnostic = { input: {}, stdinState: 'unread', codexHome: null };
process.on('uncaughtException', error => {
  const message = `[CEOS hook] runtime failure\n` +
    `event=${diagnostic.input?.hook_event_name || 'unknown'}\n` +
    `codexHome=${diagnostic.codexHome || 'unresolved'}\n` +
    `stdin=${diagnostic.stdinState}\n` +
    `error=${error?.message ?? error}\n` +
    `stack=${error?.stack ?? 'unavailable'}\n`;
  process.stderr.write(message);
  try {
    const home = diagnostic.codexHome;
    if (home) {
      const file = path.join(home, 'ceos', 'runtime', 'last-hook-error.json');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({
        observedAt: new Date().toISOString(),
        event: diagnostic.input?.hook_event_name || null,
        codexHome: home,
        stdin: diagnostic.stdinState,
        error: String(error?.message ?? error),
        stack: String(error?.stack ?? 'unavailable')
      }, null, 2) + '\n', 'utf8');
    }
  } catch (artifactError) {
    process.stderr.write(`[CEOS hook] failed to write diagnostic artifact: ${artifactError?.message ?? artifactError}\n`);
  }
  process.exitCode = 1;
});

let input = {};
try {
  const stdin = fs.readFileSync(0, 'utf8').trim();
  diagnostic.stdinState = stdin ? 'non-empty' : 'empty';
  input = stdin ? JSON.parse(stdin) : {};
} catch (error) {
  diagnostic.stdinState = 'non-empty-unparseable';
  throw error;
}
diagnostic.input = input;
const defaultCodexHome = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const codexHome = path.resolve(arg('--codex-home') || defaultCodexHome);
diagnostic.codexHome = codexHome;
const runtimeRoot = path.join(codexHome, 'ceos', 'runtime');
const sessionFile = path.join(runtimeRoot, 'current-session.json');
const turnFile = path.join(runtimeRoot, 'current-turn.json');
const legacyCapabilityFile = path.join(codexHome, 'ceos', 'native-capabilities.json');
const observedAt = new Date().toISOString();
function sessionScopedFiles(input) {
  if (typeof input.cwd !== 'string' || !input.cwd.trim() ||
      typeof input.session_id !== 'string' || !input.session_id.trim())
    throw new Error('CEOS hook requires a real cwd and nonempty session_id');
  const canonicalRoot=fs.realpathSync(path.resolve(input.cwd));
  const worktreeKey=crypto.createHash('sha256').update(canonicalRoot).digest('hex');
  const sessionKey=crypto.createHash('sha256').update(input.session_id).digest('hex');
  const root=path.join(runtimeRoot,'worktrees',worktreeKey,sessionKey);
  return {
    hostFile:path.join(runtimeRoot,'worktrees',worktreeKey,'host.json'),
    root, sessionFile:path.join(root,'session.json'),
    turnFile:path.join(root,'turn.json'),
    lifecycleFile:path.join(runtimeRoot,'lifecycle',worktreeKey,`${sessionKey}.json`),
    canonicalRoot
  };
}

function lifecycleMarker(scoped, input, state, event) {
  const prior=readJson(scoped.lifecycleFile);
  const sameSession=prior?.sessionId === input.session_id;
  return {
    schemaVersion: 1,
    sessionId: input.session_id,
    cwd: input.cwd,
    model: input.model,
    state,
    lastEvent: event,
    startedAt: sameSession ? prior.startedAt : observedAt,
    observedAt,
    endedAt: state === 'ended' ? observedAt : null
  };
}


if (process.exitCode === 1) {
  process.stdout.write(JSON.stringify({ continue: false, suppressOutput: true }));
} else {

if (input.hook_event_name === 'SessionStart') {
  const scoped=sessionScopedFiles(input);
  const prior = readJson(sessionFile);
  const scopedPrior = readJson(scoped.sessionFile);
  const changedSession = Boolean(scopedPrior?.sessionId && scopedPrior.sessionId !== input.session_id);
  const globalSessionChanged = Boolean(prior?.sessionId && prior.sessionId !== input.session_id);
  const hardReset = ['startup', 'clear', 'fork'].includes(input.source);
  if (changedSession || globalSessionChanged || hardReset) {
    fs.rmSync(turnFile, { force: true });
    const legacy = readJson(legacyCapabilityFile);
    if (!legacy?.sessionId || legacy.sessionId !== input.session_id) fs.rmSync(legacyCapabilityFile, { force: true });
  }
  const marker={
    schemaVersion: 1, sessionId: input.session_id,
    source: input.source, model: input.model,
    cwd: input.cwd, observedAt
  };
  atomicWriteJson(sessionFile, marker);
  // Each Codex worktree/session gets independent trusted hook evidence.
  // The legacy global markers remain for older CEOS installations, but
  // project-bound readers must prefer these scoped files.
  atomicWriteJson(scoped.sessionFile, marker);
  // Codex emits SessionStart(source=compact) while continuing the same
  // active turn. Do not erase its trusted scoped turn marker in that case.
  if (!(input.source === 'compact' && !changedSession)) fs.rmSync(scoped.turnFile,{force:true});
  atomicWriteJson(scoped.lifecycleFile,lifecycleMarker(scoped,input,'active','SessionStart'));
  const preservedTurn = input.source === 'compact' && !changedSession ? readJson(scoped.turnFile) : null;
  atomicWriteJson(scoped.hostFile, {
    schemaVersion: 1, sessionId: input.session_id,
    turnId: preservedTurn?.sessionId === input.session_id ? preservedTurn.turnId : null,
    model: input.model, cwd: input.cwd, observedAt,
    event: 'SessionStart', source: input.source
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
  const scoped=sessionScopedFiles(input);
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
  const scopedSession=readJson(scoped.sessionFile);
  if (scopedSession?.sessionId!==input.session_id) {
    atomicWriteJson(scoped.sessionFile, {
      schemaVersion:1,sessionId:input.session_id,
      source:'user-prompt-recovery',model:input.model,
      cwd:input.cwd,observedAt
    });
  }
  const turn={schemaVersion:1,sessionId:input.session_id,
    turnId:input.turn_id,model:input.model,cwd:input.cwd,observedAt};
  atomicWriteJson(turnFile,turn);
  atomicWriteJson(scoped.turnFile,turn);
  atomicWriteJson(scoped.hostFile, { ...turn, event: 'UserPromptSubmit' });
  atomicWriteJson(scoped.lifecycleFile,lifecycleMarker(scoped,input,'active','UserPromptSubmit'));
  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }));
} else if (input.hook_event_name === 'SessionEnd') {
  const scoped=sessionScopedFiles(input);
  // Keep an immutable lifecycle receipt before removing the active scoped
  // marker. The receipt is diagnostic evidence, not a selection override.
  atomicWriteJson(scoped.lifecycleFile,lifecycleMarker(scoped,input,'ended','SessionEnd'));
  // Never clear another active session's scoped files.
  fs.rmSync(scoped.root,{recursive:true,force:true});
  const currentHost=readJson(scoped.hostFile);
  if (currentHost?.sessionId === input.session_id) fs.rmSync(scoped.hostFile,{force:true});
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
}
