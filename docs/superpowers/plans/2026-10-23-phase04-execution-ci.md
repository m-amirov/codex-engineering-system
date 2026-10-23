# Phase 04 Execution and CI Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkboxes.

**Goal:** Bound execution and provider lifecycles, protect source-bound replay, and make local worktree cleanup unambiguous.

**Architecture:** Use a narrow command adapter/child supervisor for manifest verification; preserve existing evidence writer but add exact-HEAD guards. Add a separate read-only-first Git worktree inventory/cleanup API. Harden existing browser helper lifecycle, and run targeted integration tests on both CI operating systems.

**Tech Stack:** Node 22 ESM, `node:test`, Git, PowerShell/GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-23-phase04-execution-ci-design.md`

## Global Constraints

- No image generation, release, merge, force Git writes or user-PC deletion in this task.
- Keep V2/V3 receipts and Phase 03 recovery history untouched.
- Run safe Git remote preflight; do not reconcile unrelated divergent branches.

## Review Focus

- Windows `.cmd`/npm adapter, spaces in paths and process-tree shutdown.
- Gate timeout or output overflow never results in PASS.
- Worktree still dirty, containing ignored evidence or not merged remains untouched.
- A previously accepted replay on another checkout/HEAD cannot establish current PASS.
- Provider hangs during startup, request or shutdown, and duplicate exit/error events do not leak unresolved promises.

---

### Task 1: Safe verification execution

**Files:** `src/verification-process.mjs`, `src/ceos.mjs`, `bin/ceos.mjs`, `tests/phase04-verification-process.test.mjs`, `tests/core.test.mjs`.

**Interface:** `resolveVerificationCommand(command, projectDir)` and `runVerificationProcess(spec, { cwd, env, timeoutMs, maxOutputBytes })`. `runVerification` becomes awaitable; CLI awaits it.

- [ ] Add failing tests for shell-metachar rejection, valid node/npm commands, timeout + descendants, output cap, signal classification.
- [ ] Implement argv-only adapters and bounded process supervisor.
- [ ] Connect gate runner, evidence and CLI, adjusting existing fixture tests.
- [ ] Verify focused and full suites.

### Task 2: Source-bound replay and worktree identity

**Files:** `src/ceos.mjs`, `src/verification-replay.mjs`, `tests/phase04-replay.test.mjs`.

**Interface:** `validateVerificationReplay(project, priorEvidenceDir)` returns source/checkout mismatch diagnostics; optional `--replay-from` creates a **fresh** gate run on exactly validated source.

- [ ] Add failing tests for stale HEAD, a sibling worktree, damaged receipt and exact-source fresh replay.
- [ ] Implement fail-closed replay validation and per-run HEAD drift detection.
- [ ] Verify focused tests and evidence contract.

### Task 3: User-safe worktree governance

**Files:** `src/worktree-hygiene.mjs`, `bin/ceos.mjs`, `tests/phase04-worktree-hygiene.test.mjs`, `docs/WORKTREE_HYGIENE.md`.

**Interface:** `inspectWorktrees(project)` read-only; `cleanupWorktree(project, {path,expectedHead,planToken})` exact guarded operation.

- [ ] Add failing tests for main protection, dirty/unmerged/ignored/run-bound worktrees and valid disposable task worktree.
- [ ] Implement inventory + opt-in exact-target cleanup; refuse all unknown cases.
- [ ] Add CLI commands and one permanent main / transient worktrees instructions.
- [ ] Verify no unrelated branch/files touched.

### Task 4: Provider integration and CI

**Files:** `src/dev-web-high-transport.mjs`, `tests/phase04-provider-lifecycle.test.mjs`, `.github/workflows/release-0.5.7.yml`, `package.json`.

- [ ] Add failing integration tests with actual stub helper subprocess (no browser/session) for startup, request timeout and orderly/forced close.
- [ ] Make child lifecycle bounded and wait for exit, preserving fallback/receipt behavior.
- [ ] Expand Windows/Linux CI targeted provider, source-bound replay, worktree and safe command regressions.
- [ ] Run entire test/lint/self-test suite, inspect diff, commit and submit Draft PR.
