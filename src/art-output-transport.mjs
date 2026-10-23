import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { inspectArtOutput } from './art-output-gate.mjs';

function sha256(file) {
  const hasher=crypto.createHash('sha256');
  const data=fs.readFileSync(file);
  return hasher.update(data).digest('hex');
}

function safeTarget(projectDir, relative) {
  if (typeof relative!=='string' || !relative.trim() ||
      path.isAbsolute(relative) || !relative.toLowerCase().endsWith('.png') ||
      relative.split(/[\\/]/).some(x=>!x || x==='.' || x==='..')) {
    throw new Error('ART_TRANSPORT_TARGET_INVALID: expected a project-relative .png path');
  }
  const root=fs.realpathSync(projectDir);
  const output=path.resolve(root,relative);
  const rel=path.relative(root,output);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('ART_TRANSPORT_TARGET_ESCAPE');
  }
  if (['.git','.ceos-runs','node_modules'].includes(rel.split(path.sep)[0].toLowerCase())) {
    throw new Error('ART_TRANSPORT_TARGET_RESERVED');
  }
  const parent=path.dirname(output);
  fs.mkdirSync(parent,{recursive:true});
  const realParent=fs.realpathSync(parent);
  if (realParent!==parent) throw new Error('ART_TRANSPORT_TARGET_SYMLINK_PARENT');
  if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) {
    throw new Error('ART_TRANSPORT_TARGET_SYMLINK');
  }
  return {root,output,relative:rel.split(path.sep).join('/')};
}

/**
 * Materialize a *real local file* delivered by native Image Gen into the game.
 * This cannot extract pixels from chat messages or remote-only attachments.
 * No source, bytes, hash or provider receipt is inferred.
 */
export function importArtOutput(projectDir,{sourceFile,targetFile,expectSha256,kind,width,height}={}) {
  const result={schemaVersion:1,status:'BLOCKED_ART_OUTPUT_TRANSPORT',
    issues:[],targetFile:targetFile??null,sourceFile:sourceFile??null};
  try {
    if (typeof sourceFile!=='string' || !path.isAbsolute(sourceFile)) {
      throw new Error('ART_TRANSPORT_SOURCE_ABSOLUTE_REQUIRED');
    }
    const expected=String(expectSha256??'').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(expected)) {
      throw new Error('ART_TRANSPORT_EXPECTED_SHA256_REQUIRED');
    }
    const src=path.resolve(sourceFile);
    if (!fs.existsSync(src) || !fs.lstatSync(src).isFile() ||
        fs.lstatSync(src).isSymbolicLink()) {
      throw new Error('ART_TRANSPORT_SOURCE_NOT_LOCAL_FILE');
    }
    const sourceHash=sha256(src);
    if (sourceHash!==expected) throw new Error('ART_TRANSPORT_SOURCE_HASH_MISMATCH');
    const verifiedSource=inspectArtOutput(src,{kind,width,height});
    if (verifiedSource.status!=='PASS_ART_OUTPUT_MECHANICAL') {
      throw new Error('ART_TRANSPORT_SOURCE_INVALID:'+verifiedSource.issues.join(','));
    }
    const {output,relative}=safeTarget(projectDir,targetFile);
    result.targetFile=relative;
    if (fs.existsSync(output)) {
      if (!fs.lstatSync(output).isFile() || sha256(output)!==expected)
        throw new Error('ART_TRANSPORT_TARGET_EXISTS_DIFFERENT');
      const verifiedTarget=inspectArtOutput(output,{kind,width,height});
      if (verifiedTarget.status!=='PASS_ART_OUTPUT_MECHANICAL')
        throw new Error('ART_TRANSPORT_TARGET_EXISTS_INVALID');
      return {...result,status:'PASS_ART_OUTPUT_TRANSPORT',issues:[],
        sha256:expected,dimensions:verifiedTarget.dimensions,bytes:verifiedTarget.bytes,
        alreadyPresent:true,visualAcceptance:'NOT_VERIFIED',
        providerByteReceipt:'NOT_ATTESTED'};
    }
    const temp=path.join(path.dirname(output),
      '.'+path.basename(output)+'.'+crypto.randomUUID()+'.tmp');
    try {
      fs.copyFileSync(src,temp,fs.constants.COPYFILE_EXCL);
      if (sha256(temp)!==expected) throw new Error('ART_TRANSPORT_COPY_HASH_MISMATCH');
      // Same-directory hard-link creates the final name atomically,
      // exclusively, without silently overwriting existing accepted art.
      fs.linkSync(temp,output);
    } finally {
      try { fs.rmSync(temp,{force:true}); } catch {}
    }
    const verified=inspectArtOutput(output,{kind,width,height});
    if (verified.status!=='PASS_ART_OUTPUT_MECHANICAL' || verified.sha256!==expected)
      throw new Error('ART_TRANSPORT_POSTCOPY_VERIFICATION_FAILED');
    return {...result,status:'PASS_ART_OUTPUT_TRANSPORT',issues:[],
      sha256:verified.sha256,dimensions:verified.dimensions,bytes:verified.bytes,
      alreadyPresent:false,visualAcceptance:'NOT_VERIFIED',
      providerByteReceipt:'NOT_ATTESTED'};
  } catch (error) {
    result.issues.push(error?.message??String(error));
    return result;
  }
}
