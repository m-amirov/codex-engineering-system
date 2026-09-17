# Hybrid native / ChatGPT Web routing

CEOS 0.3.0 adds a second routing dimension without merging CEOS with `codex-chatgpt-web`.

```text
User task
   |
   v
Codex parent / CEOS orchestrator
   |
   +--> need fresh tools/repository evidence? -- yes --> native role
   |
   no
   |
   +--> bounded context already available? -- no --> native evidence collection
   |
   yes
   |
   +--> repetitive/simple supplied-evidence analysis --> Web Light
   |
   +--> reasoning/synthesis/planning/critique -------> Web Medium
            |
            +--> success / semantic outcome --> return analysis
            |
            +--> transport failure only ------> one native fallback
```

`codex-chatgpt-web` remains responsible for exposing `chatgpt-web/*` model rows. CEOS remains responsible for role selection, evidence boundaries, risk policy, fallback semantics, verification, and completion claims.

## Browser-only is sufficient

The CEOS 0.3.0 Web routes intentionally assume **no local Codex tools**. Therefore Browser-only Codex Web GPT setup is sufficient: sign in, pass the browser smoke test, install the Web model rows, restart Codex, and verify a Web turn.

MCP / Full Harness is optional and outside the 0.3.0 routing contract. Even if a user configures MCP separately, CEOS 0.3.0 does not automatically move repository exploration, terminal work, implementation, debugging, security review, or final verification onto Web models.

## Why reasoning-only Web routes

Without MCP, a Web model can still provide useful independent reasoning over context that the parent supplies. It cannot independently inspect the workspace. Treating a Browser-only Web agent as a repository explorer would create false evidence and hidden tool assumptions.

The corrected 0.3.0 design therefore uses Web models only for:

- repetitive classification/checking over a complete supplied evidence bundle;
- architecture reasoning;
- hypothesis comparison;
- planning and option analysis;
- synthesis and critique of bounded context.

Fresh evidence gathering stays native.

## Evidence handoff pattern

```text
native explorer / native tools
          |
          v
bounded evidence snapshot
          |
          v
Web reasoning agent
          |
          v
parent decision/orchestration
          |
          v
native implementation + native verifier
```

A Web analysis can influence what to inspect next, but it is not proof that repository or production state actually has a given property. Completion evidence must come from tool-backed native checks.

## Capability manifest

The Windows installer writes:

```text
$CODEX_HOME/ceos/hybrid-routing.json
```

Example enabled state:

```json
{
  "schemaVersion": 2,
  "ceosVersion": "0.3.0",
  "enabled": true,
  "routingMode": "reasoning-only",
  "mcpRequired": false,
  "localToolsAssumed": false,
  "webAgents": [
    {
      "name": "ceos_bulk_checker_web",
      "model": "chatgpt-web/light"
    },
    {
      "name": "ceos_reasoner_web",
      "model": "chatgpt-web/medium"
    }
  ]
}
```

The manifest is evidence of CEOS installation intent, not proof that a live ChatGPT account currently exposes a particular route. Runtime route failure therefore remains fail-closed and may cause the single native fallback.

## Windows detection

`-Web auto` checks both:

- a legacy/CLI-style `codex-chatgpt-web` command on PATH; and
- the packaged launcher at `%LOCALAPPDATA%\Programs\Codex Web GPT\Codex Web GPT.exe`.

If Web models are already visible in Codex but auto-detection still cannot prove the installation, use `-Web on` explicitly.
