import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveCodexHome } from './ceos.mjs';

const ROLE = 'ceos_asset_generator';
const MODEL = 'gpt-5.6-terra';
const EFFORT = 'medium';
// Rollouts can exceed 32 MiB after image-generation turns. Never load one in full.
const MAX_TRACE_BYTES = 512 * 1024 * 1024;
const MAX_RECORD_BYTES = 64 * 1024 * 1024;
const READ_CHUNK_BYTES = 64 * 1024;
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
 * Hash every original byte and validate EVERY JSONL record while retaining only
 * producer-route fields. Total bytes, individual records and read buffer are
 * bounded; no caller-provided summaries or shortened traces are trusted.
 */
function scanRollout(file, originalStat) {
  const digest = crypto.createHash('sha256');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const chunk = Buffer.allocUnsafe(READ_CHUNK_BYTES);
  let fd, bytesRead = 0, recordBytes = 0, fragments = [];
  let sessionMetaCount = 0, sessionMeta = null, contextCount = 0, contextMismatch = false;

  function processLine() {
    if (!recordBytes) return;
    const bytes = fragments.length === 1 ? fragments[0] : Buffer.concat(fragments, recordBytes);
    fragments = [];
    recordBytes = 0;
    const text = decoder.decode(bytes).trim();
    if (!text) return;
    const value = JSON.parse(text);
    if (value?.type === 'session_meta') {
      sessionMetaCount++;
      const meta = value.payload;
      sessionMeta = {
        id: meta?.id,
        role: meta?.source?.subagent?.thread_spawn?.agent_role,
        parentId: meta?.source?.subagent?.thread_spawn?.parent_thread_id
      };
    }
    if (value?.type === 'turn_context') {
      contextCount++;
      if (value.payload?.model !== MODEL || value.payload?.effort !== EFFORT)
        contextMismatch = true;
    }
  }
  function appendRecordPart(bytes) {
    if (!bytes.length) return;
    recordBytes += bytes.length;
    if (recordBytes > MAX_RECORD_BYTES)
      throw new Error('JSONL_RECORD_TOO_LARGE');
    fragments.push(Buffer.from(bytes));
  }

  try {
    fd = fs.openSync(file, 'r');
    const opened = fs.fstatSync(fd);
    if (opened.dev !== originalStat.dev || opened.ino !== originalStat.ino ||
        opened.size !== originalStat.size || opened.mtimeMs !== originalStat.mtimeMs)
      throw new Error('TRACE_CHANGED_DURING_OPEN');
    let count;
    while ((count = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0) {
      bytesRead += count;
      if (bytesRead > MAX_TRACE_BYTES) throw new Error('TRACE_TOO_LARGE');
      digest.update(chunk.subarray(0, count));
      let from = 0;
      while (from < count) {
        const end = chunk.subarray(0, count).indexOf(10, from);
        if (end < 0) { appendRecordPart(chunk.subarray(from, count)); break; }
        let part = chunk.subarray(from, end);
        // Strip CR only at the end of a complete line (including chunk boundaries).
        appendRecordPart(part);
        if (recordBytes && fragments.at(-1).at(-1) === 13) {
          const last = fragments.pop();
          fragments.push(last.subarray(0, last.length - 1));
          recordBytes--;
        }
        processLine();
        from = end + 1;
      }
    }
    processLine();
    const after = fs.fstatSync(fd);
    if (bytesRead !== originalStat.size || after.size !== originalStat.size ||
        after.mtimeMs !== originalStat.mtimeMs || after.ctimeMs !== originalStat.ctimeMs)
      throw new Error('TRACE_CHANGED_DURING_READ');
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  return {
    sessionMetaCount, sessionMeta, contextCount, contextMismatch,
    traceSha256: digest.digest('hex')
  };
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
  let rollout;
  try {
    rollout = scanRollout(file, stat);
  } catch {
    return reject('BLOCKED_NATIVE_AGENT_TRACE_INVALID',
      'Rollout contains invalid/oversized JSONL or changed while being read');
  }
  if (rollout.sessionMetaCount !== 1 || !rollout.sessionMeta?.id || !rollout.contextCount)
    return reject('BLOCKED_NATIVE_AGENT_TRACE_INCOMPLETE','Missing unique session_meta or turn_context');
  const meta = rollout.sessionMeta;
  if (meta.role !== ROLE)
    return reject('BLOCKED_NATIVE_AGENT_ROLE_MISMATCH','Rollout agent_role is missing or is not ceos_asset_generator');
  if (meta.parentId !== parentSessionId || meta.id === parentSessionId)
    return reject('BLOCKED_NATIVE_AGENT_PARENT_MISMATCH','Rollout is not a distinct child of the bound parent session');
  if (rollout.contextMismatch)
    return reject('BLOCKED_NATIVE_AGENT_MODEL_MISMATCH','Effective child turn_context model/effort differs from Terra Medium');
  return {
    ok:true,status:'PASS_NATIVE_AGENT_ROUTE_HOST_OBSERVED',
    agentId:meta.id,parentSessionId,
    agentRole:ROLE,actualModel:MODEL,actualEffort:EFFORT,
    traceFile:file,traceSha256:rollout.traceSha256,
    evidenceAssurance:'host-observed-local-jsonl-not-provider-signed',
    generationCapability:'NOT_VERIFIED'
  };
}
