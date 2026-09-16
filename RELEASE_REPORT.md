# CEOS 0.2.0 Release Report

Date: 2026-09-16

## Verdict

`PASS_CEOS_0_2_0_GLOBAL_MODEL_ROUTING`

## Scope

CEOS 0.2.0 upgrades the 0.1.1 engineering layer from project-attached tooling to a global-first Codex operating layer. The project Profiles/Gates/Evidence system remains compatible, while a one-time global installation now makes CEOS instructions, Skills, and model-routed custom agents available regardless of repository.

## Global Codex integration

`ceos install-global` installs and verifies:

- a CEOS-managed block in the active Codex-home global instructions file;
- six personal custom agents in `$CODEX_HOME/agents`;
- seven CEOS Skills in `$HOME/.agents/skills`;
- `$CODEX_HOME/ceos/installation.json` with version, paths, model routing, and content checksums.

The installer preserves unrelated global `AGENTS.md` content. A non-empty `AGENTS.override.md` is respected as the active global source. CEOS-owned conflicting targets require explicit `--force` and are backed up first. Targets not recognized as CEOS-managed are never overwritten, including with `--force`.

## Model routing

- `ceos_bulk_checker` → `gpt-5.6-luna`, low
- `ceos_explorer` → `gpt-5.6-terra`, medium
- `ceos_implementer` → `gpt-5.6`, medium
- `ceos_debugger` → `gpt-5.6`, high
- `ceos_reviewer` → `gpt-5.6`, high
- `ceos_verifier` → `gpt-5.6`, high

Routing is based on workload shape, complexity, uncertainty, and risk. The parent session remains the orchestrator; model selection occurs through native Codex custom-subagent delegation rather than in-place mutation of the parent model.

## OpenAI alignment checked

Checked against current Codex documentation on 2026-09-16:

- global `AGENTS.override.md` / `AGENTS.md` discovery;
- personal agents under `~/.codex/agents/`;
- custom agent `model`, `model_reasoning_effort`, and `sandbox_mode` configuration;
- user Skills under `$HOME/.agents/skills`;
- documented model guidance for `gpt-5.6`, `gpt-5.6-terra`, and `gpt-5.6-luna`.

## Verification

- Unit/regression tests: **40/40 PASS**
- Node syntax/lint gate: **PASS**
- Self-test: **40/40 PASS**
- Version read-back: **0.2.0**
- Custom-agent TOML parse/schema smoke: **6/6 PASS**
- Global install isolated smoke, copy mode: **PASS**
- Global status isolated smoke, copy mode: **PASS**
- Global install isolated smoke, link mode: **PASS**
- Global status isolated smoke, link mode: **PASS**
- Existing-user-instructions preservation: **PASS**
- Global install idempotency: **PASS**
- `AGENTS.override.md` precedence: **PASS**
- CEOS-owned conflict fail-closed without force: **PASS**
- Forced backup + replace: **PASS**
- Unmanaged user target preservation even with force: **PASS**
- Dry-run no-write behavior: **PASS**
- Drift detection: **PASS**
- R2/R3 verification non-execution regressions: **PASS**

## Compatibility

- Node: >=22
- Project manifest schema: v1 (unchanged)
- Evidence summary schema: v1 (unchanged from 0.1.1 behavior)
- 0.1.1 project manifests: supported
- Existing CEOS user Skills: upgradeable with `ceos install-global --force`

## Installation

Recommended Windows path after extracting the release:

```powershell
.\scripts\install-global.ps1
```

Manual equivalent:

```powershell
npm install -g <path-to-codex-engineering-os>
ceos install-global --mode copy --force
ceos global-status
ceos routing
```

Start a new Codex session after installation.
