# Hybrid model-routing policy

CEOS separates **role selection** from **backend selection** and distinguishes **reasoning over supplied context** from **tool-backed evidence gathering or mutation**.

## Web High routing matrix (0.5.2+)

| Work type | Preferred route when Web is enabled | Native route / evidence source | Tool assumption |
|---|---|---|---|
| bounded batch classification over supplied evidence | `ceos_bulk_checker_web` → `chatgpt-web/high` | `ceos_bulk_checker` → `gpt-5.6-luna` | Web: none |
| architecture reasoning / synthesis over supplied context | `ceos_reasoner_web` → `chatgpt-web/high` | parent-selected native role | Web: none |
| production-art direction / visual canon / consistency critique | `ceos_art_director_web` → `chatgpt-web/high` | `ceos_reviewer` → `gpt-5.6` high | Web: none; supplied visual evidence only |
| repository exploration / dependency tracing | — | `ceos_explorer` → `gpt-5.6-terra` | tools required |
| tool-backed bulk checks / log-file batches | — | `ceos_bulk_checker` → `gpt-5.6-luna` | tools required |
| implementation | — | `ceos_implementer` → `gpt-5.6` medium | workspace-write |
| production image generation + asset integration | — | `ceos_asset_generator` → `gpt-5.6` medium | workspace-write + native image generation when actually available |
| debugging | — | `ceos_debugger` → `gpt-5.6` high | project-defined |
| review | — | `ceos_reviewer` → `gpt-5.6` high | read-only/tool-backed |
| verification | — | `ceos_verifier` → `gpt-5.6` high | read-only/tool-backed |

Whenever CEOS selects a Web route, every CEOS-managed Web role MUST use `chatgpt-web/high` with high reasoning effort, including bulk classification and reasoning. Do not silently downgrade a Web role to light/medium when High is unavailable; record a backend/transport failure and follow the existing fallback or `--web-required` BLOCKED contract. Web High selection does not grant access to local tools, change the user's native model configuration, or imply that preflight READY proves an actual substantive Web response.

The critical evidence/write/debug/risk/final-verification path remains native. Browser-only `codex-chatgpt-web` is sufficient for supplemental Web reasoning routes; MCP / Full Harness is not a prerequisite and is not assumed by CEOS routing.

## Native agent orchestration

Routing a task to a *native role* does not automatically justify spawning another native Codex subagent. Follow `policies/native-delegation.md`: the parent performs long-form literary drafting, content repair and simple local checks by default, with one bounded Web High independent critique after each finished episode when required. Launch an additional native specialist only with a recorded reason (e.g. mandatory independent tool-backed verification or a genuinely distinct high-risk task). Web High selection remains unchanged and does not imply Web execution consumes the same Codex quota as native subagents.

## Production-art capability boundary

`ceos_art_director_web` is deliberately reasoning-only. It may define or review character/location/style canon, generation briefs, reusable asset families, contact sheets, scene-to-art mappings, and supplied runtime screenshots. It must not claim that it generated, downloaded, saved, or integrated image files.

`ceos_asset_generator` is the native mutation role. It may generate images only when the current Codex environment actually exposes a native image-generation capability. Tool availability is a runtime capability, not an assumption encoded by the agent definition. If image generation is unavailable, the production-art workflow returns `BLOCKED` rather than synthesizing placeholders while claiming production completion.

Actual file persistence, asset-manifest updates, runtime mappings, browser evidence, tests, and final completion claims remain native/tool-backed.

## Evidence boundary

A Web reasoning agent may reason only over context explicitly supplied in its delegated prompt or inherited task context. It must not claim that it inspected a file, repository state, command result, browser state, or external system unless that evidence was actually supplied to it.

When fresh evidence is needed, collect it with the appropriate native agent first. The parent may then pass a bounded evidence snapshot to a Web reasoning agent for comparison, synthesis, hypothesis ranking, art-direction critique, or consistency review. The Web result is advisory analysis; completion evidence still comes from tool-backed native verification.

## Runtime capability preflight

Installation detection is not runtime readiness. Before an audit-repair-loop or production-art workflow delegates substantive review to Web, run `ceos web-preflight --json` when available.

The preflight reads `$CODEX_HOME/ceos/hybrid-routing.json` and probes the local `codex-chatgpt-web` health endpoint. Expected states are:

- `READY` — Web routing is enabled and the bridge is healthy/accepting turns;
- `DISABLED` — CEOS policy disables Web routing;
- `NOT_CONFIGURED` — no usable hybrid-routing manifest exists;
- `UNAVAILABLE` — configured Web runtime/transport is not reachable or healthy;
- `NOT_ACCEPTING_TURNS` — the bridge is alive but currently refuses new turns.

For `audit-repair-loop`, `READY` means substantive audit must actually use the applicable Web reviewer. For `production-art`, `READY` means substantive art-direction/review work should use `ceos_art_director_web` when visual canon or consistency judgment is in scope. Do not silently choose native-only review merely because it is convenient when the task explicitly requires Web review.

## Observable routing

Audit and production-art checkpoints should report the Web preflight status, Web agent names actually used, whether native fallback was used, and fallback reason. Production-art additionally records native asset-generator use, image-generation capability, generated asset count, and integrated asset count.

A Web-backed claim with no Web agent in the routing trace is invalid. This makes backend selection auditable instead of inferred from prose.

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
- Image-generation availability must be observed, not assumed.
- Production writes remain forbidden without explicit authorization.
- A missing/disabled Web capability degrades to the native routing map unless Web was explicitly required.
- CEOS does not modify or fork `codex-chatgpt-web`; it treats it as an optional model transport provider.
