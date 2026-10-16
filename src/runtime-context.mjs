import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveCodexHome } from './ceos.mjs';

const MAX_SCOPED_SESSIONS = 64;
const MAX_TURN_AGE_MS = 24 * 60 * 60 * 1000;
const ROLLOUT_TAIL_BYTES = 1024 * 1024;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file,'utf8')); }
  catch { return null; }
}

function canonical(file) {
  try { return fs.realpathSync(path.resolve(file)); }
  catch { return null; }
}

function ageOf(observedAt) {
  const age=Date.now()-Date.parse(observedAt ?? '');
  return Number.isFinite(age) && age >= 0 && age <= MAX_TURN_AGE_MS ? age : null;
}

function validHostContext(paths, legacy) {
  const session=legacy.session;
  const turn=legacy.turn;
  if (!session?.sessionId || turn?.sessionId !== session.sessionId || !turn?.turnId) return null;
  if (canonical(session.cwd) !== paths.project || canonical(turn.cwd) !== paths.project) return null;
  const age=ageOf(turn.observedAt);
  if (age === null) return null;
  return { session, turn, age };
}

function safeReadDir(dir) {
  try { return fs.readdirSync(dir,{withFileTypes:true}); }
  catch { return []; }
}

function rolloutFile(codexHome, sessionId) {
  if (!/^[A-Za-z0-9-]+$/.test(sessionId)) return null;
  const sessionsRoot=path.join(codexHome,'sessions');
  for (const year of safeReadDir(sessionsRoot)) {
    if (!year.isDirectory()) continue;
    for (const month of safeReadDir(path.join(sessionsRoot,year.name))) {
      if (!month.isDirectory()) continue;
      for (const day of safeReadDir(path.join(sessionsRoot,year.name,month.name))) {
        if (!day.isDirectory()) continue;
        for (const entry of safeReadDir(path.join(sessionsRoot,year.name,month.name,day.name))) {
          if (entry.isFile() && entry.name.endsWith(`-${sessionId}.jsonl`))
            return path.join(sessionsRoot,year.name,month.name,day.name,entry.name);
        }
      }
    }
  }
  return null;
}

function rolloutLifecycle(codexHome, sessionId) {
  const file=rolloutFile(codexHome,sessionId);
  if (!file) return { status:'NOT_FOUND', path:null, finalEvent:null };
  try {
    const stat=fs.statSync(file);
    const size=Math.min(stat.size,ROLLOUT_TAIL_BYTES);
    const fd=fs.openSync(file,'r');
    const buffer=Buffer.alloc(size);
    fs.readSync(fd,buffer,0,size,Math.max(0,stat.size-size));
    fs.closeSync(fd);
    const lines=buffer.toString('utf8').split(/\r?\n/).filter(Boolean);
    let lastTerminal=null;
    let lastTurnContextLine=-1;
    for (let index=0; index<lines.length; index++) {
      let item;
      try { item=JSON.parse(lines[index]); } catch { continue; }
      if (item?.type === 'turn_context') lastTurnContextLine=index;
      if (item?.type !== 'event_msg') continue;
      const event=item.payload?.type;
      if (event === 'task_complete' || event === 'turn_aborted')
        lastTerminal={ event, timestamp:item.timestamp ?? null, line:index };
    }
    if (lastTerminal?.event === 'task_complete' && lastTerminal.line >= lastTurnContextLine)
      return { status:'COMPLETED', path:file, finalEvent:'task_complete', observedAt:lastTerminal.timestamp };
    return { status:'UNVERIFIED', path:file, finalEvent:lastTerminal?.event ?? null, observedAt:lastTerminal?.timestamp ?? null };
  } catch {
    return { status:'UNREADABLE', path:file, finalEvent:null };
  }
}

