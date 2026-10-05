# Starter Kit Yandex Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert recurring Yandex Games development/release failures into Starter Kit-managed contracts, validators, updater ownership rules, and regression tests.

**Architecture:** Keep project-specific product logic in projects, but move platform invariants and release-evidence lifecycle rules into the Starter Kit. Prefer executable validators over prose where a condition is mechanically checkable; use managed/semantic ownership correctly for files that legitimately mutate during project life.

**Tech Stack:** Node.js 22, Starter Kit updater, JSON/YAML contracts, Node test runner.

**Spec:** Lessons observed during `kiss-at-the-edge-of-the-world` development through 2026-10-05.

## Global Constraints

- Official current Yandex documentation remains authoritative over local rules.
- Never auto-submit moderation or publish.
- Mature projects update only through the canonical Starter Kit updater; no parallel infrastructure.
- A PASS must be tied to the exact tested build/HEAD.
- User/product files and intentional unrelated worktree changes must be preserved.

## Review Focus

- Explicit SDK bootstrap must be statically detectable and must not double-init.
- Mutable reviewed documentation snapshots must not be treated as immutable managed drift.
- Declared locales/product counts must match the actual release contract before RC.
- HEAD-bound evidence must not invalidate itself when committed.
- First-publication media must be locale-correct, real gameplay, and excluded from the game ZIP.

---

### Task 1: Add a first-class Yandex SDK bootstrap validator

**Files:**
- Create: `tools/yandex/sdk-validation.mjs`
- Create: `tests/starter-kit/yandex-sdk-validation.test.mjs`
- Modify: `package.json`
- Modify: `config/manifest-entries.json`
- Modify: `.codex/skills/yandex-release-validation/SKILL.md`
- Modify: `docs/YANDEX_REQUIREMENTS_CHECKLIST.md`

**Interfaces:**
- Consumes: target project root, production `index.html`, project SDK wrapper/source.
- Produces: machine-readable PASS/BLOCK with explicit findings for SDK bootstrap order and duplicate-init risk.

- [ ] Write failing tests for: missing explicit `/sdk.js` in production HTML; SDK script after app module; duplicate SDK script injection; more than one reachable `YaGames.init()`; production silent local fallback; localhost/file fallback allowed.
- [ ] Run `node --test tests/starter-kit/yandex-sdk-validation.test.mjs` and verify RED.
- [ ] Implement validator with static HTML/source checks and a narrow contract that requires canonical explicit SDK bootstrap before app execution while still allowing a guarded dynamic fallback.
- [ ] Add `yandex:sdk:validate` to Starter Kit scripts and target scripts.
- [ ] Wire the validator into release-validation instructions and checklist.
- [ ] Run targeted test, then `npm run test:updater` and `npm run starter-kit:self-test`.
- [ ] Commit: `feat: validate explicit Yandex SDK bootstrap`.

### Task 2: Fix reviewed Yandex documentation snapshot ownership

**Files:**
- Modify: `config/manifest-entries.json`
- Modify: `tools/starter-kit/update-engine.mjs`
- Modify: `tests/starter-kit/target-aware-updater.test.mjs`
- Modify: `tests/starter-kit/yandex-docs-watch.test.mjs`
- Modify: `docs/STARTER_KIT_UPDATES.md`

**Interfaces:**
- Consumes: project-accepted `config/yandex-doc-snapshot.json` created by the supported docs-review flow.
- Produces: clean Starter Kit status after legitimate snapshot acceptance, while still detecting unreviewed arbitrary changes.

- [ ] Write a failing updater scenario proving that a snapshot legitimately accepted by `yandex:docs:accept-snapshot` must not become ordinary immutable managed drift.
- [ ] Verify RED with the focused updater test.
- [ ] Change snapshot ownership from plain `managed/replace-if-baseline` to a semantics-aware model that permits explicit project review while preserving conflict detection when upstream Starter Kit changes.
- [ ] Add a regression proving arbitrary edits remain blocked and reviewed semantic acceptance remains clean/idempotent.
- [ ] Run updater/self-test suites.
- [ ] Commit: `fix: make reviewed Yandex snapshot semantics-aware`.

