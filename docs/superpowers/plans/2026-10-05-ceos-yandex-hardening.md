# CEOS Yandex Development Lessons Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encode the recurring orchestration, semantic-QA, stale-evidence, release-freeze, and reviewer-capability failures into reusable CEOS skills/policies.

**Architecture:** Keep CEOS generic: Yandex-specific mechanical rules live in Starter Kit; CEOS owns evidence discipline, branch-aware semantic review, exact-source verification, capability truthfulness, worktree safety, and release sequencing. Reuse existing skills rather than creating overlapping parallel systems.

**Tech Stack:** CEOS 0.5.5+, Agent Skills, Node tests, GitHub CI.

**Spec:** Lessons observed during the full development/localization/release cycle of `kiss-at-the-edge-of-the-world`.

## Global Constraints

- Never turn a narrow PASS into a broader release PASS.
- Never invent Web/host capability from preflight alone.
- Never trust a READY report without checking source/remote/evidence provenance.
- Existing intentional worktree changes are protected by default.
- Keep user-visible progress concise; detailed reasoning/evidence belongs in artifacts.

## Review Focus

- Stale repeated READY reports with unchanged SHA.
- Semantic counters that are always zero because no executable assertions exist.
- Branch-dependent interaction text tested only under default choice A.
- Temporal/consent/knowledge/action-ownership defects hidden by structural parity.
- Release evidence invalidated by moving HEAD after acceptance.

---

### Task 1: Strengthen independent verification provenance

**Files:**
- Modify: `skills/verification/SKILL.md`
- Modify: `policies/evidence.md` if needed
- Modify/add: `tests/*verification*`

**Interfaces:**
- Consumes: claimed starting SHA, source SHA, evidence SHA, final SHA, remote ref.
- Produces: PASS/FAIL/BLOCKED only when provenance is internally consistent.

- [ ] Add failing skill/contract tests for repeated stale READY with unchanged final SHA after a requested repair; evidence `testedSourceHead` pointing to an older source; remote HEAD mismatch.
- [ ] Verify RED.
- [ ] Require verification to compare the claimed base→final diff, parent chain, remote head, and evidence source binding before semantic acceptance.
- [ ] Require a repair task that explicitly mandates a new commit to fail closed when final SHA does not advance.
- [ ] Run CEOS tests.
- [ ] Commit: `docs: harden acceptance provenance checks`.

### Task 2: Make semantic counters evidence-bearing

**Files:**
- Modify: `skills/verification/SKILL.md`
- Modify: `skills/romance-narrative/SKILL.md`
- Create: `policies/semantic-evidence.md`
- Modify registry/policy mapping in `src/ceos.mjs`
- Add tests validating policy installation/context.

**Interfaces:**
- Consumes: semantic case matrix, counters, executable assertion counts.
- Produces: BLOCK when a required zero counter has zero applicable assertions without explicit N/A reasoning.

- [ ] Write failing contract tests for counters initialized to zero but never incrementable.
- [ ] Verify RED.
- [ ] Define the rule: every acceptance counter must report assertion count/coverage or explicit N/A; zero value alone is not evidence.
- [ ] Add branch-matrix requirements for stateful authored content when validity changes with predecessor choices.
- [ ] Run CEOS tests/global install tests.
- [ ] Commit: `feat: require executable semantic evidence coverage`.

### Task 3: Harden interactive narrative continuity

**Files:**
- Modify: `skills/romance-narrative/SKILL.md`
- Reuse: `policies/semantic-evidence.md`
- Add skill regression tests.

**Interfaces:**
- Consumes: canonical source, interaction insertion refs, predecessor authored choices, route/status state.
- Produces: explicit checks for chronology, consent, knowledge, ownership, relationship state, and internal-state leakage.

