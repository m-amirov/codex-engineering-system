# Install Codex Engineering OS 0.3.2

## Recommended Windows installation

### 1. Optional: install ChatGPT Web models

Install `Codex Web GPT` from:

https://github.com/miuuyy/codex-chatgpt-web

For CEOS 0.3.2 you only need the browser/model path:

1. Sign in to ChatGPT in the embedded browser.
2. Run the browser smoke test.
3. Click **Install models**.
4. Fully restart Codex.
5. Confirm a `ChatGPT Web — ...` model appears in Codex and can complete a simple turn.

**MCP / Full Harness is not required by CEOS 0.3.2.** The optional Web agents are reasoning-only and must not assume local Codex tools. Tool-backed evidence collection, writes, debugging and verification remain native.

CEOS also works without Codex Web GPT; in that case routing remains native-only.

### 2. Install CEOS

From the extracted `codex-engineering-system-0.3.2` folder:

```powershell
.\scripts\install-global.ps1
```

Default `-Web auto` behavior recognizes either a legacy `codex-chatgpt-web` command or the packaged Windows launcher at `%LOCALAPPDATA%\Programs\Codex Web GPT\Codex Web GPT.exe`. It installs the base CEOS global layer, verifies it, writes `$CODEX_HOME\ceos\hybrid-routing.json`, and installs the optional reasoning-only Web agents when enabled.

Useful modes:

```powershell
.\scripts\install-global.ps1 -Web auto
.\scripts\install-global.ps1 -Web on
.\scripts\install-global.ps1 -Web off
.\scripts\install-global.ps1 -CodexHome 'D:\CodexHome' -Web auto
```

`-Web off` removes only CEOS-managed Web agent files. The installer refuses to overwrite or delete unrelated user agents.

### 3. Check Web runtime readiness

Installation detection is not runtime readiness. With Codex Web GPT running, check:

```powershell
ceos web-preflight
ceos web-preflight --json
```

Expected healthy result:

```text
WEB READY
```

The default probe is `http://127.0.0.1:17841/healthz`. CEOS distinguishes these states:

- `READY`
- `DISABLED`
- `NOT_CONFIGURED`
- `UNAVAILABLE`
- `NOT_ACCEPTING_TURNS`

When Web is configured but unavailable, `audit-repair-loop` may use its single native fallback and must record that fallback. If the user explicitly requires Web audit, a non-ready Web route is `BLOCKED`.

### 4. Restart Codex

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

Expected version:

```powershell
ceos version
# 0.3.2
```

## Upgrade from 0.3.1

Extract/replace the central CEOS source folder with 0.3.2, then run:

```powershell
.\scripts\install-global.ps1 -Web auto
```

After installation, `ceos global-status` should include `skill:audit-repair-loop` as healthy.

## Using audit-repair-loop

For a general product audit:

```text
Проведи аудит продукта через CEOS audit-repair-loop.
Исправляй подтверждённые дефекты и повторяй verification + fresh re-audit до PASS,
либо остановись на BLOCKED/ESCALATE/лимите циклов.
Не расширяй scope на release/publication readiness, если я этого отдельно не просил.
```

For a specific surface, name it explicitly. Example for a narrative audit:

```text
Проведи audit-repair-loop сценария.
В scope: reader comprehension, continuity, causality, character/location/time clarity и последствия choices.
Release readiness, gameplay videos, store metadata и публикационные артефакты вне scope.
```

If Web review is mandatory:

```text
Web audit required. Если Web недоступен, остановись с BLOCKED и не подменяй его native review.
```

The loop defaults to a maximum of three automatic repair cycles. It does not grant permission for production writes, deployments, payments, provider submits, destructive operations, or other external mutations.

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

`enabled: true` means CEOS installation policy permits Web reasoning routes; `ceos web-preflight` determines whether the local Web runtime is currently ready.

## Repository-specific integration

```powershell
$project = 'E:\Work\YandexGames\MyGame'
ceos init --profile yandex-games --project $project --force
ceos doctor --project $project
ceos verify --project $project
```

For Yandex Games, create the project through the official Starter Kit first; CEOS attaches after bootstrap and does not replace Starter Kit infrastructure.
