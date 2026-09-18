# Install Codex Engineering OS 0.5.0

## Upgrade on Windows

```powershell
cd E:\Tools\codex-engineering-os
git pull --ff-only
.\scripts\install-global.ps1 -Web auto
```

Then verify:

```powershell
ceos version
ceos global-status
ceos capabilities --project .
ceos web-preflight
```

Expected version: `0.5.0`. Fully restart Codex and start a new task/session after the global install.

## Deterministic Execution Engine

0.5.0 adds a project-local run control plane under `.ceos-runs/<run-id>/` containing `run.json`, `scope.json`, `capabilities.json`, `checkpoints/`, `artifacts/`, and `evidence/`.

Useful commands:

```powershell
ceos capabilities --project .
ceos run audit-repair-loop ...
ceos run production-art ...
ceos checkpoint latest --stage <STAGE> --artifact <path>
ceos resume latest
ceos run-status latest
ceos routing-trace latest --web-agents 'ceos_reasoner_web'
```

A run requires `--target`, `--in-scope`, `--acceptance`, and `--mutation-boundary`; `--out-of-scope`, `--web-required`, and `--max-cycles` are optional.

Example:

```powershell
ceos run audit-repair-loop `
  --project . `
  --target 'narrative pacing' `
  --in-scope 'scene pacing;engagement;hooks' `
  --out-of-scope 'release readiness;store metadata' `
  --acceptance 'fresh re-audit PASS with zero confirmed pacing defects' `
  --mutation-boundary 'scenario/runtime files required for confirmed defects' `
  --web-required
```

The CLI returns the only valid next stage. The parent Codex agent performs that work, persists evidence, then advances with `ceos checkpoint`.

## Runtime capability attestation

`ceos capabilities` probes filesystem access, Git/npm/Node, project manifest/browser hints, installed native-agent definitions, and live Web preflight.

Native Image Gen is a host-model tool and cannot be discovered from the standalone Node process. The host must explicitly attest it when known:

```powershell
ceos capabilities --image-generation available
# or
$env:CEOS_IMAGE_GENERATION_CAPABILITY='available'
```

Allowed values: `available`, `unavailable`, `unknown`. Production-art refuses `GENERATING` unless the persisted capability is `available`.

If capability state changes after a run starts:

```powershell
ceos resume latest --refresh-capabilities --image-generation available
```

## Resume and crash recovery

After Codex, terminal, or bridge restart:

```powershell
ceos resume latest
```

CEOS reloads durable state and verifies prior checkpoint hashes. Changed/missing evidence yields `INTEGRITY_BLOCKED` instead of guessing where the workflow should continue.

## Web-required behavior

When `--web-required` is set and Web preflight is not `READY`, the run is persisted as `BLOCKED`. After starting Codex Web GPT:

```powershell
ceos resume latest --refresh-capabilities
```

If Web becomes `READY`, a capability-blocked run reopens at its first substantive stage. Before final PASS, record actual routing with `ceos routing-trace`.

## Global agents and Web routes

Native agents remain `ceos_bulk_checker`, `ceos_explorer`, `ceos_implementer`, `ceos_asset_generator`, `ceos_debugger`, `ceos_reviewer`, and `ceos_verifier`.

Optional Web routes remain reasoning-only: `ceos_bulk_checker_web`, `ceos_reasoner_web`, and `ceos_art_director_web`. MCP / Full Harness is not required.

## Manual base installation

```powershell
npm install -g .
ceos install-global --mode copy --force
.\scripts\install-hybrid.ps1 -Web auto
ceos global-status
```

## Repository-specific integration

```powershell
ceos init --profile yandex-games --project E:\Work\YandexGames\MyGame
ceos doctor --project E:\Work\YandexGames\MyGame
ceos verify --project E:\Work\YandexGames\MyGame
```

For Yandex Games, bootstrap a new project through the official Starter Kit first. CEOS attaches after bootstrap and does not replace Starter Kit infrastructure.
