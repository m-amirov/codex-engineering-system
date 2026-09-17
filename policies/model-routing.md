# Hybrid model-routing policy

CEOS separates **role selection** from **backend selection** and distinguishes **reasoning over supplied context** from **tool-backed evidence gathering**.

## 0.3.x routing matrix

| Work type | Preferred route when Web is enabled | Native route / evidence source | Tool assumption |
|---|---|---|---|
| bounded batch classification over supplied evidence | `ceos_bulk_checker_web` → `chatgpt-web/light` | `ceos_bulk_checker` → `gpt-5.6-luna` | Web: none |
| architecture reasoning / synthesis over supplied context | `ceos_reasoner_web` → `chatgpt-web/medium` | parent-selected native role | Web: none |
| repository exploration / dependency tracing | — | `ceos_explorer` → `gpt-5.6-terra` | tools required |
| tool-backed bulk checks / log-file batches | — | `ceos_bulk_checker` → `gpt-5.6-luna` | tools required |
| implementation | — | `ceos_implementer` → `gpt-5.6` medium | workspace-write |
| debugging | — | `ceos_debugger` → `gpt-5.6` high | project-defined |
| review | — | `ceos_reviewer` → `gpt-5.6` high | read-only/tool-backed |
| verification | — | `ceos_verifier` → `gpt-5.6` high | read-only/tool-backed |

The critical implementation/debug/review/final-verification path remains native. Browser-only `codex-chatgpt-web` is sufficient for the two supplemental Web reasoning routes; MCP / Full Harness is not a prerequisite and is not assumed by CEOS routing.

## Evidence boundary

A Web reasoning agent may reason only over context explicitly supplied in its delegated prompt or inherited task context. It must not claim that it inspected a file, repository state, command result, browser state, or external system unless that evidence was actually supplied to it.

When fresh evidence is needed, collect it with the appropriate native agent first. The parent may then pass a bounded evidence snapshot to a Web reasoning agent for comparison, synthesis, hypothesis ranking, or critique. The Web result is advisory analysis; completion evidence still comes from tool-backed native verification.

## Runtime capability preflight

Installation detection is not runtime readiness. Before an audit-repair-loop delegates substantive review to Web, run `ceos web-preflight --json` when available.

The preflight reads `$CODEX_HOME/ceos/hybrid-routing.json` and probes the local `codex-chatgpt-web` health endpoint. Expected states are:

- `READY` — Web routing is enabled and the bridge is healthy/accepting turns;
- `DISABLED` — CEOS policy disables Web routing;
- `NOT_CONFIGURED` — no usable hybrid-routing manifest exists;
- `UNAVAILABLE` — configured Web runtime/transport is not reachable or healthy;
- `NOT_ACCEPTING_TURNS` — the bridge is alive but currently refuses new turns.

For `audit-repair-loop`, `READY` means substantive audit must actually use `ceos_bulk_checker_web` and/or `ceos_reasoner_web`. Do not silently choose native-only audit merely because it is convenient. For non-ready states, use the deterministic fallback contract below unless the user explicitly requires Web review.

## Observable routing

Every audit-repair-loop checkpoint must report:

- Web preflight status;
- Web agent names actually used;
- whether native fallback was used;
- fallback reason.

A Web-backed audit claim with no Web agent in the routing trace is invalid. This makes backend selection auditable instead of inferred from prose.

## Capability source

`scripts/install-hybrid.ps1` supports `auto|on|off` and writes `$CODEX_HOME/ceos/hybrid-routing.json`. In `auto` mode on Windows it recognizes both the legacy CLI-style command and the packaged `Codex Web GPT.exe` launcher installation. Detection enables model definitions; it does not prove that the local bridge is currently running or that every Web model route is available.

`-Web on` explicitly installs/enables the reasoning-only Web definitions. `-Web off` disables routing and removes only CEOS-managed Web agent definitions. It never removes an unrelated user agent.

## Deterministic fallback

Each delegated Web task gets at most one native fallback. The fallback is permitted only for route/backend/transport/runtime unavailability. Semantic outcomes — defects, uncertainty, rejected hypotheses, or poor task results — are not transport failures and must not trigger a second model run.

If the user explicitly requires Web review, a non-ready Web route is `BLOCKED`; native fallback may provide diagnostic help but does not satisfy the requested audit backend.

This prevents hidden double execution, retry storms, quota-evasion behavior, and result shopping.

## Safety invariants

- The fallback inherits the original task scope and safety constraints.
- Web agents are reasoning-only and assume no local tools.
- Web output is not independent evidence of repository or production state.
- Production writes remain forbidden without explicit authorization.
- A missing/disabled Web capability degrades to the native routing map unless Web was explicitly required.
- CEOS does not modify or fork `codex-chatgpt-web`; it treats it as an optional model transport provider.
