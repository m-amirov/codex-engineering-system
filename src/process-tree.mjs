import { spawnSync } from 'node:child_process';

/** Only call for a child PID the caller spawned; never pass user-supplied PIDs. */
export function terminateProcessTree(child, signal = 'SIGTERM') {
  if (!Number.isInteger(child?.pid) || child.pid <= 0) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true, timeout: 2_000, stdio: 'ignore'
    });
  } else {
    try { process.kill(-child.pid, signal); }
    catch { try { child.kill(signal); } catch {} }
  }
}
