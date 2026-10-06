export const EVIDENCE_CONTRACT_VERSION = 1;

export const FAILURE_TYPES = Object.freeze([
  'PRODUCT_FAILURE',
  'TEST_FAILURE',
  'COMMAND_FAILURE',
  'CONFIGURATION_ERROR',
  'INFRA_FAILURE',
  'EXTERNAL_BLOCKER',
  'CAPABILITY_BLOCKER',
  'EVIDENCE_FAILURE',
  'PROVENANCE_FAILURE'
]);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validSourceHead(value) {
  return value === undefined || value === null || /^[a-f0-9]{7,64}$/i.test(String(value));
}

export function validatePositiveEvidenceContract(metadata = {}, {
  currentSourceHead = null
} = {}) {
  const issues = [];
  const contract = metadata?.evidenceContract;

  if (!isObject(contract)) {
    return {
      ok: false,
      code: 'SEMANTIC_ASSERTIONS_MISSING',
      issues: ['metadata.evidenceContract is required for a terminal PASS']
    };
  }

  if (contract.schemaVersion !== EVIDENCE_CONTRACT_VERSION) {
    issues.push(`evidenceContract.schemaVersion must equal ${EVIDENCE_CONTRACT_VERSION}`);
  }

  if (!Number.isInteger(contract.assertionsExecuted) || contract.assertionsExecuted < 1) {
    issues.push('assertionsExecuted must be an integer >= 1');
  }

  if (!Array.isArray(contract.claims) || contract.claims.length === 0) {
    issues.push('claims must contain at least one proved claim');
  } else {
    for (const [index, claim] of contract.claims.entries()) {
      if (!isObject(claim)) {
        issues.push(`claims[${index}] must be an object`);
        continue;
      }
      if (!nonEmpty(claim.id)) issues.push(`claims[${index}].id is required`);
      if (!nonEmpty(claim.assertionId)) issues.push(`claims[${index}].assertionId is required`);
      if (claim.status !== 'PASS') issues.push(`claims[${index}].status must be PASS`);
      if (!Number.isInteger(claim.executions) || claim.executions < 1) {
        issues.push(`claims[${index}].executions must be an integer >= 1`);
      }
    }
  }

  const coverage = contract.coverage;
  if (!isObject(coverage)) {
    issues.push('coverage object is required');
  } else {
    if (coverage.complete !== true) issues.push('coverage.complete must be true');
    if (!nonEmpty(coverage.scope)) issues.push('coverage.scope is required');
    if (!Number.isInteger(coverage.checked) || coverage.checked < 1) issues.push('coverage.checked must be an integer >= 1');
    if (!Number.isInteger(coverage.total) || coverage.total < 1) issues.push('coverage.total must be an integer >= 1');
    if (Number.isInteger(coverage.checked) && Number.isInteger(coverage.total) && coverage.checked !== coverage.total) {
      issues.push('coverage.checked must equal coverage.total for PASS');
    }
  }

  if (!Array.isArray(contract.unresolved)) {
    issues.push('unresolved must be an array');
  } else if (contract.unresolved.length > 0) {
    issues.push('unresolved must be empty for PASS');
  }

  if (!validSourceHead(contract.sourceHead)) issues.push('sourceHead must be a Git commit SHA when supplied');
  if (currentSourceHead && contract.sourceHead !== currentSourceHead) {
    issues.push(`sourceHead mismatch: evidence=${contract.sourceHead ?? '(missing)'} current=${currentSourceHead}`);
  }

  return {
    ok: issues.length === 0,
    code: issues.some((issue) => issue.startsWith('sourceHead mismatch'))
      ? 'EVIDENCE_PROVENANCE_MISMATCH'
      : issues.some((issue) => issue.startsWith('coverage'))
        ? 'COVERAGE_INCOMPLETE'
        : 'SEMANTIC_ASSERTIONS_MISSING',
    issues
  };
}

export function assertPositiveEvidenceContract(metadata, options = {}) {
  const result = validatePositiveEvidenceContract(metadata, options);
  if (!result.ok) {
    const error = new Error(`${result.code}: terminal PASS evidence contract failed:\n- ${result.issues.join('\n- ')}`);
    error.code = result.code;
    error.details = result.issues;
    throw error;
  }
  return result;
}
