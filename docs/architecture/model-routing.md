# Automatic model routing

CEOS 0.2.0 uses Codex custom subagents as the model-routing mechanism. The parent session remains the orchestrator; CEOS routes bounded units of work to globally installed custom agents whose TOML files select the model and reasoning effort.

| Agent | Model | Effort | Default role |
|---|---|---|---|
| `ceos_bulk_checker` | `gpt-5.6-luna` | low | high-volume deterministic checks |
| `ceos_explorer` | `gpt-5.6-terra` | medium | repository exploration and evidence mapping |
| `ceos_implementer` | `gpt-5.6` | medium | bounded implementation after scope is understood |
| `ceos_debugger` | `gpt-5.6` | high | ambiguous/complex debugging |
| `ceos_reviewer` | `gpt-5.6` | high | high-risk correctness/security/architecture review |
| `ceos_verifier` | `gpt-5.6` | high | independent acceptance and release verification |

## Routing dimensions

Routing is semantic rather than keyword-only. The parent evaluates:

1. workload shape — read-heavy, repetitive, implementation, debugging, review, verification;
2. complexity — local/bounded versus cross-component/multi-step;
3. uncertainty — known path/root cause versus competing hypotheses;
4. risk — ordinary local changes versus security, production, concurrency, data integrity, migration, or irreversible behavior.

Use the lowest-cost agent that is adequate. Escalate when uncertainty or risk rises, a first pass cannot close the task, or verification fails. De-escalate repetitive checks after the hard reasoning is complete.

## Global discovery

`ceos install-global` installs:

- a managed CEOS block into the active global Codex instructions file (`$CODEX_HOME/AGENTS.override.md` when it is non-empty, otherwise `$CODEX_HOME/AGENTS.md`);
- custom agent TOMLs under `$CODEX_HOME/agents/`;
- CEOS skills under `$HOME/.agents/skills/`;
- `$CODEX_HOME/ceos/installation.json` with checksums for drift detection.

Project-specific instructions and skills can still add narrower constraints. The global layer is intended to provide the default engineering operating system in every repository.
