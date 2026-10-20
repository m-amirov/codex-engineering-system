import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const DIRECT_WORKFLOW_V1 = 'CEOS_DIRECT_WORKFLOW_V1';

const KNOWN_CHECKS = Object.freeze([
  'test', 'lint', 'typecheck', 'build', 'narrative:validate',
  'narrative:fixtures', 'starter-kit:status', 'starter-kit:self-test'
]);

function git(project, ...args) {
  return spawnSync('git', args, {
    cwd: project, encoding: 'utf8', timeout: 15000, maxBuffer: 8*1024*1024,
    windowsHide: true
  });
}

function readScripts(project) {
  const file = path.join(project, 'package.json');
  try {
    if (!fs.statSync(file).isFile() || fs.statSync(file).size > 256*1024 ||
        !fs.realpathSync(file).startsWith(project + path.sep)) return [];
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!pkg || typeof pkg.scripts !== 'object' || Array.isArray(pkg.scripts))
      return [];
    return KNOWN_CHECKS.filter(name => typeof pkg.scripts[name] === 'string')
      .map(name => ({command:'npm run ' + name, source:'package.json'}));
  } catch {
    return [];
  }
}

/**
 * A non-gating work context for Codex. No run selection, scope lock,
 * checkpoint, claim, network calls, Git mutation, or model invocation.
 * This does NOT issue capability attestations or assert any QA/visual PASS.
 */
export function inspectDirectWorkflow(projectDir) {
  const project = path.resolve(projectDir);
  const base = {
    schemaVersion:1, kind:DIRECT_WORKFLOW_V1, workflow:'direct',
    project, runRequired:false, checkpointRequired:false,
    historicalRunsConsulted:false, mutated:false,
    sourceOfAuthorization:'USER_REQUEST_AND_PROJECT_RULES',
    independentAcceptance:'NOT_VERIFIED',
    releaseReady:false
  };
  const block = (status, reason) => ({
    ...base,status, ...(reason ? {reason} : {})
  });
  let real;
  try { real = fs.realpathSync(project); }
  catch { return block('BLOCKED_PROJECT_UNREADABLE'); }
  const root = git(real,'rev-parse','--show-toplevel');
  const head = git(real,'rev-parse','HEAD');
  if (root.status !== 0 || head.status !== 0 ||
      !/^[0-9a-f]{40}$/i.test(head.stdout.trim()))
    return block('BLOCKED_NOT_GIT');
  let gitRoot;
  try { gitRoot = fs.realpathSync(root.stdout.trim()); }
  catch { return block('BLOCKED_GIT_ROOT_UNREADABLE'); }
  const rootMatches = process.platform === 'win32'
    ? real.toLowerCase() === gitRoot.toLowerCase() : real === gitRoot;
  if (!rootMatches) return block('BLOCKED_WRONG_WORKTREE');
  const branch = git(real,'symbolic-ref','--quiet','--short','HEAD');
  const status = git(real,'status','--porcelain=v1','-z','--untracked-files=all');
  if (status.status !== 0) return block('BLOCKED_GIT_STATUS_UNAVAILABLE');
  const changedCount = status.stdout.split('\0').filter(Boolean).length;
  const checks = readScripts(real);
  return {
    ...base,
    status:'READY_FOR_DIRECT_DEVELOPMENT',
    git:{
      head:head.stdout.trim(),branch:branch.status === 0 ? branch.stdout.trim() : null,
      dirty:status.stdout.length > 0,changedEntries:changedCount
    },
    suggestedChecks:checks,
    nextStep:'Codex reads project instructions and current task/plan, edits directly, runs relevant project tests, and commits only intended changes. CEOS is not a mandatory step.',
    boundaries:{
      doNotEraseExistingWork:true,doNotFalsifyEvidence:true,
      noImplicitPushOrMerge:true,noImplicitReleaseOrPublish:true,
      noUnverifiedArtOrReviewPass:true,
      actualGenerationRequiresNativeToolAndRealOutput:true,
      artAndReleaseChecksRemainIndependent:true
    },
    notes:status.stdout.length ? [
      'Uncommitted changes exist. Inspect ownership before editing; never reset, clean, overwrite, or stage unrelated files.',
      'This informational status does not replace Git remote checks before push/merge.'
    ] : [
      'No uncommitted changes detected. Perform Git remote checks before push/merge.'
    ]
  };
}
