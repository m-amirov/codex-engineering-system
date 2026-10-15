---
name: ceos-continue
description: Continue an existing CEOS project workflow from persisted runs and checkpoints with a bounded next action, safe claim, verified execution, and evidence-based checkpointing.
metadata:
  ceos-version: "0.5.20"
---

# Skill: ceos-continue

Use when the user says "continue", "продолжи", "go on", or asks to resume
an existing CEOS run without repeating a long technical brief. This skill
is a **Codex-host execution adapter**, not a separate model host or daemon.

## One action at a time

1. In the project root, run: ceos continue --mode inspect --json
   If several active runs exist, select the correct run ID from the user's
   established task, not by guessing. For work run:
   ceos continue RUN_ID --mode guided --json
   Or choose --mode auto ONLY when user authorization covers the work.
2. Respect BLOCKED, NEEDS_RECOVERY_DECISION, RECOVERY_CHECK_REQUIRED,
   STOP_TERMINAL and DONE results. Planning does not reopen, create runs,
   generate art or mark review PASS.
3. If READY_FOR_CODEX, claim the exact returned action:
   ceos continue RUN_ID --mode guided --claim --action-id ACTION_ID --json
   auto enables only already authorized host work, not new side effects.
   A dry run never claims or mutates state.
4. Perform ONLY that action under existing CEOS skill/project scope.
   Use real tools and required models/capabilities. Reuse accepted evidence
   only with matching dependency hashes and compatible currentness rules;
   never replay completed image generation. Validate actual Web delivery and
   visual pixels when required.
5. Persist genuine artifacts and call ceos checkpoint with real evidence
   once the stage is actually complete. Do not infer art, episode, or
   independent acceptance from continue itself or from a partial batch.
6. Always release the exact lease token, including on errors:
   ceos continue RUN_ID --release LEASE_TOKEN --json
   Missing/wrong-token claims block; never hijack or delete another claim.
7. Inspect again. Continue only within scope, budgets and permissions.
   Stop on terminal outcome, no material progress, ambiguous state,
   transport/capability block or user-approval boundary.

## Recovery

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
