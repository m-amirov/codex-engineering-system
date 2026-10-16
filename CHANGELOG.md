# Changelog

## 0.5.31 — 2026-10-16

- Added `ceos art-output-import` to safely materialize an existing local native Image Gen PNG into a project path before `art-output-verify`, with mandatory complete SHA-256, decoded image/dimension gate, byte-exact verification, atomic no-clobber destination and idempotent matching-file recheck.
- Producer instructions now require an actual local binary delivery path before image generation, never confuse visual chat output with a saved asset and stop after transport failure rather than re-spending the generation budget.
- Added negative regression tests for missing source, truncated/wrong hash, non-PNG bytes, wrong dimensions, escaping output paths and overwrite of existing art.
- Does not extract bytes from chat-only images, invoke native Image Gen, restore the missing S24 portrait or automatically reopen terminal Stage 9.4 run `f2c045`. Existing accepted S19–S23 remain immutable.


## 0.5.30 — 2026-10-16

- Fixed contradictory producer-side guidance for CURRENT_TURN runs: null `producerParentSessionId` is an intentional deferred binding, not a mismatch after authoritative `ceos producer-route-check` PASS.
- Updated installed Terra agent TOML, global instructions, production-art skill, model/art policies and routing docs to make the parent orchestrator the sole owner of run-scoped producer route verification. The child checks its own callable Image Gen separately and must not use the legacy pinned-parent field.
- Clarified low-level `inspectNativeProducerRoute` error for callers omitting an effective parent. Added regression coverage: CURRENT_TURN with null persisted parent passes authentic Terra route, while a genuinely unrelated child still returns `BLOCKED_NATIVE_AGENT_PARENT_MISMATCH`.
- No changes to the Stage 9.4 run, accepted art S19–S23 or S24–S26 PNGs. Route PASS does not imply Image Gen invocation or artistic acceptance.


## 0.5.29 — 2026-10-16

- Replaced overly strict post-challenge turn equality with a bounded (30-minute) run/parent-session Image Gen capability window. Challenge issuance and response still require the exact original trusted session and turn, and the current worktree host must still be valid.
- Same-session Codex follow-up turns no longer invalidate the consumed attestation before authentic Terra producer-route verification. Different sessions, expired attestations, invalid challenge identity/timestamps and missing active host are blocked.
- New attestations carry `trustScope=run-session-window`; previous `run-session-turn` receipts remain compatible within the bounded window and verified parent session.
- Regression tests cover session rollover, cross-session isolation, 30-minute expiry and challenge consumption after a turn switch; producer model/role/parent and PNG/visual gates remain strict.
- Stage 9.4 run `f2c045`, S19–S23 accepted art, S24–S26 briefs and image outputs are not modified.


## 0.5.28 — 2026-10-16

- Kept root `UserPromptSubmit` session/turn binding intact when a native child emits a hook with `subagent` metadata. Child hooks no longer overwrite the current worktree host or parent lifecycle, avoiding a spurious `turn mismatch` in fresh run-scoped Image Gen attestation.
- Added hook and challenge regression tests: child hook preserves parent marker/attestation, child cannot invent root authority, a real new root turn still invalidates old attestation.
- Did not change Terra Medium policy: a genuine `gpt-5.6-luna` child rollout remains `BLOCKED_NATIVE_AGENT_MODEL_MISMATCH`. No route verification, PNG generation, recovery run or accepted-art changes are implied.


## 0.5.27 — 2026-10-16

- Introduced execution-bound host trust for native producer selection: CEOS selects the current matched worktree-scoped UserPromptSubmit session/turn, treating prior active lifecycles lacking SessionEnd as read-only diagnostic history instead of a blanket execution blocker.
- Old lifecycle files remain untouched; current host and session+turn markers must agree, current cwd/age must match, and stale or corrupted current contexts fail closed.
- Run-scoped image generation challenge remains single-use and bound to this exact execution. Terra child JSONL, model/role/parent identity, output checks and exclusive continuation claim are unchanged.
- Added regression coverage for the S24–S26 two-lifecycle scenario, new SessionStart lacking turn, tampered current turn, cross-worktree isolation, and end-to-end challenge/attestation without trusting the previous lifecycle.
- No actual Image Gen invocation, automatic asset acceptance or game run modification.


## 0.5.26 — 2026-10-16

