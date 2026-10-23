# CEOS Phase 01–04 consolidation — design

## Intent

Integrate the independently evolved Phase 01/02 PR history and the Phase 03/04 cumulative implementation into one auditable line, without discarding either branch's unique functional changes. Preserve the owner's stable `main` checkout and all local worktree and evidence data.

## Boundaries

- Integrate only CEOS. Do not change Starter Kit, game narrative/art, V2/V3 receipts, owner exceptions, candidate ledger data, or any remote product release.
- Create one short-lived CEOS integration branch from remote Phase 04; preserve original Draft PRs and history during integration.
- Do not rewrite or force-push original branches. No automatic branch, worktree or directory deletion.
- `main` may be updated only through review, passing final Linux/Windows CI and protected GitHub workflows. A green Phase 04 run on its pre-merge HEAD does not prove the integrated tree.

## Approaches

1. **Two-parent merge with explicit reconciliation (chosen):** merge Phase 02 (which includes Phase 01) into cumulative Phase 04; inspect each conflict and preserve behavior, test the final tree. This retains provenance and a reviewable integration diff.
2. Rebase/cherry-pick all phases: simpler linear history but duplicates/replays existing integration commits and rewrites source-bound historical SHA provenance. Rejected.
3. Git `-s ours` merge: records history with no code reconciliation; risks silently dropping PR 68 changes. Rejected without equivalence proof.

## Acceptance

- Demonstrate ancestry of Phase 01, 02, 03 and 04 heads in final integration commit.
- No conflict markers, no missing features/contracts: phase-specific tests and backward compatibility all pass.
- Verify `npm test`, self-test, lint and git diff checks locally; run independent CI on final source HEAD (Linux and Windows) and evaluate real logs.
- Keep an integration PR as Draft pending normal review; do not merge into protected `main` before all gates and human integration choice.
- Produce a read-only inventory of branch/worktree lifecycle; any physical cleanup remains a separate exact-target owner-approved action.
