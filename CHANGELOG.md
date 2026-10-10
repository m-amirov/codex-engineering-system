# Changelog

## 0.5.10 — 2026-10-10

- Added explicit `ATTACHMENT_QUOTA_EXHAUSTED` detection for real ChatGPT/Web attachment-limit messages and provider error codes. Generic failed upload or HTTP 429 alone never implies attachment quota.
- Added `ceos web-attachment-block` for active enhanced-review runs: require a locally preserved authentic error excerpt, reject incorrect phase or ambiguous evidence, append an immutable evidence-hashed checkpoint, and terminalize as `BLOCKED` without consuming an art/repair cycle.
- A bridge health response explicitly reporting quota is now a non-ready, non-fallback status. No automated quota-reset guessing, session hopping, model fallback or fake pixel acknowledgement.
- Preserved all previous CEOS runs and Web evidence. Added classification, bridge, immutability and cycle-budget regression tests.

## 0.5.9 — 2026-10-10

- Validated all routed Web High review receipts **before** the first persistent trace write; missing acknowledgement, stale source, invalid strict records, or unresolved earlier findings now stop at ingestion rather than at a later checkpoint.
- Added read-only `ceos routing-trace --dry-run --web-review-file` using the same preflight as the final locked record operation.
- Added an optional immutable run-scope historical cue contract (`ceos run --resolution-contract-file`): exact source lines and source SHA-256 are frozen at creation, and acceptance `historicalExactLines` must match those verified lines before recording.
- Rejects routing metadata writes to terminal or integrity-invalid runs. Existing terminal provenance is never overwritten, reclassified or retroactively accepted.
- Added regression cases for missing cue lines, missing finding-resolution links, changed historical source and zero-mutation dry runs. No product source or visual acceptance threshold is changed.

## 0.5.8 — 2026-10-09

- Added explicit `visual-content` assurance for visual production-art and visual-qa reviews when Codex Web GPT does not expose per-call trusted task/trace IDs; `strict` remains the default for all workflows.
- Required independent pixel-specific observations, received-image identities, source HEAD and local screenshot SHA-256, with physical image-hash checks on routing-trace ingest and resume.
- Prevented recycling the same Web review artifact across independent stages and retained fail-closed handling of missing pixels, invalid or stale evidence and unresolved findings.
- Added CLI flags (`--assurance`, `--web-review-assurance`), regression tests and policy guidance; no project release validator or Yandex compliance gate is altered.


## 0.5.7 — 2026-10-08

- Migrated all three CEOS-managed Web subagents to explicit GPT-6 Sol High (`chatgpt-web/gpt-6-sol`) while preserving native model routing and reasoning-only boundaries.
- Updated Windows hybrid installation, global instructions and live preflight route validation for Codex Web GPT 6.1.6+.
- Added fail-closed validation for legacy GPT-5.6 aliases and missing or duplicate managed agents; bridge READY alone is not a substantive Web response.
- Added regression tests and Windows CI Web-on installation verification, while retaining historical run compatibility.


## 0.5.6 — 2026-10-08

- Added enhanced Web High delegation gates for engine-backed runs: analysis, post-repair midpoint, and fresh acceptance, with deterministic midpoint skipping for zero-defect audits.
- Added source-HEAD-bound review receipts with explicit evidence receipt, actual-pixel, findings, unresolved-item, and evidence-integrity checks.
- Added standalone `ceos web-plan` and `ceos web-review-verify` commands for non-engine workflows.
- Preserved native-only evidence collection, implementation, writes, debugging, and final verification; the CLI records host-provided review receipts and does not invoke Web agents itself.
- Hardened native fallback acceptance so semantic reviewer outcomes cannot be relabeled as transport failures.

## 0.5.5 — 2026-09-28

- Added explicit `ceos resume --reopen-blocked --reason` recovery for terminal runs stopped by supported recoverable external blockers.
- Preserved immutable terminal checkpoints and appended persisted `RUN_REOPENED` lifecycle events with prior verdict, stop reason, reopen reason, cycle, and optional evidence.
- Reopened runs return to the blocked stage, including production-art visual review, without restarting generation or rewriting scope history.
- Rejected automatic capability reopen and fail-closed on PASS, FAIL, ESCALATE, integrity failures, and unsupported/manual blockers.
- Added CLI and execution-engine regression coverage for lifecycle recovery, history, scope integrity, terminal verdicts, and production-art stage restoration.

## Unreleased — 2026-09-25

- Added a shared Web transport/rate-limit policy for CEOS Web High routes, with explicit separation of semantic REWORK/FAIL from transport failures.
- Added conservative anti-burst pacing for attachment-heavy review, bounded 120s → 300s → 600s rate-limit cooldown, and bounded attachment-only retry handling that does not consume generation/repair cycles.
- Added runtime-UI vs baked-UI guidance for visual review so production dialogue/navigation chrome is not misclassified as image content.
- Extended `ceos web-preflight` to report explicit `RATE_LIMITED` state for HTTP 429 / bridge cooldown signals and preserve Retry-After when available.
- Added regression coverage ensuring visual workflows resolve the new policy and preflight classifies rate limits deterministically.


