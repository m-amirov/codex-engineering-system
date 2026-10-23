import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fingerprintWorkingSource } from './source-fingerprint.mjs';

const SHA = /^[a-f0-9]{40,64}$/;

function git(project, args) {
  const result = spawnSync('git', args, { cwd: project, encoding: 'utf8', windowsHide: true, timeout: 15_000 });
  return result.status === 0 ? result.stdout.trim() : null;
}

/** Evidence is a link to previous work, never permission to skip gates. */
export function validateVerificationReplay(projectDir, priorEvidenceDir) {
  const project = fs.realpathSync(path.resolve(projectDir));
  const evidenceDir = path.resolve(priorEvidenceDir);
  const stop = (reasonCode, detail) => ({ ok: false, reasonCode, detail, evidenceDir });
  let summary;
  let bytes;
  let gitStart;
  try {
    bytes = fs.readFileSync(path.join(evidenceDir, 'summary.json'));
    summary = JSON.parse(bytes.toString('utf8'));
    gitStart = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'git.start.json'), 'utf8'));
    if (summary.schemaVersion !== 1 || !Array.isArray(summary.gates) || !summary.gates.length) throw new Error('not a gate summary');
    if (!['PASS', 'FAIL', 'BLOCKED', 'CONFIGURATION_ERROR'].includes(summary.verdict)) throw new Error('unrecognized verdict');
    if (!gitStart.isRepo || !SHA.test(summary.sourceHead) || gitStart.head !== summary.sourceHead
      || !/^[a-f0-9]{64}$/.test(summary.sourceFingerprint || '')) throw new Error('missing byte-bound Git provenance');
    for (const gate of summary.gates) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(gate.id)) throw new Error('unsafe evidence gate id');
      const record = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'gates', `${gate.id}.json`), 'utf8'));
      if (record.id !== gate.id || record.status !== gate.status) throw new Error('gate record mismatch');
    }
  } catch (error) { return stop('REPLAY_EVIDENCE_INVALID', error.message); }

  let priorProject;
  try { priorProject = fs.realpathSync(summary.projectDir); }
  catch { return stop('REPLAY_EVIDENCE_INVALID', 'Previous checkout path does not resolve'); }
  if (summary.sourceRoot !== project || priorProject !== project) {
    return stop('REPLAY_WORKTREE_MISMATCH', 'Previous evidence was created in another checkout');
  }
  const currentHead = git(project, ['rev-parse', 'HEAD']);
  if (!currentHead || currentHead !== summary.sourceHead) {
    return stop('REPLAY_SOURCE_HEAD_MISMATCH', 'Current HEAD is not the previously verified source');
  }
  let fingerprint;
  try { fingerprint = fingerprintWorkingSource(project, evidenceDir); }
  catch (error) { return stop('REPLAY_SOURCE_FINGERPRINT_UNAVAILABLE', error.message); }
  if (fingerprint !== summary.sourceFingerprint) {
    return stop('REPLAY_SOURCE_FINGERPRINT_MISMATCH', 'Current dirty/untracked file bytes differ from the original source snapshot');
  }
  return { ok: true, reasonCode: null, sourceHead: currentHead, sourceRoot: project, evidenceDir,
    priorVerdict: summary.verdict, priorSummarySha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}
