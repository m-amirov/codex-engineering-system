import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resumeRun, inspectBlockedRunRecovery, EXECUTION_PIPELINES } from './execution-engine.mjs';

const MODES = new Set(['inspect', 'guided', 'auto']);
const TERMINAL = new Set(['PASS', 'FAIL', 'BLOCKED', 'ESCALATE']);
const STAGE_ACTIONS = Object.freeze({
  EVIDENCE_COLLECTED: 'COLLECT_EVIDENCE',
  AUDITED: 'REVIEW_EVIDENCE',
  DEFECTS_CONFIRMED: 'CLASSIFY_DEFECTS',
  REPAIRING: 'REPAIR_CONFIRMED_DEFECTS',
  VERIFIED: 'VERIFY_CHANGES',
  INVENTORIED: 'INVENTORY_ASSETS',
  CANON_READY: 'FREEZE_ART_CANON',
  GENERATING: 'PRODUCE_BOUNDED_ART_BATCH',
  INTEGRATED: 'INTEGRATE_ASSET_BATCH',
  VISUAL_VERIFIED: 'CAPTURE_RUNTIME_PIXELS',
  REAUDITED: 'INDEPENDENT_REAUDIT'
});
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const currentRoot = projectDir => path.join(path.resolve(projectDir), '.ceos-runs');

function gitReadOnly(projectDir) {
  const project = path.resolve(projectDir);
  const git = (...args) => spawnSync('git', args, {cwd:project, encoding:'utf8', timeout:15000, windowsHide:true});
  const root = git('rev-parse','--show-toplevel');
  if (root.status !== 0) return {status:'NOT_GIT', head:null, branch:null, dirty:null};
  let expected, actual;
  try { expected = fs.realpathSync(project); actual = fs.realpathSync(root.stdout.trim()); }
  catch { return {status:'BLOCKED_GIT', head:null, branch:null, dirty:null}; }
  if (expected !== actual) return {status:'BLOCKED_WRONG_ROOT', head:null, branch:null, dirty:null};
  const head = git('rev-parse','HEAD');
  const branch = git('symbolic-ref','--quiet','--short','HEAD');
  const dirty = git('status','--porcelain=v1','--untracked-files=normal');
  if (head.status !== 0 || dirty.status !== 0 || branch.status !== 0)
    return {status:'BLOCKED_GIT', head:null, branch:null, dirty:null};
  return {status:'READY', head:head.stdout.trim(), branch:branch.stdout.trim(), dirty:Boolean(dirty.stdout.trim())};
}

