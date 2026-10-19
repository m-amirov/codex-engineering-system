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
  - Read-only explicit inspection mode. Inspect only; does not create runs, lock, refresh,
    reopen, check out Git, generate assets or accept evidence.
- ceos continue --progress-index <path> --mode inspect --json
  - Optional explicit locator for a project-owned source-bound art-progress index or
    acceptance ledger. The default `continue` discovers one under `artifacts/`.
- ceos continue [RUN_ID] --json
  - Guided default. Normally returns one bounded host action plus the current
    source-bound project progress. An eligible legacy pinned-parent production-art
    run may create a linked recovery; a new `CURRENT_TURN` run never does so just
    because the Codex session changed.
- ceos continue RUN_ID --mode guided --json
  - Equivalent explicit mode; any new work remains host-executed.
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
  - Explicit no-write planning, including session recovery. --dry-run and --claim/--release cannot mix.

The Codex-host adapter is the installed ceos-continue skill. It performs the
actual work, persists real evidence and uses ceos checkpoint, routing-trace,
capability-challenge and existing verified recovery actions. It then calls
continue again. CEOS cannot invoke host-native models, Web High or Image Gen
from Node alone, and the CLI never pretends to.

## Episode-wide art finalization without run selection

A completed episode may have multiple historical active/blocked runs with
unusable scope provenance. The **read-only** `ceos episode-art-finalize` path
does not select a run and cannot repair or waive any run's missing
`scope.json`, source drift or broken checkpoint:

```text
ceos episode-art-finalize --project <game> \
  --manifest artifacts/episode-finalization-v1.json --json
```

It separately checks the source Git ancestry (only evidence-file commits may
follow the pinned baseline), clean authored source, pinned narrative files,
independent raw reviewer responses and per-image observations, revalidated
historical art-progress where supplied, real portrait/landscape PNGs,
runtime screenshots, narrative validation and reconciliation. Missing
evidence returns `NOT_VERIFIED`. Its distinct
`PASS_EPISODE_ART_FINALIZATION` verdict means **episode artwork only**:
it is not a CEOS historical run `PASS`, platform release approval or
`releaseReady=true`. This path never mutates historical evidence or calls
Image Gen/Web High. See `docs/EPISODE_ART_FINALIZATION_V1.md` for the
manifest contract.

## Deterministic behavior

A single active run is selected automatically. If a source-bound production-art
ledger is present, unrelated active pipelines are not silently selected; CEOS
returns `BLOCKED_NO_ACTIVE_PIPELINE_RUN` with the project progress and the
concrete missing action. Multiple matching active runs require an explicit
RUN_ID; if only terminal runs remain, the persisted latest run is inspected.
Existing run checkpoints are not inferred from prompts.

Expected statuses:
- SESSION_RECOVERY_AVAILABLE: inspect/dry-run identified an eligible old
  parent; no state changed. Guided/auto creates linked recovery and returns
  READY_FOR_CODEX on the new run.
- BLOCKED_SESSION_CONTEXT_UNVERIFIED / BLOCKED_RECOVERY_GIT_PREFLIGHT /
  BLOCKED_RECOVERY_GUARD / BLOCKED_RECOVERY_ALREADY_IN_PROGRESS:
  fail-closed recovery diagnostics; no fallback to reusing the old parent.
- READY_FOR_CODEX: a current stage with one actionable, **unexecuted** unit.
- BLOCKED_AMBIGUOUS_RUNS / BLOCKED_NO_RUN / BLOCKED_RUN_UNREADABLE.
- BLOCKED_AMBIGUOUS_PROGRESS / BLOCKED_NO_ACTIVE_PIPELINE_RUN: the project
  progress locator or its execution cursor needs a concrete repair/selection;
  accepted evidence is not regenerated.
- BLOCKED_ART_PROGRESS: a selected progress ledger was found but its
  source-bound evidence no longer revalidates. Continue is non-claimable until
  the named files are restored or the explicit evidence path is repaired.
- BLOCKED_INTEGRITY / BLOCKED_GIT_PREFLIGHT / BLOCKED_DIRTY_WORKTREE.
  Verified output evidence pinned to immutable GENERATING or RUN_REOPENED
  checkpoints may be untracked yet not block. A producer-batches JSON ledger
  qualifies only when explicitly SHA-pinned in the same successful GENERATING
  checkpoint with all mechanical output checks matched to actual PNGs. The plan still shows
  `git.dirty=true` and `git.checkpointedEvidenceOnly=true`, with exact
  approved file paths; anything else, including accepted-art changes,
  remains BLOCKED_DIRTY_WORKTREE. No Git reset, staging, or auto-commit.
- BLOCKED_ALREADY_CLAIMED / BLOCKED_STALE_ACTION.
- RECOVERY_CHECK_REQUIRED: existing execution engine allows a type of
  explicit reopen; first obtain fresh evidence, then call supported
  resume --reopen-blocked with reason/evidence. For the narrow terminal
  `STAGE_BLOCKED: BLOCKED_ART_OUTPUT / ART_FILE_NOT_FOUND` case,
  provide old failure receipt, fresh mechanical PASS receipt and
  original real native generated_images PNG with matching SHA-256 using
  `--art-output-failed-receipt`, `--art-output-pass-receipt`
  and `--art-output-native-source`. The engine verifies the exact
  terminal checkpoint and unchanged Git HEAD before appending a
  new `RUN_REOPENED` checkpoint. It does not reuse Image Gen authority
  or confer artistic PASS. No silent reopen.
- NEEDS_RECOVERY_DECISION: existing blocked run cannot reopen; preserve
  immutable history and propose an authorized scoped fresh recovery run.
