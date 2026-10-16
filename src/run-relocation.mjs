// Explicit, fail-closed relocation of pre-generation CEOS evidence between Git worktrees.
// No automatic rewriting during "continue", no session/capability trust is inherited.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolveRun, resumeRun } from './execution-engine.mjs';

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const same = (a,b) => process.platform === 'win32'
  ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
  : path.resolve(a) === path.resolve(b);
const within = (base, candidate) => {
  const relative = path.relative(base,candidate);
  return relative && relative !== '..' && !relative.startsWith('..'+path.sep) &&
    !path.isAbsolute(relative);
};
const read = file => JSON.parse(fs.readFileSync(file,'utf8'));
const fileHash = file => hash(fs.readFileSync(file));

function git(project,...args) {
  const result=spawnSync('git',args,{cwd:project,encoding:'utf8',timeout:15000,windowsHide:true});
  if (result.status!==0) throw new Error('BLOCKED_RELOCATION_GIT: '+(result.stderr || args.join(' ')).trim());
  return result.stdout.trim();
}
function currentGit(project,source) {
  const root=git(project,'rev-parse','--show-toplevel');
  if (!same(fs.realpathSync(root),fs.realpathSync(project)))
    throw new Error('BLOCKED_RELOCATION_WRONG_GIT_ROOT');
  const head=git(project,'rev-parse','HEAD');
  const dirty=git(project,'status','--porcelain=v1','--untracked-files=normal',
    '--','.',':(exclude).ceos-runs');
  if (dirty) throw new Error('BLOCKED_RELOCATION_DIRTY_WORKTREE');
  if (!/^[0-9a-f]{40}$/.test(source))
    throw new Error('BLOCKED_RELOCATION_MISSING_SOURCE_HEAD');
  const ancestor=spawnSync('git',['merge-base','--is-ancestor',source,head],
    {cwd:project,encoding:'utf8',timeout:15000,windowsHide:true});
  if (ancestor.status!==0) throw new Error('BLOCKED_RELOCATION_SOURCE_HEAD_NOT_ANCESTOR');
  return head;
}
function expectedArtifact(oldProject,project,artifact) {
  if (!artifact || typeof artifact.path!=='string' || !path.isAbsolute(artifact.path) ||
      !/^[0-9a-f]{64}$/i.test(artifact.sha256 ?? ''))
    throw new Error('BLOCKED_RELOCATION_INVALID_ARTIFACT');
  const oldPath=path.resolve(artifact.path);
  if (!within(oldProject,oldPath))
    throw new Error('BLOCKED_RELOCATION_EXTERNAL_ARTIFACT: '+oldPath);
  const relative=path.relative(oldProject,oldPath);
  const nextPath=path.resolve(project,relative);
  if (!within(project,nextPath) || !fs.existsSync(nextPath) || !fs.statSync(nextPath).isFile())
    throw new Error('BLOCKED_RELOCATION_ARTIFACT_MISSING: '+relative);
  // Do not allow symlinks or junctions to redirect a candidate outside this checkout.
  if (!within(fs.realpathSync(project),fs.realpathSync(nextPath)))
    throw new Error('BLOCKED_RELOCATION_ARTIFACT_ESCAPE: '+relative);
  if (fileHash(nextPath)!==artifact.sha256.toLowerCase())
    throw new Error('BLOCKED_RELOCATION_ARTIFACT_HASH_MISMATCH: '+relative);
  return { ...artifact, path:nextPath };
}
function prepare(projectDir,runRef) {
  const project=fs.realpathSync(path.resolve(projectDir));
  const resolved=resolveRun(project,runRef);
  const run=resolved.run;
  const runDir=fs.realpathSync(resolved.runDir);
  const expectedDir=path.join(project,'.ceos-runs',run.runId);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(run.runId ?? '') ||
      !same(runDir,expectedDir) || !same(resolved.runDir,expectedDir))
    throw new Error('BLOCKED_RELOCATION_RUN_LOCATION_INVALID');
  const oldProject=path.resolve(run.projectDir ?? '');
  if (!path.isAbsolute(run.projectDir ?? '') || same(oldProject,project))
    throw new Error('BLOCKED_RELOCATION_NOT_REQUIRED_OR_INVALID_SOURCE');
  if (!same(run.runDir ?? '',path.join(oldProject,'.ceos-runs',run.runId)))
    throw new Error('BLOCKED_RELOCATION_SOURCE_RUN_DIR_MISMATCH');
  // Only canon-ready batches with no generated evidence can be rebound.
  if (run.pipeline!=='production-art' || run.state!=='CANON_READY' ||
      run.nextStage!=='GENERATING' || run.verdict!==null ||
      run.producerBindingMode!=='CURRENT_TURN' || run.producerParentSessionId ||
      run.linkedRecovery || run.relocation ||
      (run.routingTrace?.webReviews ?? []).length ||
      (run.routingTrace?.webAgentsUsed ?? []).length)
    throw new Error('BLOCKED_RELOCATION_UNSAFE_STAGE_OR_PROVENANCE');
  if (fs.existsSync(path.join(runDir,'.lock')) ||
      fs.existsSync(path.join(runDir,'capability-attestation','image-generation.json')))
    throw new Error('BLOCKED_RELOCATION_ACTIVE_LOCK_OR_ATTESTATION');
  const originalProjectPresent=fs.existsSync(oldProject);
  if (originalProjectPresent) {
    const oldCommon=git(oldProject,'rev-parse','--git-common-dir');
    const newCommon=git(project,'rev-parse','--git-common-dir');
    if (!same(path.resolve(oldProject,oldCommon),path.resolve(project,newCommon)))
      throw new Error('BLOCKED_RELOCATION_DIFFERENT_GIT_REPOSITORY');
  }
  const head=currentGit(project,run.sourceAtStart?.head);
  const scope=path.join(runDir,'scope.json'), caps=path.join(runDir,'capabilities.json');
  if (hash(Buffer.from(JSON.stringify(read(scope))))!==run.scopeSha256 ||
      hash(Buffer.from(JSON.stringify(read(caps))))!==run.capabilitiesSha256)
    throw new Error('BLOCKED_RELOCATION_SCOPE_OR_CAPABILITIES_CHANGED');
  const checkpointDir=path.join(runDir,'checkpoints');
  const files=fs.readdirSync(checkpointDir).filter(f=>f.endsWith('.json')).sort();
  if (files.length!==run.checkpointCount ||
      !files.every((f,i)=>/^[0-9]{3}-/.test(f) && Number(f.slice(0,3))===i+1))
    throw new Error('BLOCKED_RELOCATION_CHECKPOINT_CHAIN_INCOMPLETE');
  const updates=[];
  for (const file of files) {
    const full=path.join(checkpointDir,file),raw=fs.readFileSync(full,'utf8');
    const checkpoint=JSON.parse(raw);
    if (checkpoint.stage==='GENERATING' || checkpoint.stage==='INTEGRATED' ||
        checkpoint.stage==='VISUAL_VERIFIED' || checkpoint.stage==='REAUDITED')
      throw new Error('BLOCKED_RELOCATION_GENERATION_OR_REVIEW_EVIDENCE');
    const artifacts=checkpoint.artifacts ?? [];
    if (!Array.isArray(artifacts)) throw new Error('BLOCKED_RELOCATION_ARTIFACT_LIST_INVALID');
    const rewritten=artifacts.map(artifact=>expectedArtifact(oldProject,project,artifact));
    updates.push({file:full,relative:path.join('checkpoints',file),raw,
      next:JSON.stringify({...checkpoint,artifacts:rewritten},null,2)+'\n'});
  }
  // Re-validate scope/capabilities and every checkpoint before any modification.
  const pendingRun={...run,projectDir:project,runDir};
  const runFile=resolved.file,rawRun=fs.readFileSync(runFile,'utf8');
  return {project,runDir,runFile,run,rawRun,pendingRun,updates,head,oldProject,
    originalRunSha256:hash(rawRun)};
}
export function inspectRunRelocation(projectDir,runRef='latest') {
  try {
    const p=prepare(projectDir,runRef);
    return {status:'READY_FOR_EXPLICIT_RELOCATION',executable:false,runId:p.run.runId,
      fromProject:p.oldProject,toProject:p.project,head:p.head,
      originalRunSha256:p.originalRunSha256,checkpointCount:p.updates.length,
      action:'Run ceos run-relocate <run-id> --project <worktree> --apply --expect-sha <originalRunSha256>.'};
  } catch(error) {
    return {status:'BLOCKED_RUN_RELOCATION',executable:false,detail:error.message};
  }
}
function atomicWrite(file,content) {
  const temp=file+'.relocate-'+crypto.randomBytes(6).toString('hex')+'.tmp';
  fs.writeFileSync(temp,content,'utf8');
  try { fs.renameSync(temp,file); }
  catch(error) {
    if (!['EEXIST','EPERM','ENOTEMPTY'].includes(error.code)) {
      fs.rmSync(temp,{force:true});
      throw error;
    }
    fs.rmSync(file,{force:true});
    fs.renameSync(temp,file);
  }
}
/** Explicit apply only. Preserve the original metadata and rollback on any failed verification. */
export function relocateRun(projectDir,runRef,{expectedSha}={}) {
  if (!/^[0-9a-f]{64}$/.test(expectedSha ?? ''))
    return {status:'BLOCKED_RELOCATION_EXPECTED_SHA_REQUIRED',executable:false};
  let p;
  try {p=prepare(projectDir,runRef);}
  catch(error) {return {status:'BLOCKED_RUN_RELOCATION',executable:false,detail:error.message};}
  if (expectedSha!==p.originalRunSha256)
    return {status:'BLOCKED_RELOCATION_SOURCE_CHANGED',executable:false};
  const lock=path.join(p.runDir,'.relocation.lock');
  try {fs.writeFileSync(lock,JSON.stringify({at:new Date().toISOString(),pid:process.pid}),{flag:'wx'});}
  catch {return {status:'BLOCKED_RELOCATION_LOCKED',executable:false};}
  const backupDir=path.join(p.runDir,'relocations',new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex'));
  const originals=[{file:p.runFile,relative:'run.json',raw:p.rawRun},
    ...p.updates.map(x=>({file:x.file,relative:x.relative,raw:x.raw}))];
  let modified=false;
  try {
    const fresh=prepare(p.project,p.run.runId);
    if (fresh.originalRunSha256!==expectedSha || fresh.head!==p.head)
      throw new Error('BLOCKED_RELOCATION_CONCURRENT_CHANGE');
    fs.mkdirSync(backupDir,{recursive:true});
    for (const entry of originals) {
      const destination=path.join(backupDir,entry.relative);
      fs.mkdirSync(path.dirname(destination),{recursive:true});
      fs.writeFileSync(destination,entry.raw,{flag:'wx'});
    }
    const receipt={schemaVersion:1,runId:p.run.runId,at:new Date().toISOString(),
      originalProject:p.oldProject,targetProject:p.project,gitHead:p.head,
      originalRunSha256:expectedSha,
      originals:originals.map(x=>({path:x.relative,sha256:hash(x.raw)})),
      capabilityTrustInherited:false,generatedAssetsInherited:false};
    fs.writeFileSync(path.join(backupDir,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
    const updatedRun={...p.pendingRun,
      relocation:{receiptPath:path.relative(p.runDir,path.join(backupDir,'receipt.json')).split(path.sep).join('/'),
        fromProject:p.oldProject,at:receipt.at,originalRunSha256:expectedSha}};
    modified=true;
    for (const entry of p.updates) atomicWrite(entry.file,entry.next);
    atomicWrite(p.runFile,JSON.stringify(updatedRun,null,2)+'\n');
    const checked=resumeRun(p.project,p.run.runId);
    if (!checked.integrity.ok) throw new Error('BLOCKED_RELOCATION_POSTCHECK: '+checked.integrity.issues.join('; '));
    return {status:'PASS_RUN_RELOCATED',runId:p.run.runId,project:p.project,
      checkpointCount:p.updates.length,receiptPath:path.join(backupDir,'receipt.json'),
      integrity:checked.integrity,nextStage:checked.run.nextStage,
      capabilityTrustInherited:false};
  } catch(error) {
    if (modified) for (const entry of originals) {
      try {atomicWrite(entry.file,entry.raw);} catch { /* backups remain for manual recovery */ }
    }
    return {status:'BLOCKED_RUN_RELOCATION',detail:error.message,
      backups:fs.existsSync(backupDir)?backupDir:null,executable:false};
  } finally {fs.rmSync(lock,{force:true});}
}
