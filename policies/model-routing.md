# Hybrid model-routing policy

CEOS separates **role selection** from **backend selection** and distinguishes **reasoning over supplied context** from **tool-backed evidence gathering**.

## 0.4.x routing matrix

| Work type | Preferred route when Web is enabled | Native route / evidence source | Tool assumption |
|---|---|---|---|
| bounded batch classification over supplied evidence | `ceos_bulk_checker_web` → `chatgpt-web/light` | `ceos_bulk_checker` → `gpt-5.6-luna` | Web: none |
| architecture reasoning / synthesis over supplied context | `ceos_reasoner_web` → `chatgpt-web/medium` | parent-selected native role | Web: none |
| art direction / visual canon / supplied-image critique | `ceos_art_director_web` → `chatgpt-web/high` | `ceos_reviewer` → `gpt-5.6` high fallback | Web: none |
| repository exploration / dependency tracing | — | `ceos_explorer` → `gpt-5.6-terra` | tools required |
| tool-backed bulk checks / log-file batches | — | `ceos_bulk_checker` → `gpt-5.6-luna` | tools required |
| implementation | — | `ceos_implementer` → `gpt-5.6` medium | workspace-write |
| production visual asset generation / integration | — | `ceos_asset_generator` → `gpt-5.6` medium | workspace-write + native image-generation capability when exposed |
| debugging | — | `ceos_debugger` → `gpt-5.6` high | project-defined |
| review | — | `ceos_reviewer` → `gpt-5.6` high | read-only/tool-backed |
| verification | — | `ceos_verifier` → `gpt-5.6` high | read-only/tool-backed |

The critical implementation/debug/asset-write/review/final-verification path remains native. Browser-only `codex-chatgpt-web` is sufficient for supplemental Web reasoning routes; MCP / Full Harness is not a prerequisite and is not assumed by CEOS routing.

## Evidence boundary

A Web reasoning agent may reason only over context explicitly supplied in its delegated prompt or inherited task context. It must not claim that it inspected a file, repository state, command result, browser state, or external system unless that evidence was actually supplied to it.

For visual work, `ceos_art_director_web` may critique supplied reference sheets, generated images, screenshots, art manifests, and scene summaries. It does **not** prove that an asset was generated, saved, mapped, or rendered, and CEOS does not treat a Web response as a binary asset-generation event.

When fresh evidence is needed, collect it with the appropriate native agent first. The parent may then pass a bounded evidence snapshot to a Web reasoning agent for comparison, synthesis, hypothesis ranking, art-direction critique, or consistency review. Completion evidence still comes from tool-backed native verification.

## Native image-generation boundary

Actual production-asset generation belongs to `ceos_asset_generator` on a native route. If the current Codex runtime exposes a native image-generation capability, the asset generator may invoke it and save/integrate the resulting project-owned files. If that capability is absent, the task must return `BLOCKED_CAPABILITY` (or the parent equivalent) with an exact generation packet instead of fabricating files, counting prompts as assets, or silently replacing production art with placeholders/procedural stand-ins.

A Web art director may prepare generation constraints and review results, but it must not be described as having generated or written production files under CEOS 0.4.x.

## Runtime capability preflight

Installation detection is not runtime readiness. Before an audit-repair-loop or art-production workflow delegates substantive review to Web, run `ceos web-preflight --json` when available.

The preflight reads `$CODEX_HOME/ceos/hybrid-routing.json` and probes the local `codex-chatgpt-web` health endpoint. Expected states are:

- `READY` — Web routing is enabled and the bridge is healthy/accepting turns;
- `DISABLED` — CEOS policy disables Web routing;
- `NOT_CONFIGURED` — no usable hybrid-routing manifest exists;
- `UNAVAILABLE` — configured Web runtime/transport is not reachable or healthy;
- `NOT_ACCEPTING_TURNS` — the bridge is alive but currently refuses new turns.

For `audit-repair-loop`, `READY` means substantive audit must actually use `ceos_bulk_checker_web` and/or `ceos_reasoner_web`. For `art-production`, `READY` means substantive visual direction/review should use `ceos_art_director_web` when the task benefits from supplied-image/visual reasoning. Do not silently choose native-only Web-required review merely because it is convenient. For non-ready states, use the deterministic fallback contract below unless the user explicitly requires Web review.

## Observable routing

Audit/repair and art-production checkpoints that claim hybrid review must report:

- Web preflight status;
- Web agent names actually used;
- whether native fallback was used;
- fallback reason.

A Web-backed audit/art-review claim with no Web agent in the routing trace is invalid. This makes backend selection auditable instead of inferred from prose.

## Capability source

`scripts/install-hybrid.ps1` supports `auto|on|off` and writes `$CODEX_HOME/ceos/hybrid-routing.json`. In `auto` mode on Windows it recognizes both the legacy CLI-style command and the packaged `Codex Web GPT.exe` launcher installation. Detection enables model definitions; it does not prove that the local bridge is currently running or that every Web model route is available.

`-Web on` explicitly installs/enables the reasoning-only Web definitions, including the art-director route. `-Web off` disables routing and removes only CEOS-managed Web agent definitions. It never removes an unrelated user agent.

## Deterministic fallback

Each delegated Web task gets at most one native fallback. The fallback is permitted only for route/backend/transport/runtime unavailability. Semantic outcomes — defects, uncertainty, rejected hypotheses, art rejection/regeneration requests, or poor task results — are not transport failures and must not trigger a second model run.

If the user explicitly requires Web review, a non-ready Web route is `BLOCKED`; native fallback may provide diagnostic help but does not satisfy the requested review backend.

This prevents hidden double execution, retry storms, quota-evasion behavior, and result shopping.

## Safety invariants

- The fallback inherits the original task scope and safety constraints.
- Web agents are reasoning-only and assume no local tools.
- Web output is not independent evidence of repository or production state; it is also not evidence of generated-file state.
- Production writes remain forbidden without explicit authorization.
- Project-owned art generation does not imply permission to publish/upload/deploy assets externally.
- A missing/disabled Web capability degrades to the native routing map unless Web was explicitly required.
- CEOS does not modify or fork `codex-chatgpt-web`; it treats it as an optional model transport provider.
