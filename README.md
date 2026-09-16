# Codex Engineering OS (CEOS) 0.2.0

CEOS is a global-first engineering operating layer for Codex. Install it once and every Codex repository inherits the same compact engineering contract, reusable Skills, and automatic multi-model routing. Project Profiles, Gates, and Evidence remain available when a repository needs a stricter local contract.

## What 0.2.0 adds

- Global Codex installation with `ceos install-global`.
- Managed CEOS instructions in the active `$CODEX_HOME/AGENTS.override.md` or `$CODEX_HOME/AGENTS.md` without replacing unrelated user text.
- Six personal custom agents under `$CODEX_HOME/agents/` with task-specific model and reasoning settings.
- Seven CEOS Skills under `$HOME/.agents/skills/`, available in every repository.
- Automatic semantic routing based on workload shape, complexity, uncertainty, and risk.
- Drift detection with `ceos global-status` and checksummed `$CODEX_HOME/ceos/installation.json`.
- Conflict-safe upgrades: differing CEOS-owned agent/skill targets fail closed unless `--force` is explicit; forced replacement is backed up first, while unrelated user targets are never overwritten.
- Dry-run planning with `ceos install-global --dry-run`.

Existing 0.1.1 project manifests and verification behavior remain compatible.

## Automatic model routing

CEOS uses Codex custom subagents, not a wrapper API, to route bounded units of work:

| Agent | Model | Reasoning | Typical work |
|---|---|---|---|
| `ceos_bulk_checker` | `gpt-5.6-luna` | low | repetitive/high-volume deterministic checks |
| `ceos_explorer` | `gpt-5.6-terra` | medium | repository exploration, tracing, evidence gathering |
| `ceos_implementer` | `gpt-5.6` | medium | bounded implementation/refactor after scope is known |
| `ceos_debugger` | `gpt-5.6` | high | ambiguous bugs, state/concurrency, failed gates |
| `ceos_reviewer` | `gpt-5.6` | high | correctness/security/architecture/production-risk review |
| `ceos_verifier` | `gpt-5.6` | high | independent final acceptance and release verification |

The parent Codex thread remains the orchestrator. CEOS does **not** hot-swap the model of an already-running parent thread; it automatically delegates suitable subtasks to the configured agents. This is the native Codex model-routing mechanism.

## One-time global install

```powershell
npm install -g E:\Tools\codex-engineering-os
ceos install-global --mode copy --force
ceos global-status
ceos routing
```

Then start a new Codex session. The global layer applies regardless of repository. Project-local `AGENTS.md`, Skills, and config can still add narrower constraints and take precedence where Codex normally allows them.

For Windows, the package also includes a one-command installer from the extracted folder:

```powershell
.\scripts\install-global.ps1
```

It installs the local package globally, applies the CEOS global layer with safe CEOS-owned replacement, and runs `global-status`.

Use `--mode link` instead of `copy` if you want user-level Skills linked to the central CEOS checkout:

```powershell
ceos install-global --mode link --force
```

Preview an upgrade without changing the Codex home:

```powershell
ceos install-global --dry-run --mode copy
```

## Project-specific integration remains optional

Global CEOS does not require `.codex-os/project.yml`. Add a project manifest only when you want executable project gates, evidence bundles, or a family-specific profile:

```bash
ceos init --profile yandex-games --project /path/to/project
ceos doctor --project /path/to/project
ceos verify --project /path/to/project
ceos failures --project /path/to/project
```

When `package.json` is present, `init` detects profile-relevant scripts instead of inventing commands. The Yandex Games profile, for example, recognizes existing browser/E2E script aliases and omits the E2E gate when no compatible script exists.

## Reusable Skills

The global installation exposes:

```text
$audit
$fix
$verification
$release
$visual-qa
$prod-check
$incident-analysis
```

Codex can also invoke a skill implicitly when its description matches the task.

## Engineering contract

- Evidence, not assertion, determines PASS.
- Production access is read-only by default.
- Unknown permission is not permission.
- Reuse repository-native infrastructure; do not build parallel test/build systems without need.
- Prefer goal + constraints + acceptance criteria over prescriptive multi-thousand-line prompts.
- Route noisy exploration, batch checks, debugging, review, and verification to bounded subagents when delegation is beneficial.
- Prefer the lowest-cost model that is adequate, then escalate on uncertainty, failed attempts, expanded scope, or high risk.

See `docs/architecture/model-routing.md` and `docs/architecture/overview.md`.
