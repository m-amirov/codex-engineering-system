import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const PROJECT_CONTINUE_V1 = 'CEOS_PROJECT_CONTINUE_V1';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const safePath = value => typeof value === 'string' && value.length > 0 &&
  value.length < 512 && !path.isAbsolute(value) && !/^[A-Za-z]:[\\/]/.test(value) &&
  !value.includes('\\') && !value.includes('\\0') &&
  value.split('/').every(part => part && part !== '.' && part !== '..');

function git(project, ...args) {
  return spawnSync('git', args, {cwd:project,encoding:'utf8',timeout:15000,windowsHide:true});
}

function checkedFile(project, relative) {
  if (!safePath(relative)) throw new Error('UNSAFE_PLAN_PATH');
  const resolved = fs.realpathSync(path.resolve(project, relative));
  if (!resolved.startsWith(project + path.sep) || !fs.statSync(resolved).isFile())
    throw new Error('PLAN_OUTSIDE_PROJECT');
  const bytes = fs.readFileSync(resolved);
  if (bytes.length > 512 * 1024) throw new Error('PLAN_TOO_LARGE');
  return {path:relative,bytes,sha256:hash(bytes)};
}

function discover(project, planPath) {
  if (planPath !== null && planPath !== undefined) {
    if (!safePath(planPath)) return {error:'BLOCKED_PROJECT_PLAN_PATH'};
    return {path:planPath,discovered:false};
  }
  const folder = path.join(project,'artifacts','audit');
  const matches = fs.existsSync(folder) ? fs.readdirSync(folder)
    .filter(name => /(?:COMPLETION_PLAN|PROJECT_PLAN)_\\d{8}\\.md$/i.test(name))
    .sort().reverse() : [];
  if (matches.length) {
    const dates = matches.map(name => name.match(/_(\\d{8})\\.md$/)?.[1]);
    if (dates[0] === dates[1]) return {error:'BLOCKED_AMBIGUOUS_PROJECT_PLANS',
      candidates:matches.filter(name => name.includes('_'+dates[0]+'.md')).map(name=>'artifacts/audit/'+name)};
    return {path:'artifacts/audit/'+matches[0],discovered:true};
  }
  for (const candidate of ['docs/PROJECT_PLAN.md','PLAN.md']) {
    if (fs.existsSync(path.join(project,candidate))) return {path:candidate,discovered:true};
  }
  return {error:'BLOCKED_NO_PROJECT_PLAN'};
}

function planWorkUnit(content) {
  // Checkboxes are explicit ordering hints, never evidence that a prior stage passed.
  const lines=content.split(/\\r?\\n/);
  for (let i=0;i<lines.length;i++) {
    const hit=/^\\s*[-*]\\s*\\[ \\]\\s*(.{8,280})\\s*$/.exec(lines[i]);
    if (hit) return {kind:'VALIDATE_NEXT_PROJECT_TASK',candidate:hit[1].trim(),line:i+1};
  }
  // A free-form plan is interpreted by the Codex host. The CLI does not
  // invent completion criteria, reorder user priorities or run side effects.
  return {kind:'RESOLVE_NEXT_PROJECT_TASK',candidate:null,line:null};
}

/** Read-only project-level handoff. Never chooses, heals or reopens an old run. */
export function planProjectContinuation(projectDir,{planPath=null,goal=null}={}) {
  const project=path.resolve(projectDir);
  const base={schemaVersion:1,contract:PROJECT_CONTINUE_V1,project,executable:false,
    hostExecutionRequired:true,historicalRunsSelected:false,mutated:false,
    boundaries:{noImplicitGitPush:true,noImplicitMerge:true,noPublish:true,
      noCheckpointWithoutEvidence:true,noUnverifiedAcceptance:true,
      noImplicitImageGeneration:true,noImplicitScopeExpansion:true}};
  const blocked=(status,extra={})=>({...base,status,...extra});
  if (goal !== null && (typeof goal !== 'string' || goal.length > 500 || !goal.trim()))
    return blocked('BLOCKED_PROJECT_GOAL_INVALID');
  let projectReal;
  try { projectReal=fs.realpathSync(project); }
  catch { return blocked('BLOCKED_PROJECT_UNREADABLE'); }
  const head=git(projectReal,'rev-parse','HEAD');
  const root=git(projectReal,'rev-parse','--show-toplevel');
  const branch=git(projectReal,'symbolic-ref','--quiet','--short','HEAD');
  if (head.status !== 0 || !/^[a-f0-9]{40}$/i.test(head.stdout.trim()) ||
      root.status !== 0 || branch.status !== 0)
    return blocked('BLOCKED_PROJECT_GIT_PREFLIGHT');
  let gitRoot;
  try { gitRoot=fs.realpathSync(root.stdout.trim()); }
  catch { return blocked('BLOCKED_PROJECT_GIT_PREFLIGHT'); }
  if (process.platform === 'win32' ? gitRoot.toLowerCase() !== projectReal.toLowerCase()
    : gitRoot !== projectReal) return blocked('BLOCKED_PROJECT_WRONG_WORKTREE');
  const selected=discover(projectReal,planPath);
  if (selected.error) return blocked(selected.error,{candidates:selected.candidates??[]});
  let plan;
  try { plan=checkedFile(projectReal,selected.path); }
  catch(error) { return blocked('BLOCKED_PROJECT_PLAN_INVALID',{reason:error.message}); }
  const checked=git(projectReal,'status','--porcelain=v1','--',plan.path);
  if (checked.status!==0 || checked.stdout.trim())
    return blocked('BLOCKED_PROJECT_PLAN_DIRTY',{planPath:plan.path,planSha256:plan.sha256});
  const body=plan.bytes.toString('utf8');
  if (!/^\\s*#\\s+\\S/m.test(body) || body.length<40)
    return blocked('BLOCKED_PROJECT_PLAN_EMPTY',{planPath:plan.path});
  const unit=planWorkUnit(body);
  const matrixPath=plan.path.replace(/(?:COMPLETION_PLAN|PROJECT_PLAN)(?=_\\d{8}\\.md$)/i,'READINESS_MATRIX')
    .replace(/\\.md$/i,'.json');
  let audit=null;
  try {
    const matrix=checkedFile(projectReal,matrixPath);
    const state=git(projectReal,'status','--porcelain=v1','--',matrixPath);
    if (state.status===0 && !state.stdout.trim()) {
      const parsed=JSON.parse(matrix.bytes.toString('utf8'));
      audit={path:matrix.path,sha256:matrix.sha256,
        sourceHead:typeof parsed.sourceHead==='string'?parsed.sourceHead:null,
        inventoryOnly:true};
    }
  } catch { /* a missing matrix never becomes a fabricated audit */ }
  const actionId=hash(JSON.stringify({sourceHead:head.stdout.trim(),path:plan.path,
    planSha256:plan.sha256,matrixSha256:audit?.sha256??null,unit,goal}));
  return {...base,status:'READY_FOR_PROJECT_PLANNING',sourceHead:head.stdout.trim(),
    git:{branch:branch.stdout.trim(),status:'READY',runSelectionBypassed:true},
    plan:{path:plan.path,sha256:plan.sha256,discovered:selected.discovered},
    ...(audit?{audit}:{}),...(goal?{goal}:{}),
    action:{...unit,id:actionId,risk:'R0_PLANNING',instruction:
      'Read the SHA-pinned project completion plan and applicable audit. Identify exactly one unfinished bounded task, verify its status against primary project evidence, and execute it only under existing CEOS permissions and normal Git/capability gates. Never infer PASS from checklist text or launch generation/push/merge/release from this planner.'}};
}
