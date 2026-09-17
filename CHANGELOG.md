# Changelog

## 0.3.0 — 2026-09-17

- Added optional hybrid native / ChatGPT Web model routing without making `codex-chatgpt-web` a CEOS runtime dependency.
- Added `ceos_bulk_checker_web` (`chatgpt-web/light`) and `ceos_explorer_web` (`chatgpt-web/medium`) as read-only preferred routes.
- Kept implementation, ambiguous debugging, security/production review, and final verification on native Codex models for the 0.3.0 critical path.
- Added Windows capability detection and `$CODEX_HOME/ceos/hybrid-routing.json` through `scripts/install-hybrid.ps1`.
- Updated `scripts/install-global.ps1` to apply and verify the hybrid layer after the normal CEOS global installation.
- Added a deterministic single-fallback contract: Web → native only for backend/transport/runtime unavailability; semantic/task failures never trigger hidden reruns.
- Added fail-closed ownership checks and backups for changed CEOS-managed Web agent definitions.
- Added hybrid routing architecture/policy documentation and static regression coverage.
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
