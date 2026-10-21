---
name: ceos-continue
description: Continue a project directly from project instructions and tests by default; opt into legacy CEOS run/checkpoint orchestration when explicitly requested.
metadata:
  ceos-version: "0.5.41"
---

# Skill: ceos-continue

Use when the user says "continue", "продолжи", "go on", or asks to resume
an existing CEOS run without repeating a long technical brief. This skill
is a **Codex-host execution adapter**, not a separate model host or daemon.

## Default: direct development, no orchestration overhead

For ordinary Codex instructions such as "продолжи", "следующий этап",
"подготовь EP3", "implement this" or "fix tests", **do the requested
project work directly**. Do not require any CEOS run, checkpoint, claim,
recovery, capability-challenge, audit receipt or `ceos continue` as a
prerequisite just to edit code, write narrative, prepare art briefs,
run tests, or commit intended files.

1. Read the project's `AGENTS.md`, actual user request, relevant source,
   current plan and existing accepted evidence. Do not make the user repeat
   their previous technical brief.
2. Inspect the actual Git worktree and active parallel work; preserve dirty
   and untracked files. Direct workflow does not silently reset, clean,
   cherry-pick or force-push.
3. Execute the bounded user-authorized task using the host's normal tools.
   Run relevant project-owned tests/validators. Record real results and
   commit only intended files when authorized. Report remaining blockers.
4. Optional context helper: `ceos direct --json`. It is **read-only,
   never a gate**, does not inspect old runs, never claims PASS and does not
   grant permission to generate, merge or publish. A missing CEOS binary
   must not block ordinary Codex project development.
5. If a particular CEOS validator lacks support for a new episode, do not
   falsify IDs or evidence or force production through the old validator.
   Use the project's real source-bound art workflow; report missing
   verification separately and propose a narrowly scoped validator repair
   only when needed for an actual acceptance/release requirement.

For actual image generation, call a real host-native authorized generator,
persist the original pixels and SHA-256, respect rights/provenance and
bounded retries, and obtain independent artistic review of final images.
For release/publishing, run the platform's real QA and permission gates.
**No story, visual, media, episode or release PASS is inferred from a
completed Codex task or unit tests alone.** CEOS-independent work is not
an excuse to fabricate receipts or to reclassify an old blocker.

## Opt-in: strict historical CEOS run lifecycle

Use the strict instructions below **only** when the user explicitly requests
a CEOS run, a named historical run/checkpoint recovery, a source-bound CEOS
producer challenge, or another project's binding rule expressly requires it.
Do not start a new strict run merely because an old run exists or is blocked.
If an old `BLOCKED_AMBIGUOUS_RUNS` pertains only to historical workflows,
it must not hold up unrelated direct development. Preserve it for audit.

For an explicitly requested project planning inspection, the read-only
`ceos continue --scope project --mode inspect --json` remains available.
That command provides suggestions and does not authorize any mutating action.

## One action at a time

1. In the project root, run: ceos continue --mode inspect --json
   This is strictly read-only; if it reports SESSION_RECOVERY_AVAILABLE,
   use a normal ceos continue --mode guided --json to link safely. Ordinary
   ceos continue defaults to guided.
   If several active runs exist, select the correct run ID from the user's
   established task, not by guessing. For work run:
   ceos continue RUN_ID --mode guided --json
   Or choose --mode auto ONLY when user authorization covers the work.
2. Before any Git-backed mutation, run CEOS fresh-remote git-preflight
   with the actual branch, expected repository and --fetch; do not assume
   the local-only Git snapshot proves remote synchronization. Stop on
   diverged or behind state; never fast-forward a dirty tree. For production
   art, `continue` may explicitly report `git.checkpointedEvidenceOnly=true`
   even with `git.dirty=true`, but only for hash-pinned *untracked* PNGs, output receipts and producer-batch
   JSON ledgers explicitly present in a successful GENERATING checkpoint with
   a fully matched PASS_ART_BATCH_MECHANICAL gate. No directory-wide JSON
   exemption and no inference of acceptance from a ledger. If the remote is IN_SYNC and
   those are the only changes, continue the already authorized bounded
   action without forcing a Git commit or deleting evidence. Any other
   dirty source, acceptance ledger or uncheckpointed file still blocks.
   Preserve parallel worktrees.
3. Respect BLOCKED, NEEDS_RECOVERY_DECISION, RECOVERY_CHECK_REQUIRED,
   STOP_TERMINAL and DONE results. Inspect never creates runs. Guided/auto
   may automatically create a linked session recovery only for verified
   production-art stale-parent GENERATING, with pinned source/canon state.
   Never try to evade the corresponding fail-closed recovery blocker.
4. If READY_FOR_CODEX, claim the exact returned action:
   ceos continue RUN_ID --mode guided --claim --action-id ACTION_ID --json
   auto enables only already authorized host work, not new side effects.
   A dry run never claims or mutates state.
