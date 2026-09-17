# Codex Engineering OS (CEOS) 0.3.1

CEOS is a global-first engineering operating layer for Codex. It installs compact engineering instructions, reusable Skills, project policies, verification/evidence tooling, and task-specific custom agents. Version 0.3.1 adds a universal **audit → repair → verify → fresh re-audit** workflow on top of the optional native / ChatGPT Web reasoning routes introduced in 0.3.0.

## What 0.3.1 adds

- New global Skill: `audit-repair-loop`.
- Product-agnostic orchestration for software behavior, UI/UX, visual quality, narrative/content, configuration, data transformations, integrations, documentation, and release-readiness checks.
- Native Codex remains responsible for fresh repository/tool evidence, implementation, debugging, mechanical verification, and writes.
- Optional Web models remain reasoning-only:
  - `ceos_bulk_checker_web` → `chatgpt-web/light` for bounded repetitive audit/classification over supplied evidence;
  - `ceos_reasoner_web` → `chatgpt-web/medium` for cross-cutting analysis, consolidation, critique, and causal reasoning over supplied context.
- Confirmed defects are consolidated into one **remediation packet** before repair instead of creating one prompt per finding.
- Post-repair review uses a **fresh evidence snapshot** and the original acceptance contract; it must not simply confirm the reviewer's prior recommendation.
- Default maximum automatic repair cycles: **3**.
- Loop exits: `PASS`, `FAIL`, `BLOCKED`, or `ESCALATE`.
- If the same material defect survives two repair attempts, CEOS requires a deeper native debug/reasoning pass before another mutation.
- Production remains read-only by default; audit-repair-loop does not authorize deployments, payments, provider submits, destructive writes, or other external mutations.

## Hybrid routing baseline

CEOS retains optional integration with [`miuuyy/codex-chatgpt-web`](https://github.com/miuuyy/codex-chatgpt-web) without making browser automation, MCP, or API billing a required dependency.

- **No MCP requirement** for the CEOS Web routes. Browser-only ChatGPT Web model rows are sufficient.
- `$CODEX_HOME/ceos/hybrid-routing.json` records whether optional Web reasoning is enabled and explicitly records `mcpRequired: false` / `localToolsAssumed: false`.
- Deterministic fallback: at most one Web → native fallback, and only for backend/transport/runtime unavailability.
- Semantic failures, discovered bugs, uncertainty, disagreements, and unfavorable results never trigger hidden model reruns.
- All fresh repository evidence gathering, terminal/test/browser work, implementation, debugging, security/production review, and final verification remain on native Codex models.
- Existing CEOS 0.2.x/0.3.0 project manifests, Gates, Evidence, Skills, and native agents remain compatible.

## Routing matrix

| Work type | Optional Web route | Native route | Policy |
|---|---|---|---|
| batch classification over a complete supplied evidence bundle | `chatgpt-web/light` | `gpt-5.6-luna` | Web allowed only when no fresh tools are needed |
| architecture/product reasoning / synthesis over supplied context | `chatgpt-web/medium` | parent-selected native role | Web allowed only when no fresh tools are needed |
| repository exploration / dependency tracing | — | `gpt-5.6-terra` | native tool-backed path |
| tool-backed bulk checks | — | `gpt-5.6-luna` | native tool-backed path |
| implementation | — | `gpt-5.6` medium | native critical path |
| debugger | — | `gpt-5.6` high | native critical path |
| reviewer | — | `gpt-5.6` high | native critical path |
| verifier | — | `gpt-5.6` high | native final gate |

CEOS chooses the engineering role and evidence boundary; `codex-chatgpt-web` supplies optional `chatgpt-web/*` model rows. The projects remain separate. CEOS does not fork or modify the Web bridge.

A standard reasoning pattern remains:

```text
native explorer/tooling -> bounded evidence snapshot -> Web reasoner -> native implementation/verification
```

For automatic repair, CEOS 0.3.1 extends it to:

```text
native evidence
    ↓
web/native audit
    ↓
confirmed defects
    ↓
consolidated remediation packet
    ↓
native implement/debug
    ↓
project-native verification
    ↓
fresh evidence snapshot
    ↓
fresh web/native re-audit
    ↓
PASS | FAIL | BLOCKED | ESCALATE
```

The Web result is advisory reasoning over supplied evidence. It is not independent proof of repository or production state.

## Using audit-repair-loop

A short user instruction is enough:

```text
Проведи полный аудит продукта через CEOS audit-repair-loop.
Исправь подтверждённые дефекты автоматически и повторяй verify + fresh re-audit до PASS,
либо остановись на BLOCKED/ESCALATE/лимите циклов.
Не выходи за существующие product constraints и не выполняй production writes без отдельного разрешения.
```

The active project profile determines domain-specific verification. The loop itself does not hard-code game, narrative, frontend, backend, or other product assumptions.

## Recommended Windows installation

1. Install/configure `Codex Web GPT` if you want Web reasoning. Browser sign-in, browser smoke test, **Install models**, and a successful ChatGPT Web turn in Codex are sufficient. MCP / Full Harness is optional and not required by CEOS.
2. Extract CEOS 0.3.1.
3. Run:

```powershell
.\scripts\install-global.ps1
```

The installer:

- installs this CEOS folder globally with npm;
- updates CEOS-managed global Codex instructions, native agents, and Skills, including `audit-repair-loop`;
- verifies `ceos global-status`;
- recognizes the packaged Windows `Codex Web GPT.exe` installation when present;
- installs the two reasoning-only Web agent definitions when enabled;
- writes `$CODEX_HOME\ceos\hybrid-routing.json`.

Then restart Codex and start a **new task**.

If ChatGPT Web model rows are already visible in Codex but auto-detection does not find the launcher:

```powershell
.\scripts\install-global.ps1 -Web on
```

Disable the optional Web routes and retain native CEOS:

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
```

The base `ceos routing` command reports the always-available native custom-agent routes. The optional Web reasoning routes are governed by the hybrid manifest and global routing policy.

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
- Prefer one consolidated remediation packet over many isolated fix prompts when findings interact.
- Prefer the lowest-cost adequate role/model and escalate when uncertainty or risk requires it.
- Web reasoning without tools may analyze supplied evidence but must never pretend it inspected fresh repository state.
- Fresh re-audit must evaluate the repaired state against the original acceptance contract, not merely validate prior recommendations.
- Hybrid routing never weakens sandbox, approval, production-write, or project-specific constraints.
- Do not retry/switch Web modes to evade usage limits.

See `docs/architecture/hybrid-routing.md`, `policies/model-routing.md`, and `INSTALL.md`.