- Fixed the self-referential Git HEAD cycle for committed S24–S26 production-art briefs: `sourceHead` may be the source ancestor when all intervening changes consist exclusively of newly committed Stage 9.4 brief JSONs pinned to that same source.
- The art brief validator verifies the complete intervening Git diff, exact Git blob bytes, committed brief path, scene ID and existing reference image hashes. Stale source inputs, modified/uncommitted briefs and unrelated evidence remain blocked.
- `ceos art-brief-verify` forwards its explicit brief path so in-memory caller claims without a committed file cannot use this exception.
- Added success/fail-closed CLI and programmatic regression tests. No run re-creation, native generation, Web High or automatic Git writes.


## 0.5.25 — 2026-10-16

- Fixed `ceos producer-route-check` for `CURRENT_TURN` production-art runs: it now resolves the effective parent from the live run-scoped image-generation attestation and matching persisted capability snapshot, not the intentionally null `producerParentSessionId`.
- Centralized producer parent resolution with the `GENERATING` checkpoint to prevent route-check/checkpoint divergence, while rejecting stale turns, absent capability grants and unrelated Terra children.
- Added CLI and engine regression coverage for current-turn preflight, missing/stale attestation, unrelated child parent and historical pinned-parent compatibility.
- Read-only route preflight does not mutate runs, invent traces, or generate images. Existing S19–S23 evidence and Stage 9.4 run remain unchanged.


## 0.5.24 — 2026-10-16

- Added explicit `ceos run-relocate` preview and SHA-confirmed `--apply` for moved, pre-generation production-art runs. Original metadata is backed up with a relocation receipt; hash and Git ancestry checks are mandatory.
- `ceos continue` now detects an incorrect `projectDir` even when original absolute evidence paths still exist, and supplies an actionable relocation preview instead of reporting a misleading success.
- Restricts relocation to clean canonical `CANON_READY → GENERATING` runs with no native producer, generation or Web review receipts. Preserves source history and checkpoint count; no Image Gen, Web, implicit trust or automatic migration.
- Added relocation safety regression tests and portable worktree documentation. Session/turn trust remains mandatory only for native generation operations, not planning or relocation.


## 0.5.23 — 2026-10-16

- Isolated CEOS SessionStart/UserPromptSubmit freshness markers by canonical Git worktree path and Codex session ID instead of relying on shared last-writer-wins global markers.
- `ceos continue`, linked native parent creation, and Image Gen capability challenges now select the requested project's host-observed hook context, independent of other worktrees' sessions.
- Fail closed on multiple fresh sessions for the same worktree, corrupt or stale markers, and cross-worktree borrowing. Legacy-global migration is allowed only when both cwd fields resolve to the requested project and no scoped records exist.
- Active lifecycle and scoped turn markers cannot establish a trusted producer parent without a matching live worktree session/turn binding; missing or mismatched bindings return `BLOCKED_ACTIVE_LIFECYCLE_CURRENT_TURN_UNBOUND`.
- Added parallel-session and trust-boundary regression tests. No native Image Gen, Web High, or unattended generation is introduced.


## 0.5.22 — 2026-10-16

- Fixed linked session recovery for historical scopes containing the source-bound `resolutionReceiptContract`. CEOS now revalidates the locked exact lines and evidence SHA-256 and reconstructs the contract through normal run creation without changing scope, evidence, or source run.
- Rejects unsupported scope extensions, missing locked source hashes, and changed historical receipt sources, with regression coverage for recovery and non-recovery.
- Existing fresh session and Git/canon currentness boundaries remain in force; this release does not relax canon source-HEAD checks or automatically invoke Image Gen.


## 0.5.21 — 2026-10-16

- Added automatic session-only linked recovery to ordinary `ceos continue` for eligible narrative production-art runs waiting at `GENERATING` after the Codex parent session changes.
- Preserves the source run and accepted CANON_READY evidence, pins provenance hashes, creates a new session-bound run, and resets generation capability trust pending a fresh run/session/turn challenge.
- Keeps inspect and dry-run read-only; blocks stale/untrusted hooks, dirty or changed Git source, invalid canon, conflicting recovery locks and unrelated art output failures. Adds idempotence and regression coverage.
- No automatic image generation, Web High review, merge, or release execution.


## 0.5.20 — 2026-10-15

