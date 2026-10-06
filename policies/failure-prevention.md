# Failure Prevention Policy

This policy is the durable engineering memory for recurring failure classes. It is loaded by every CEOS resolved context. Project profiles and repository instructions may add stricter rules but may not weaken these protections.

## Core rule

A confirmed recurring defect is not complete when the immediate symptom is fixed. Close the loop as:

reproduce → classify → identify root cause → repair → regression coverage → durable rule/gate → fresh verification.

Do not encode an unproven hypothesis as a root cause. Record uncertainty explicitly.

## 1. Contract, profile and scope identity

- Resolve the actual repository profile before work. A plausible but wrong profile is a configuration defect, not an acceptable fallback.
- Freeze the user-selected audit/release target, mutation boundary and acceptance contract before broad work.
- Concept, product repair, visual acceptance, platform compliance and release readiness are distinct scopes. Do not silently expand one into another.
- Do not claim use of a skill, tool, agent, browser, model route or capability that is not actually installed/callable in the current environment.
- A routing/preflight result such as READY means the route can be attempted; it is not proof that the delegated review ran or received its evidence.

## 2. Repository identity, worktrees and release lineage

Before mutation record repository identity, worktree path, branch and HEAD. Preserve unrelated work.

For release, recovery, hotfix or evidence continuation, also record the expected base/ref and starting HEAD. If the active HEAD is not the expected commit or a proven descendant where descendants are allowed, stop as a base/lineage mismatch. Do not repair the mismatch by silently checking out another branch, resetting, stashing, cleaning or overwriting a parallel worktree.

A dirty worktree is evidence. Release profiles may require it to be clean; ordinary repair work must preserve unrelated changes.

## 3. Managed infrastructure, migrations and drift

- Never replace managed-file integrity with checksum substitution, rollback to an older policy, or acceptance of drift merely to make a gate green.
- Update/migration flows require an explicit profile, ownership classification and non-mutating dry run before applying changes when the project tooling supports it.
- Preserve project-owned runtime/content. Treat semantic merge, accept-current and take-incoming as different operations.
- Cross-platform text bytes are part of managed integrity. Line-ending/EOF drift must be prevented by repository policy and regression coverage.
- Update success requires idempotency and final status evidence; "files copied" is not enough.

## 4. Evidence domains do not substitute for one another

Keep these domains separate: functional/tests, runtime behavior, visual pixels, authored narrative/content, platform/manual portal evidence, media, package/artifact integrity, and external infrastructure.

A PASS in one domain cannot promote a broader verdict. Examples:

- unit/E2E PASS does not prove visual acceptance;
- DOM/overflow assertions do not prove composition;
- local SDK mocks do not prove authenticated platform/Draft behavior;
- Web reasoning does not prove repository state;
- provider/harness PASS does not override official platform failures;
- file existence does not prove the asset is correctly mapped or visibly usable;
- successful export metadata does not prove video content quality.

Required evidence must be fresh for the current commit/build/configuration and tied to the exact claim.

## 5. Visual and mobile regressions

Visual acceptance requires actual current-runtime pixels. Paths, filenames, OCR, DOM dumps and "screenshot created" messages are insufficient.

For affected responsive/full-bleed surfaces record viewport, state/cue, four-edge coverage, document/internal scroll, primary-action overlap and text readability. If cropping uses cover/focal positioning, inspect the actual composition at target viewports; distinguish a global layout defect from a source-asset/focal-point defect before changing shared CSS.

Browser/capture failure is BLOCKED/EVIDENCE_GAP, never visual PASS.

## 6. Test, harness and configuration adjudication

Do not collapse every red command into "product bug".

Classify at minimum:

- TEST_FAILURE: an existing test executed and behavior/assertion failed;
- CONFIGURATION_ERROR: required command/script/profile/fixture wiring is missing or invalid;
- COMMAND_FAILURE: a non-test command executed and failed;
- HARNESS_DEFECT: driver/browser/fixture behavior is unsupported by a minimal reproduction;
- PRODUCT_DEFECT: runtime/product behavior is independently reproduced.

Before changing production code for unstable browser/UI automation, reproduce the interaction on a minimal/native fixture when practical and inspect targeting, overlays and emitted input events. Locale-sensitive assertions must verify the active locale rather than assume one. Stale fixtures must be repaired as fixtures unless current product behavior violates the contract.

For a bug fix, prefer RED → GREEN regression coverage that would fail if the root cause returns.

## 7. Narrative and branching systems

A default-path or "always choose option A" runner is not branch-complete semantic evidence.

For authored branching content, audit every materially reachable branch affected by the change and verify chronology, location/presence, knowledge, objects, promises/payoffs, consent/boundaries, route/status predicates, choice preconditions and ending causality. Shared scenes need not be re-read redundantly, but alternate branches cannot be inferred from the default route.

Localization state and saves must follow the project contract; do not bake one locale into progression/state unless explicitly designed.

## 8. Native capability and trust boundaries

A capability required for production work must be fresh, callable and bound to the current run/session/turn according to the active CEOS contract.

For native image generation, stale files, environment variables, manual claims, old session markers or an earlier run cannot unlock generation. Missing/untrusted capability evidence is BLOCKED. A generated asset is not real until the file exists in the workspace and integration/mapping is verified.

## 9. Platform/manual and external evidence

Authenticated portals, moderation/Draft state, production services and external providers are separate evidence surfaces.

- Never start an authenticated or mutating platform workflow implicitly.
- Local/static/runtime harness results cannot self-approve manual portal requirements.
- Optional external providers are advisory unless the project profile explicitly makes them mandatory.
- Network/DNS/provider/GitHub outages are infrastructure blockers. Report them separately from product correctness and do not convert them into either product PASS or product FAIL.

## 10. Release and media integrity

Release readiness requires the exact release source identity plus all profile-required domains. Validate the final production artifact, not only the development server.

When applicable verify artifact inventory, archive root/path policy, hashes, excluded dev/harness/media files, media metadata and manual media review. Inspect opening/closing rendered media frames when they are user/platform-visible; metadata-only validation cannot catch an accidental menu, blank, debug or stale frame.

Do not declare a release ready while any mandatory gate is missing, stale, blocked, or attached to a different commit/build.

## 11. Efficiency without weakening evidence

Use targeted reads/tests during iteration, one final barrier after relevant state changes, and persisted checkpoints. Do not repeat green suites against unchanged inputs, spawn redundant agents, or replace a focused task with oversized prompts.

Token/context economy may remove duplication; it may not remove a required independent review, platform gate, current-runtime evidence or regression check.

## Incident promotion checklist

When a defect class is worth institutionalizing, record:

1. symptom and affected surface;
2. confirmed root cause or explicit UNKNOWN;
3. why existing protection missed it;
4. durable prevention rule;
5. mechanical regression/gate where practical;
6. evidence required for PASS;
7. stop/BLOCKED condition;
8. scope: universal policy, profile, project skill, or project-only rule.

Prefer mechanical enforcement over prose-only memory whenever the invariant is deterministic.
