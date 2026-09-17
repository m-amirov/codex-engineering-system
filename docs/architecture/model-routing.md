# Automatic model routing

CEOS uses Codex custom subagents as the model-routing mechanism. The parent session remains the orchestrator; CEOS routes bounded units of work to globally installed custom agents whose TOML files select the model and reasoning effort.

## Native baseline

| Agent | Model | Effort | Default role |
|---|---|---|---|
| `ceos_bulk_checker` | `gpt-5.6-luna` | low | tool-backed high-volume deterministic checks |
| `ceos_explorer` | `gpt-5.6-terra` | medium | repository exploration and evidence mapping |
| `ceos_implementer` | `gpt-5.6` | medium | bounded implementation after scope is understood |
| `ceos_debugger` | `gpt-5.6` | high | ambiguous/complex debugging |
| `ceos_reviewer` | `gpt-5.6` | high | high-risk correctness/security/architecture review |
| `ceos_verifier` | `gpt-5.6` | high | independent acceptance and release verification |

These six native routes remain the evidence-producing engineering baseline in 0.3.0.

## Optional Web reasoning layer

When Codex Web GPT model rows are installed and CEOS Web routing is enabled, the parent may also use:

| Agent | Model | Effort | Allowed use |
|---|---|---|---|
| `ceos_bulk_checker_web` | `chatgpt-web/light` | low | repetitive analysis over a complete evidence bundle already supplied by the parent |
| `ceos_reasoner_web` | `chatgpt-web/medium` | medium | architecture reasoning, hypothesis comparison, planning, synthesis, critique over supplied context |

The Web layer is **reasoning-only** in CEOS 0.3.0. MCP / Full Harness is not required and local Codex tools must not be assumed. If a task needs fresh files, repository searches, terminal commands, tests, browser interaction, or external-system inspection, route it to the appropriate native agent first.

A native agent may gather evidence and the parent may then pass a bounded snapshot to a Web reasoning agent. The Web result is analysis over that snapshot, not independent evidence of current repository or production state.

## Routing dimensions

Routing is semantic rather than keyword-only. The parent evaluates:

1. workload shape — read-heavy, repetitive, implementation, debugging, review, verification, or reasoning/synthesis;
2. tool need — whether fresh evidence must be collected from files, commands, browsers, or external systems;
3. complexity — local/bounded versus cross-component/multi-step;
4. uncertainty — known path/root cause versus competing hypotheses;
5. risk — ordinary local changes versus security, production, concurrency, data integrity, migration, or irreversible behavior.

Use the lowest-cost adequate route. Escalate when uncertainty or risk rises, a first pass cannot close the task, or verification fails. De-escalate repetitive checks after the hard reasoning is complete.

## Fallback

A Web reasoning delegation may fall back to native at most once, and only when the Web route/backend/transport cannot run. Semantic disagreement, uncertainty, a negative finding, or a failed hypothesis is not a transport failure and must not trigger model shopping.

## Global discovery

`ceos install-global` installs:

- a managed CEOS block into the active global Codex instructions file (`$CODEX_HOME/AGENTS.override.md` when it is non-empty, otherwise `$CODEX_HOME/AGENTS.md`);
- the six native custom agent TOMLs under `$CODEX_HOME/agents/`;
- CEOS skills under `$HOME/.agents/skills/`;
- `$CODEX_HOME/ceos/installation.json` with checksums for drift detection.

`scripts/install-hybrid.ps1` separately manages the optional Web reasoning agent definitions and `$CODEX_HOME/ceos/hybrid-routing.json`.

Project-specific instructions and skills can still add narrower constraints. The global layer is intended to provide the default engineering operating system in every repository.
