import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CEOS_ROOT, SKILL_NAMES } from '../src/ceos.mjs';

const read = name => fs.readFileSync(path.join(CEOS_ROOT, name), 'utf8');

test('concept and payoff workflow reuses the registered editorial skills', () => {
  for (const name of ['romance-narrative','narrative-continuity-engine','reader-experience-review','narrative-dialogue-editor']) {
    assert.ok(SKILL_NAMES.includes(name), name);
  }
  assert.match(read('skills/romance-narrative/SKILL.md'), /Optional concept prototype/);
  assert.match(read('skills/romance-narrative/SKILL.md'), /story promise ledger/i);
  assert.match(read('skills/narrative-continuity-engine/SKILL.md'), /claimed payoff must have a reachable antecedent/);
  assert.match(read('skills/reader-experience-review/SKILL.md'), /Before revealing the author's promise\/payoff ledger/);
  assert.match(read('skills/narrative-dialogue-editor/SKILL.md'), /Bounded episode handoff/);
});

test('planning template keeps route-specific source and evidence statuses separate', () => {
  const t = read('templates/narrative/STORY_PROMISE_LEDGER.md');
  for (const term of ['Promise ID','Route / condition','Resolution scene/cue','planned','authored','runtime-verified','intentionally-open','unresolved','context packet']) {
    assert.ok(t.includes(term), term);
  }
  assert.match(t, /not authority/);
});

test('CEOS adaptation is opt-in, original, and does not activate a game release gate', () => {
  const guide = read('docs/NARRATIVE_DEVELOPMENT_WORKFLOW.md');
  assert.match(guide, /No upstream code/);
  assert.match(guide, /future/);
  assert.match(guide, /Deferred Starter Kit work/);
  assert.match(guide, /No change to Starter Kit or the current game/);
  assert.match(read('skills/reader-experience-review/SKILL.md'), /NOT_VERIFIED/);
});
