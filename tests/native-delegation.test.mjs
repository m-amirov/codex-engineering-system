import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKILL_NAMES, renderContext, installGlobal, VERSION } from '../src/ceos.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('romance-narrative is registered and installed as a managed global CEOS skill', () => {
  assert.ok(SKILL_NAMES.includes('romance-narrative'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-native-delegation-'));
  const codexHome = path.join(homeDir, '.codex');
  try {
    const result = installGlobal({ homeDir, codexHome, mode: 'copy' });
    assert.equal(result.status.ok, true);
    const skillFile = path.join(homeDir, '.agents', 'skills', 'romance-narrative', 'SKILL.md');
    assert.ok(fs.existsSync(skillFile));
    assert.match(fs.readFileSync(skillFile, 'utf8'), /sole native writer\/editor|one parent native Codex session/i);
    assert.match(fs.readFileSync(path.join(codexHome, 'AGENTS.md'), 'utf8'), /Native delegation budget/);
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});

test('resolved romance context contains the single-native delegation policy', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-romance-context-'));
  try {
    const dir = path.join(project, '.codex-os');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ version: 1, profile: 'generic', commands: {} }));
    const resolved = renderContext(project, 'romance-narrative');
    assert.match(resolved, /sole native writer\/editor by default/i);
    assert.match(resolved, /Web High/i);
    const audit = renderContext(project, 'audit-repair-loop');
    assert.match(audit, /sole native writer\/editor by default/i);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('delegation policy avoids blanket native parallelism while preserving required review and Web High', () => {
  const policy = fs.readFileSync(path.join(root, 'policies', 'native-delegation.md'), 'utf8');
  const romance = fs.readFileSync(path.join(root, 'skills', 'romance-narrative', 'SKILL.md'), 'utf8');
  const global = fs.readFileSync(path.join(root, 'global', 'AGENTS.md'), 'utf8');
  assert.match(policy, /Do not spawn native writer/);
  assert.match(policy, /one episode sequentially at a time/);
  assert.match(policy, /independent.*tool-backed/i);
  assert.match(global, /sole native writer\/editor by default/);
  assert.match(romance, /bounded Web High/);
  assert.equal(fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim(), VERSION);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version, VERSION);
});
