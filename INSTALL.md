# Install Codex Engineering OS 0.3.0

## Recommended Windows installation

### 1. Optional: install ChatGPT Web models

Install `Codex Web GPT` from:

https://github.com/miuuyy/codex-chatgpt-web

For CEOS 0.3.0 you only need the browser/model path:

1. Sign in to ChatGPT in the embedded browser.
2. Run the browser smoke test.
3. Click **Install models**.
4. Fully restart Codex.
5. Confirm a `ChatGPT Web — ...` model appears in Codex and can complete a simple turn.

**MCP / Full Harness is not required by CEOS 0.3.0.** The optional Web agents are reasoning-only and must not assume local Codex tools. If you later configure MCP for other reasons, CEOS 0.3.0 still keeps repository/tool-backed engineering roles native unless a future policy explicitly changes that boundary.

CEOS also works without Codex Web GPT; in that case routing remains native-only.

### 2. Install CEOS

From the extracted `codex-engineering-system-0.3.0` folder:

```powershell
.\scripts\install-global.ps1
```

Default `-Web auto` behavior recognizes either a legacy `codex-chatgpt-web` command or the packaged Windows launcher at `%LOCALAPPDATA%\Programs\Codex Web GPT\Codex Web GPT.exe`. It then installs the base CEOS global layer, verifies it, writes `$CODEX_HOME\ceos\hybrid-routing.json`, and installs the optional reasoning-only Web agents when enabled.

Useful modes:

```powershell
# Detect automatically
.\scripts\install-global.ps1 -Web auto

# Explicitly enable Web reasoning definitions when model rows are already visible in Codex
.\scripts\install-global.ps1 -Web on

# Explicitly disable/remove CEOS-managed Web reasoning definitions
.\scripts\install-global.ps1 -Web off

# Non-default Codex home
.\scripts\install-global.ps1 -CodexHome 'D:\CodexHome' -Web auto
```

`-Web off` removes only Web agent files that are recognizably CEOS-managed. The installer refuses to overwrite or delete unrelated user agents.

During upgrade from the earlier 0.3.0 draft, `ceos_explorer_web` is backed up and removed only when it is recognizably CEOS-managed; it is replaced by `ceos_reasoner_web`.

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

The normal CEOS installer keeps its existing conflict behavior: CEOS-owned drift requires explicit replacement and is backed up; unrelated user targets are not overwritten. The hybrid installer applies the same ownership rule to its Web agent files.

## Hybrid-routing evidence

Inspect:

```powershell
Get-Content "$env:USERPROFILE\.codex\ceos\hybrid-routing.json"
```

When `CODEX_HOME` is configured, use that path instead. For the corrected 0.3.0 contract, the manifest should record:

```json
{
  "routingMode": "reasoning-only",
  "mcpRequired": false,
  "localToolsAssumed": false
}
```

`enabled: true` means CEOS installation policy permits the Web reasoning routes; it is not proof that every live ChatGPT model is currently available.

## Native-only operation

No Codex Web GPT installation is required. With Web routing disabled, CEOS 0.3.0 uses the same six native routes as 0.2.0 and all project Profiles/Gates/Evidence remain available.

## Repository-specific integration

```powershell
$project = 'E:\Work\YandexGames\MyGame'
ceos init --profile yandex-games --project $project --force
ceos doctor --project $project
ceos verify --project $project
```

For Yandex Games, create the project through the official Starter Kit first; CEOS attaches after bootstrap and does not replace Starter Kit infrastructure.
