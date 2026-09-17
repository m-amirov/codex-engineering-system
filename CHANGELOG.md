# Changelog

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
- Non-zero test-like gates are tagged `TEST_FAILURE`; other non-zero commands are `COMMAND_FAILURE`.
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
