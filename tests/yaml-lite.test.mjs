import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYamlLite } from '../src/yaml-lite.mjs';

test('parses CEOS YAML subset', () => {
  const obj = parseYamlLite(`version: 1\nprofile: generic\ncommands:\n  lint: npm run lint\ngates:\n  verification: [lint, test]\nproduction:\n  access: read-only\nrelease:\n  clean_worktree: true\n`);
  assert.equal(obj.version, 1);
  assert.equal(obj.profile, 'generic');
  assert.deepEqual(obj.gates.verification, ['lint', 'test']);
  assert.equal(obj.release.clean_worktree, true);
});

test('rejects block arrays instead of guessing', () => {
  assert.throws(() => parseYamlLite('x:\n  - a\n'), /Block arrays are not supported/);
});

test('keeps # inside quoted values', () => {
  const obj = parseYamlLite('x: "a # b" # comment\n');
  assert.equal(obj.x, 'a # b');
});
