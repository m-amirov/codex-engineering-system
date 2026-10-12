import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CEOS_ROOT } from '../src/ceos.mjs';

const read = p => fs.readFileSync(path.join(CEOS_ROOT, p), 'utf8');

test('static narrative art chooses full-scene CG before sprite staging', () => {
  assert.match(read('skills/production-art/SKILL.md'), /default to a unified full-scene CG/);
  assert.match(read('policies/art-producer.md'), /full-scene CG before sprite-layer staging/);
  assert.match(read('skills/visual-qa/SKILL.md'), /complete scene-specific CG/);
});

test('P0 and P1 material findings precede P3 cosmetic suggestions', () => {
  assert.match(read('policies/art-producer.md'), /P0\/P1 errors/);
  assert.match(read('policies/art-producer.md'), /P3 alone is not authorization/);
  assert.match(read('skills/production-art/SKILL.md'), /P3 subjective style preferences/);
});

test('image-driven runtime transition regressions are mandatory after asset repair', () => {
  for (const file of ['skills/production-art/SKILL.md', 'skills/visual-qa/SKILL.md', 'policies/art-producer.md']) {
    const source = read(file);
    for (const term of [/preload/i, /crossfade/i, /stale/i, /reduced-motion/i])
      assert.match(source, term, file);
  }
});
