import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveCodexHome } from './ceos.mjs';

const MAX_SCOPED_SESSIONS = 64;
const MAX_TURN_AGE_MS = 24 * 60 * 60 * 1000;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file,'utf8')); }
  catch { return null; }
}

function canonical(file) {
  try { return fs.realpathSync(path.resolve(file)); }
  catch { return null; }
}

export function runtimeContextPaths({ homeDir=os.homedir(), codexHome, projectDir }={}) {
  const resolvedCodexHome=resolveCodexHome({homeDir,codexHome});
  const root=path.join(resolvedCodexHome,'ceos','runtime');
  const project=projectDir ? canonical(projectDir) : null;
  return {
    codexHome:resolvedCodexHome,root,
    sessionFile:path.join(root,'current-session.json'),
    turnFile:path.join(root,'current-turn.json'),
    project,
    worktreeDir:project ? path.join(root,'worktrees',hash(project)) : null
  };
}

/**
 * A scoped lookup never borrows the last globally active Codex turn from a
 * different worktree. Multiple fresh sessions for one worktree are ambiguous
 * and must not be reduced to "latest wins".
 *
 * Legacy markers are allowed only if there is no scoped evidence AND both
 * global cwd fields resolve to the requested worktree.
 */
export function readRuntimeContext(options={}) {
  const paths=runtimeContextPaths(options);
  const legacy={...paths,session:readJson(paths.sessionFile),
    turn:readJson(paths.turnFile),origin:'legacy-global',selectionError:null};
  if(!options.projectDir) return legacy;
  if(!paths.project) return {...legacy,session:null,turn:null,origin:'project-scoped',
    selectionError:'BLOCKED_SESSION_PROJECT_UNRESOLVED'};

  if(paths.worktreeDir && fs.existsSync(paths.worktreeDir)) {
    const entries=fs.readdirSync(paths.worktreeDir,{withFileTypes:true})
      .filter(x=>x.isDirectory() && /^[a-f0-9]{64}$/.test(x.name));
    if(entries.length > MAX_SCOPED_SESSIONS)
      return {...legacy,session:null,turn:null,origin:'project-scoped',
        selectionError:'BLOCKED_SESSION_CONTEXT_OVERFLOW'};
    const eligible=[];
    let invalid=false;
    for(const entry of entries) {
      const root=path.join(paths.worktreeDir,entry.name);
      const session=readJson(path.join(root,'session.json'));
      const turn=readJson(path.join(root,'turn.json'));
      if(!session || !turn) continue;
      const age=Date.now()-Date.parse(turn.observedAt??'');
      if(!Number.isFinite(age) || age<0) { invalid=true; continue; }
      if(age>MAX_TURN_AGE_MS) continue;
      if(typeof session.sessionId!=='string' || !session.sessionId ||
         turn.sessionId!==session.sessionId ||
         hash(session.sessionId)!==entry.name ||
         typeof turn.turnId!=='string' || !turn.turnId ||
         canonical(session.cwd)!==paths.project ||
         canonical(turn.cwd)!==paths.project) {
        invalid=true;continue;
      }
      eligible.push({session,turn,root});
    }
    if(invalid) return {...legacy,session:null,turn:null,origin:'project-scoped',
      selectionError:'BLOCKED_SESSION_CONTEXT_CORRUPT'};
    if(eligible.length>1) return {...legacy,session:null,turn:null,origin:'project-scoped',
      selectionError:'BLOCKED_AMBIGUOUS_WORKTREE_SESSIONS'};
    if(eligible.length===1) return {...paths,...eligible[0],
      origin:'project-scoped',selectionError:null};
    return {...legacy,session:null,turn:null,origin:'project-scoped',
      selectionError:'BLOCKED_SESSION_CONTEXT_UNVERIFIED'};
  }

  const matches=legacy.session?.sessionId && legacy.turn?.sessionId===legacy.session.sessionId &&
    canonical(legacy.session.cwd)===paths.project &&
    canonical(legacy.turn.cwd)===paths.project;
  return matches ? legacy : {...legacy,session:null,turn:null,
    selectionError:'BLOCKED_SESSION_CONTEXT_UNVERIFIED'};
}
