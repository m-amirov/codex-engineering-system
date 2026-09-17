import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skill = fs.readFileSync(path.join(root, 'skills', 'audit-repair-loop', 'SKILL.md'), 'utf8');

test('release artifacts cannot hijack a non-release audit verdict', () => {
  assert.match(skill, /screenshots, videos, marketing material, publication forms/i);
  assert.match(skill, /OUT_OF_SCOPE_OBSERVATION/);
  assert.match(skill, /must not turn the target verdict into `FAIL`, `BLOCKED`, or `ESCALATE`/i);
});

test('READY Web routing cannot be silently skipped by audit-repair-loop', () => {
  assert.match(skill, /preflight returns `READY`/i);
  assert.match(skill, /at least one substantive audit unit in that cycle \*\*must\*\* be delegated/i);
  assert.match(skill, /Never silently skip Web/i);
  assert.match(skill, /A claimed Web-backed audit with no Web agent in the trace is non-compliant/i);
});
