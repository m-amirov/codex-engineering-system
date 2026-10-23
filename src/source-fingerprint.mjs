import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

/** Fingerprint actual modified/untracked bytes, not merely porcelain filenames. */
export function fingerprintWorkingSource(projectDir, excludedDir = null) {
  const root = fs.realpathSync(path.resolve(projectDir));
  const args = ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.'];
  if (excludedDir) {
    const relative = path.relative(root, path.resolve(excludedDir)).split(path.sep).join('/');
    if (relative && relative !== '.' && !relative.startsWith('../') && !path.isAbsolute(relative)) args.push(`:(exclude)${relative}`);
  }
  const command = spawnSync('git', args, { cwd: root, encoding: 'buffer', windowsHide: true, timeout: 15_000 });
  if (command.status !== 0 || command.error) throw new Error(`Cannot fingerprint working source: ${command.stderr?.toString('utf8') || command.error?.message}`);
  const digest = crypto.createHash('sha256');
  const entries = command.stdout.toString('utf8').split('\0');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    const xy = entry.slice(0, 2);
    const name = entry.slice(3);
    if (/^[RC]/.test(xy) || /[RC]$/.test(xy)) i++; // porcelain -z rename/copy has a second path
    const file = path.resolve(root, name);
    if (file !== root && !file.startsWith(root + path.sep)) throw new Error('Source fingerprint path escapes checkout');
    digest.update(`${xy}\0${name}\0`);
    let info;
    try { info = fs.lstatSync(file); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      digest.update('MISSING\0');
      continue;
    }
    if (info.isSymbolicLink()) {
      // Never dereference source paths through an untrusted symlink.
      digest.update(`LINK\0${fs.readlinkSync(file)}\0`);
    } else if (info.isFile()) {
      digest.update(`FILE\0${info.size}\0`);
      const descriptor = fs.openSync(file, 'r');
      try {
        let count;
        while ((count = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) digest.update(buffer.subarray(0, count));
      } finally { fs.closeSync(descriptor); }
    } else digest.update('NON_REGULAR\0');
  }
  return digest.digest('hex');
}
