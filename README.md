# Codex Engineering OS (CEOS) 0.3.0

CEOS is a global-first engineering operating layer for Codex. It installs compact engineering instructions, reusable Skills, project policies, verification/evidence tooling, and task-specific custom agents. Version 0.3.0 adds **optional hybrid native / ChatGPT Web routing** without making browser automation a required dependency.

## What 0.3.0 adds

- Optional integration with [`miuuyy/codex-chatgpt-web`](https://github.com/miuuyy/codex-chatgpt-web).
- Two bounded read-only Web agents:
  - `ceos_bulk_checker_web` → `chatgpt-web/light`;
  - `ceos_explorer_web` → `chatgpt-web/medium`.
- Automatic Windows capability detection through `codex-chatgpt-web` on PATH.
- `$CODEX_HOME/ceos/hybrid-routing.json` records whether hybrid routing is enabled.
- Deterministic fallback: at most one Web → native fallback, and only for backend/transport/runtime unavailability.
- Semantic failures, failed tests, discovered bugs, uncertainty, and unfavorable results never trigger hidden model reruns.
- Implementation, ambiguous debugging, security/production review, and final verification remain on native Codex models in 0.3.0.
- Existing CEOS 0.2.0 project manifests, Gates, Evidence, Skills, and six native agents remain compatible.

## Routing matrix

| Role | Hybrid preferred route | Native route | 0.3.0 policy |
|---|---|---|---|
| bulk checker | `chatgpt-web/light` | `gpt-5.6-luna` | Web when enabled, one native transport fallback |
| explorer | `chatgpt-web/medium` | `gpt-5.6-terra` | Web when enabled, one native transport fallback |
| implementer | — | `gpt-5.6` medium | native critical path |
| debugger | — | `gpt-5.6` high | native critical path |
| reviewer | — | `gpt-5.6` high | native critical path |
| verifier | — | `gpt-5.6` high | native final gate |

CEOS chooses the engineering **role**; `codex-chatgpt-web` supplies optional `chatgpt-web/*` model routes. The projects remain separate. CEOS does not fork or modify the Web bridge.

## Recommended Windows installation

1. Install/configure `codex-chatgpt-web` first if you want Web routing. Complete its Full Harness setup and make sure `codex-chatgpt-web` is available on PATH.
2. Extract CEOS 0.3.0.
3. Run:

```powershell
.\scripts\install-global.ps1
```

The installer:

- installs this CEOS folder globally with npm;
- updates CEOS-managed global Codex instructions, native agents, and Skills;
- verifies `ceos global-status`;
- detects `codex-chatgpt-web`;
- installs the two Web agent definitions when detected;
- writes `$CODEX_HOME\ceos\hybrid-routing.json`.

Then restart Codex and start a **new task**.

Force Web routing definitions when the bridge is configured but not discoverable on PATH:

```powershell
.\scripts\install-global.ps1 -Web on
```

Disable the optional Web routes and retain native CEOS:

```powershell
.\scripts\install-global.ps1 -Web off
```

To re-detect only the hybrid layer later:

```powershell
.\scripts\install-hybrid.ps1 -Web auto
```

## Manual base installation

```powershell
npm install -g <path-to-codex-engineering-system>
ceos install-global --mode copy --force
ceos global-status
ceos routing
.\scripts\install-hybrid.ps1 -Web auto
```

The base `ceos routing` command still reports the six native custom-agent routes because those are the always-available CEOS baseline. The two optional Web routes are governed by the hybrid manifest and global routing policy.

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
- Hybrid routing never weakens sandbox, approval, production-write, or project-specific constraints.
- Do not retry/switch Web modes to evade usage limits.

See `docs/architecture/hybrid-routing.md`, `policies/model-routing.md`, and `INSTALL.md`.
