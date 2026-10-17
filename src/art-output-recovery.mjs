import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {inspectArtOutput} from './art-output-gate.mjs';

const fullSha=/^[a-f0-9]{64}$/;
const outputFailure=/\bBLOCKED_ART_OUTPUT\b[\s\S]*\bART_FILE_NOT_FOUND\b/;
const hashFile=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));

export function isArtOutputTransportBlocked(run) {
  const s=run?.stopReason;
  return run?.pipeline==='production-art' &&
    run?.artMode==='NEW_GENERATION' && run?.verdict==='BLOCKED' &&
    run?.state==='BLOCKED' && s?.code==='STAGE_BLOCKED' &&
    s?.stage==='GENERATING' &&
    typeof s.reason==='string' && outputFailure.test(s.reason) &&
    /\\bSHA-256\\s+[a-f0-9]{64}\\b/i.test(s.reason) &&
    /\\bassets\\/[^\\s]+\\.png\\b/i.test(s.reason);
}
function safeProjectFile(projectDir,relative,prefix) {
  if (typeof relative!=='string' || !relative ||
      path.isAbsolute(relative) ||
      relative.split(/[\\/]/).some(p=>p==='' || p==='.' || p==='..'))
    throw new Error('ART_TRANSPORT_RECOVERY_PATH_INVALID');
  const root=fs.realpathSync(projectDir);
  const file=path.resolve(root,relative);
  const rel=path.relative(root,file).replaceAll('\\','/');
  if (!rel || rel.startsWith('../') || path.isAbsolute(rel) ||
      (prefix && !rel.startsWith(prefix)))
    throw new Error('ART_TRANSPORT_RECOVERY_PATH_ESCAPE');
  if (!fs.existsSync(file) || !fs.lstatSync(file).isFile() ||
      fs.realpathSync(file)!==file)
    throw new Error('ART_TRANSPORT_RECOVERY_FILE_MISSING_OR_LINKED');
  return {file,rel};
}

/**
 * Read-only, fail-closed proof that a terminal GENERATING failure was solely a
 * previously missing Image Gen PNG, subsequently delivered byte-for-byte.
 * Never changes the original checkpoint, failed receipt, candidate ledger or
 * authorizes reuse of a parent capability/child trace.
 */
export function verifyArtOutputTransportRecovery(projectDir,runDir,run,{
  failedReceipt,passReceipt,nativeSource
}={}) {
  if (!isArtOutputTransportBlocked(run))
    throw new Error('ART_TRANSPORT_RECOVERY_WRONG_BLOCKER');
  const {file:failedFile,rel:failedRel}=safeProjectFile(projectDir,failedReceipt,
    'artifacts/production-art/');
  const {file:passFile,rel:passRel}=safeProjectFile(projectDir,passReceipt,
    'artifacts/production-art/');
  if (failedFile===passFile)
    throw new Error('ART_TRANSPORT_RECOVERY_RECEIPTS_NOT_DISTINCT');

  const failed=readJson(failedFile);
  const pass=readJson(passFile);
  if (failed.status!=='BLOCKED_ART_OUTPUT' ||
      !Array.isArray(failed.issues) ||
      !failed.issues.includes('ART_FILE_NOT_FOUND') ||
      failed.issues.length!==1)
    throw new Error('ART_TRANSPORT_RECOVERY_FAILED_RECEIPT_INVALID');
  if (pass.status!=='PASS_ART_OUTPUT_MECHANICAL' ||
      !Array.isArray(pass.issues) || pass.issues.length ||
      pass.visualAcceptance!=='NOT_VERIFIED' ||
      typeof pass.sha256!=='string' || !fullSha.test(pass.sha256) ||
      !Number.isInteger(pass.dimensions?.width) ||
      !Number.isInteger(pass.dimensions?.height) ||
      !Number.isInteger(pass.bytes) || pass.bytes<=0)
    throw new Error('ART_TRANSPORT_RECOVERY_PASS_RECEIPT_INVALID');

  const root=fs.realpathSync(projectDir);
  const target=path.resolve(String(pass.path??''));
  const failedTarget=path.resolve(String(failed.path??''));
  const targetRelative=path.relative(root,target).replaceAll('\\','/');
  if (target!==failedTarget || pass.kind!==failed.kind ||
      !['background','sprite','prop'].includes(pass.kind) ||
      !targetRelative || targetRelative.startsWith('../') ||
      path.isAbsolute(targetRelative) ||
      !targetRelative.toLowerCase().endsWith('.png') ||
      targetRelative.startsWith('.ceos-runs/') ||
      !fs.existsSync(target) || !fs.lstatSync(target).isFile() ||
      fs.realpathSync(target)!==target)
    throw new Error('ART_TRANSPORT_RECOVERY_TARGET_MISMATCH');

  const note=String(run.stopReason?.reason??'').replaceAll('\\','/');
  if (!note.includes(pass.sha256) || !note.includes(targetRelative) ||
      !note.includes('ART_FILE_NOT_FOUND'))
    throw new Error('ART_TRANSPORT_RECOVERY_STOP_REASON_MISMATCH');

  const priorFile=path.join(runDir,'checkpoints',
    String(run.checkpointCount).padStart(3,'0')+'-generating.json');
  if (!fs.existsSync(priorFile))
    throw new Error('ART_TRANSPORT_RECOVERY_TERMINAL_CHECKPOINT_MISSING');
  const checkpoint=readJson(priorFile);
  if (checkpoint.index!==run.checkpointCount ||
      checkpoint.stage!=='GENERATING' || checkpoint.outcome!=='BLOCKED' ||
      checkpoint.note!==run.stopReason.reason)
    throw new Error('ART_TRANSPORT_RECOVERY_TERMINAL_CHECKPOINT_MISMATCH');

  // Git HEAD is checked by the execution engine under the run lock.

  const verified=inspectArtOutput(target,{
    kind:pass.kind,width:pass.dimensions.width,height:pass.dimensions.height
  });
  if (verified.status!=='PASS_ART_OUTPUT_MECHANICAL' ||
      verified.sha256!==pass.sha256 || verified.bytes!==pass.bytes)
    throw new Error('ART_TRANSPORT_RECOVERY_PNG_VERIFICATION_MISMATCH');

  if (typeof nativeSource!=='string' || !path.isAbsolute(nativeSource) ||
      !fs.existsSync(nativeSource) || !fs.lstatSync(nativeSource).isFile() ||
      fs.lstatSync(nativeSource).isSymbolicLink())
    throw new Error('ART_TRANSPORT_RECOVERY_NATIVE_SOURCE_MISSING');
  const sourceReal=fs.realpathSync(nativeSource);
  if (!sourceReal.split(path.sep).includes('generated_images'))
    throw new Error('ART_TRANSPORT_RECOVERY_NATIVE_SOURCE_UNVERIFIED_PATH');
  if (hashFile(sourceReal)!==pass.sha256)
    throw new Error('ART_TRANSPORT_RECOVERY_NATIVE_SOURCE_HASH_MISMATCH');

  return {status:'PASS_ART_OUTPUT_TRANSPORT_RECOVERY',
    sha256:pass.sha256,kind:pass.kind,width:pass.dimensions.width,
    height:pass.dimensions.height,bytes:pass.bytes,
    targetPath:targetRelative,failedReceipt:failedRel,passReceipt:passRel,
    nativeSourcePath:sourceReal,sourceSha256:pass.sha256,
    visualAcceptance:'NOT_VERIFIED',generationInvokedAgain:false};
}
