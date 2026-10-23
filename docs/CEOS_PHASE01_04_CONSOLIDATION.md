# CEOS Phase 01–04 integration record

## Historical branches

- PR #67: Phase 01, `6bd2f4c1d7bfbefe24d75abb5218742e2c482515`.
- PR #68: Phase 02, `7f1d21d8a0de48c15a8b4d868a5b80cdb0fc94c6` (includes Phase 01 ancestry).
- PR #69: cumulative Phase 01–03 implementation, `66198f2282e0731ea56574066529f53c17abb8e2` (separate integration commits).
- PR #70: cumulative Phase 01–04 and Windows path-identity repair, `e053140816f01a7790568d08b987bd0071207e49`.

## Reconciliation

The later Phase 03/04 line and original Phase 01/02 PR line share `main` history but do not share Phase 01/02 *commit* ancestry. Phase 03 already incorporated revised contracts and additional checks via separate integration commits. The Phase 02 branch was merged as a second parent to make the original source history explicitly reachable.

The merge generated overlapping changes in:

- `src/art-candidate-ledger.mjs`, `src/art-change-impact.mjs`, `src/art-producer-brief.mjs`;
- `src/continuation-controller.mjs`, `src/dev-web-high-transport.mjs`, `src/temporary-blocker-recovery.mjs`;
- `tests/art-change-impact.test.mjs`, `tests/phase01-blocker-recovery.test.mjs`;
- `src/episode-art-finalization.mjs`, `src/execution-engine.mjs` (automatically merged duplicate definitions/variables).

The Phase 04 versions were retained for these overlapping paths after comparing the contracts: they contain stricter native producer/evidence lineage, changed staged/unstaged/untracked impact detection, source-bound brief support, browser-only reviewer fallback, Phase 03 recovery integration, and Phase 04 process/worktree hardening. The automatically merged duplicate `selectedNarrativeArtProfile` function and duplicate `v3` local were **not** admitted.

This merge records both histories and retains the tested cumulative runtime tree. It does not weaken release/evidence gates, override V2/V3 receipts, or declare any fresh artistic acceptance.

## Regression evidence

Before the merge, cumulative Phase 04 baseline: `npm test` **523 PASS, 0 FAIL, 1 SKIP** on Linux. To test compatibility with the original Phase 02 contracts, the three differing Phase 02 test files were temporarily run against Phase 04 production code together with the unchanged suite: **515 PASS, 0 FAIL, 1 SKIP**. The original Phase 04 test files were then restored byte-for-byte before creating the integrated commit.

The final integrated HEAD requires its **own** `npm test`, self-test, lint, SHA/ancestry checks and GitHub Actions on Windows/Linux. Prior run `39956570200` is evidence for the Phase 04 *parent*, not for a new merged commit.

## Worktree and branch safety

The integration uses one temporary `ceos/task/*` worktree; no user-PC worktree, historical branch, Draft PR or ignored/evidence data was deleted. Superseded PRs must remain in place until an accepted integration candidate has been reviewed and merged. Any eventual physical cleanup requires a fresh exact-target inspection and separate authorization.
