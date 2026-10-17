# Source-bound historical art revalidation

`ceos art-progress` intentionally invalidates a historical acceptance ledger
when a pinned dependency changes. The old ledger remains immutable; it must not
be edited to replace its dependency hash.

For a bounded, non-generating recovery, create a new contract from the current
checkout:

```text
ceos art-progress-revalidate \
  --ledger artifacts/.../STAGE9_4_S19_S23_ACCEPTANCE_LEDGER.json \
  --mechanical-receipt artifacts/.../new-output-batch-receipt.json \
  --deferred-pairs S24;S25;S26 \
  --output artifacts/.../stage9-4-s19-s23-art-progress-index.json \
  --json
```

The command is source-bound and read-only with respect to the historical
ledger, accepted PNGs, checkpoints and authored content. It records and
rechecks:

- the historical ledger hash and its pinned source HEAD;
- old and current dependency bytes, SHA-256 values, and deterministic JSON
  record-level differences;
- graph-to-asset runtime mappings for every historically accepted pair;
- current PNG bytes, decoded dimensions, hashes and a fresh mechanical batch
  receipt;
- whether a visual re-review is required; changed accepted mappings never
  become PASS automatically;
- deferred pairs as mechanical-only scope, never as artistic acceptance.

`ceos art-progress --index <new-contract.json>` accepts the five historical
pairs only when all of these checks pass. The original ledger remains the
historical acceptance record, and the contract is a separate currentness
proof. A tampered mapping, PNG, dependency comparison, ledger or deferred
scope returns `BLOCKED_ART_PROGRESS`.
