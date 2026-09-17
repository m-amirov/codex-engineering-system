import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CEOS_ROOT, GLOBAL_AGENT_FILES, SKILL_NAMES } from '../src/ceos.mjs';

const read = rel => fs.readFileSync(path.join(CEOS_ROOT, rel), 'utf8');

test('production-art is a first-class CEOS skill with a native asset route', () => {
  assert.ok(SKILL_NAMES.includes('production-art'));
  const native = GLOBAL_AGENT_FILES.find(x => x.name === 'ceos_asset_generator');
  assert.ok(native);
  assert.equal(native.model, 'gpt-5.6');
  assert.equal(native.effort, 'medium');
  assert.equal(fs.existsSync(path.join(CEOS_ROOT, 'skills', 'production-art', 'SKILL.md')), true);
});

test('Web art director remains reasoning-only and hybrid-installed rather than a native route', () => {
  assert.equal(GLOBAL_AGENT_FILES.some(x => x.name === 'ceos_art_director_web'), false);
  const web = read('agents/ceos-art-director-web.toml');
  const installer = read('scripts/install-hybrid.ps1');
  assert.match(web, /model = "chatgpt-web\/high"/);
  assert.match(web, /reasoning-only/i);
  assert.match(web, /Do not invoke tools, generate image files, or claim to persist assets/i);
  assert.match(installer, /ceos_art_director_web/);
  assert.match(installer, /ceos-art-director-web\.toml/);
});

test('production-art fails closed when native image generation is unavailable', () => {
  const skill = read('skills/production-art/SKILL.md');
  const native = read('agents/ceos-asset-generator.toml');
  assert.match(skill, /image generation is unavailable, stop with `BLOCKED`/i);
  assert.match(skill, /generated files actually exist and are referenced by runtime\/project mappings/i);
  assert.match(native, /otherwise stop and report the missing capability rather than fabricating generated files/i);
  assert.match(native, /Never claim an asset exists unless it is present in the workspace/i);
});