5. Perform ONLY that action under existing CEOS skill/project scope.
   Use real tools and required models/capabilities. Reuse accepted evidence
   only with matching dependency hashes and compatible currentness rules;
   never replay completed image generation. Validate actual Web delivery and
   visual pixels when required.
6. Persist genuine artifacts and call ceos checkpoint with real evidence
   once the stage is actually complete. Do not infer art, episode, or
   independent acceptance from continue itself or from a partial batch.
7. Always release the exact lease token, including on errors:
   ceos continue RUN_ID --release LEASE_TOKEN --json
   Missing/wrong-token claims block; never hijack or delete another claim.
8. Inspect again. Continue only within scope, budgets and permissions.
   Stop on terminal outcome, no material progress, ambiguous state,
   transport/capability block or user-approval boundary.

## Recovery

- SESSION_RECOVERY_AVAILABLE (inspect): the current trusted hook session
  differs from the parent bound to an eligible production-art run. Run
  ceos continue --mode guided --json; this creates one linked run with
  immutable source evidence, then returns the next action. Do not manually
  edit parent IDs, sessions, checkpoints or provenance. Confirm its new
  run ID and linked source, then issue a fresh run/session/turn capability
  challenge BEFORE generation. The old challenge and Terra trace do not
  carry across runs. No host generator is invoked by the CLI.
- BLOCKED_RECOVERY_* or BLOCKED_SESSION_CONTEXT_UNVERIFIED: stop and
  diagnose stale hook markers, source HEAD drift, dirty worktree or lock.
  Never bypass the gate to retry generation.
- BLOCKED_ART_OUTPUT / ART_FILE_NOT_FOUND are NOT session recovery.
  Locate the **original local native PNG** if the host persisted it and
  compare its full Image Gen SHA-256. Use `ceos art-output-import` only
  with a real, accessible local PNG and the full known source SHA.
  A chat preview or text describing pixels is not transport. Once
  imported, rerun `art-output-verify` with a **new receipt filename**.
  Never erase the failed receipt or rewrite an immutable terminal checkpoint.
  For a terminal production-art GENERATING `STAGE_BLOCKED` specifically
  naming `BLOCKED_ART_OUTPUT / ART_FILE_NOT_FOUND`, CEOS 0.5.32
  supports **explicit** `resume --reopen-blocked` with
  `--art-output-failed-receipt`, `--art-output-pass-receipt`,
  `--art-output-native-source`, and `--reason`. The native file and
  target bytes, unchanged source HEAD and historical terminal checkpoint
  are reverified; the same run opens at GENERATING with preserved
  candidate spend. Do not assume that an ordinary missing-file or image
  quality error qualifies. The command is never run automatically.


- INTEGRATED / NARRATIVE_DUAL_FORMAT_FULL_EPISODE_COVERAGE:
  a legacy three-scene batch must not be forced to generate all other
  episode scenes. In CEOS 0.5.35, explicitly run
  `ceos resume RUN --reopen-blocked --reason "Scoped batch proof restored"
  --dual-format-batch-manifest PROJECT_RELATIVE_JSON --json`
  only for this exact terminal reason. The engine verifies the original
  terminal checkpoint, current HEAD, real scene graph and *every*
  immutable GENERATING output PNG; then it adds a separate RUN_REOPENED
  record. Never edit the old checkpoint. Batch coverage never proves
  episode final acceptance.
- Historical `DEPENDENCY_*_HASH_MISMATCH` after a runtime asset-map update:
  do not rewrite old accepted S19–S23 ledger, falsely retain accepted counts
  or wave through an unknown mapping. Inspect `art-progress.staleDependencies`,
  compare old/new scene mappings, and create new independently verified
  currentness evidence or targeted runtime/Web pixel re-acceptance before
  claiming those scenes current.

- RECOVERY_CHECK_REQUIRED: verify that the external blocker truly changed
  (installed CEOS version, Web availability, producer route, capabilities
  and source/asset hashes). If supported, explicitly call the existing
  ceos resume --reopen-blocked with reason and genuine evidence.
  The continue command never silently performs a reopen.
- NEEDS_RECOVERY_DECISION: reopening is not authorized by the engine.
  Preserve old runs/checkpoints and propose a linked scoped recovery run;
  obtain required authorization. Never recycle provider attestations,
  run/session/turn attestations or generation receipts as fresh evidence.
- Conflicting worktrees, dirty files, stale evidence or divergences:
  report the block; never reset, clean, stash, force-push or switch
  someone else's worktree without authorization.

## Hard limits

CEOS is a Node control plane. It cannot invoke the Codex host's subagents,
Web High, Image Gen or browser on its own. Only the host executes them.
Keep scope locked; follow safety, production, evidence, model-routing,
art/rework budget and Git policies. No implicit push, merge, deploy,
payment, deletion, release, publication or irreversible operations.
Ask for risk-class authorization. auto is not a bypass.

## Reporting

Report current run and action, evidence-backed completed work, next action
or precise blocker. Read persisted state; do not ask the user to restate
prior HEADs, paths, receipts or long prompts.
