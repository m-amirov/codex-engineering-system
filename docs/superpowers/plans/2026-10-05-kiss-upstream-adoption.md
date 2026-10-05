# Kiss Project Upstream-Lessons Adoption Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the newly upstreamed Starter Kit/CEOS contracts to the current game and prove that the next RC closes the recurring local failures without changing accepted narrative/art unnecessarily.

**Architecture:** Upstream first, project adoption second. The game project consumes the released Starter Kit and installed CEOS updates; project-local patches are limited to genuine product-specific defects, starting with explicit SDK bootstrap compatibility.

**Tech Stack:** Existing game runtime, Starter Kit updater, CEOS, Playwright/browser QA, release packager.

**Spec:** Current accepted release line at `e40394c895b88df5d27558ccf04ceb6067287f75` plus the Yandex SDK detection warning observed on 2026-10-05.

## Global Constraints

- Do not modify accepted Episodes 1–10 prose/art unless a new blocker proves it necessary.
- No Yandex Draft write, moderation submit, or publication in this plan.
- Preserve unrelated local evidence/art files.
- Final RC must be deterministic and tied to one frozen release HEAD.

## Review Focus

- Explicit `/sdk.js` bootstrap visible before app module.
- Exactly one `YaGames.init()`.
- Starter Kit status remains clean after docs snapshot review.
- All HEAD-bound evidence is generated after final HEAD and not committed afterward.
- RU/EN media and packaged runtime match the same final HEAD.

---

### Task 1: Adopt released Starter Kit and CEOS hardening

**Files:**
- Project-managed files changed only by the official Starter Kit updater/global CEOS installer.

- [ ] Update Starter Kit source to the new released version and run dry-run against the project.
- [ ] Review every semantic/managed resolution explicitly; no blanket acceptance.
- [ ] Apply update through canonical updater.
- [ ] Install the new CEOS global package through `scripts/install-global.ps1`.
- [ ] Require Starter Kit status clean and self-test PASS.
- [ ] Commit only project-managed source/config changes required by the update.

### Task 2: Repair explicit SDK bootstrap compatibility

**Files:**
- Modify: `index.html`
- Modify only if required: `src/yandex-sdk.js`
- Modify/add: SDK regression tests in the project.

- [ ] Write failing tests proving production HTML lacks a canonical pre-app `/sdk.js` reference or can double-inject/init.
- [ ] Verify RED.
- [ ] Add explicit `<script src="/sdk.js"></script>` before app/module execution.
- [ ] Keep guarded dynamic fallback only where needed; existing `window.YaGames` must prevent a second injection.
- [ ] Prove exactly one `YaGames.init()`, fail-closed production behavior, and valid localhost/file fallback.
- [ ] Run SDK/localization tests and browser startup smoke.
- [ ] Commit: `fix: make Yandex SDK bootstrap explicit`.

### Task 3: Re-freeze release with new evidence lifecycle

- [ ] Finish all source/config changes and create FINAL_RELEASE_HEAD.
- [ ] Push normal fast-forward and verify remote equality.
- [ ] Create fresh route, art, media, localization/SDK evidence against that exact HEAD.
- [ ] Make no commits after FINAL_RELEASE_HEAD.
- [ ] Run release preflight/local freeze; only external Yandex evidence may remain.
- [ ] Build deterministic RC and verify ZIP hash/rebuild equality.

### Task 4: External Draft retest as a separate authorized task

- [ ] Only after explicit user authorization, upload the exact verified RC to Draft 619224.
- [ ] Wait for Archive → Processing → Check → Ready.
- [ ] Test RU and EN Draft runtime/SDK behavior.
- [ ] Record external evidence; do not submit moderation or publish.
