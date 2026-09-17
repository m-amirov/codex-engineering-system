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

**MCP / Full Harness is not required by CEOS 0.4.0.** The optional Web agents remain reasoning-only and must not assume local Codex tools. Tool-backed evidence collection, writes, image persistence, debugging, and verification remain native.

CEOS also works without Codex Web GPT; in that case routing remains native-only.

### 2. Install CEOS

From the extracted `codex-engineering-system-0.4.0` folder:

```powershell
.\scripts\install-global.ps1 -Web auto
```

The global install adds the native `ceos_asset_generator` agent and `production-art` Skill. Hybrid installation adds the optional reasoning-only `ceos_art_director_web` route (`chatgpt-web/high`) when Web routing is enabled.

Default `-Web auto` behavior recognizes either a legacy `codex-chatgpt-web` command or the packaged Windows launcher at `%LOCALAPPDATA%\Programs\Codex Web GPT\Codex Web GPT.exe`. It writes `$CODEX_HOME\ceos\hybrid-routing.json` as UTF-8 without BOM. `ceos web-preflight` also tolerates existing UTF-8 BOM manifests from older installs.

Useful modes:

```powershell
.\scripts\install-global.ps1 -Web auto
.\scripts\install-global.ps1 -Web on
.\scripts\install-global.ps1 -Web off
.\scripts\install-global.ps1 -CodexHome 'D:\CodexHome' -Web auto
```

`-Web off` removes only CEOS-managed Web agent files. The native `ceos_asset_generator` and `production-art` Skill remain installed as part of the base CEOS layer.

### 3. Check installation and Web runtime readiness

```powershell
ceos version
ceos global-status
ceos routing
ceos web-preflight
```

Expected version:

```text
0.4.0
```

`ceos global-status` should include at least:

```text
PASS  agent:ceos_asset_generator
PASS  skill:production-art
```

With Codex Web GPT running, expected Web state:

```text
WEB READY
```

The default probe is `http://127.0.0.1:17841/healthz`. CEOS distinguishes `READY`, `DISABLED`, `NOT_CONFIGURED`, `UNAVAILABLE`, and `NOT_ACCEPTING_TURNS`.

### 4. Restart Codex

Start a new Codex session/task after installation so global instructions, custom agents, and Skills reload together.

## Production-art runtime capability

The CEOS installation can register `ceos_asset_generator`, but that does **not** prove the current Codex runtime exposes an image-generation tool. Production-art must observe that capability at execution time.

If native image generation is available, `ceos_asset_generator` may generate real project assets and integrate them. If it is unavailable, the workflow must return `BLOCKED` rather than fabricate files, silently keep placeholders, or claim generation succeeded.

`ceos_art_director_web` never generates or saves files. It provides art direction and reviews supplied visual evidence.

## Using production-art

A compact task is enough:

```text
Проведи CEOS production-art pass проекта.
Построй asset manifest и visual canon, при Web READY используй ceos_art_director_web,
генерируй и интегрируй изображения нативно через ceos_asset_generator только при реально доступном image-generation capability,
после каждого batch делай fresh runtime evidence + visual-qa и заверши PASS/BLOCKED/ESCALATE.
```

The Skill expands this into the full workflow: scope/invariants lock → inventory/manifest → Web preflight → canon → native generation batches → integration → consistency review → runtime visual QA → final re-audit.

## Manual equivalent

```powershell
npm install -g .
ceos install-global --mode copy --force
.\scripts\install-hybrid.ps1 -Web auto
ceos global-status
ceos routing
ceos web-preflight
```

## Upgrade from 0.3.3

From the CEOS source folder:

```powershell
git pull --ff-only
.\scripts\install-global.ps1 -Web auto
ceos version
ceos global-status
ceos web-preflight
```

The global installer updates CEOS-managed native agents and Skills. The hybrid installer adds `ceos_art_director_web` when Web is enabled.

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

## Hybrid-routing evidence

Inspect:

```powershell
Get-Content "$env:USERPROFILE\.codex\ceos\hybrid-routing.json"
```

The reasoning-only contract should retain:

```json
{
  "routingMode": "reasoning-only",
  "mcpRequired": false,
  "localToolsAssumed": false
}
```

When Web is enabled, the manifest should list `ceos_bulk_checker_web`, `ceos_reasoner_web`, and `ceos_art_director_web`.

## Repository-specific integration

```powershell
$project = 'E:\Work\YandexGames\MyGame'
ceos init --profile yandex-games --project $project --force
ceos doctor --project $project
ceos verify --project $project
```

For Yandex Games, create the project through the official Starter Kit first; CEOS attaches after bootstrap and does not replace Starter Kit infrastructure.
