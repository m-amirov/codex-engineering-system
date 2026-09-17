# Codex Engineering OS (CEOS) 0.3.2

CEOS is a global-first engineering operating layer for Codex. It installs compact engineering instructions, reusable Skills, project policies, verification/evidence tooling, and task-specific custom agents.

Version 0.3.2 hardens the universal **audit → repair → verify → fresh re-audit** workflow introduced in 0.3.1. It fixes two real pilot defects: audit scope drift into unrelated release-readiness work, and silent native-only audits when Web routing was enabled.

## What 0.3.2 changes

- `audit-repair-loop` now freezes a **scope lock** before audit:
  - target;
  - in-scope surfaces;
  - out-of-scope surfaces;
  - acceptance contract;
  - mutation boundary.
- Repository profiles and platform requirements no longer silently redefine the user's audit target.
- Unless explicitly requested, release/publication/submission artifacts such as store metadata, screenshots, videos, marketing assets, publication forms, and deployment evidence cannot block a product/content/runtime audit verdict.
- New command: `ceos web-preflight`.
- Web installation and Web runtime readiness are now separate concepts. The preflight probes the local `codex-chatgpt-web` health endpoint and reports `READY`, `DISABLED`, `NOT_CONFIGURED`, `UNAVAILABLE`, or `NOT_ACCEPTING_TURNS`.
- If hybrid routing is enabled and Web preflight is `READY`, each substantive `audit-repair-loop` cycle must actually use `ceos_bulk_checker_web` and/or `ceos_reasoner_web`.
- Each checkpoint records routing evidence: Web preflight state, Web agents used, native fallback usage, and fallback reason.
- If Web is unavailable, the existing single deterministic native fallback remains allowed. If the user explicitly requires Web review, Web unavailability is `BLOCKED` rather than silently treated as equivalent native review.

## Audit-repair loop

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

- `ceos_bulk_checker_web` → `chatgpt-web/light`: repetitive classification/comparison over complete supplied evidence.
- `ceos_reasoner_web` → `chatgpt-web/medium`: architecture, product logic, causal analysis, synthesis, critique, and remediation consolidation over supplied context.
- Web agents are reasoning-only in CEOS. They do not discover repository state, run commands/tests, or write files.
- Fresh evidence gathering, implementation, debugging, mechanical verification, security/production review, and final completion evidence remain native.

Native routes remain:

| Role | Native model | Purpose |
|---|---|---|
| `ceos_bulk_checker` | `gpt-5.6-luna` low | tool-backed batch checks |
| `ceos_explorer` | `gpt-5.6-terra` medium | repository exploration/evidence mapping |
| `ceos_implementer` | `gpt-5.6` medium | bounded implementation/refactor |
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

`READY` means Web routing is enabled and the bridge is healthy and accepting turns. Non-ready states do not cause repeated reconnect storms inside CEOS: the loop may use its single native fallback unless Web was explicitly required.

## Using audit-repair-loop

For a general product audit:

```text
Проведи полный аудит продукта через CEOS audit-repair-loop.
Исправляй подтверждённые дефекты автоматически и повторяй verify + fresh re-audit до PASS,
либо остановись на BLOCKED/ESCALATE/лимите циклов.
Не расширяй scope на release/publication readiness, если я этого отдельно не просил.
```

For a specific surface, name it explicitly:

```text
Проведи audit-repair-loop сценария как читательского продукта.
В scope: narrative comprehension, continuity, causality, character/location/time clarity и последствия choices.
Release readiness, gameplay videos, store metadata и публикационные артефакты вне scope.
```

If Web review itself is mandatory:

```text
Проведи audit-repair-loop. Web audit required: если Web недоступен, остановись с BLOCKED, не подменяй его native review.
```

## Recommended Windows installation

1. Install/configure `Codex Web GPT` if you want Web reasoning. Browser sign-in, browser smoke test, **Install models**, and a successful ChatGPT Web turn are sufficient. MCP / Full Harness is optional for CEOS.
2. Extract CEOS 0.3.2.
3. Run:

```powershell
.\scripts\install-global.ps1
```

Then fully restart Codex and start a new task.

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

- User scope controls the audit verdict; project profiles do not silently broaden it.
- Evidence, not assertion, determines PASS.
- Web-backed audit must contain observable Web routing evidence.
- Web reasoning without tools may analyze supplied evidence but must never pretend it inspected fresh repository state.
- Fresh re-audit evaluates the repaired state against the original locked acceptance contract.
- Prefer one consolidated remediation packet over isolated fix prompts when findings interact.
- Production access is read-only by default.
- Hybrid routing never weakens sandbox, approval, production-write, or project-specific constraints.
- Do not retry/switch Web modes to evade usage limits.

See `policies/model-routing.md`, `skills/audit-repair-loop/SKILL.md`, and `INSTALL.md`.
