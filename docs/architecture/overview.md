# Architecture

CEOS 0.2.0 has a global operating layer plus optional project enforcement.

## Global layer

1. **Global instructions** — a compact managed block in the active Codex-home `AGENTS.md` source.
2. **Custom agents** — personal agents with task-specific models, reasoning effort, sandbox defaults, and narrow roles.
3. **User Skills** — reusable engineering workflows discovered from `$HOME/.agents/skills`.
4. **Installation state** — checksums and paths under `$CODEX_HOME/ceos/` for safe upgrade and drift detection.

This layer is repository-independent and provides the default engineering behavior for any new Codex session.

## Optional project layer

5. **Profiles + policies** — project-family invariants and risk/evidence rules.
6. **Mechanical gates** — project-native verification commands executed by `ceos verify`.
7. **Evidence** — machine-readable proof used to derive PASS/FAIL/BLOCKED.

The project manifest is an adapter, not a build system. It points CEOS at commands the repository already owns. Project-local Codex instructions remain more specific than the global defaults.

## Model-routing boundary

The parent Codex session is the orchestrator. CEOS does not mutate the parent model in-place. It asks Codex to delegate suitable work to globally discovered custom agents. Each custom agent selects its own model and reasoning effort. See `model-routing.md`.

## Trust boundary

CEOS separates verification from external mutation. The verifier blocks commands heuristically classified as R2/R3. Custom-agent sandbox settings are defaults and remain subordinate to Codex runtime permission/approval behavior. These are guardrails, not a replacement for OS/container isolation or explicit production authorization.