## 0.5.1 — 2026-09-18

- Changed Windows/global installation to build a temporary `npm pack` archive and install the archive instead of running `npm install -g` directly against the CEOS Git worktree.
- Added fail-closed validation for npm pack JSON metadata and archive existence before global installation.
- Added guaranteed cleanup of the temporary package directory.
- Added `.gitattributes` with deterministic LF rules for CEOS source/text files, including `*.mjs` and `*.ps1`.
- Added regression tests ensuring the installer cannot regress to `npm install -g $Root`.
- Added a real `windows-latest` CI smoke that installs CEOS with `-Web off`, verifies `ceos version`, checks that the global npm package is not a reparse-point link back to the repository, and asserts the source worktree remains clean after installation.
- No changes to the 0.5.0 execution-engine state machine, routing semantics, Skills, or production safety contracts.

## 0.5.0 — 2026-09-18

- Added the deterministic execution engine for `audit-repair-loop` and `production-art`.
- Added `ceos capabilities` with live Web-preflight integration plus explicit host attestation for native Image Gen.
- Added durable project-local run state under `.ceos-runs/` with immutable scope locks, refreshable capability snapshots, atomic JSON writes, and checkpoint history.
- Added `ceos run`, `ceos checkpoint`, `ceos resume`, `ceos run-status`, and `ceos routing-trace`.
- Enforced legal stage transitions and bounded repair/regeneration cycles mechanically instead of relying only on prose instructions.
- Added SHA-256 provenance for checkpoint evidence and `INTEGRITY_BLOCKED` resume behavior when persisted evidence changes or disappears.
- Added deterministic no-defect repair skipping while still requiring verification and fresh re-audit.
- Added final-PASS routing enforcement: READY Web cycles require observable appropriate Web review unless a permitted non-required transport fallback is explicitly recorded.
- `--web-required` now creates a durable BLOCKED run when Web is unavailable and can reopen after a READY capability refresh.
- Production-art generation is mechanically gated on `imageGeneration.status=available`.
- Preserved reasoning-only Web boundaries, production-write safety, Starter Kit policy, existing verification/evidence commands, and 0.4.0 production-art contracts.
## 0.4.0 — 2026-09-17

- Added the `production-art` Skill for asset inventory/manifest → visual canon → Web art direction → native image generation/integration → runtime visual QA → fresh consistency re-audit.
- Added `ceos_art_director_web` (`chatgpt-web/high`) as a reasoning-only Web role for character/location/style canon, generation briefs, contact-sheet review, scene-to-art mapping, and visual consistency critique over supplied evidence.
- Added native `ceos_asset_generator` (`gpt-5.6` medium, workspace-write) for bounded generation and integration of real project assets when the current Codex runtime actually exposes image generation.
- Production-art now fails closed with `BLOCKED` when required image-generation capability, references, permission, or essential evidence are unavailable; it must not fabricate image files or claim placeholder output as production completion.
- Registered the new Skill and native agent in global installation, `global-status`, routing manifests, checksums, and `ceos context` policy resolution.
- Extended hybrid installation to install/remove the CEOS-managed `ceos_art_director_web` route and record it in `hybrid-routing.json` without changing the reasoning-only Web contract.
- Added routing/evidence requirements for image-generation capability, generated/integrated asset counts, Web agents used, and fallback state.
- Preserved project-native runtime verification: actual asset files, mappings, fresh desktop/mobile evidence, visual QA, and relevant test/lint/build gates remain native/tool-backed.
- Added regression coverage for the production-art capability boundary, Web art-director route, native asset-generator route, skill registration, and installation shape.

## 0.3.3 — 2026-09-17

- Fixed `ceos web-preflight` on Windows when `hybrid-routing.json` contains a UTF-8 BOM written by Windows PowerShell.
- The Web routing manifest reader now strips a leading UTF-8 BOM before `JSON.parse`, preserving compatibility with already-installed 0.3.2 manifests.
- `scripts/install-hybrid.ps1` now writes `hybrid-routing.json` using explicit UTF-8 without BOM across Windows PowerShell and PowerShell 7.
- Added regression coverage for BOM-prefixed manifests and for BOM-free installer writes.

## 0.3.2 — 2026-09-17

- Added an explicit **scope lock** to `audit-repair-loop`: user-selected target, in-scope/out-of-scope surfaces, acceptance contract, and mutation boundary are frozen before audit.
- Prevented release/publication/submission assets from hijacking product/content/runtime audit verdicts unless the user explicitly requested release readiness.
- Added `ceos web-preflight` to distinguish configured Web routing from a live, healthy `codex-chatgpt-web` runtime via `/healthz`.
- Made Web routing observable in `audit-repair-loop`: when hybrid routing is enabled and preflight is `READY`, each substantive audit cycle must actually use `ceos_bulk_checker_web` and/or `ceos_reasoner_web`.
- Added required routing trace fields (`web_preflight_status`, `web_agents_used`, fallback usage/reason) so Web-backed audit claims cannot be silent or inferred.
- Preserved one deterministic native fallback for transport/backend/runtime unavailability; explicit user requirements for Web review now become `BLOCKED` when Web is unavailable.
- Added regression coverage for runtime preflight states, scope drift prevention, and mandatory observable Web audit routing.