function availableRuns(projectDir) {
  const base = currentRoot(projectDir);
  if (!fs.existsSync(base)) return [];
  const entries = fs.readdirSync(base, {withFileTypes:true})
    .filter(x => x.isDirectory() && /^[A-Za-z0-9._-]+$/.test(x.name))
    .slice(0, 256);
  const runs = [];
  for (const entry of entries) {
    const name = entry.name, file = path.join(base,name,'run.json');
    try {
      if (!fs.statSync(file).isFile()) continue;
      const run = read(file);
      if (run.runId === name) runs.push({id:name, verdict:run.verdict ?? null, state:run.state, updatedAt:run.updatedAt ?? ''});
    } catch { /* damaged runs are not silently selected */ }
  }
  return runs.sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function resolveSelection(projectDir, runRef) {
  if (runRef && runRef !== 'latest') return {id:runRef};
  const runs = availableRuns(projectDir);
  if (!runs.length) return {status:'BLOCKED_NO_RUN'};
  const active = runs.filter(x => !TERMINAL.has(x.verdict ?? x.state));
  if (active.length > 1) return {status:'BLOCKED_AMBIGUOUS_RUNS', candidates:active.map(x=>x.id)};
  if (active.length === 1) return {id:active[0].id};
  const latestPath = path.join(currentRoot(projectDir),'latest.json');
  try {
    const latest = read(latestPath);
    if (runs.some(x => x.id === latest.runId)) return {id:latest.runId};
  } catch { /* select newest real run */ }
  return {id:runs[0].id};
}

function taskFor(run) {
  if (run.verdict === 'PASS') return {kind:'RUN_COMPLETE', risk:'R0', instruction:'The run has passed. No new product milestone is inferred automatically.'};
  if (run.verdict === 'FAIL' || run.verdict === 'ESCALATE')
    return {kind:'STOP_TERMINAL', risk:'R0', instruction:'Do not reopen failed/escalated runs automatically.'};
  if (run.verdict === 'BLOCKED') {
    const recovery = inspectBlockedRunRecovery(run);
    return recovery.reopenSupported
      ? {kind:'VERIFY_RECOVERY_PREREQUISITES', risk:'R0',
        instruction:'Verify fresh external recovery evidence. The adapter may request explicit reopen with reason/evidence through the existing engine; do not auto-reopen.'}
      : {kind:'PREPARE_LINKED_RECOVERY_PLAN', risk:'R0',
        instruction:'Preserve terminal checkpoints; propose a new scoped, explicitly authorized recovery run. Never forge producer/art receipts.'};
  }
  const stage = run.nextStage;
  const known = EXECUTION_PIPELINES[run.pipeline]?.stages.find(x=>x.id===stage);
  if (!known) return {kind:'BLOCKED_UNKNOWN_STAGE', risk:'R0', instruction:'Unexpected stage: stop.'};
  return {
    kind:STAGE_ACTIONS[stage] ?? 'BLOCKED_UNKNOWN_STAGE',
    risk:stage === 'GENERATING' ? 'R1_WITH_METERED_TOOLS' : 'R1',
    instruction:known.description,
    requirements:known.minArtifacts ? ['Persist real evidence; record through ceos checkpoint only after the work is complete.'] : [],
    toolRoute: stage === 'GENERATING' ? 'verified-ceos-asset-generator'
      : stage === 'REAUDITED' ? 'required-independent-review-as-dictated-by-run' : 'codex-parent'
  };
}

function makeBlocked(status, extra = {}) {
  return {schemaVersion:1, status, executable:false, ...extra};
}

/**
 * Determine exactly one next admissible work unit. Does not perform host-only
 * semantic steps, advance checkpoints, mutate Git or replay Image Gen calls.
 */
export function planContinuation(projectDir, {runRef, mode='inspect'}={}) {
  if (!MODES.has(mode)) throw new Error('Invalid continue mode');
  const project = path.resolve(projectDir);
  const selection = resolveSelection(project,runRef);
  if (selection.status) return makeBlocked(selection.status, {project, mode, ...(selection.candidates ? {candidates:selection.candidates} : {})});
  let resumed;
  try { resumed = resumeRun(project, selection.id); }
  catch (error) { return makeBlocked('BLOCKED_RUN_UNREADABLE', {project, mode, runId:selection.id, detail:error.message}); }
  const run=resumed.run, git=gitReadOnly(project);
  const summary={project,runId:run.runId,pipeline:run.pipeline,stage:run.nextStage,verdict:run.verdict,
    scopeSha256:run.scopeSha256,cycle:run.cycle,checkpointCount:run.checkpointCount,
    maxCycles:run.maxCycles,git,mode};
  if (!resumed.integrity?.ok) return makeBlocked('BLOCKED_INTEGRITY',{...summary,integrity:resumed.integrity});
  const action=taskFor(run);
  const actionId=digest(JSON.stringify({runId:run.runId,scope:run.scopeSha256,head:git.head,
    cycle:run.cycle,checkpointCount:run.checkpointCount,nextStage:run.nextStage,kind:action.kind}));
  const status=action.kind === 'RUN_COMPLETE' ? 'DONE'
    : action.kind === 'STOP_TERMINAL' ? 'STOP_TERMINAL'
    : action.kind === 'BLOCKED_UNKNOWN_STAGE' ? 'BLOCKED_UNKNOWN_STAGE'
    : action.kind === 'PREPARE_LINKED_RECOVERY_PLAN' ? 'NEEDS_RECOVERY_DECISION'
    : action.kind === 'VERIFY_RECOVERY_PREREQUISITES' ? 'RECOVERY_CHECK_REQUIRED'
    : (git.status !== 'READY' ? 'BLOCKED_GIT_PREFLIGHT'
      : (git.dirty ? 'BLOCKED_DIRTY_WORKTREE' : 'READY_FOR_CODEX'));
  const executable=status === 'READY_FOR_CODEX';
  return {schemaVersion:1,status,executable,...summary,integrity:resumed.integrity,
    action:{...action,id:actionId},nextAction:resumed.nextAction,
    hostExecutionRequired:true, boundaries:{
      noImplicitGitPush:true,noImplicitMerge:true,noPublish:true,
      noCheckpointWithoutEvidence:true,noImplicitScopeExpansion:true
    }};
}

function leasePath(projectDir,runId) {
  return path.join(currentRoot(projectDir), '.continue-claims',digest(runId)+'.json');
}

/** An atomic single-work-unit claim. Never executes a task or advances CEOS state. */
export function claimContinuation(projectDir, {runRef,mode='guided',expectedActionId}={}) {
  if (mode === 'inspect') throw new Error('Inspect cannot claim work');
  const plan=planContinuation(projectDir,{runRef,mode});
  if (!plan.executable) return plan;
  if (!expectedActionId || plan.action.id !== expectedActionId)
    return makeBlocked('BLOCKED_STALE_ACTION',{expectedActionId,actualActionId:plan.action.id});
  const file=leasePath(projectDir,plan.runId);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const lease={schemaVersion:1, runId:plan.runId, actionId:plan.action.id,
    token:crypto.randomUUID(), createdAt:new Date().toISOString(), mode};
  try { fs.writeFileSync(file,JSON.stringify(lease,null,2)+'\n',{flag:'wx',mode:0o600}); }
  catch(error) {
    if (error.code !== 'EEXIST') throw error;
    return makeBlocked('BLOCKED_ALREADY_CLAIMED',{runId:plan.runId,actionId:plan.action.id});
  }
  const refreshed=planContinuation(projectDir,{runRef:plan.runId,mode});
  if (refreshed.action?.id !== plan.action.id || !refreshed.executable) {
    try { fs.unlinkSync(file); } catch {}
    return makeBlocked('BLOCKED_ACTION_CHANGED_DURING_CLAIM',{runId:plan.runId});
  }
  return {...refreshed,lease:{token:lease.token,actionId:lease.actionId,createdAt:lease.createdAt}};
}

/** Only the holder's opaque token can release an active claim. */
export function releaseContinuation(projectDir,{runRef,token}={}) {
  if (typeof token !== 'string' || !/^[a-f0-9-]{36}$/i.test(token))
    return makeBlocked('BLOCKED_LEASE_TOKEN_INVALID');
  const selection=resolveSelection(projectDir,runRef);
  if (selection.status) return makeBlocked(selection.status);
  const file=leasePath(projectDir,selection.id);
  let current;
  try {current=read(file);} catch{return makeBlocked('BLOCKED_LEASE_MISSING',{runId:selection.id});}
  if (current.token!==token) return makeBlocked('BLOCKED_LEASE_NOT_OWNED',{runId:selection.id});
  fs.unlinkSync(file);
  return {schemaVersion:1,status:'RELEASED',runId:selection.id,actionId:current.actionId};
}
