# Hybrid native / ChatGPT Web routing

CEOS 0.3.0 adds a second routing dimension without merging CEOS with `codex-chatgpt-web`.

```text
User task
   |
   v
Codex parent / CEOS orchestrator
   |
   +--> role classification -----------------------------+
   |                                                     |
   |  bulk checker / explorer                            | implement/debug/review/verify
   v                                                     v
backend policy                                        native critical path
   |
   +--> hybrid enabled? -- no --> native agent
   |
  yes
   |
   +--> Web read-only agent
           |
           +--> success / semantic failure --> return evidence
           |
           +--> transport failure only --> one native fallback
```

`codex-chatgpt-web` remains responsible for exposing `chatgpt-web/*` model rows and, in Full Harness mode, bridging tools through MCP. CEOS remains responsible for role selection, risk policy, fallback semantics, verification, and evidence.

## Why only two Web agents in 0.3.0

The browser transport is unofficial and can fail because of UI/model/account/runtime drift. The first production integration therefore routes only bounded read-only workloads to Web models. Implementation, ambiguous debugging, security/production review, and final verification remain native. A later CEOS release can expand Web routing only after measured stability on real workloads.

## Capability manifest

The Windows installer writes:

```text
$CODEX_HOME/ceos/hybrid-routing.json
```

Example enabled state:

```json
{
  "schemaVersion": 1,
  "ceosVersion": "0.3.0",
  "enabled": true,
  "detection": "codex-chatgpt-web-on-path",
  "webAgents": [
    "ceos_bulk_checker_web",
    "ceos_explorer_web"
  ]
}
```

The manifest is evidence of CEOS installation intent, not proof that a live ChatGPT account currently exposes a particular route. Runtime route failure therefore remains fail-closed and may cause the single native fallback.
