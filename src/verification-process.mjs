import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { terminateProcessTree } from './process-tree.mjs';

const SAFE_TOKEN = /^[A-Za-z0-9_./:@=+-]+$/;
const SAFE_SCRIPT = /^[A-Za-z0-9][A-Za-z0-9_./-]*\.(?:mjs|cjs|js)$/i;

/** Only known, argument-vector based R0 entrypoints; never evaluate manifest shell. */
export function resolveVerificationCommand(command, { projectDir = process.cwd() } = {}) {
  if (typeof command !== 'string' || !command.trim()) throw new Error('Unsupported empty verification command');
  const tokens = command.trim().split(/\s+/);
  if (tokens.some(token => !SAFE_TOKEN.test(token))) throw new Error('Unsafe verification command token or shell operator');
  if (/^npm(?:\.cmd)?$/i.test(tokens[0])) {
    const args = tokens.slice(1);
    const script = args[0] === 'test' && args.length === 1 ? 'test'
      : ['run', 'run-script'].includes(args[0]) ? args[1] : null;
    if (!script || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(script)) throw new Error('Unsupported npm verification adapter');
    const rest = args[0] === 'test' ? [] : args.slice(2);
    if (rest.length && (rest[0] !== '--' || rest.slice(1).some(arg => !SAFE_TOKEN.test(arg)))) {
      throw new Error('Unsafe npm verification arguments');
    }
    return { kind: 'npm', command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args, script };
  }
  if (tokens[0] === 'node') {
    if (tokens.length === 2 && ['--version', '-v'].includes(tokens[1])) {
      return { kind: 'node', command: process.execPath, args: [tokens[1]] };
    }
    if (tokens[1] === '--check' && tokens.length === 3) {
      return { kind: 'node', command: process.execPath, args: ['--check', resolveNodeScript(tokens[2], projectDir)] };
    }
    if (tokens.length === 2) return { kind: 'node', command: process.execPath, args: [resolveNodeScript(tokens[1], projectDir)] };
    throw new Error('Node verification adapter does not allow evaluation or arbitrary flags');
  }
  throw new Error('Unsupported verification adapter; use npm test, npm run <script>, or node <project-script>');
}

function resolveNodeScript(file, projectDir) {
  if (!SAFE_SCRIPT.test(file) || path.isAbsolute(file) || file.split('/').includes('..')) {
    throw new Error('Unsafe or unsupported Node verification script path');
  }
  const root = path.resolve(projectDir);
  const absolute = path.resolve(root, file);
  if (!absolute.startsWith(root + path.sep)) throw new Error('Node verification script escapes project root');
  if (fs.existsSync(absolute) && !fs.realpathSync(absolute).startsWith(fs.realpathSync(root) + path.sep)) {
    throw new Error('Node verification script symlink escapes project root');
  }
  return absolute;
}

/** Run a bounded gate without invoking a shell on POSIX or interpreting user shell syntax. */
export function runVerificationProcess(spec, {
  cwd, env = process.env, timeoutMs = 300_000, maxOutputBytes = 2 * 1024 * 1024
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 1_800_000) throw new Error('Invalid gate timeout');
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1024 || maxOutputBytes > 20 * 1024 * 1024) throw new Error('Invalid gate output limit');
  if (!['npm', 'node'].includes(spec?.kind)) throw new Error('Unrecognized verification process adapter');

  return new Promise(resolve => {
    const started = Date.now();
    const windowsNpm = process.platform === 'win32' && spec.kind === 'npm';
    const command = windowsNpm ? 'cmd.exe' : spec.command;
    // Every token has already passed SAFE_TOKEN; cmd only launches the known npm.cmd shim.
    const args = windowsNpm ? ['/d', '/s', '/c', `npm.cmd ${spec.args.join(' ')}`] : spec.args;
    let child;
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let stoppedFor = null;
    let childError = null;
    let finished = false;
    let forceTimer;
    let watchdog;
    let timer;

    function result(code, signal) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(forceTimer);
      clearTimeout(watchdog);
      const status = stoppedFor ?? (childError || code !== 0 ? 'FAIL' : 'PASS');
      resolve({ status, exitCode: Number.isInteger(code) ? code : null, signal: signal ?? null,
        timedOut: status === 'TIMED_OUT', termination: stoppedFor, durationMs: Date.now() - started,
        stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'), error: childError?.message ?? null });
    }
    function stop(reason) {
      if (stoppedFor || finished) return;
      stoppedFor = reason;
      terminateProcessTree(child, 'SIGTERM');
      forceTimer = setTimeout(() => terminateProcessTree(child, 'SIGKILL'), 200);
      forceTimer.unref?.();
      watchdog = setTimeout(() => result(null, 'KILL_TIMEOUT'), 3_000);
      watchdog.unref?.();
    }
    function collect(stream, data) {
      const available = maxOutputBytes - stdout.length - stderr.length;
      if (available <= 0) return stop('OUTPUT_LIMIT');
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const selected = buffer.subarray(0, Math.min(available, buffer.length));
      if (stream === 'stdout') stdout = Buffer.concat([stdout, selected]);
      else stderr = Buffer.concat([stderr, selected]);
      if (selected.length < buffer.length) stop('OUTPUT_LIMIT');
    }
    try {
      child = spawn(command, args, {
        cwd, env, windowsHide: true, shell: false, detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      child.stdout?.on('data', data => collect('stdout', data));
      child.stderr?.on('data', data => collect('stderr', data));
      child.once('error', error => { childError = error; });
      child.once('close', result);
      timer = setTimeout(() => stop('TIMED_OUT'), timeoutMs);
    } catch (error) { childError = error; result(null, null); }
  });
}
