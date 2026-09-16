import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CEOS_ROOT, GLOBAL_AGENT_FILES, SUPPORTED_PROFILES } from '../src/ceos.mjs';

const skills = ['audit','fix','verification','release','visual-qa','prod-check','incident-analysis'];

test('all MVP skills exist', () => {
  for (const skill of skills) assert.ok(fs.existsSync(path.join(CEOS_ROOT, 'skills', skill, 'SKILL.md')), skill);
});

test('all supported profiles exist', () => {
  for (const p of SUPPORTED_PROFILES) assert.ok(fs.existsSync(path.join(CEOS_ROOT, 'profiles', p, 'PROFILE.md')), p);
});

test('AGENTS.md remains a compact router', () => {
  const text = fs.readFileSync(path.join(CEOS_ROOT, 'AGENTS.md'), 'utf8');
  assert.ok(text.length < 5000, `AGENTS.md too large: ${text.length}`);
  assert.match(text, /Skills/i);
  assert.match(text, /Evidence/i);
});


test('global Codex layer and custom model-routing agents exist', () => {
  const globalInstructions = fs.readFileSync(path.join(CEOS_ROOT, 'global', 'AGENTS.md'), 'utf8');
  assert.ok(globalInstructions.length < 7000, `global/AGENTS.md too large: ${globalInstructions.length}`);
  assert.match(globalInstructions, /Automatic model routing/i);
  for (const agent of GLOBAL_AGENT_FILES) {
    const file = path.join(CEOS_ROOT, 'agents', agent.file);
    assert.ok(fs.existsSync(file), agent.file);
    const text = fs.readFileSync(file, 'utf8');
    assert.match(text, new RegExp(`name\\s*=\\s*"${agent.name}"`));
    assert.match(text, new RegExp(`model\\s*=\\s*"${agent.model.replaceAll('.', '\\.') }"`));
    assert.match(text, new RegExp(`model_reasoning_effort\\s*=\\s*"${agent.effort}"`));
  }
});
