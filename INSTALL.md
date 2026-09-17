# Install Codex Engineering OS 0.4.0

## Recommended Windows installation

### 1. Optional: install ChatGPT Web models

Install `Codex Web GPT` from:

https://github.com/miuuyy/codex-chatgpt-web

For CEOS 0.4.0 you only need the browser/model path:

1. Sign in to ChatGPT in the embedded browser.
2. Run the browser smoke test.
3. Click **Install models**.
4. Fully restart Codex.
5. Confirm a `ChatGPT Web — ...` model appears in Codex and can complete a simple turn.

**MCP / Full Harness is not required by CEOS 0.4.0.** Optional Web agents remain reasoning-only and must not assume local Codex tools. Tool-backed evidence collection, writes, debugging, asset generation/integration, and verification remain native.

CEOS also works without Codex Web GPT; in that case routing remains native-only.

### 2. Install CEOS

From the updated `codex-engineering-system-0.4.0` folder:

```powershell
.\scripts\install-global.ps1 -Web auto
```

Default `-Web auto` behavior recognizes either a legacy `codex-chatgpt-web` command or the packaged Windows launcher at `%LOCALAPPDATA%\Programs\Codex Web GPT\Codex Web GPT.exe`. It installs the base CEOS global layer, verifies it, writes `$CODEX_HOME\ceos\hybrid-routing.json`, and installs optional reasoning-only Web agents when enabled.

CEOS writes `hybrid-routing.json` as UTF-8 without BOM and `ceos web-preflight` tolerates an existing UTF-8 BOM from older Windows PowerShell installs.

Useful modes:

```powershell
.\scripts\install-global.ps1 -Web auto
.\scripts\install-global.ps1 -Web on
.\scripts\install-global.ps1 -Web off
.\scripts\install-global.ps1 -CodexHome 'D:\CodexHome' -Web auto
```

`-Web off` removes only CEOS-managed Web agent files. The installer refuses to overwrite or delete unrelated user agents.

### 3. Verify global 0.4.0 installation

```powershell
ceos version
ceos global-status
ceos routing
```

Expected version:

```text
0.4.0
```

`ceos global-status` should include at least:

```text
PASS  agent:ceos_asset_generator
PASS  skill:art-production
```

The native asset generator is part of the base global CEOS install regardless of whether Web routing is enabled.

When Web routing is enabled, `$CODEX_HOME\agents` should additionally contain:

```text
ceos-art-director-web.toml
```

### 4. Check Web runtime readiness

Installation detection is not runtime readiness. With Codex Web GPT running, check:

```powershell
ceos web-preflight
ceos web-preflight --json
```

Expected healthy result:

```text
WEB READY
```

The default probe is `http://127.0.0.1:17841/healthz`. CEOS distinguishes:

- `READY`
- `DISABLED`
- `NOT_CONFIGURED`
- `UNAVAILABLE`
- `NOT_ACCEPTING_TURNS`

When Web is configured but unavailable, workflows may use the single native fallback only when their contract permits it. If the user explicitly requires Web review, a non-ready Web route is `BLOCKED`.

### 5. Restart Codex

Start a new Codex session/task after installation so global instructions and the custom-agent/Skill catalog reload together.

## Manual equivalent

```powershell
npm install -g .
ceos install-global --mode copy --force
ceos global-status
ceos routing
.\scripts\install-hybrid.ps1 -Web auto
ceos web-preflight
```

## Upgrade from 0.3.3

Update the central CEOS source folder to 0.4.0, then run:

```powershell
.\scripts\install-global.ps1 -Web auto
```

This installs:

- new native agent `ceos_asset_generator`;
- new Skill `art-production`;
- updated global routing instructions/policies;
- `ceos_art_director_web` when Web routing is enabled.

After installation, fully restart Codex.

## Using art-production

For a production-art pass:

```text
Проведи CEOS art-production pass продукта.
Сначала собери art manifest и canon персонажей/локаций.
Web art direction required when READY; реальные ассеты генерируй и интегрируй нативно.
После batch проверяй identity/style consistency, mapping и runtime framing.
Заверши fresh rendered evidence + fresh Web art re-audit до PASS/BLOCKED/ESCALATE.
Release readiness вне scope.
```

Behavioral contract:

- `ceos_art_director_web` is reasoning/review only; it does not generate or save production files.
- `ceos_asset_generator` performs actual native image-generation calls only when that capability is exposed by the current Codex runtime, then writes/integrates project-owned outputs.
- If native image-generation capability is unavailable, CEOS returns `BLOCKED_CAPABILITY` with a generation packet. It must not count prompts, manifests, placeholders, or procedural stand-ins as production art.
- Canonical recurring characters/locations should be established before dependent high-volume batches.

## Using audit-repair-loop

For a general product audit:

```text
Проведи аудит продукта через CEOS audit-repair-loop.
Исправляй подтверждённые дефекты и повторяй verification + fresh re-audit до PASS,
либо остановись на BLOCKED/ESCALATE/лимите циклов.
Не расширяй scope на release/publication readiness, если я этого отдельно не просил.
```

If Web review is mandatory:

```text
Web audit required. Если Web недоступен, остановись с BLOCKED и не подменяй его native review.
```

The loop defaults to a maximum of three automatic repair cycles. It does not grant permission for deployments, payments, provider submits, destructive operations, or other external mutations.

## Hybrid-routing evidence

Inspect:

```powershell
Get-Content "$env:USERPROFILE\.codex\ceos\hybrid-routing.json"
```

The reasoning-only contract should record:

```json
{
  "routingMode": "reasoning-only",
  "mcpRequired": false,
  "localToolsAssumed": false
}
```

With Web enabled, `webAgents` should include `ceos_bulk_checker_web`, `ceos_reasoner_web`, and `ceos_art_director_web`.

`enabled: true` means CEOS policy permits Web reasoning routes; `ceos web-preflight` determines whether the local bridge is currently ready.

## Repository-specific integration

```powershell
$project = 'E:\Work\YandexGames\MyGame'
ceos init --profile yandex-games --project $project --force
ceos doctor --project $project
ceos verify --project $project
```

For Yandex Games, create the project through the official Starter Kit first; CEOS attaches after bootstrap and does not replace Starter Kit infrastructure.
