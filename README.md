# Codex Engineering OS (CEOS) 0.3.0

CEOS is a global-first engineering operating layer for Codex. It installs compact engineering instructions, reusable Skills, project policies, verification/evidence tooling, and task-specific custom agents. Version 0.3.0 adds **optional native / ChatGPT Web reasoning routes** without making browser automation, MCP, or API billing a required dependency.

## What 0.3.0 adds

- Optional integration with [`miuuyy/codex-chatgpt-web`](https://github.com/miuuyy/codex-chatgpt-web).
- Two supplemental reasoning-only Web agents:
  - `ceos_bulk_checker_web` → `chatgpt-web/light` for bounded repetitive analysis over supplied evidence;
  - `ceos_reasoner_web` → `chatgpt-web/medium` for architecture reasoning, hypothesis comparison, planning, synthesis, and critique over supplied context.
- **No MCP requirement** for the CEOS 0.3.0 Web routes. Browser-only ChatGPT Web model rows are sufficient.
- Packaged Windows launcher detection (`Codex Web GPT.exe`) in addition to legacy CLI-style detection.
- `$CODEX_HOME/ceos/hybrid-routing.json` records whether optional Web reasoning is enabled and explicitly records `mcpRequired: false` / `localToolsAssumed: false`.
- Deterministic fallback: at most one Web → native fallback, and only for backend/transport/runtime unavailability.
- Semantic failures, discovered bugs, uncertainty, disagreements, and unfavorable results never trigger hidden model reruns.
- All fresh repository evidence gathering, terminal/test/browser work, implementation, debugging, security/production review, and final verification remain on native Codex models in 0.3.0.
- Existing CEOS 0.2.0 project manifests, Gates, Evidence, Skills, and six native agents remain compatible.

## Routing matrix

| Work type | Optional Web route | Native route | 0.3.0 policy |
|---|---|---|---|
| batch classification over a complete supplied evidence bundle | `chatgpt-web/light` | `gpt-5.6-luna` | Web allowed only when no fresh tools are needed |
| architecture reasoning / synthesis over supplied context | `chatgpt-web/medium` | parent-selected native role | Web allowed only when no fresh tools are needed |
| repository exploration / dependency tracing | — | `gpt-5.6-terra` | native tool-backed path |
| tool-backed bulk checks | — | `gpt-5.6-luna` | native tool-backed path |
| implementation | — | `gpt-5.6` medium | native critical path |
| debugger | — | `gpt-5.6` high | native critical path |
| reviewer | — | `gpt-5.6` high | native critical path |
| verifier | — | `gpt-5.6` high | native final gate |

CEOS chooses the engineering role and evidence boundary; `codex-chatgpt-web` supplies optional `chatgpt-web/*` model rows. The projects remain separate. CEOS does not fork or modify the Web bridge.

A useful pattern is:

```text
native explorer/tooling -> bounded evidence snapshot -> Web reasoner -> native implementation/verification
```

The Web result is advisory reasoning over supplied evidence. It is not independent proof of repository or production state.

## Recommended Windows installation

1. Install/configure `Codex Web GPT` if you want Web reasoning. Browser sign-in, browser smoke test, **Install models**, and a successful ChatGPT Web turn in Codex are sufficient. MCP / Full Harness is optional and not required by CEOS 0.3.0.
2. Extract CEOS 0.3.0.
3. Run:

```powershell
.\scripts\install-global.ps1
```

The installer:

- installs this CEOS folder globally with npm;
- updates CEOS-managed global Codex instructions, native agents, and Skills;
- verifies `ceos global-status`;
- recognizes the packaged Windows `Codex Web GPT.exe` installation when present;
- installs the two reasoning-only Web agent definitions when enabled;
- writes `$CODEX_HOME\ceos\hybrid-routing.json`.

Then restart Codex and start a **new task**.

If ChatGPT Web model rows are already visible in Codex but auto-detection does not find the launcher:

```powershell
.\scripts\install-global.ps1 -Web on
```

Disable the optional Web routes and retain native CEOS:

```powershell
.\scripts\install-global.ps1 -Web off
```

## Manual base installation

```powershell
npm install -g <path-to-codex-engineering-system>
ceos install-global --mode copy --force
ceos global-status
ceos routing
.\scripts\install-hybrid.ps1 -Web auto
```

The base `ceos routing` command reports the six always-available native custom-agent routes. The optional Web reasoning routes are governed by the hybrid manifest and global routing policy.

## Project-specific integration remains optional

Global CEOS works without `.codex-os/project.yml`. Add a project manifest only when executable project gates/evidence or a family profile are required:

```powershell
ceos init --profile yandex-games --project E:\Work\YandexGames\MyGame
ceos doctor --project E:\Work\YandexGames\MyGame
ceos verify --project E:\Work\YandexGames\MyGame
```

For Yandex Games, bootstrap new projects only through the official Starter Kit before attaching CEOS.

## Engineering invariants

- Evidence, not assertion, determines PASS.
- Production access is read-only by default.
- Unknown permission is not permission.
- Reuse repository-native infrastructure.
- Prefer goal + constraints + acceptance criteria over oversized procedural prompts.
- Prefer the lowest-cost adequate role/model and escalate when uncertainty or risk requires it.
- Web reasoning without tools may analyze supplied evidence but must never pretend it inspected fresh repository state.
- Hybrid routing never weakens sandbox, approval, production-write, or project-specific constraints.
- Do not retry/switch Web modes to evade usage limits.

See `docs/architecture/hybrid-routing.md`, `policies/model-routing.md`, and `INSTALL.md`.
