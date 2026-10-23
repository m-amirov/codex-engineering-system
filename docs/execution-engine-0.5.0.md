# CEOS 0.5.0 — Deterministic Execution Engine

## Boundary

The execution engine is a control plane, not a second agent runtime. Codex/Web agents still perform semantic work. CEOS persists and validates workflow facts that should not depend on conversational memory.

It records the authorized target, in/out-of-scope surfaces, runtime capabilities, legal next stage, evidence for completed stages, repair/regeneration cycle count, routing trace, evidence integrity, and terminal state.

## Durable state

```text
.ceos-runs/<run-id>/
  run.json
  scope.json
  capabilities.json
  checkpoints/
  artifacts/
  evidence/
```

`scope.json` is immutable for the run and hash-checked. `capabilities.json` is refreshable because Web availability and host tools can change between sessions.

Checkpoint evidence is content-hashed. Resume validates all immutable checkpoint artifacts.

## Transition rule

`ceos checkpoint` accepts only `run.nextStage`. Trying to skip stages is rejected before state mutation. Semantic stages require persisted artifacts; the engine records path, type, size, and SHA-256.

## Cycle rule

Each pipeline owns retry destinations. Retry increments `cycle`; it never silently resets the run. At `maxCycles`, another failed verification/re-audit becomes terminal `FAIL`.

## Web routing rule

Routing trace is persisted by cycle. Final PASS with persisted Web status `READY` requires the pipeline-appropriate Web route in the current cycle:

- audit-repair-loop: `ceos_bulk_checker_web` or `ceos_reasoner_web`;
- production-art: `ceos_art_director_web`.

For non-Web-required runs, an explicit transport/backend fallback may satisfy routing only when `nativeFallbackUsed=true` and a fallback reason is recorded. For `--web-required`, native fallback never satisfies the contract.

## Image-generation rule

The Node CLI cannot inspect the host model's private tool catalog. Image Gen is therefore explicit runtime attestation, not a guess.

Sources are `--image-generation available|unavailable|unknown`, `CEOS_IMAGE_GENERATION_CAPABILITY`, or otherwise `unknown`. Production-art `GENERATING` requires `available`.

## Recovery rule

`ceos resume` is the authoritative recovery path after restart. If evidence is intact, it returns the exact next stage. If evidence changed or disappeared, it returns `INTEGRITY_BLOCKED`; conversation history cannot override the mechanical mismatch.

## Non-goals for 0.5.0

- no hidden Codex RPC/subagent runtime inside CEOS;
- no automatic production/deployment writes;
- no guessing of Image Gen availability;
- no general arbitrary workflow DSL yet;
- no token/cost budget controller yet;
- no dependency-aware incremental verification scheduler yet.

Those can be layered on after the two first-class pipelines prove the state-machine contract in real projects.
