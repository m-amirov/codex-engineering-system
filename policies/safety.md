# Safety Policy

## Risk classes

- **R0 Read-only:** inspect code, logs, HTTP GET/HEAD, tests, builds, local analysis.
- **R1 Local mutation:** edit code/tests/docs inside the scoped working copy.
- **R2 Reversible external mutation:** deploy, restart, staging mutation, draft creation.
- **R3 Financial / irreversible production operation:** BUY/payment, production data deletion, publication, financial parameter changes.

## Authorization

R0 is allowed by default. R1 is allowed only when the task asks to change/fix/create. R2 requires explicit task authorization or an explicit project policy. R3 requires explicit authorization for the concrete action. Silence, ambiguity and historical authorization are not authorization.

Never retry an ambiguous financial/provider submit automatically. Return `BLOCKED` or an explicit ambiguous state instead.
