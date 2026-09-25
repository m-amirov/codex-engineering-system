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

test('visual acceptance requires actual pixels and mechanical runtime measurements', () => {
  const visual = read('skills/visual-qa/SKILL.md');
  const evidence = read('policies/evidence.md');
  const stop = read('policies/stop-conditions.md');
  assert.match(visual, /actual screenshot and character\/reference pixels were supplied/i);
  assert.match(visual, /all four viewport edges/i);
  assert.match(visual, /stale or missing ledgers are evidence gaps/i);
  assert.match(evidence, /actual pixels were supplied/i);
  assert.match(stop, /screenshot pixels or reference-image pixels/i);
});


test('visual workflows carry bounded Web rate-limit and attachment transport policy', async () => {
  const transport = read('policies/web-transport.md');
  const visual = read('skills/visual-qa/SKILL.md');
  const production = read('skills/production-art/SKILL.md');
  assert.match(transport, /120 seconds/);
  assert.match(transport, /300 seconds/);
  assert.match(transport, /600 seconds/);
  assert.match(transport, /ATTACHMENT_TRANSPORT/);
  assert.match(transport, /actualPixelsReceived=true/);
  assert.match(visual, /Production reader\/dialogue\/navigation overlays/i);
  assert.match(production, /do not consume the bounded generation\/regeneration cycle count/i);

  const { renderContext } = await import('../src/ceos.mjs');
  const os = await import('node:os');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ceos-web-transport-context-'));
  fs.mkdirSync(path.join(temp, '.codex-os'), { recursive: true });
  fs.writeFileSync(path.join(temp, '.codex-os', 'project.json'), JSON.stringify({
    version: 1,
    profile: 'generic',
    commands: { ok: 'node -e ""' },
    gates: { verification: ['ok'] },
    production: { access: 'read-only' }
  }));
  const context = renderContext(temp, 'visual-qa');
  assert.match(context, /Web Transport, Rate Limit & Attachment Policy/);
});