- Added ceos continue: persisted one-step planning (inspect/guided/auto), read-only default, fail-closed run selection/integrity/Git checks, atomic per-run action claims and safe token release.
- Added ceos-continue Codex host skill; the Node CLI never claims to invoke Web High, Image Gen or mark checkpoints complete.
- Uses existing blocked-run recoverability classification rather than bypassing terminal checkpoints, provider attestations or producer-route gates.
- Added continuation tests, documentation and global skill registration. Project-level cross-episode workflow scheduling remains outside the V1 contract.

## 0.5.19 — 2026-10-15

- Replaced the 32-MiB whole-file native Terra rollout parser with bounded incremental JSONL scanning and a SHA-256 digest of all original bytes. Real >32-MiB Codex traces no longer fail solely because of file size.
- Preserved strict parent/child identity, genuine sessions-path, single session_meta, all turn_context model/effort checks, complete-record JSON integrity, and fail-closed producer-route attestation.
- Limited source file size to 512 MiB and any JSONL record to 64 MiB; detect source changes during read. Added >32-MiB and adversarial regression tests.
- Historical terminal CEOS runs and producer receipts remain immutable; existing blocked runs require the supported new-run recovery path.

## 0.5.18 — 2026-10-15

- Carried dependency-based currentness through the production-art state machine's `INTEGRATED` and final narrative dual-format checks.

## 0.5.17 — 2026-10-15

- Propagated `DEPENDENCY_BASED_REUSE` currentness to the narrative dual-format manifest validator so source-bound scene mappings remain fail-closed across history-only HEAD changes.

## 0.5.16 — 2026-10-15

- Added explicit `DEPENDENCY_BASED_REUSE` currentness for existing-art recovery when Git HEAD changes but all source-bound dependency hashes remain identical.
- Dependency-based reuse keeps the base-head provenance anchor, validates every dependency against the current checkout, and rejects mismatched base heads or changed bytes.

## 0.5.15 — 2026-10-15

- Added explicit `VERIFIED_EXISTING_ART_REUSE` production-art mode for source-bound reuse of already accepted assets without invoking Image Gen.
- Added fail-closed actual-file, SHA-256, PNG, portrait/desktop, manifest, dependency, provenance, runtime-pixel, canon, independent-art-acceptance and blocking-findings validation.
- Reuse checkpoints pin every referenced evidence and asset byte immutably, reject generation/reuse mixing, and preserve the existing native-generation capability and producer-route gates for ordinary runs.
- Added CLI `--art-mode`, execution-engine regression coverage, and recovery documentation.

## 0.5.12 — 2026-10-10

- Added dependency-free, decoded PNG production source-image gate: alpha/nonempty foreground/transparent corners, strong baked checkerboard, exact canvas, CRC and dimensions.
- Added CLI `ceos art-output-verify`, fail-fast `art-output-batch`, read-only evidence receipts, and `art-output-normalize` for lossless crop/pad of already-fitting props without resampling.
- New production-art runs require `metadata.artOutputs` at successful `GENERATING` checkpoint, revalidate each real output and include SHA-hashed files in immutable checkpoints; historical runs lack this gate flag and are unchanged.
- Terra generation instruction now requires **synchronous gate after each** Image Gen call and immediate stop upon failure. No fake PNG-alpha, canvas resizing that degrades quality, silent retries or claimed visual acceptance.
- Added mechanical validator / engine / CLI tests and documented decoder limitations. This policy cannot intercept unauthorized model/tool calls outside CEOS.

## 0.5.11 — 2026-10-10

- Routed `ceos_asset_generator` to native **GPT-5.6 Terra Medium**, distinct from the parent (optionally Luna Very High) and reasoning-only GPT-6 Sol High independent Web art reviewer.
- Added read-only `ceos art-brief-verify --file <art-brief.json>` to check exact source HEAD, physical SHA-256 of character references, authored scene/cue and actions, mandatory desktop/portrait framing, rejected candidate evidence and a maximum two-candidate ordinal. A valid brief does not authorize or attest Image Gen.
- Added source-art quality / narrative consistency / mobile framing separation, bounded regeneration policy, actual producer-context capability checks and truthful provider/asset SHA metadata requirements.
- No automatic Web image-file export or API model selector is implied; run-scoped native Image Gen capability attestation, original Web acceptance contracts and historical runs remain unchanged.
- Added Terra producer brief, CLI and installation/model routing regression tests.

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
