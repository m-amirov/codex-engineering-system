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

Visual PASS is forbidden when pixel transfer, character/reference pixels, current-runtime screenshots, edge-to-edge/no-scroll/readability measurements, or cue-to-event mapping are absent. Text-only capture claims and DOM-only checks are not visual evidence.

Overall verdict rules:

- `FAIL` if any required gate fails.
- `BLOCKED` if no required gate fails but at least one required gate cannot be executed/proven.
- `PASS` only if every required gate passes.
- Optional gate failures may be reported without changing the overall verdict unless the profile says otherwise.
