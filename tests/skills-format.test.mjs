import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CEOS_ROOT } from '../src/ceos.mjs';

const skills = ['audit','audit-repair-loop','fix','verification','release','visual-qa','prod-check','incident-analysis'];

function parseFrontmatter(text) {
  assert.ok(text.startsWith('---\n'), 'missing opening frontmatter');
  const end = text.indexOf('\n---\n', 4);
  assert.ok(end > 4, 'missing closing frontmatter');
  const fm = text.slice(4, end).split('\n');
  const out = {};
  for (const line of fm) {
    const m = line.match(/^([a-z0-9-]+):\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return out;
}

test('MVP skills follow required Agent Skills metadata shape', () => {
  for (const name of skills) {
    const text = fs.readFileSync(path.join(CEOS_ROOT, 'skills', name, 'SKILL.md'), 'utf8');
    const fm = parseFrontmatter(text);
    assert.equal(fm.name, name);
    assert.match(fm.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(fm.description?.length > 20 && fm.description.length <= 1024, `${name}: description`);
    assert.ok(text.length < 30000, `${name}: keep activated skill compact`);
  }
});