### Task 3: Add project-contract drift validation before release

**Files:**
- Create: `tools/yandex/project-contract-validation.mjs`
- Create: `tests/starter-kit/yandex-project-contract-validation.test.mjs`
- Modify: `package.json`
- Modify: `config/manifest-entries.json`
- Modify: `.codex/skills/yandex-release-validation/SKILL.md`
- Modify: `.codex/skills/release-audit/SKILL.md`

**Interfaces:**
- Consumes: `game-spec.yaml`, project-provided localization completeness evidence, runtime/content summary evidence.
- Produces: BLOCK when declared episodes/locales/features disagree with the release evidence.

- [ ] Write failing tests for stale episode count, declared EN without complete EN evidence, enabled audio with no production audio evidence, and declared locale missing first-publication media.
- [ ] Verify RED.
- [ ] Implement a generic contract checker that reads project evidence rather than inferring narrative/game internals.
- [ ] Add release barrier requirements for exact declared locale coverage and declared feature presence.
- [ ] Run tests/self-test.
- [ ] Commit: `feat: block stale release contract declarations`.

### Task 4: Encode final-HEAD evidence lifecycle

**Files:**
- Modify: `.codex/skills/release-audit/SKILL.md`
- Modify: `.codex/skills/yandex-release-validation/SKILL.md`
- Modify: `.starter-kit/core/CODEX_ENGINEERING_SYSTEM.md`
- Create: `docs/HEAD_BOUND_RELEASE_EVIDENCE.md`
- Add/modify tests under `tests/starter-kit/` for the documented release contract.

**Interfaces:**
- Consumes: source/config commit history and HEAD-bound runtime/art/media evidence.
- Produces: deterministic release order: source/config finalization → final HEAD → no more commits → HEAD-bound evidence → RC.

- [ ] Add a failing contract test that rejects a workflow claiming final art/runtime evidence from a HEAD different from the frozen release HEAD.
- [ ] Verify RED.
- [ ] Document and enforce the distinction between commit-bound durable evidence and local HEAD-bound freeze evidence.
- [ ] State explicitly that committing a HEAD-bound record after freeze invalidates it and is prohibited unless the evidence scheme itself is content-addressed independently of HEAD.
- [ ] Require remote release HEAD equality before local freeze evidence is generated.
- [ ] Run tests/self-test.
- [ ] Commit: `docs: formalize final HEAD evidence lifecycle`.

### Task 5: Harden first-publication video production and validation

**Files:**
- Modify: `.codex/skills/yandex-release-validation/SKILL.md`
- Modify: `tools/yandex/media-validation.mjs`
- Modify: `tests/starter-kit/yandex-release-validation.test.mjs`
- Modify: `templates/media/HORIZONTAL_GAMEPLAY_VIDEO.md`

**Interfaces:**
- Consumes: locale-specific final gameplay video manifest and actual MP4 files.
- Produces: validated final-gameplay-videos evidence with no release-ZIP contamination.

- [ ] Add tests for blank/loading first frames where evidence marks gameplay as already started, duplicate RU/EN file reuse with localized text, stale source HEAD, and video manifest hash mismatch.
- [ ] Verify RED.
- [ ] Extend evidence schema/validator with source HEAD/build provenance and representative-frame/manual review requirements without pretending to automate subjective review.
- [ ] Reference CEOS `video-production` when available, while keeping Starter Kit independent from external editor availability.
- [ ] Run media/updater/self-test suites.
- [ ] Commit: `test: harden first-publication gameplay video evidence`.

### Task 6: Full Starter Kit regression and release

**Files:**
- Modify only version/release files required by the Starter Kit's existing release process.

- [ ] Run `npm run test:updater`.
- [ ] Run `npm run starter-kit:self-test`.
- [ ] Run `npm run starter-kit:status` against representative mature-project fixtures.
- [ ] Run Yandex requirements, Console, docs-watch fixture tests, SDK validator, project-contract validator, and media validator.
- [ ] Verify package/update idempotency.
- [ ] Release through the existing Starter Kit process; do not manually bypass package/manifest generation.
