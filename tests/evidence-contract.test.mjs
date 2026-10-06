import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPositiveEvidenceContract,
  validatePositiveEvidenceContract
} from '../src/evidence-contract.mjs';

function valid(overrides = {}) {
  return {
    evidenceContract: {
      schemaVersion: 1,
      assertionsExecuted: 2,
      claims: [
        { id: 'behavior', assertionId: 'test:behavior', status: 'PASS', executions: 2 }
      ],
      coverage: { scope: 'declared acceptance scope', checked: 2, total: 2, complete: true },
      unresolved: [],
      sourceHead: 'a'.repeat(40),
      ...overrides
    }
  };
}

test('positive evidence contract accepts executable complete coverage', () => {
  const result = validatePositiveEvidenceContract(valid(), { currentSourceHead: 'a'.repeat(40) });
  assert.equal(result.ok, true);
});

test('fake zero counters without executed assertions cannot pass', () => {
  const result = validatePositiveEvidenceContract(valid({ assertionsExecuted: 0 }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'SEMANTIC_ASSERTIONS_MISSING');
});

test('partial coverage cannot prove a full-scope PASS', () => {
  const result = validatePositiveEvidenceContract(valid({
    coverage: { scope: 'full season', checked: 65, total: 66, complete: false }
  }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'COVERAGE_INCOMPLETE');
});

test('unresolved evidence conditions cannot pass', () => {
  const result = validatePositiveEvidenceContract(valid({ unresolved: ['manual mobile review pending'] }));
  assert.equal(result.ok, false);
});

test('current source HEAD mismatch is a provenance failure', () => {
  const result = validatePositiveEvidenceContract(valid({ sourceHead: 'b'.repeat(40) }), {
    currentSourceHead: 'a'.repeat(40)
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'EVIDENCE_PROVENANCE_MISMATCH');
  assert.throws(
    () => assertPositiveEvidenceContract(valid({ sourceHead: 'b'.repeat(40) }), { currentSourceHead: 'a'.repeat(40) }),
    /EVIDENCE_PROVENANCE_MISMATCH/
  );
});
