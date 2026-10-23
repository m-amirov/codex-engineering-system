# CEOS Phase 01–04 consolidation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Reconcile the Phase 01–04 Git histories and executable contracts into one safe CEOS integration candidate.

**Architecture:** Work in a temporary `ceos/task/*` worktree branched from the remote Phase 04 HEAD. Merge the Phase 02 head (which contains Phase 01) with manual resolution of overlapping production logic and tests; retain Phase 03/04 hardening. Confirm the final merge tree with local and remote gates before proposing integration into main.

**Tech Stack:** Git, Node.js test runner, GitHub Actions Windows/Linux.

**Spec:** `docs/superpowers/specs/2026-10-23-ceos-phase01-04-consolidation-design.md`

## Global constraints

- Historical PRs and branches remain untouched, and no force push or destructive cleanup occurs.
- No fake provenance rebind, receipts rewrite, art generation or release publication.
- No PASS statement based only on pre-integration CI evidence.

## Review focus

- Merged art candidate ledger must retain trace lineage and owner exceptions.
- V3 evidence/DEV transport must remain browser-only and fail closed.
- Autonomous continuation must preserve recovery idempotency and authorization.
- Windows worktree cleanup retains filesystem-identity and exact-token requirements.
- Historical scene IDs and old V2 receipts remain backward compatible.

### Task 1: Reconcile branches

- [ ] Inspect Phase 01/02 vs cumulative Phase 03/04 changes and confirm remote source SHAs.
- [ ] Create a two-parent merge of Phase 02 into Phase 04 on the isolated integration branch.
- [ ] Resolve code and test conflicts deliberately and verify expected contracts against both parents.
- [ ] Prove all four phase branch HEADs are ancestors of the candidate and check the diff against both parents.

### Task 2: Verify local integration

- [ ] Run affected phase-specific regression tests and inspect all failures.
- [ ] Run `env -u CODEX_HOME npm test`, `env -u CODEX_HOME npm run self-test`, `npm run lint` and `git diff --check`.
- [ ] Reconcile genuine regressions at their root cause; do not skip gates.

### Task 3: Publish review candidate, then verify host CI

- [ ] Fetch remote main and phase refs again before publication; abort on unexpected divergence.
- [ ] Commit only in-scope changes and publish a new Draft integration PR into main without force pushing.
- [ ] Check actual Linux and Windows job results on final candidate HEAD; require success of all release CI jobs.
- [ ] Report any remaining merge/release gates and preserve historical Draft PRs and worktrees until review.