- [ ] Add RED scenarios covering future promise referenced early, replay of completed action, consent before canonical consent, closed romance resurrected, wrong actor ownership, knowledge before reveal, and player-visible `routeStatus/active line`.
- [ ] Require exact insertion context plus preceding/following canonical text for interaction audits.
- [ ] Require all semantically distinct reachable predecessor branches, not default A-only coverage.
- [ ] Preserve editorial-vs-objective distinction: automated assertions prove continuity, not chemistry.
- [ ] Run skill tests.
- [ ] Commit: `docs: harden branch-complete narrative continuity review`.

### Task 4: Formalize release freeze ordering in CEOS

**Files:**
- Modify: `skills/release/SKILL.md`
- Modify: `skills/verification/SKILL.md`
- Add: `policies/release-evidence.md`
- Modify: `src/ceos.mjs` policy mapping
- Add tests.

**Interfaces:**
- Consumes: source/config changes, final commit, local/remote equality, HEAD-bound evidence, packaged RC.
- Produces: a single legal freeze sequence.

- [ ] Write failing scenarios where art/runtime evidence is refreshed, committed, and thereby immediately stale.
- [ ] Verify RED.
- [ ] Encode sequence: finish source/config → commit → establish/push FINAL_HEAD → no more commits → create HEAD-bound evidence → package/test exact RC.
- [ ] Distinguish local/external release blockers so external Yandex evidence does not falsify a bounded local-freeze PASS.
- [ ] Require packaged-RC verification, not source-tree-only verification.
- [ ] Run CEOS tests.
- [ ] Commit: `feat: formalize release evidence freeze order`.

### Task 5: Harden Web reviewer capability truthfulness

**Files:**
- Modify: `global/AGENTS.md`
- Modify: `skills/audit-repair-loop/SKILL.md`
- Modify: `skills/release/SKILL.md`
- Modify: `policies/web-transport.md`
- Add regression tests.

**Interfaces:**
- Consumes: Web preflight state plus actual callable reviewer availability/use.
- Produces: honest `Web used`, `native fallback`, or `BLOCKED` trace.

- [ ] Add failing scenario: preflight READY but no callable CEOS Web reviewer exists.
- [ ] Verify RED.
- [ ] State that READY proves transport configuration only; actual reviewer use requires an observable call/trace.
- [ ] Permit native fallback only where the active contract allows it; never label fallback as Web PASS.
- [ ] Run tests.
- [ ] Commit: `docs: separate Web readiness from reviewer execution`.

### Task 6: Worktree and staging safety at release/audit boundaries

**Files:**
- Modify: `skills/release/SKILL.md`
- Modify: `skills/audit-repair-loop/SKILL.md`
- Reuse/modify: `policies/git.md`
- Add tests if current policy does not already cover these cases.

**Interfaces:**
- Consumes: dirty worktree with known unrelated changes.
- Produces: explicit-path staging and protected unrelated files.

- [ ] Require classification before deletion and explicit staged-path inspection before commit.
- [ ] Prohibit `git add .`, `git add -A`, broad clean/reset/checkout in bounded repair/release tasks.
- [ ] Do not require globally clean worktree when accepted intentional local evidence/art changes are documented.
- [ ] Run CEOS tests.
- [ ] Commit: `docs: harden bounded worktree safety`.

### Task 7: Preserve video-production separation

**Files:**
- Modify only if tests expose gaps: `skills/video-production/SKILL.md`
- Add tests for `gameplay-evidence` vs `promo-trailer`.

- [ ] RED-test that a cinematic promo edit cannot satisfy gameplay evidence automatically.
- [ ] RED-test that Descript project/timeline existence is not proof of exported final MP4.
- [ ] Require actual final file hash/metadata and project-native media validation.
- [ ] Run CEOS tests.
- [ ] Commit only if behavior was not already fully covered.

### Task 8: Full CEOS verification

- [ ] Run `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run self-test`.
- [ ] Run Windows install-isolation CI.
- [ ] Verify global `AGENTS.md` remains under size budget and all new policy files install.
- [ ] Merge through normal PR only after all checks pass.
