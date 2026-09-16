import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  GLOBAL_AGENT_FILES,
  GLOBAL_INSTRUCTIONS_BEGIN,
  GLOBAL_INSTRUCTIONS_END,
  SKILL_NAMES,
  VERSION,
  globalStatus,
  installGlobal,
  mergeGlobalInstructions,
  routingTable
} from '../src/ceos.mjs';

function fakeHome() { return fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-global-')); }

function paths(home) {
  const codexHome = path.join(home, '.codex');
  return { home, codexHome, agents: path.join(codexHome, 'agents'), skills: path.join(home, '.agents', 'skills') };
}

test('global install creates instructions, custom agents, user skills and manifest', () => {
  const p = paths(fakeHome());
  const r = installGlobal({ homeDir: p.home, codexHome: p.codexHome, mode: 'copy' });
  assert.equal(r.status.ok, true);
  assert.equal(r.changes.length, 1 + GLOBAL_AGENT_FILES.length + SKILL_NAMES.length + 1);
  const agentsText = fs.readFileSync(path.join(p.codexHome, 'AGENTS.md'), 'utf8');
  assert.match(agentsText, new RegExp(GLOBAL_INSTRUCTIONS_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(agentsText, new RegExp(GLOBAL_INSTRUCTIONS_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(agentsText, new RegExp(`CEOS_VERSION: ${VERSION}`));
  for (const agent of GLOBAL_AGENT_FILES) assert.ok(fs.existsSync(path.join(p.agents, agent.file)), agent.file);
  for (const skill of SKILL_NAMES) assert.ok(fs.existsSync(path.join(p.skills, skill, 'SKILL.md')), skill);
  const manifest = JSON.parse(fs.readFileSync(path.join(p.codexHome, 'ceos', 'installation.json'), 'utf8'));
  assert.equal(manifest.version, VERSION);
  assert.equal(Object.keys(manifest.agents).length, GLOBAL_AGENT_FILES.length);
  assert.equal(Object.keys(manifest.skills).length, SKILL_NAMES.length);
});

test('global install preserves user instructions and is idempotent', () => {
  const p = paths(fakeHome());
  fs.mkdirSync(p.codexHome, { recursive: true });
  fs.writeFileSync(path.join(p.codexHome, 'AGENTS.md'), '# My user rules\n\nKeep this text.\n');
  installGlobal({ homeDir: p.home, codexHome: p.codexHome, mode: 'copy' });
  const first = fs.readFileSync(path.join(p.codexHome, 'AGENTS.md'), 'utf8');
  assert.match(first, /# My user rules/);
  assert.match(first, /Keep this text\./);
  assert.equal((first.match(/CEOS:GLOBAL:BEGIN/g) ?? []).length, 1);
  const manifestFile = path.join(p.codexHome, 'ceos', 'installation.json');
  const manifestBefore = fs.readFileSync(manifestFile, 'utf8');
  const second = installGlobal({ homeDir: p.home, codexHome: p.codexHome, mode: 'copy' });
  assert.equal(second.alreadyCurrent, true);
  assert.equal(second.changes.length, 0);
  assert.equal(fs.readFileSync(path.join(p.codexHome, 'AGENTS.md'), 'utf8'), first);
  assert.equal(fs.readFileSync(manifestFile, 'utf8'), manifestBefore);
});

test('non-empty AGENTS.override.md is the active global instructions target', () => {
  const p = paths(fakeHome());
  fs.mkdirSync(p.codexHome, { recursive: true });
  fs.writeFileSync(path.join(p.codexHome, 'AGENTS.md'), '# Normal global rules\n');
  fs.writeFileSync(path.join(p.codexHome, 'AGENTS.override.md'), '# Active override\n');
  const normalBefore = fs.readFileSync(path.join(p.codexHome, 'AGENTS.md'), 'utf8');
  const r = installGlobal({ homeDir: p.home, codexHome: p.codexHome });
  assert.equal(r.instructionsFile, path.join(p.codexHome, 'AGENTS.override.md'));
  assert.equal(fs.readFileSync(path.join(p.codexHome, 'AGENTS.md'), 'utf8'), normalBefore);
  assert.match(fs.readFileSync(path.join(p.codexHome, 'AGENTS.override.md'), 'utf8'), /CEOS:GLOBAL:BEGIN/);
  assert.equal(globalStatus({ homeDir: p.home, codexHome: p.codexHome }).ok, true);
});

test('differing CEOS-owned targets fail closed unless force is explicit, then backup and replace', () => {
  const p = paths(fakeHome());
  installGlobal({ homeDir: p.home, codexHome: p.codexHome });
  const agentTarget = path.join(p.agents, GLOBAL_AGENT_FILES[0].file);
  const skillTarget = path.join(p.skills, SKILL_NAMES[0], 'SKILL.md');
  fs.appendFileSync(agentTarget, '\n# local drift\n');
  fs.appendFileSync(skillTarget, '\nlocal drift\n');
  assert.throws(() => installGlobal({ homeDir: p.home, codexHome: p.codexHome }), /Use --force/);
  const r = installGlobal({ homeDir: p.home, codexHome: p.codexHome, force: true });
  assert.equal(r.status.ok, true);
  assert.ok(r.backupRoot);
  assert.ok(fs.existsSync(path.join(r.backupRoot, 'agents', GLOBAL_AGENT_FILES[0].file)));
  assert.ok(fs.existsSync(path.join(r.backupRoot, 'skills', SKILL_NAMES[0], 'SKILL.md')));
});


test('force never overwrites an unrelated user skill that is not CEOS-managed', () => {
  const p = paths(fakeHome());
  const target = path.join(p.skills, 'audit');
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'SKILL.md'), '---\nname: audit\ndescription: Personal unrelated audit skill.\n---\nDo not replace me.\n');
  const before = fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8');
  assert.throws(() => installGlobal({ homeDir: p.home, codexHome: p.codexHome, force: true }), /not CEOS-managed/);
  assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), before);
  assert.equal(fs.existsSync(p.codexHome), false);
});

test('dry-run plans global installation without writing anything', () => {
  const p = paths(fakeHome());
  const r = installGlobal({ homeDir: p.home, codexHome: p.codexHome, dryRun: true });
  assert.equal(r.applied, false);
  assert.ok(r.changes.length > 0);
  assert.equal(fs.existsSync(p.codexHome), false);
  assert.equal(fs.existsSync(path.join(p.home, '.agents')), false);
});

test('global status detects drift after installation', () => {
  const p = paths(fakeHome());
  installGlobal({ homeDir: p.home, codexHome: p.codexHome });
  fs.appendFileSync(path.join(p.agents, GLOBAL_AGENT_FILES[1].file), '\n# drift\n');
  const status = globalStatus({ homeDir: p.home, codexHome: p.codexHome });
  assert.equal(status.ok, false);
  assert.equal(status.checks.find(x => x.id === `agent:${GLOBAL_AGENT_FILES[1].name}`).ok, false);
});

test('managed global instruction merge rejects malformed markers', () => {
  assert.throws(() => mergeGlobalInstructions(`x\n${GLOBAL_INSTRUCTIONS_BEGIN}\ny`), /Malformed/);
  assert.throws(() => mergeGlobalInstructions(`${GLOBAL_INSTRUCTIONS_END}\n${GLOBAL_INSTRUCTIONS_BEGIN}`), /marker order|Malformed/);
});

test('routing table exposes the intended model tiers', () => {
  const routes = routingTable();
  assert.deepEqual(routes.map(x => [x.name, x.model, x.reasoningEffort]), [
    ['ceos_bulk_checker', 'gpt-5.6-luna', 'low'],
    ['ceos_explorer', 'gpt-5.6-terra', 'medium'],
    ['ceos_implementer', 'gpt-5.6', 'medium'],
    ['ceos_debugger', 'gpt-5.6', 'high'],
    ['ceos_reviewer', 'gpt-5.6', 'high'],
    ['ceos_verifier', 'gpt-5.6', 'high']
  ]);
});
