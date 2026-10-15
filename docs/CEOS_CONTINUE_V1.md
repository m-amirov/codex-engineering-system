# CEOS Continue V1 — bounded host-directed continuation

## Why

A multi-stage CEOS run already records scope, evidence, nextStage, cycles,
capabilities and recovery/terminal verdicts. Re-pasting all this in a user
prompt is redundant and can lead to stale source assumptions.

CEOS Continue V1 is a **single-next-action planner** and **exclusive work claim**.
It is not an autonomous daemon, another model host, generic workflow language,
nor a substitute for the existing run/checkpoint/verdict engine.

## Commands

- ceos continue --mode inspect --json
  - Read-only, default mode. Inspect only; does not create runs, lock, refresh,
    reopen, check out Git, generate assets or accept evidence.
- ceos continue RUN_ID --mode guided --json
  - One typed action to be completed by the current authorized Codex host.
- ceos continue RUN_ID --mode auto --json
  - Same action contract for an existing authorized task. The CLI does not
    perform host actions, and auto NEVER grants new permission to mutate
    source, pay, publish, push or merge.
- ceos continue RUN_ID --mode guided --claim --action-id ACTION_ID --json
  - Atomically claim the current next action; an existing claim blocks.
- ceos continue RUN_ID --release LEASE_TOKEN --json
  - Release only the matching lease. Always release in the host adapter's
    cleanup path, even on a failure.
- ceos continue RUN_ID --dry-run --json
  - Explicit no-write planning. --dry-run and --claim/--release cannot mix.

The Codex-host adapter is the installed ceos-continue skill. It performs the
actual work, persists real evidence and uses ceos checkpoint, routing-trace,
capability-challenge and existing verified recovery actions. It then calls
continue again. CEOS cannot invoke host-native models, Web High or Image Gen
from Node alone, and the CLI never pretends to.

## Deterministic behavior

A single active run is selected automatically. Multiple active runs require
an explicit RUN_ID; if only terminal runs remain, the persisted latest run
is inspected. Existing run checkpoints are not inferred from prompts.

Expected statuses:
- READY_FOR_CODEX: a current stage with one actionable, **unexecuted** unit.
- BLOCKED_AMBIGUOUS_RUNS / BLOCKED_NO_RUN / BLOCKED_RUN_UNREADABLE.
- BLOCKED_INTEGRITY / BLOCKED_GIT_PREFLIGHT / BLOCKED_DIRTY_WORKTREE.
- BLOCKED_ALREADY_CLAIMED / BLOCKED_STALE_ACTION.
- RECOVERY_CHECK_REQUIRED: existing execution engine allows a type of
  explicit reopen; first obtain fresh evidence, then call supported
  resume --reopen-blocked with reason/evidence. No silent reopen.
- NEEDS_RECOVERY_DECISION: existing blocked run cannot reopen; preserve
  immutable history and propose an authorized scoped fresh recovery run.
- STOP_TERMINAL / DONE: stop; do not invent a next product milestone.

Plan IDs hash immutable scope hash, run ID, current Git HEAD, cycle,
checkpoint count, stage and action kind. Claim uses an atomic exclusive file
per run under .ceos-runs/.continue-claims; do not remove someone else's
claim or silently seize a stale one. Normal inspection never writes it.

## Permission boundary

The existing CEOS risk and Git policies remain in force. Read-only planning
does not grant mutation. A host using auto must already hold authorization
for the exact task and remain within locked scope. External actions have
their own risk/approval requirements. A CEOS final PASS still requires
existing checkpoint, evidence, Web and full narrative/dual-format gates.
No arbitrary "mark PASS" or step skipping is supported.

## Remaining scope (not falsely claimed by V1)

- Automatic invocation of Codex host subagents, image generation and Web
  reviewers: host-only via the ceos-continue skill.
- Project-level EP1–EP10 dependency scheduling: not implemented in V1; an
  explicit project workflow manifest and incremental batch-vs-episode
  acceptance model are required before crossing product milestones.
- Portable recovery of generation attestations across runs: prohibited
  without a future explicit source/dependency-bound CEOS recovery contract.
- Automatic push/merge/deployment, destructive cleanup or publication:
  intentionally out of scope.

## Rollout

Install CEOS V1 update, refresh installed global skills/instructions through
normal installer, and start a fresh Codex session. From the intended project
worktree ask: "Продолжи по CEOS." The host should follow ceos-continue,
use one claim at a time, avoid repeating completed work, and report the next
real blocker rather than requesting a multi-page prompt.