export function runtimeContextPaths({ homeDir=os.homedir(), codexHome, projectDir }={}) {
  const resolvedCodexHome=resolveCodexHome({homeDir,codexHome});
  const root=path.join(resolvedCodexHome,'ceos','runtime');
  const project=projectDir ? canonical(projectDir) : null;
  const worktreeKey=project ? hash(project) : null;
  return {
    codexHome:resolvedCodexHome,root,
    sessionFile:path.join(root,'current-session.json'),
    turnFile:path.join(root,'current-turn.json'),
    project,
    worktreeDir:worktreeKey ? path.join(root,'worktrees',worktreeKey) : null,
    lifecycleDir:worktreeKey ? path.join(root,'lifecycle',worktreeKey) : null
  };
}

function candidateRecord(paths, entry, session, turn, lifecycle, rollout, classification, reason) {
  return {
    sessionId:session?.sessionId ?? null,
    turnId:turn?.turnId ?? null,
    root:path.join(paths.worktreeDir,entry.name),
    lifecycleFile:path.join(paths.lifecycleDir,`${entry.name}.json`),
    lifecycleState:lifecycle?.state ?? null,
    rolloutPath:rollout?.path ?? null,
    rolloutFinalEvent:rollout?.finalEvent ?? null,
    classification,
    reason
  };
}

