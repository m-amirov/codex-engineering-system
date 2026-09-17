# Hybrid model-routing policy

CEOS separates **role selection** from **backend selection**.

## 0.3.0 routing matrix

| Role | Preferred when hybrid enabled | Native fallback/default | Sandbox |
|---|---|---|---|
| bulk checker | `ceos_bulk_checker_web` → `chatgpt-web/light` | `ceos_bulk_checker` → `gpt-5.6-luna` | read-only |
| explorer | `ceos_explorer_web` → `chatgpt-web/medium` | `ceos_explorer` → `gpt-5.6-terra` | read-only |
| implementer | native | `ceos_implementer` → `gpt-5.6` medium | workspace-write |
| debugger | native | `ceos_debugger` → `gpt-5.6` high | project-defined |
| reviewer | native | `ceos_reviewer` → `gpt-5.6` high | read-only |
| verifier | native | `ceos_verifier` → `gpt-5.6` high | read-only |

The critical implementation/debug/review/final-verification path remains native in 0.3.0. Web routing is deliberately limited to read-only roles until real-project evidence justifies expansion.

## Capability source

`scripts/install-hybrid.ps1` detects `codex-chatgpt-web` on PATH in `auto` mode and writes `$CODEX_HOME/ceos/hybrid-routing.json`. The global instructions treat Web routing as enabled only when that manifest reports `enabled: true`.

`-Web on` explicitly installs/enables the Web definitions. `-Web off` disables routing and removes only CEOS-managed Web agent definitions. It never removes an unrelated user agent.

## Deterministic fallback

Each delegated Web task gets at most one native fallback. The fallback is permitted only for transport/backend/runtime unavailability. Semantic outcomes — test failures, defects, inconclusive evidence, rejected hypotheses, or poor task results — are not transport failures and must not trigger a second model run.

This prevents hidden double execution, retry storms, quota-evasion behavior, and result shopping.

## Safety invariants

- The fallback inherits the original task scope and sandbox.
- Web agents in 0.3.0 are read-only.
- Production writes remain forbidden without explicit authorization.
- A missing/disabled Web capability degrades to the 0.2.0 native routing map.
- CEOS does not modify or fork `codex-chatgpt-web`; it treats it as an optional transport provider.
