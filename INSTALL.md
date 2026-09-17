# Install Codex Engineering OS 0.3.0

## Recommended Windows installation

### 1. Optional: install ChatGPT Web transport

Hybrid routing requires `codex-chatgpt-web`. Install and configure it separately from:

https://github.com/miuuyy/codex-chatgpt-web

Complete its browser sign-in and, for tool-using agents, Full Harness/MCP setup. Verify that this command is available in PowerShell:

```powershell
codex-chatgpt-web --help
```

CEOS works without it; in that case routing remains native-only.

### 2. Install CEOS

From the extracted `codex-engineering-system-0.3.0` folder:

```powershell
.\scripts\install-global.ps1
```

Default `-Web auto` behavior detects `codex-chatgpt-web` on PATH. The script installs the base CEOS global layer, verifies it, then writes `$CODEX_HOME\ceos\hybrid-routing.json` and installs the optional Web agents only when enabled.

Useful modes:

```powershell
# Detect automatically
.\scripts\install-global.ps1 -Web auto

# Explicitly enable Web agent definitions
.\scripts\install-global.ps1 -Web on

# Explicitly disable/remove CEOS-managed Web agent definitions
.\scripts\install-global.ps1 -Web off

# Non-default Codex home
.\scripts\install-global.ps1 -CodexHome 'D:\CodexHome' -Web auto
```

`-Web off` removes only Web agent files that are recognizably CEOS-managed. The installer refuses to overwrite or delete unrelated user agents.

### 3. Restart Codex

Start a new Codex session/task after installation so global instructions and the custom-agent catalog reload together.

## Manual equivalent

```powershell
npm install -g .
ceos install-global --mode copy --force
ceos global-status
ceos routing
.\scripts\install-hybrid.ps1 -Web auto
```

Expected version:

```powershell
ceos version
# 0.3.0
```

## Upgrade from 0.2.0

Extract/replace the central CEOS source folder with 0.3.0, then run:

```powershell
.\scripts\install-global.ps1 -Web auto
```

The normal CEOS installer keeps its existing conflict behavior: CEOS-owned drift requires explicit replacement and is backed up; unrelated user targets are not overwritten. The hybrid installer applies the same ownership rule to its two Web agent files.

## Hybrid-routing evidence

Inspect:

```powershell
Get-Content "$env:USERPROFILE\.codex\ceos\hybrid-routing.json"
```

When `CODEX_HOME` is configured, use that path instead. `enabled: true` means CEOS installation policy permits the Web routes; it is not a guarantee that the live ChatGPT account currently exposes every model. A runtime transport failure may therefore cause the single native fallback defined by policy.

## Native-only operation

No `codex-chatgpt-web` installation is required. With hybrid disabled, CEOS 0.3.0 uses the same six native routes as 0.2.0 and all project Profiles/Gates/Evidence remain available.

## Repository-specific integration

```powershell
$project = 'E:\Work\YandexGames\MyGame'
ceos init --profile yandex-games --project $project --force
ceos doctor --project $project
ceos verify --project $project
```

For Yandex Games, create the project through the official Starter Kit first; CEOS attaches after bootstrap and does not replace Starter Kit infrastructure.
