# Codex Engineering OS (CEOS) 0.5.0

CEOS is a global-first engineering operating layer for Codex. Version 0.5.0 adds a **Deterministic Execution Engine** so long multi-stage workflows no longer depend on the parent model remembering prose instructions correctly.

## Deterministic Execution Engine

The first engine-backed pipelines are `audit-repair-loop` and `production-art`.

Each run persists under `.ceos-runs/<run-id>/` with `run.json`, immutable `scope.json`, refreshable `capabilities.json`, `checkpoints/`, `artifacts/`, and `evidence/`.

The engine owns legal stage order, scope/capability snapshots, cycle limits, checkpoint SHA-256 provenance, routing-trace acceptance, terminal verdicts, and restart recovery. The parent Codex agent still performs repository/tool work, model delegation, implementation, Image Gen, browser QA, and semantic review. A CLI transition never substitutes for real evidence.

## Core commands

```powershell
ceos capabilities --project . --json

ceos run audit-repair-loop `
  --project . `
  --target 'full-season reader experience' `
  --in-scope 'comprehension;continuity;causality' `
  --out-of-scope 'release readiness;store metadata' `
  --acceptance 'fresh re-audit has no confirmed in-scope defects' `
  --mutation-boundary 'scenario/runtime files required for confirmed defects' `
  --web-required

ceos checkpoint latest --stage EVIDENCE_COLLECTED --artifact '.ceos-evidence/current/evidence.json'
ceos resume latest
ceos run-status latest
ceos routing-trace latest --web-agents 'ceos_reasoner_web'
```

`ceos run` returns the only valid next stage. `ceos checkpoint` refuses out-of-order transitions.

## Audit-repair-loop state machine

```text
SCOPE_LOCKED
  → CAPABILITIES_CHECKED
  → EVIDENCE_COLLECTED
  → AUDITED
  → DEFECTS_CONFIRMED
  → REPAIRING
  → VERIFIED
  → REAUDITED
  → PASS | FAIL | BLOCKED | ESCALATE
```

When `defectCount=0`, CEOS records a deterministic skipped-repair checkpoint but still requires verification and fresh re-audit. Failed verification/re-audit consumes a cycle and moves to the pipeline-defined retry stage; the cycle limit becomes a mechanical terminal boundary.

When the persisted Web capability is `READY`, final PASS requires observable pipeline-appropriate Web review in the current cycle unless a permitted non-required transport fallback was explicitly recorded. `--web-required` never accepts native fallback as equivalent Web review.

## Production-art state machine

```text
SCOPE_LOCKED
  → CAPABILITIES_CHECKED
  → INVENTORIED
  → CANON_READY
  → GENERATING
  → INTEGRATED
  → VISUAL_VERIFIED
  → REAUDITED
  → PASS | FAIL | BLOCKED | ESCALATE
```

`GENERATING` is mechanically rejected unless the current capability snapshot says `imageGeneration.status=available`.

The standalone Node CLI cannot inspect the host model's private tool catalog. Image Gen therefore uses explicit runtime attestation:

```powershell
ceos capabilities --image-generation available
# or
$env:CEOS_IMAGE_GENERATION_CAPABILITY='available'
```

Allowed values: `available`, `unavailable`, `unknown`. If capability state changes after a run starts:

```powershell
ceos resume latest --refresh-capabilities --image-generation available
```

## Evidence integrity and resume

Every semantic checkpoint records the path, type, size, and SHA-256 of its persisted evidence. `ceos resume` revalidates the scope hash, current capability hash, and immutable checkpoint artifacts. Missing or modified evidence yields `INTEGRITY_BLOCKED`; conversation history cannot override the mechanical mismatch.

## Hybrid routing

Web routes remain reasoning-only:

- `ceos_bulk_checker_web` → `chatgpt-web/light`
- `ceos_reasoner_web` → `chatgpt-web/medium`
- `ceos_art_director_web` → `chatgpt-web/high`

Native routes remain responsible for tool-backed evidence, writes, debugging, asset persistence, and final verification. MCP / Full Harness is not required by CEOS.

## Existing verification commands

The engine complements rather than replaces `ceos status`, `doctor`, `gates`, `verify`, `evidence`, `failures`, `web-preflight`, `global-status`, and `routing`.

## Windows upgrade

```powershell
cd E:\Tools\codex-engineering-os
git pull --ff-only
.\scripts\install-global.ps1 -Web auto
ceos version
ceos global-status
ceos capabilities --project .
ceos web-preflight
```

Expected version: `0.5.0`. Fully restart Codex after installation.

For Yandex Games, new projects must still be created through the official Starter Kit before CEOS is attached.

See `docs/execution-engine-0.5.0.md`, `skills/audit-repair-loop/SKILL.md`, `skills/production-art/SKILL.md`, and `policies/model-routing.md`.
