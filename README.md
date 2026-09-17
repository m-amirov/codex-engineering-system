# Codex Engineering OS (CEOS) 0.4.0

CEOS is a global-first engineering operating layer for Codex. It installs compact engineering instructions, reusable Skills, project policies, verification/evidence tooling, and task-specific custom agents.

Version 0.4.0 adds a production-art pipeline that deliberately separates **Web art direction** from **native image generation and file integration**.

## Production art workflow

Use `art-production` when a project needs real characters, backgrounds, CGs, props, UI/game art, or other visual assets generated and integrated into the runtime.

```text
scope + product invariants
        ↓
art manifest / use-site inventory
        ↓
character + location + style canon
        ↓
ceos web-preflight
        ↓
ceos_art_director_web when READY
        ↓
native ceos_asset_generator
        ↓
actual generated project files
        ↓
runtime mapping + validation
        ↓
fresh rendered evidence
        ↓
fresh Web art re-audit
        ↓
PASS | BLOCKED_CAPABILITY | BLOCKED | ESCALATE
```

### Art roles

- `ceos_art_director_web` → `chatgpt-web/high`: reasoning-only visual canon, scene-to-art planning, generation constraints, reference critique, identity/style consistency review, and fresh visual re-audit over supplied evidence.
- `ceos_asset_generator` → `gpt-5.6` medium: native production-asset generation and project-owned filesystem/runtime integration when a native image-generation capability is exposed.

The boundary is strict: a Web response, prompt file, or art manifest is **not** a generated asset. If native image generation is unavailable, CEOS must return `BLOCKED_CAPABILITY` with an exact generation packet rather than fake production art with placeholders or procedural stand-ins.

For recurring characters/locations, establish canonical references first and generate dependent variants from them. Prefer reusable location masters + meaningful variants over blindly producing a unique background for every scene.

Example short task:

```text
Проведи CEOS art-production pass полного сезона.
Сначала собери art manifest и canon персонажей/локаций.
Web art direction required when READY; реальные ассеты генерируй и интегрируй нативно.
После каждого batch проверяй identity/style consistency и runtime mapping.
Заверши fresh rendered evidence + fresh Web art re-audit до PASS/BLOCKED/ESCALATE.
Release readiness вне scope.
```

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

Web routes:

- `ceos_bulk_checker_web` → `chatgpt-web/light`: repetitive classification/comparison over complete supplied evidence.
- `ceos_reasoner_web` → `chatgpt-web/medium`: architecture, product logic, causal analysis, synthesis, and critique over supplied context.
- `ceos_art_director_web` → `chatgpt-web/high`: visual/art-direction reasoning over supplied narrative, manifests, references, generated images, and runtime captures.

All CEOS Web agents are reasoning-only. They do not discover repository state, run commands/tests, invoke image generation, save assets, or perform writes.

Native routes:

| Role | Native model | Purpose |
|---|---|---|
| `ceos_bulk_checker` | `gpt-5.6-luna` low | tool-backed batch checks |
| `ceos_explorer` | `gpt-5.6-terra` medium | repository exploration/evidence mapping |
| `ceos_implementer` | `gpt-5.6` medium | bounded implementation/refactor |
| `ceos_asset_generator` | `gpt-5.6` medium | native image generation + asset integration when capability is exposed |
| `ceos_debugger` | `gpt-5.6` high | ambiguous/cross-component debugging |
| `ceos_reviewer` | `gpt-5.6` high | correctness/security/risk review |
| `ceos_verifier` | `gpt-5.6` high | independent acceptance verification |

Fresh repository/tool evidence, file writes, debugging, security/production review, and final completion evidence remain native.

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

`READY` means Web routing is enabled and the bridge is healthy and accepting turns. CEOS distinguishes `READY`, `DISABLED`, `NOT_CONFIGURED`, `UNAVAILABLE`, and `NOT_ACCEPTING_TURNS`.

Existing BOM-prefixed `hybrid-routing.json` files remain supported and new Windows manifests are written UTF-8 without BOM.

## Recommended Windows installation

1. Install/configure `Codex Web GPT` if you want Web reasoning. Browser sign-in, browser smoke test, **Install models**, and a successful ChatGPT Web turn are sufficient. MCP / Full Harness is optional for CEOS.
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

A healthy 0.4.0 `global-status` includes `agent:ceos_asset_generator` and `skill:art-production`. With Web enabled, `$CODEX_HOME\agents` also contains `ceos-art-director-web.toml`.

If ChatGPT Web model rows are already visible but auto-detection does not find the launcher:

```powershell
.\scripts\install-global.ps1 -Web on
```

Disable optional Web routes while retaining native CEOS:

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
ceos web-preflight
```

## Project-specific integration

Global CEOS works without `.codex-os/project.yml`. Add a project manifest only when executable project gates/evidence or a family profile are required:

```powershell
ceos init --profile yandex-games --project E:\Work\YandexGames\MyGame
ceos doctor --project E:\Work\YandexGames\MyGame
ceos verify --project E:\Work\YandexGames\MyGame
```

For Yandex Games, bootstrap new projects only through the official Starter Kit before attaching CEOS.

## Engineering invariants

- User scope controls the verdict; project profiles do not silently broaden it.
- Evidence, not assertion, determines PASS.
- Web reasoning may analyze supplied evidence but must never pretend it inspected fresh repository state or generated files.
- Production-art PASS requires actual generated files plus integration/render evidence.
- Fresh re-audit evaluates the current state against the locked acceptance contract/canon.
- Production/external-system access remains read-only by default unless separately authorized.
- Hybrid routing never weakens sandbox, approval, production-write, or project-specific constraints.
- Do not retry/switch Web modes to evade usage limits or shop for a favorable semantic result.

See `skills/art-production/SKILL.md`, `policies/art-production.md`, `policies/model-routing.md`, `skills/audit-repair-loop/SKILL.md`, and `INSTALL.md`.
