# Codex Engineering OS (CEOS) 0.5.9

CEOS is a global-first engineering operating layer for Codex. Version 0.5.0 introduced the **Deterministic Execution Engine**; 0.5.1 hardened Windows installation so the global CLI no longer depends on the Git worktree so long multi-stage workflows no longer depend on the parent model remembering prose instructions correctly.

## Historical resolution receipt preflight (0.5.9)

CEOS now validates **all** routed Web receipts before adding them to the persisted trace (including `strict` mode). Acceptance receipts must resolve every prior unresolved finding with a supplied, acknowledged evidence reference. The optional run-locked `--resolution-contract-file` binds task-specific exact historical lines to an existing source-evidence file and its SHA-256 at run creation. CEOS does not invent the historical lines or allow an incomplete first receipt to be corrected by editing an immutable trace.

Contract file example (substitute literal verified lines from existing source evidence):

```json
{
  "schemaVersion": 1,
  "sourceEvidence": "artifacts/evidence/original-historical-cues.txt",
  "requiredExactLines": [
    "Direct-prop cues: <first exact historical line>",
    "Direct-prop cues: <second exact historical line>"
  ]
}
```

```powershell
ceos run production-art --target "..." --in-scope "..." --acceptance "..." --mutation-boundary "..." --resolution-contract-file receipt-contract.json
ceos routing-trace latest --web-review-file acceptance-receipt.json --dry-run
ceos routing-trace latest --web-review-file acceptance-receipt.json
```

The acceptance receipt must contain `historicalExactLines` listing the identical lines, plus any `resolvedFindings` with evidence references received by the independent reviewer. The preflight is read-only; recording repeats checks while holding the run lock. A missing/changed historical source or incomplete acceptance fails before a write. Already terminal runs and their old provenance are **not** repaired or relabeled; create a legitimately new run if authorized.

## Deterministic Execution Engine

The first engine-backed pipelines are `audit-repair-loop` and `production-art`.

Each run persists under `.ceos-runs/<run-id>/` with `run.json`, immutable `scope.json`, refreshable `capabilities.json`, `checkpoints/`, `artifacts/`, and `evidence/`.

The engine owns legal stage order, scope/capability snapshots, cycle limits, checkpoint SHA-256 provenance, routing-trace acceptance, terminal verdicts, and restart recovery. The parent Codex agent still performs repository/tool work, model delegation, implementation, Image Gen, browser QA, and semantic review. A CLI transition never substitutes for real evidence.

## GPT-6 Sol High routing (0.5.7)

The managed `ceos_bulk_checker_web`, `ceos_reasoner_web` and
`ceos_art_director_web` all select `chatgpt-web/gpt-6-sol` with
High reasoning effort. Codex Web GPT **6.1.6+** is required for that route.
Legacy `chatgpt-web/high` aliases are rejected by the 0.5.7 Web preflight.

A `READY` preflight means that the routes and local bridge are configured
and healthy; it does **not** prove that GPT-6 actually responded to a
host-side delegated task. Preserve the independent real-response gate.

## Enhanced Web High delegation (0.5.6+)

For new engine-backed runs, CEOS records separate host-orchestrated Web High review phases: `analysis`, `midpoint` after material repair, and fresh `acceptance`. Zero-defect `audit-repair-loop` runs skip only the midpoint; analysis and acceptance remain required when Web is `READY`.

Each receipt must identify the delegated task and trace, match the current source `HEAD`, list the evidence supplied and actually received, and preserve substantive `FINDINGS` during analysis. Acceptance cannot pass with unresolved findings or changed/missing evidence. Web agents remain reasoning-only: the Codex host performs the actual calls, while CEOS validates routing and evidence; the standalone CLI does not simulate a Web response.

Native fallback is accepted only for an allowed non-ready transport state with a transport-specific reason. Semantic reviewer findings, uncertainty, or rejected conclusions are not fallback reasons. Historical `legacy` runs remain readable and are not silently migrated.

## Core commands

### Adopt an existing project

Adoption adds only the CEOS-owned `.codex-os` manifest and report to an
existing project. Discovery is dry-run first; source, npm scripts, Starter Kit
files, assets, and release infrastructure remain project-owned.

```powershell
ceos adopt --project E:/Work/existing-project --dry-run --json
ceos adopt --project E:/Work/existing-project --profile yandex-games
```

An undetermined profile or unmanaged existing CEOS manifest fails closed. A
successful repeat reports `IN_SYNC` and performs no writes.

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