## 0.3.1 — 2026-09-17

- Added the universal `audit-repair-loop` Skill for product-agnostic audit → remediation → native repair → verification → fresh re-audit workflows.
- Added a structured consolidated remediation-packet contract instead of emitting isolated fix prompts for interacting defects.
- Kept fresh repository/tool evidence, implementation, debugging, verification, and all writes on native Codex routes; Web routes remain reasoning-only over explicitly supplied evidence.
- Added a default maximum of three automatic repair cycles plus `PASS`, `FAIL`, `BLOCKED`, and `ESCALATE` outcomes and no-progress stop conditions.
- Required fresh post-repair evidence and re-audit against the original acceptance contract to reduce self-confirmation of previous recommendations.
- Registered the new Skill in global installation, status/evidence policy resolution, and repository/Skill-shape regression coverage.
- Preserved read-only production defaults and the existing single Web → native transport/backend fallback contract.

## 0.3.0 — 2026-09-17

- Added optional native / ChatGPT Web model routing without making `codex-chatgpt-web` a CEOS runtime dependency.
- Corrected the Web integration contract to **reasoning-only by default**: MCP / Full Harness is not required or assumed.
- Added `ceos_bulk_checker_web` (`chatgpt-web/light`) for repetitive analysis over complete evidence bundles already supplied by the parent.
- Added `ceos_reasoner_web` (`chatgpt-web/medium`) for architecture reasoning, hypothesis comparison, planning, synthesis, and critique over supplied context.
- Removed the earlier `ceos_explorer_web` route because Browser-only Web models cannot independently inspect repository state; fresh file/repository/tool evidence stays native.
- Kept native `ceos_bulk_checker` and `ceos_explorer` for tool-backed batch checks and repository exploration.
- Kept implementation, ambiguous debugging, security/production review, and final verification on native Codex models for the 0.3.0 critical path.
- Added packaged Windows launcher detection at `%LOCALAPPDATA%\Programs\Codex Web GPT\Codex Web GPT.exe` in addition to legacy CLI-style detection.
- Updated `$CODEX_HOME/ceos/hybrid-routing.json` to schema v2 with `routingMode: reasoning-only`, `mcpRequired: false`, and `localToolsAssumed: false`.
- Added safe migration/backups for the earlier CEOS-managed `ceos_explorer_web` definition.
- Fixed Windows `install-global.ps1` forwarding of `-Web` / `-CodexHome` to `install-hybrid.ps1` by using named PowerShell hashtable splatting; added regression coverage for the exact failure.
- Preserved deterministic fallback: at most one Web → native fallback, only for backend/transport/runtime unavailability; semantic outcomes never trigger hidden reruns.
- Preserved project manifest schema v1, Evidence schema v1, seven Skills, five Profiles, and the six native 0.2.0 routes.

## 0.2.0 — 2026-09-16

- Added global Codex installation via `ceos install-global`.
- Added automatic multi-model routing through six personal custom agents.
- Added `ceos routing` and `ceos global-status`.
- Added managed global-instructions merge with `AGENTS.override.md` precedence and user-text preservation.
- Added global user-Skill installation as part of the one-time setup.
- Added checksummed installation manifest and drift detection.
- Added dry-run planning, conflict fail-closed behavior, `--force` replacement, and timestamped backups.
- Added isolated fake-home regression coverage for global installation/idempotency/override/drift/conflicts.
- Preserved project manifest v1 and existing project Gate/Evidence behavior.

## 0.1.1 — 2026-09-14

- `init` now inspects real `package.json` scripts and filters profile gates to commands that exist.
- Yandex Games E2E auto-detection recognizes `test:e2e`, `e2e`, `test:browser`, `test:playwright`, and `test:e2e:prod`.
- Twork integration auto-detection recognizes common integration/E2E/browser aliases.
- `doctor` separates command-risk checks from npm-script existence checks.
- `verify` preflights configured npm commands and records `CONFIGURATION_ERROR` without executing missing scripts.
- Non-zero test-like gates are tagged `TEST_FAILURE`; other non-zero commands are tagged `COMMAND_FAILURE`.
- Added `ceos failures` with evidence auto-discovery and configurable stdout/stderr tailing.
- Evidence schema accepts `CONFIGURATION_ERROR`.
- Added regression coverage for the first real Yandex Games pilot failure mode.

## 0.1.0 — 2026-09-14

- Initial CEOS core.
- Seven workflow Skills.
- Five project Profiles.
- R0–R3 safety model and read-only production default.
- Project manifest loader with JSON/restricted-YAML support.
- `ceos init/status/doctor/gates/verify/evidence/profile/self-test` CLI.
- Safe verification runner that blocks R2/R3-like commands.
- Machine-readable evidence bundles and validator.
- Codex-discoverable Agent Skills with standard metadata and optional `agents/openai.yaml`.
- Repo/user skill installation via copy or link.
- On-demand `ceos context` resolution for profile + policy loading.
- Node built-in regression suite.
