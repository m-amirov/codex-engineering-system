import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveCodexHome } from './ceos.mjs';

const ROLE = 'ceos_asset_generator';
const MODEL = 'gpt-5.6-terra';
const EFFORT = 'medium';
const MAX_TRACE_BYTES = 32 * 1024 * 1024;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

/** Do not mistake a parent statement or a task_name for an actual custom subagent. */
export function nativeProducerParentContext({codexHome} = {}) {
  const home = resolveCodexHome({homeDir:os.homedir(),codexHome});
  try {
    const session = JSON.parse(fs.readFileSync(path.join(home,'ceos','runtime','current-session.json'),'utf8'));
    return typeof session.sessionId === 'string' && session.sessionId.trim() ? session.sessionId : null;
  } catch { return null; }
}

function reject(code, detail = '') {
  return {status:code, ok:false, detail, expected:{role:ROLE,model:MODEL,effort:EFFORT}};
}

/**
 * Inspect a real local Codex rollout JSONL. We intentionally never accept a
 * caller-authored JSON summary or a claimed model as routing evidence.
 * This is HOST-OBSERVED evidence, NOT a provider-signed attestation.
 */
export function inspectNativeProducerRoute(traceFile, {codexHome, parentSessionId} = {}) {
  const home = resolveCodexHome({homeDir:os.homedir(),codexHome});
  if (typeof parentSessionId !== 'string' || !parentSessionId.trim())
    return reject('BLOCKED_NATIVE_AGENT_PARENT_UNVERIFIED','No parent session was bound at CEOS run creation');
  if (typeof traceFile !== 'string' || !traceFile.trim())
    return reject('BLOCKED_NATIVE_AGENT_TRACE_MISSING','Provide a genuine Codex subagent rollout JSONL path');
  let file, root, stat;
  try {
    root = fs.realpathSync(path.join(home,'sessions'));
    file = fs.realpathSync(path.resolve(traceFile));
    stat = fs.statSync(file);
  } catch { return reject('BLOCKED_NATIVE_AGENT_TRACE_MISSING','Missing Codex rollout or $CODEX_HOME/sessions directory'); }
  if (!file.startsWith(root + path.sep) || !file.endsWith('.jsonl') || !stat.isFile())
    return reject('BLOCKED_NATIVE_AGENT_TRACE_UNTRUSTED_PATH','Trace must be a regular *.jsonl inside the actual Codex sessions directory');
  if (stat.size > MAX_TRACE_BYTES || stat.size < 32)
    return reject('BLOCKED_NATIVE_AGENT_TRACE_INVALID','Trace size outside supported limits');
  const bytes=fs.readFileSync(file), records=[];
  try {
    for (const line of bytes.toString('utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      records.push(JSON.parse(line));
    }
  } catch { return reject('BLOCKED_NATIVE_AGENT_TRACE_INVALID','Could not decode all rollout records'); }
  const metas=records.filter(x=>x?.type==='session_meta').map(x=>x.payload);
  const contexts=records.filter(x=>x?.type==='turn_context').map(x=>x.payload);
  if (metas.length!==1 || !metas[0]?.id || !contexts.length)
    return reject('BLOCKED_NATIVE_AGENT_TRACE_INCOMPLETE','Missing unique session_meta or turn_context');
  const meta=metas[0];
  const spawn=meta.source?.subagent?.thread_spawn;
  if (!spawn || spawn.agent_role!==ROLE)
    return reject('BLOCKED_NATIVE_AGENT_ROLE_MISMATCH','Rollout agent_role is missing or is not ceos_asset_generator');
  if (spawn.parent_thread_id!==parentSessionId || meta.id===parentSessionId)
    return reject('BLOCKED_NATIVE_AGENT_PARENT_MISMATCH','Rollout is not a distinct child of the bound parent session');
  const models=contexts.map(x=>x?.model),efforts=contexts.map(x=>x?.effort);
  if (models.some(x=>x!==MODEL) || efforts.some(x=>x!==EFFORT))
    return reject('BLOCKED_NATIVE_AGENT_MODEL_MISMATCH','Effective child turn_context model/effort differs from Terra Medium');
  return {
    ok:true,status:'PASS_NATIVE_AGENT_ROUTE_HOST_OBSERVED',
    agentId:meta.id,parentSessionId,
    agentRole:ROLE,actualModel:MODEL,actualEffort:EFFORT,
    traceFile:file,traceSha256:hash(bytes),
    evidenceAssurance:'host-observed-local-jsonl-not-provider-signed',
    generationCapability:'NOT_VERIFIED'
  };
}