A terminal `BLOCKED` run may be reopened only by an explicit action when its stop reason is a supported recoverable external condition and persisted scope, capabilities, and evidence still pass integrity checks. The old terminal checkpoint remains immutable; CEOS appends a `RUN_REOPENED` event and returns to the blocked stage. PASS, FAIL, ESCALATE, integrity failures, and unsupported/manual blockers cannot be reopened.

```powershell
ceos resume <run-id> `
  --reopen-blocked `
  --reason 'Web High recovered; continue the persisted review' `
  --evidence 'artifacts/evidence/review.json'
```

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

The standalone Node CLI cannot inspect the host model's private tool catalog. CEOS therefore installs Codex lifecycle hooks that record only current session/turn freshness and uses a run-scoped in-session capability challenge before production generation. A future host integration may also persist a **session-bound** callable inventory at `$CODEX_HOME/ceos/native-capabilities.json`:

```json
{"schemaVersion":1,"sessionId":"<current Codex session>","generatedAt":"...","capabilities":{"image-generation":{"provider":"native-host","presence":"PRESENT","serviceAvailability":"UNKNOWN"}}}
```

Callable presence is reported separately from service availability and does not claim quota availability. `PRESENT + UNKNOWN` permits the first real user-required generation attempt; explicit rate/usage-limit evidence blocks further attempts until refreshed. Legacy explicit runtime attestation remains supported for diagnostics, but it is not trusted to unlock production-art:

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

## Native delegation budget (0.5.3)

Long-form writing and editorial repair run in the parent native Codex session **without parallel native scene writers/reviewers by default**. A large requested scope proceeds sequentially, one episode per persisted checkpoint; completion of a checkpoint is not completion of the whole task. At the end of each completed episode use one bounded Web High editorial review when required/available; repair locally, then re-review the changed text and causally affected branch context. The full execution-engine audit-repair-loop retains its mandatory routing/stage/evidence contracts. Independent native tool-backed verification remains available when genuinely necessary; explicit user-requested parallel work remains permitted with disjoint file ownership. See `policies/native-delegation.md` and `skills/romance-narrative/SKILL.md`.

**Scope of enforcement:** CEOS installs instructions and skill policies; it cannot hard-limit the host Codex subagent scheduler, guarantee quota savings, or cancel running subagents. Observe actual active sessions and provider usage separately. CEOS 0.5.8 routes all three managed Web agents to GPT-6 Sol High (`chatgpt-web/gpt-6-sol`); it does not silently downgrade to GPT-5.6.

## Hybrid routing

Web routes remain reasoning-only. As of 0.5.2, every CEOS-managed Web route selects **High**, including bulk checking and general reasoning. Native model routes are unchanged; when High is unavailable, do not silently use a lower Web model:

- `ceos_bulk_checker_web` → `chatgpt-web/gpt-6-sol`
- `ceos_reasoner_web` → `chatgpt-web/gpt-6-sol`
- `ceos_art_director_web` → `chatgpt-web/gpt-6-sol`

Native routes remain responsible for tool-backed evidence, writes, debugging, asset persistence, and final verification. MCP / Full Harness is not required by CEOS.

## Existing verification commands

The engine complements rather than replaces `ceos status`, `doctor`, `gates`, `verify`, `evidence`, `failures`, `web-preflight`, `global-status`, and `routing`.

## Windows installation isolation

CEOS 0.5.1 no longer runs `npm install -g <source-worktree>` from `scripts/install-global.ps1`. The installer first builds a temporary `npm pack` archive outside the repository, installs that archive globally, and deletes the temporary package. This prevents npm's local-package linking behavior from coupling the global `ceos` command to `bin/ceos.mjs` in the Git checkout.

The repository also includes `.gitattributes` with deterministic LF rules for CEOS source/text files, including `*.mjs` and `*.ps1`.

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

Expected version: `0.5.8`. Restart Codex and verify that all three CEOS-managed Web agent TOML files and `$CODEX_HOME/ceos/hybrid-routing.json` specify `chatgpt-web/gpt-6-sol`. This checks configured routing, not the success of a substantive delegation. Fully restart Codex after installation.

For Yandex Games, new projects must still be created through the official Starter Kit before CEOS is attached.

See `docs/execution-engine-0.5.0.md`, `skills/audit-repair-loop/SKILL.md`, `skills/romance-narrative/SKILL.md`, `policies/native-delegation.md`, `skills/production-art/SKILL.md`, and `policies/model-routing.md`.