function inspectRuntimeContext(options={}) {
  const paths=runtimeContextPaths(options);
  const legacy={...paths,session:readJson(paths.sessionFile),
    turn:readJson(paths.turnFile),origin:'legacy-global',selectionError:null};
  if (!options.projectDir) return {
    context:legacy,
    diagnostics:{status:'PASS',selectionError:null,project:null,selectedSessionId:legacy.session?.sessionId ?? null,
      trustedHost:null,candidates:[]}
  };
  if (!paths.project) {
    const context={...legacy,session:null,turn:null,origin:'project-scoped',
      selectionError:'BLOCKED_SESSION_PROJECT_UNRESOLVED'};
    return {context,diagnostics:{status:'BLOCKED',selectionError:context.selectionError,project:null,
      selectedSessionId:null,trustedHost:null,candidates:[]}};
  }

  const host=validHostContext(paths,legacy);
  const diagnostics={status:'BLOCKED',selectionError:null,project:paths.project,
    selectedSessionId:null,
    trustedHost:host ? {sessionId:host.session.sessionId,turnId:host.turn.turnId,observedAt:host.turn.observedAt} : null,
    candidates:[]};
  const base={...legacy,session:null,turn:null,origin:'project-scoped'};

  if (paths.worktreeDir && fs.existsSync(paths.worktreeDir)) {
    const entries=safeReadDir(paths.worktreeDir).filter(x=>x.isDirectory() && /^[a-f0-9]{64}$/.test(x.name));
    if (entries.length > MAX_SCOPED_SESSIONS) {
      const context={...base,selectionError:'BLOCKED_SESSION_CONTEXT_OVERFLOW'};
      diagnostics.selectionError=context.selectionError;
      return {context,diagnostics};
    }
    const eligible=[];
    let invalid=false;
    for (const entry of entries) {
      const root=path.join(paths.worktreeDir,entry.name);
      const session=readJson(path.join(root,'session.json'));
      const scopedTurn=readJson(path.join(root,'turn.json'));
      const lifecycle=readJson(path.join(paths.lifecycleDir,`${entry.name}.json`));
      if (!session) {
        diagnostics.candidates.push(candidateRecord(paths,entry,null,scopedTurn,lifecycle,null,'INCOMPLETE_MARKER','session.json is missing or unreadable'));
        continue;
      }
      if (lifecycle && (lifecycle.sessionId !== session.sessionId || lifecycle.cwd && canonical(lifecycle.cwd)!==paths.project || !['active','ended'].includes(lifecycle.state))) {
        diagnostics.candidates.push(candidateRecord(paths,entry,session,scopedTurn,lifecycle,null,'CORRUPT_LIFECYCLE','lifecycle record does not match the scoped session'));
        invalid=true;
        continue;
      }
      const hostMatch=host?.session.sessionId === session.sessionId && canonical(session.cwd)===paths.project;
      const turn=scopedTurn ?? (hostMatch ? host.turn : null);
      if (!turn) {
        diagnostics.candidates.push(candidateRecord(paths,entry,session,null,lifecycle,null,'INCOMPLETE_MARKER','turn.json is missing and no matching trusted host turn exists'));
        continue;
      }
      const age=ageOf(turn.observedAt);
      if (age === null) {
        diagnostics.candidates.push(candidateRecord(paths,entry,session,turn,lifecycle,null,'STALE_OR_INVALID_TURN','turn marker is outside the trusted freshness window'));
        continue;
      }
      if (typeof session.sessionId!=='string' || !session.sessionId ||
          turn.sessionId!==session.sessionId || hash(session.sessionId)!==entry.name ||
          typeof turn.turnId!=='string' || !turn.turnId ||
          canonical(session.cwd)!==paths.project || canonical(turn.cwd)!==paths.project) {
        diagnostics.candidates.push(candidateRecord(paths,entry,session,turn,lifecycle,null,'CORRUPT_MARKER','session and turn markers failed identity or cwd validation'));
        invalid=true;
        continue;
      }
      if (lifecycle?.state === 'ended') {
        diagnostics.candidates.push(candidateRecord(paths,entry,session,turn,lifecycle,null,'ENDED_SESSION','trusted SessionEnd lifecycle receipt exists'));
        continue;
      }

      const rollout=lifecycle ? null : rolloutLifecycle(paths.codexHome,session.sessionId);
      let classification='ACTIVE_LIFECYCLE';
      let reason='active scoped lifecycle record from a trusted hook event';
      if (!lifecycle) {
        if (hostMatch) {
          classification='TRUSTED_HOST_CURRENT';
          reason='scoped marker matches the trusted current host session';
        } else if (rollout.status === 'COMPLETED') {
          classification='MISSING_SESSION_END';
          reason='Codex rollout ended with task_complete, but task completion is not a trusted SessionEnd receipt';
        } else {
          classification='UNVERIFIED_LEGACY';
          reason='legacy scoped marker has no lifecycle receipt and no trusted completion evidence';
        }
      }
      const record=candidateRecord(paths,entry,session,turn,lifecycle,rollout,classification,reason);
      diagnostics.candidates.push(record);
      eligible.push({entry,session,turn,lifecycle,classification,root});
    }
    if (invalid) diagnostics.selectionError='BLOCKED_SESSION_CONTEXT_CORRUPT';
    else if (eligible.length > 1) diagnostics.selectionError='BLOCKED_AMBIGUOUS_WORKTREE_SESSIONS';
    else if (eligible.length === 1 && eligible[0].classification !== 'UNVERIFIED_LEGACY') {
      const selected=eligible[0];
      const context={...paths,session:selected.session,turn:selected.turn,root:selected.root,
        origin:'project-scoped',selectionError:null};
      diagnostics.status='PASS';
      diagnostics.selectedSessionId=selected.session.sessionId;
      return {context,diagnostics};
    } else diagnostics.selectionError='BLOCKED_SESSION_CONTEXT_UNVERIFIED';
    const context={...base,selectionError:diagnostics.selectionError};
    return {context,diagnostics};
  }

  const matches=host !== null;
  const context=matches ? legacy : {...base,selectionError:'BLOCKED_SESSION_CONTEXT_UNVERIFIED'};
  diagnostics.status=matches ? 'PASS' : 'BLOCKED';
  diagnostics.selectionError=context.selectionError;
  diagnostics.selectedSessionId=matches ? legacy.session.sessionId : null;
  return {context,diagnostics};
}

/** Read-only explanation of all project-scoped session candidates. */
export function diagnoseRuntimeContext(options={}) {
  return inspectRuntimeContext(options).diagnostics;
}

/**
 * Active lifecycle receipts and trusted host binding decide selection. A
 * timestamp never wins a same-worktree race; parallel active sessions block.
 */
export function readRuntimeContext(options={}) {
  return inspectRuntimeContext(options).context;
}