- STOP_TERMINAL / DONE: stop; do not invent a next product milestone.

Plan IDs hash immutable scope hash, run ID, current Git HEAD, cycle,
checkpoint count, stage and action kind. Claim uses an atomic exclusive file
per run under .ceos-runs/.continue-claims; do not remove someone else's
claim or silently seize a stale one. Normal inspection never writes it.

## Session-only linked recovery

Automatic recovery is narrow and legacy-only: narrative production-art in its first cycle,
waiting at GENERATING, with a mismatched parent SessionStart marker and a
fresh same-session UserPromptSubmit marker for the exact project worktree.
A terminal BLOCKED run qualifies only if it specifically stopped for
BLOCKED_NATIVE_AGENT_PARENT_MISMATCH at GENERATING. Missing generated PNGs,
art output gate failures, unrelated terminal errors and arbitrary checkpoints
are not eligible.

The source run stays unchanged. Before linking, CEOS verifies its integrity,
a clean Git worktree, HEAD matching the accepted CANON_READY checkpoint,
unchanged scope, and valid parent/turn context. Historical
  `resolutionReceiptContract` scopes retain their original exact lines,
  authoritative source path and SHA-256 across recovery; the source is checked
  again through the standard receipt preflight. No contract is stripped or
  reinterpreted. Unknown scope extensions and source drift remain blocked. A new run keeps source/canon
hashes in LINKED_SESSION_RECOVERY and inherits only the pre-generation
CANON_READY milestone; no PNG, acceptance, tool invocation or generation PASS
is inferred. It is bound to the fresh parent session. Native capability
presence, trust and service availability are reset and must be re-attested
through the new run's current-turn challenge. The original run, its scope and
accepted source artifacts are pinned; changing them invalidates the link.

Only one recovery may proceed for a source run. The index/lock is stored
under .ceos-runs/.continue-recoveries, and surviving conflicting locks require
explicit repair; CEOS never steals them. Subsequent continue calls select the
linked run and do not create a second fork. The Codex adapter must still
perform current Git remote preflight, stage work, pixel checks and independent
Web High review under the original permissions.

## Permission boundary

The existing CEOS risk and Git policies remain in force. Read-only planning
does not grant mutation. A host using auto must already hold authorization
for the exact task and remain within locked scope. External actions have
their own risk/approval requirements. A CEOS final PASS still requires
existing checkpoint, evidence and Web gates. For NEW_GENERATION narrative batches, INTEGRATED uses BATCH_ONLY dual-format verification against every PNG in the successful GENERATING checkpoint; episode-final coverage remains a separate explicit requirement. A legacy full-episode-at-batch INTEGRATED terminal may be explicitly reopened with `resume --reopen-blocked --dual-format-batch-manifest <path> --reason <text>` only after revalidating the immutable batch and unchanged HEAD. Historic acceptance dependency drift still blocks current accepted-progress claims until fresh revalidation.
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

## Worktree-scoped host hook markers (CEOS 0.5.23)

SessionStart and UserPromptSubmit now persist additional worktree/session
evidence under `~/.codex/ceos/runtime/worktrees/<SHA256(realpath(cwd))>/<SHA256(session_id)>/`.
Project-bound continue and capability challenges read only the requested
worktree's context; a turn in a separate checkout cannot evict it.
Eligibility also requires the live worktree host binding at
`~/.codex/ceos/runtime/worktrees/<SHA256(realpath(cwd))>/host.json` to match
both the candidate session ID and its current turn ID. An `ACTIVE_LIFECYCLE`
receipt or scoped `turn.json` without that binding is diagnostic history only
and returns `BLOCKED_ACTIVE_LIFECYCLE_CURRENT_TURN_UNBOUND`, even when it is
the only remaining candidate.
The historical global `current-session.json` / `current-turn.json`
files remain as a migration fallback only when **both** recorded cwd
values match the requested project and there is no scoped state.

A single eligible session is required. Multiple fresh same-worktree sessions
remain BLOCKED rather than automatically selecting the latest: an active
lifecycle without a matching live host binding returns
`BLOCKED_ACTIVE_LIFECYCLE_CURRENT_TURN_UNBOUND`; otherwise the ambiguity
code is `BLOCKED_AMBIGUOUS_WORKTREE_SESSIONS`. Stale/corrupt evidence stays
BLOCKED.
SessionEnd only removes that session's scoped evidence.

These are Codex-host-observed local hooks, NOT provider-signed model
attestations or a cryptographic proof of which process issued a separate
CLI command. Do not pass `--project` from another checkout to borrow
a session. Generate from an authorized Codex session actually launched
in the target worktree and retain capability/trace checks.

## Scoped verified-art reuse (CEOS 0.5.40)

Narrative `VERIFIED_EXISTING_ART_REUSE` can cover a positive subset of authored scenes while the whole episode remains incomplete. CEOS checks its dual-format manifest in `REUSE_SCOPE` using the exact PNG path/SHA-256 set from the validated `GENERATING` reuse contract, not a fabricated image-generation checkpoint. It rechecks independent Web/runtime/provenance receipts, the pinned scope and the underlying bytes at integration and final scoped acceptance. The `INTEGRATED` / `REAUDITED` metadata `dualFormatManifest` must match the original contract.

`REUSE_SCOPE` **never** means episode-final or release approval. Only `FULL_EPISODE` can validate complete episode scene coverage. A previously terminal `BLOCKED` reuse run remains terminal and is not silently reopened; create a distinct bounded reuse run under explicit authorization if the original run cannot use a supported recovery mechanism.
