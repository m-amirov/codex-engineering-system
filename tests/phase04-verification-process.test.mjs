import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveVerificationCommand, runVerificationProcess } from '../src/verification-process.mjs';

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-phase04-proc-'));
  return dir;
}

test('verification adapters reject shell operators, node evaluation and unknown executables before execution', () => {
  for (const command of [
    'npm test && git push origin main', 'npm run build; echo unsafe',
    'node -e process.exit(0)', 'python script.py', 'npm run build | cat',
    'node ../escape.mjs', 'npm run build > artifact.txt'
  ]) assert.throws(() => resolveVerificationCommand(command), /unsupported|unsafe|not allowed/i, command);
});

test('node and npm adapters produce argv-only commands and accept project paths with spaces', () => {
  const dir = fixture();
  fs.writeFileSync(path.join(dir, 'check.mjs'), 'process.exit(0)\n');
  const node = resolveVerificationCommand('node check.mjs', { projectDir: dir });
  assert.equal(node.kind, 'node');
  assert.equal(node.command, process.execPath);
  assert.deepEqual(node.args, [path.join(dir, 'check.mjs')]);
  const npm = resolveVerificationCommand('npm run test:e2e -- --mode prod', { projectDir: dir });
  assert.equal(npm.kind, 'npm');
  assert.deepEqual(npm.args, ['run', 'test:e2e', '--', '--mode', 'prod']);
});

test('process runner captures a real successful child with bounded evidence', async () => {
  const dir = fixture();
  fs.writeFileSync(path.join(dir, 'check.mjs'), "process.stdout.write('verified\\n')\n");
  const result = await runVerificationProcess(resolveVerificationCommand('node check.mjs', { projectDir: dir }), {
    cwd: dir, timeoutMs: 2_000, maxOutputBytes: 4096
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, 'verified\n');
  assert.equal(result.timedOut, false);
});

test('timeout terminates nested descendants instead of leaving background work running', async () => {
  const dir = fixture();
  const marker = path.join(dir, 'orphan.txt');
  const release = path.join(dir, 'release.txt');
  fs.writeFileSync(path.join(dir, 'child.mjs'), `import fs from 'node:fs'; const timer = setInterval(() => { if (fs.existsSync(${JSON.stringify(release)})) { fs.writeFileSync(${JSON.stringify(marker)}, 'orphan'); clearInterval(timer); } }, 20);`);
  fs.writeFileSync(path.join(dir, 'hang.mjs'), "import {spawn} from 'node:child_process'; spawn(process.execPath, ['child.mjs'], {stdio:'ignore'}); setInterval(()=>{}, 1000);\n");
  const result = await runVerificationProcess(resolveVerificationCommand('node hang.mjs', { projectDir: dir }), {
    cwd: dir, timeoutMs: 220, maxOutputBytes: 4096
  });
  assert.equal(result.status, 'TIMED_OUT');
  assert.equal(result.timedOut, true);
  fs.writeFileSync(release, 'check-after-timeout');
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(fs.existsSync(marker), false, 'grandchild survived timeout');
});

test('output ceiling fails closed without filling the verification logs', async () => {
  const dir = fixture();
  fs.writeFileSync(path.join(dir, 'verbose.mjs'), "process.stdout.write('z'.repeat(100000)); setInterval(()=>{}, 1000);\n");
  const result = await runVerificationProcess(resolveVerificationCommand('node verbose.mjs', { projectDir: dir }), {
    cwd: dir, timeoutMs: 2_000, maxOutputBytes: 2048
  });
  assert.equal(result.status, 'OUTPUT_LIMIT');
  assert.ok(Buffer.byteLength(result.stdout) <= 2048);
});
