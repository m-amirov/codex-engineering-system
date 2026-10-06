# Evidence Policy

A claim is not evidence. Every required gate must have a recorded result.

Minimum gate record:

- gate id/name
- status: PASS / FAIL / BLOCKED / SKIP
- command or inspection method
- start/end timestamps
- exit code when applicable
- bounded stdout/stderr or artifact reference
- notes/reason for non-PASS
- for image evidence: path/content reference, SHA-256, byte size, width/height, current commit, viewport, state/cue, and proof that actual pixels were supplied to any independent multimodal reviewer
- for coverage claims: current ledger hash/version and exact authored event id before/after the cue
- for Web review transport: review/trace id, whether required evidence was actually received, failure class (`RATE_LIMITED` / `ATTACHMENT_TRANSPORT` / `WEB_UNAVAILABLE`) when applicable, retry attempt, and applied cooldown/Retry-After

Visual PASS is forbidden when pixel transfer, character/reference pixels, current-runtime screenshots, edge-to-edge/no-scroll/readability measurements, or cue-to-event mapping are absent. Text-only capture claims and DOM-only checks are not visual evidence.

Overall verdict rules:

- `FAIL` if any required gate fails.
- `BLOCKED` if no required gate fails but at least one required gate cannot be executed/proven.
- `PASS` only if every required gate passes.
- Optional gate failures may be reported without changing the overall verdict unless the profile says otherwise.


## Positive verdict contract

Terminal `PASS` is fail-closed. A persisted artifact or a zero-valued defect counter is not proof by itself.

For engine-backed workflows, the final `REAUDITED -> PASS` checkpoint must include
`metadata.evidenceContract` with:

- `schemaVersion: 1`;
- `assertionsExecuted >= 1`;
- at least one claim with a stable claim id, executable assertion id, `status: PASS`, and `executions >= 1`;
- explicit coverage scope with `checked == total`, `total >= 1`, and `complete: true`;
- an empty `unresolved` list;
- `sourceHead` matching the current repository HEAD when the target is Git-backed.

CEOS records the current Git HEAD, cleanliness and a hash of `git status --porcelain`
inside each checkpoint. A full-scope claim cannot be inferred from partial coverage. Unknown,
not-run, unavailable, unproven, blocked, pending manual, or pending external conditions remain
non-PASS states.

The stable historical failure taxonomy is machine-readable in
`policies/failure-catalog.json`.
