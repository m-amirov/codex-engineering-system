# CEOS: simple workflow, strict acceptance

## Goal

CEOS manages **product work**, not the lifetime of one Codex chat. A user should
normally say **"continue"** in their project's Codex client. Scope and accepted
assets survive a session change. Only host-only operations that need live trust
are allowed to depend on the current Codex turn.

## Two boundaries, not two competing state machines

| Development | Acceptance / release |
| --- | --- |
| Edit canon, create briefs and prepare batches without a model-session lock. | Verify source dependencies, immutable PNG hashes, runtime pixels and independent art acceptance. |
| Inspect previous accepted receipts; preserve genuine evidence across sessions. | Never upgrade mechanical PASS to artistic PASS, episode PASS or release readiness. |
| Start/resume a scoped run before Image Gen is available. | Real image generation requires a fresh in-turn capability challenge and proven native Terra child. |
| A blocked model route must not delete draft work or accepted outputs. | Untrusted images/receipts cannot masquerade as production artifacts. |

The existing `production-art` pipeline continues to enforce all art output,
independent Web review, dual-format and release gates. This change does **not**
turn off trust checks or claim that the CLI can invoke native Image Gen.

## Deferred producer binding (new narrative generation runs)

New `production-art` + `NEW_GENERATION` runs using the `narrative-game`
profile store `producerBindingMode: CURRENT_TURN` and
`producerParentSessionId: null`.

1. `INVENTORIED` and `CANON_READY` are project/source-scoped. No chat must
   remain open simply for those stages to be completed.
2. At `GENERATING`, the *current* host must provide a trusted
   `UserPromptSubmit` and a fresh **run-scoped challenge response** from the
   *same session and turn*.
3. Its attestation must match the refreshed capability snapshot. The true
   `ceos_asset_generator` Terra child's rollout `parent_thread_id` must
   match that authenticated parent. The attestation and output are retained
   as immutable checkpoint evidence.
4. If that binding is missing or stale, `GENERATING` is blocked with
   `BLOCKED_GENERATION_CURRENT_TURN_UNVERIFIED`. No fallback to choosing the
   last active lifecycle marker or trusting a manually supplied parent ID.
5. Historical runs **without** `producerBindingMode` keep their original
   pinned-parent behavior and linked recovery rules, unchanged.

The parent is a property of the **generation attempt**, not a property of
the artistic plan. An old run with a terminal BLOCKED verdict is not
silently reopened or rewritten.

## Canonical progress

The game-level accepted state is the union of validated, non-overlapping
source-bound batch receipts and existing-art reuse evidence. A newer inventory
must not erase a previously accepted batch just because it was built in
another session. Each accepted pair must have source/assets SHA checks and
independent art acceptance; a mechanical-only recheck is insufficient.

There is no new CEOS acceptance database in this change. Existing receipt
files and scoped manifests are the evidence sources; do not duplicate them
as invented PASS markers.

## Operator path

Use the existing canonical game checkout; no second worktree is needed.

- `ceos continue --mode inspect --json` reads the work plan without
  invoking Image Gen.
- Work on the planned canon/briefs and record source evidence.
- Immediately before *real* generation, answer the run-scoped capability
  challenge, refresh capabilities and verify the native child route.
- Accept each batch using the existing mechanical, runtime and Web High gates.
  Keep full episode acceptance/release checks separate.

## Deliberate limits

This is the **first, backward-compatible architectural simplification**:
the preliminary product stages are no longer coupled to a Codex chat.
It does not yet merge the many legacy recovery receipts or solve a host that
fails to deliver a trusted UserPromptSubmit; those require separate evidence
and cannot be replaced by fabricated events. Do not create repeated runs to
work around an untrusted host. Use the existing accepted evidence and report
the actual blocker.

## Read-only cumulative production-art progress

CEOS does **not** invent a new acceptance database. The optional
\`ceos art-progress --index artifacts/art-progress-index.json --json\` command
projects the current state from an existing immutable Web High receipt, actual
PNG bytes, actual runtime screenshots and source dependencies.

The index is only a locator. A representative schema:

\`\`\`json
{
  "schemaVersion": 1,
  "plan": {"path":"artifacts/production-art/stage9.4/ART_REUSE_MATRIX.json",
           "sha256":"<actual SHA-256 of plan bytes>"},
  "batches": [{
    "id":"ep2-s22-s23",
    "pairs":["S22","S23"],
    "receipt":{"path":"artifacts/production-art/stage9.4/STAGE9_4_S22_S23_WEB_HIGH_ACCEPTANCE_20261016.json",
               "sha256":"<actual SHA-256 of receipt bytes>"},
    "runtimeSha256":"<actual SHA-256 of runtime receipt bytes>"
  }]
}
\`\`\`

Each reference is constrained to the project and compared with the current
SHA-256. The plan's locked \`sourceHashes\` are also checked. A batch only
counts if its receipt explicitly scopes exactly those pairs; each portrait
and landscape PNG exists with the accepted hash, dimensions/aspect ratio,
Web High pixels PASS, runtime captures/screenshots PASS and no unresolved
blocking observations. A missing format, source drift, duplicated pair,
unsafe path, unsupported receipt schema, absent runtime capture or modified
PNG returns \`BLOCKED_ART_PROGRESS\`, not fictional accepted coverage.

The report counts only verified batches and always states
\`finalEpisodeAcceptance: NOT_VERIFIED\` and \`releaseReady: false\`. The
command is read-only and does not create CEOS runs, access the current Codex
session, invoke an Image Gen tool, write a new PASS receipt, or modify
existing evidence.

Historical acceptance formats differ. An older sampling-style Web High
receipt that lacks explicit scene scope or complete portrait/landscape
acceptance **remains historical evidence** but cannot be promoted to a
fully revalidated pair by this command. The operator must use the original
independent acceptance + runtime provenance; do not synthesize missing
records or regenerate accepted images solely to satisfy this view.

This is a second incremental simplification, not a new required release gate.
Existing acceptance and release policies remain authoritative.
