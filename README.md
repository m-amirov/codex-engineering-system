# Codex Engineering OS (CEOS) 0.4.0

CEOS is a global-first engineering operating layer for Codex. It installs compact engineering instructions, reusable Skills, project policies, verification/evidence tooling, and task-specific custom agents.

Version 0.4.0 adds a production-art pipeline that separates **Web art direction** from **native image generation and integration** without weakening the existing reasoning-only Web contract.

## Production-art pipeline

Use `production-art` when a project needs real character art, expressions, backgrounds, CGs, location masters, production image assets, or a systematic replacement of placeholders.

```text
scope + invariants lock
        ↓
asset inventory / manifest
        ↓
ceos web-preflight
        ↓
Web art direction when READY
ceos_art_director_web → chatgpt-web/high
        ↓
character/location/style canon
        ↓
native generation batches
ceos_asset_generator → gpt-5.6
        ↓
real files + runtime mappings
        ↓
contact sheets / runtime evidence
        ↓
Web consistency review
        ↓
visual-qa + project-native gates
        ↓
PASS | BLOCKED | ESCALATE
```

The Web art director is reasoning-only. It may define canon, generation briefs, reusable asset families, and review supplied screenshots/contact sheets/manifests, but it does not generate or persist files.

The native `ceos_asset_generator` may use image generation only when the current Codex environment actually exposes that capability. If native image generation is unavailable, the workflow returns `BLOCKED` instead of fabricating assets or silently substituting placeholders.

Production-art completion requires real files in the workspace, complete required manifest coverage, valid runtime mappings, no confirmed identity/style/location drift, fresh runtime evidence, and relevant tests/lint/build passing.

## Audit-repair loop

`audit-repair-loop` freezes a scope lock before audit: target, in-scope surfaces, out-of-scope surfaces, acceptance contract, and mutation boundary. Release/publication/submission artifacts cannot block a product/content/runtime audit unless the user explicitly includes release readiness.

```text
scope lock
    ↓
native evidence collection
    ↓
ceos web-preflight
    ↓
web audit when READY
    ↓
confirmed in-scope defects
    ↓
consolidated remediation packet
    ↓
native implement/debug
    ↓
target-proportional verification
    ↓
fresh evidence snapshot
    ↓
fresh web audit when READY
    ↓
PASS | FAIL | BLOCKED | ESCALATE
```

Default maximum automatic repair cycles: **3**. Production remains read-only unless separately authorized.

## Hybrid routing baseline

CEOS integrates optionally with [`miuuyy/codex-chatgpt-web`](https://github.com/miuuyy/codex-chatgpt-web) without making MCP / Full Harness a CEOS requirement.

Web reasoning routes:

- `ceos_bulk_checker_web` → `chatgpt-web/light`: repetitive classification/comparison over complete supplied evidence.
- `ceos_reasoner_web` → `chatgpt-web/medium`: architecture, product logic, causal analysis, synthesis, critique, and remediation consolidation.
- `ceos_art_director_web` → `chatgpt-web/high`: visual canon, asset briefs, art-direction reasoning, and consistency critique over supplied visual evidence.

Web agents do not discover repository state, run commands/tests, or write files.

Native routes:

| Role | Native model | Purpose |
|---|---|---|
| `ceos_bulk_checker` | `gpt-5.6-luna` low | tool-backed batch checks |
| `ceos_explorer` | `gpt-5.6-terra` medium | repository exploration/evidence mapping |
| `ceos_implementer` | `gpt-5.6` medium | bounded implementation/refactor |
| `ceos_asset_generator` | `gpt-5.6` medium | bounded native image generation + asset integration when capability exists |
| `ceos_debugger` | `gpt-5.6` high | ambiguous/cross-component debugging |
| `ceos_reviewer` | `gpt-5.6` high | correctness/security/risk review |
| `ceos_verifier` | `gpt-5.6` high | independent acceptance verification |

## Web runtime preflight

Use:

```powershell
ceos web-preflight
ceos web-preflight --json
```

Default health endpoint:

```text
http://127.0.0.1:17841/healthz
```

`READY` means Web routing is enabled and the bridge is healthy and accepting turns. CEOS accepts BOM-prefixed `hybrid-routing.json` files from older Windows installs and writes new manifests as UTF-8 without BOM.

## Example: production art

```text
Проведи CEOS production-art pass проекта.
Сначала построй asset manifest и visual canon.
При Web READY используй ceos_art_director_web для art direction и consistency review.
Генерируй и интегрируй изображения только нативно через ceos_asset_generator и только если image-generation capability реально доступна.
После каждого batch собирай fresh runtime evidence и делай visual-qa.
Не меняй product topology/character cores ради удобства генерации.
Заверши PASS, BLOCKED или ESCALATE.
```

## Recommended Windows installation

1. Install/configure `Codex Web GPT` if you want Web reasoning. MCP / Full Harness is optional for CEOS.
2. Update/extract CEOS 0.4.0.
3. Run:

```powershell
.\scripts\install-global.ps1 -Web auto
```

Then fully restart Codex and start a new task.

Useful checks:

```powershell
ceos version
ceos global-status
ceos routing
ceos web-preflight
```

If ChatGPT Web model rows are already visible but auto-detection does not find the launcher:

```powershell
.\scripts\install-global.ps1 -Web on
```

## Manual base installation

```powershell
npm install -g <path-to-codex-engineering-system>
ceos install-global --mode copy --force
.\scripts\install-hybrid.ps1 -Web auto
ceos global-status
ceos routing
ceos web-preflight
```

## Project-specific integration

Global CEOS works without `.codex-os/project.yml`. Add a project manifest when executable project gates/evidence or a family profile are required:

```powershell
ceos init --profile yandex-games --project E:\Work\YandexGames\MyGame
ceos doctor --project E:\Work\YandexGames\MyGame
ceos verify --project E:\Work\YandexGames\MyGame
```

For Yandex Games, bootstrap new projects only through the official Starter Kit before attaching CEOS.

## Engineering invariants

- User scope controls the audit verdict; project profiles do not silently broaden it.
- Evidence, not assertion, determines PASS.
- Web reasoning may analyze supplied evidence but must never pretend it inspected fresh repository state.
- Generated assets count as complete only when real files exist and are integrated.
- Image-generation availability is observed at runtime, not assumed from configuration.
- Fresh re-audit evaluates the repaired/generated state against the original locked contract.
- Production access is read-only by default unless separately authorized.
- Hybrid routing never weakens sandbox, approval, production-write, or project-specific constraints.
- Do not retry/switch Web modes to evade usage limits.

See `policies/model-routing.md`, `skills/production-art/SKILL.md`, `skills/audit-repair-loop/SKILL.md`, and `INSTALL.md`.
