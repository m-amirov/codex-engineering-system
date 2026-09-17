# Hybrid model-routing policy

CEOS separates **role selection** from **backend selection** and, in 0.3.0, also distinguishes **reasoning over supplied context** from **tool-backed evidence gathering**.

## 0.3.0 routing matrix

| Work type | Preferred route when Web is enabled | Native route / evidence source | Tool assumption |
|---|---|---|---|
| bounded batch classification over supplied evidence | `ceos_bulk_checker_web` → `chatgpt-web/light` | `ceos_bulk_checker` → `gpt-5.6-luna` | Web: none |
| architecture reasoning / synthesis over supplied context | `ceos_reasoner_web` → `chatgpt-web/medium` | parent-selected native role | Web: none |
| repository exploration / dependency tracing | native | `ceos_explorer` → `gpt-5.6-terra` | tools required |
| tool-backed bulk checks / log-file batches | native | `ceos_bulk_checker` → `gpt-5.6-luna` | tools required |
| implementation | native | `ceos_implementer` → `gpt-5.6` medium | workspace-write |
| debugging | native | `ceos_debugger` → `gpt-5.6` high | project-defined |
| review | native | `ceos_reviewer` → `gpt-5.6` high | read-only/tool-backed |
| verification | native | `ceos_verifier` → `gpt-5.6` high | read-only/tool-backed |

The critical implementation/debug/review/final-verification path remains native in 0.3.0. Browser-only `codex-chatgpt-web` is sufficient for the two supplemental Web reasoning routes; MCP / Full Harness is not a prerequisite and is not assumed by CEOS routing.

## Evidence boundary

A Web reasoning agent may reason only over context explicitly supplied in its delegated prompt or inherited task context. It must not claim that it inspected a file, repository state, command result, browser state, or external system unless that evidence was actually supplied to it.

When fresh evidence is needed, collect it with the appropriate native agent first. The parent may then pass a bounded evidence snapshot to a Web reasoning agent for comparison, synthesis, hypothesis ranking, or critique. The Web result is advisory analysis; completion evidence still comes from tool-backed native verification.

## Capability source

`scripts/install-hybrid.ps1` supports `auto|on|off` and writes `$CODEX_HOME/ceos/hybrid-routing.json`. In `auto` mode on Windows it recognizes both the legacy CLI-style command and the packaged `Codex Web GPT.exe` launcher installation. This is installation detection, not proof that every Web model route is currently available.

`-Web on` explicitly installs/enables the reasoning-only Web definitions. `-Web off` disables routing and removes only CEOS-managed Web agent definitions. It never removes an unrelated user agent.

## Deterministic fallback

Each delegated Web task gets at most one native fallback. The fallback is permitted only for route/backend/transport/runtime unavailability. Semantic outcomes — defects, uncertainty, rejected hypotheses, or poor task results — are not transport failures and must not trigger a second model run.

This prevents hidden double execution, retry storms, quota-evasion behavior, and result shopping.

## Safety invariants

- The fallback inherits the original task scope and safety constraints.
- Web agents in 0.3.0 are reasoning-only and assume no local tools.
- Web output is not independent evidence of repository or production state.
- Production writes remain forbidden without explicit authorization.
- A missing/disabled Web capability degrades to the 0.2.0 native routing map.
- CEOS does not modify or fork `codex-chatgpt-web`; it treats it as an optional model transport provider.
