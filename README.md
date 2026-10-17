# Codex Engineering OS (CEOS) 0.5.32

CEOS is a global-first engineering operating layer for Codex. Version 0.5.0 introduced the **Deterministic Execution Engine**; 0.5.1 hardened Windows installation so the global CLI no longer depends on the Git worktree so long multi-stage workflows no longer depend on the parent model remembering prose instructions correctly.

## Verified native PNG transport recovery after terminal BLOCKED (0.5.32)

A narrowly scoped `production-art` GENERATING run stopped with
`STAGE_BLOCKED`, `BLOCKED_ART_OUTPUT` and `ART_FILE_NOT_FOUND` can be
**explicitly** reopened if its original Image Gen PNG has since been
byte-for-byte materialized. This is not generic recovery of failed image art.
The existing failed receipt and terminal checkpoint remain immutable.
Supply a *new* PASS mechanical receipt and the readable original file
from `generated_images`; CEOS confirms exact target, full SHA-256,
actual PNG decoded dimensions, blocked checkpoint, and unchanged Git HEAD.

```powershell
ceos resume RUN_ID --project "<game-worktree>" --reopen-blocked \
  --reason "Native S24 portrait PNG successfully recovered unchanged" \
  --art-output-failed-receipt "artifacts/production-art/stage9.4/output-receipts/S24-portrait-art-output-verify.json" \
  --art-output-pass-receipt "artifacts/production-art/stage9.4/output-receipts/S24-portrait-art-output-imported-verify-20261017.json" \
  --art-output-native-source "<original-absolute-Codex-generated_images-PNG>" --json
```

The command reopens **the same run** with a new auditable
`RUN_REOPENED` checkpoint and `nextStage=GENERATING`, without resetting
the cycle, replenishing candidate budgets, creating another run or granting
Image Gen. It pins the restored PNG and both receipts as hash-checked
checkpoint artifacts, preserves the original blocked reason, and records
`visualAcceptance=NOT_VERIFIED`. A new generation needs a fresh valid
attestation and verified Terra route; the recovered portrait is not a
reason to generate it again.

The `continue --mode inspect` planner reports `RECOVERY_CHECK_REQUIRED`
instead of `NEEDS_RECOVERY_DECISION` for this specific *recognized*
transport failure, but still cannot perform a reopen or accept image art.
Missing/mismatched bytes, wrong source HEAD, wrong blocker or forged
receipts leave the terminal run untouched. Git dirty status from the
restored evidence is **not** implicitly cleaned or committed; normal
product work still follows the existing Git preflight boundary.

## Native Image Gen PNG materialization (0.5.31)

Image Gen tools may render and display an image without saving an accessible
PNG inside the game's worktree. `art-output-verify` intentionally checks
the **real target file**; a displayed image, dimensions or reported hash
without bytes must return `ART_FILE_NOT_FOUND`.

When Codex receives a **real local PNG file path** from the Image Gen tool,
materialize it in the project before the output gate:

```powershell
ceos art-output-import --project "<game-worktree>" --source "<accessible-native-original.png>" --target "assets/production/S24-portrait.png" --sha256 "<full actual SHA256>" --kind background --width 1024 --height 1536 --json
ceos art-output-verify --project "<game-worktree>" --file "assets/production/S24-portrait.png" --kind background --width 1024 --height 1536 --receipt "artifacts/production-art/S24-portrait-verified.json" --json
```

Import never invokes Image Gen, reads remote chat content or guesses image
bytes. It verifies the source SHA-256, actual PNG format/dimensions/kind,
copies into a project-only path without overwriting existing assets, hashes
the copied bytes and returns `PASS_ART_OUTPUT_TRANSPORT` only on success.
A repeated import with identical bytes is safe. Provider provenance and
visual acceptance remain unverified by mechanical checks.

If no accessible source file or documented binary-save channel exists,
**stop before any additional Image Gen calls**; do not fake a PNG, manually
mark gates PASS, or automatically recreate the previous image. Search
original host-produced attachments/temporary files for a SHA-matching
original. A terminal blocked run remains terminal unless a separately
supported, explicitly authorized recovery is available. Do not edit
`run.json`, accepted scene assets or immutable checkpoints manually.

## Terra producer deferred parent binding (0.5.30)

For a narrative production-art run with `producerBindingMode=CURRENT_TURN`,
`run.producerParentSessionId=null` is **intentional**. An official
`ceos producer-route-check RUN_ID --project ROOT --trace TRACE --json`
that returns `PASS_NATIVE_AGENT_ROUTE_HOST_OBSERVED` resolves the
effective parent from live, consumed run-scoped Image Gen attestation
and verifies the actual Terra Medium child rollout. This check is owned
by the parent Codex orchestrator and is independently repeated when
recording the GENERATING checkpoint. The Terra child must not do a
second legacy pinned-parent comparison against the nullable field.

The child still needs real callable Image Gen access in its execution
context. A PASS from the parent route does not grant the child Image Gen
or certify output, provider availability, quality or acceptance. An
actual incorrect child parent, role/model mismatch or changed trace
remains BLOCKED; run metadata cannot be hand-edited to bypass it.
The shipped agent and production-art instructions now explicitly
state this contract, and the low-level missing-parent diagnostic
points callers to the official resolver.

## Bounded run/session Image Gen authority (0.5.29)

`ceos capability-challenge` and `ceos capability-attest` still require a
matching trusted parent session **and turn when the challenge is issued and
answered**. The consumed Image Gen attestation is then reusable for at most
30 minutes within the same verified parent session, run and worktree, even if
Codex delivers another `UserPromptSubmit` turn. `ceos producer-route-check`
and `GENERATING` share this verification. This prevents false `turn mismatch`
blocks after valid generation setup; the stored original turn identity and
single-use challenge remain auditable.

A new Codex session or checkout, expired attestation, absent current host
binding, changed run, mismatched challenge/receipt, missing real Terra Medium
child rollout or Image Gen unavailability still block. Prior 0.5.28
`run-session-turn` receipts are accepted **only** while matching the same
run/session and the new freshness window; no indefinite upgrade of trust.
No fake traces, assertion-based parent binding or bypass of output/visual gates.
The producing native agent must separately possess callable Image Gen;
parent-only tool presence does not establish child tool access.

## Parent/child Codex hook isolation (0.5.28)

Codex can emit `UserPromptSubmit` for a spawned native subagent.
Those events include `subagent` metadata and must **not** replace the
current worktree `host.json`, global freshness markers, parent turn,
or parent lifecycle. CEOS now ignores a subagent's UserPromptSubmit for
parent-session freshness. Native child provenance is verified separately
via the genuine rollout JSONL (role, child-parent relationship, model
and effort). A child hook does not create authority when a root turn
does not exist. A new **root** UserPromptSubmit still invalidates the
prior attestation; no across-turn capability grant is created.

A `BLOCKED_GENERATION_CURRENT_TURN_UNVERIFIED (turn mismatch)` due to
child hook takeover is therefore avoided. This fix **does not** resolve
a genuine provider/model mismatch: a child that actually runs
`gpt-5.6-luna` is not Terra Medium, even if the installed agent TOML
requests Terra. CEOS keeps `BLOCKED_NATIVE_AGENT_MODEL_MISMATCH` until
the effective child model/effort is correctly configured and observed.
The route cannot be approved by changing the declared or asserted
model without a fresh authentic child rollout.

## Execution-bound host trust (0.5.27)

CEOS selects the **currently host-bound** `UserPromptSubmit` session/turn in
the **exact canonical worktree** for native capability challenges and producer
parent resolution. A historical `active` lifecycle without a matching current
host turn remains visible in `ceos session-diagnostics` as
`HISTORICAL_ACTIVE_NOT_CURRENT`; it does not veto a fresh trusted turn merely
because a prior Codex session closed without `SessionEnd`. No lifecycle files
are deleted, rewritten, or falsely marked ended.

Still fail-closed: absent `UserPromptSubmit` / wrong cwd; corrupt or stale
current scoped marker; mismatched host session or turn; missing attestation;
reused challenge from another turn; forged/unrelated Terra child rollout.
The run-scoped capability challenge and producer trace continue to prove
the **current execution**, not the complete history of Codex sessions.
Run-level parallel work uses the existing exclusive `ceos continue --claim`
lease; hosts must claim and release on failure rather than circumventing it.
Neither a stale lifecycle nor an attestation alone authorizes generation or
a checkpoint. Real PNG + mechanical and artistic gates remain mandatory.

For an existing run, reopen Codex in the correct worktree, submit a new
prompt, then run `ceos session-diagnostics --project <worktree> --json`.
`PASS` allows a *fresh* run-scoped Image Gen challenge. No historical
run/brief migration, manual lifecycle cleanup, or new run is required.

## Source-bound art briefs without self-referential Git HEAD (0.5.26)

The existing Stage 9.4 `sourceHead` field points to the product-source
commit *before* the brief itself was committed. Requiring it to equal the
new HEAD makes any committed brief stale by definition.

`ceos art-brief-verify --file <project-relative-brief.json>` now accepts
either an exact current HEAD or a verified, ancestor-pinned **brief-only
commit**. For the second case every intervening changed Git entry must be
a new committed JSON brief under
`artifacts/production-art/stage9.4/briefs/`, with the same sourceHead,
a valid scene ID and exact byte equality with the Git blob. Every character
reference is still verified by actual file bytes and SHA-256.

Changes to narrative, scripts, assets, source references or even unrelated
evidence in the intervening commit cause `BLOCKED_ART_BRIEF`. Missing,
untracked or uncommitted briefs never satisfy this exception. A brief-only
commit does not verify Image Gen availability, route, visual quality or
acceptance. Old brief JSON and accepted S19–S23 assets need no modification.

## Current-turn Terra producer-route preflight (0.5.25)

`ceos producer-route-check` and the `GENERATING` checkpoint now share
the same parent-resolution contract. For `CURRENT_TURN` runs,
`producerParentSessionId: null` is expected: the parent is derived from
a fresh, consumed run-scoped capability challenge and the matching
`capabilities.json` snapshot for the current live session and turn.
The preflight verifies the actual child rollout's role, parent ID and
model/effort without writing a parent ID into `run.json`.

An absent, stale, unrelated, or non-PRESENT attestation remains blocked,
and the child producer trace cannot be substituted with a parent assertion.
Preflight does not generate images or authorize an art checkpoint; those
still require real output PNGs and independent gates. Historical
`PINNED_PARENT` run behavior is preserved.

## Explicit worktree relocation (0.5.24)

If an existing, not-yet-generated production-art run has physically moved to
another Git worktree, `ceos continue` reports
`NEEDS_EXPLICIT_RUN_RELOCATION` rather than silently reading snapshots from
the original checkout. Preview without mutation:

```powershell
ceos run-relocate <run-id> --project "<target-worktree>" --json
```

The preview includes `originalRunSha256`. Review the project, source Git
ancestry, checkpoint count, and evidence, then explicitly apply:

```powershell
ceos run-relocate <run-id> --project "<target-worktree>" --apply --expect-sha <originalRunSha256> --json
```

This operation works only at `CANON_READY → GENERATING`, on a clean worktree,
with source HEAD reachable as an ancestor, unchanged scope/capabilities and
all relocated checkpoint artifacts SHA-matched. It writes original JSON backups
and a relocation receipt, revalidates full integrity and rolls back on failure.
It never invokes or attests Image Gen, imports producer traces, changes accepted
art or enables Web High. Native generation still requires a fresh trusted
current-turn capability attestation and real producer trace.

**Lifecycle is not required for ordinary continue, inventory, canon, or
relocation.** Its trust boundary applies at native generation, not to
project-file progress. `BLOCKED_SESSION_CONTEXT_UNVERIFIED` means the current
checkout has no trusted Codex turn; it is not proof that Image Gen is available
or unavailable.

## Continue and source-bound project progress (0.5.23)

Ordinary `ceos continue` is project-oriented. It selects the next persisted
run action and, when present, projects one source-bound art-progress index or
acceptance ledger from `artifacts/`. Accepted evidence survives a Codex session
change; the response reports remaining scope without regenerating accepted
pairs. A blocked ledger remains blocked and cannot become Release PASS.

New narrative production-art runs defer producer binding until the generation
turn. Restarting Codex before generation does not create a recovery run. Fresh
current-turn capability evidence and a real Terra child route are still
mandatory at generation.

## Automatic linked session recovery (0.5.21)

Ordinary `ceos continue` now uses guided mode. When a narrative
`production-art` run is awaiting `GENERATING` but its parent Codex
session has changed, CEOS can create a new source-bound run using an accepted
CANON_READY checkpoint and a fresh SessionStart/UserPromptSubmit binding.
This compatibility path applies only to historical pinned-parent runs without
`producerBindingMode`; it is not used for new deferred-binding runs.
The old run is not edited, and earlier art/review receipts are not re-attested
as new output. Image generation requires fresh current-turn capability proof;
`--mode inspect` and `--dry-run` remain strictly read-only. Invalid hooks,
Git drift, stale canon, conflicting recovery, output-file transport failures
and unrelated terminal blockers remain blocked. See
[CEOS Continue V1](docs/CEOS_CONTINUE_V1.md) for safety constraints.

## Narrative Art Acceptance V2 (0.5.14)

New `production-art` runs for an enabled `narrative-game` profile use
`NARRATIVE_ART_ACCEPTANCE_V2`. Web High prioritizes story correctness and
player-facing readability over incidental/background pixel differences.
P2 is non-blocking by default unless an independent reviewer provides
specific pixel-backed evidence of material impact on understanding the
authored cue; P3 is always advisory. P0/P1 story-critical errors remain
blocking. A cosmetic-only `REWORK` cannot be promoted to PASS by the
parent: the real Web reviewer must issue a fresh independent verdict.

This is enforced in the Web acceptance validator, the opt-in V2 coverage
queue and rework preflight. Full actual-pixel coverage, immutable receipts,
source hashes, dual-format output and native model routing gates are
unchanged. Existing runs are not retroactively rewritten.
See `docs/NARRATIVE_ART_ACCEPTANCE_V2.md`.

## Per-image Art Output Gate (0.5.12)

After **every single Image Gen invocation**, the native Terra producer must run:

```sh
ceos art-output-verify --file assets/generated/alice.png --kind sprite --width 1024 --height 1536 --receipt artifacts/production-art/alice-output.json --json
ceos art-output-verify --file assets/generated/notebook.png --kind prop --receipt artifacts/production-art/notebook-output.json --json
```

`BLOCKED_ART_OUTPUT` (exit code 2) stops the batch **before another generation**. The gate validates 8-bit RGB/RGBA noninterlaced PNG content, SHA-256, dimensions, transparent/nonempty alpha and corners, and strong baked-checkerboard patterns. Mechanical PASS never means independent visual acceptance. New production-art `GENERATING` checkpoints must include `--metadata-json '{"artOutputs":[{"path":"...png","kind":"sprite","width":1024,"height":1536}]}'` and pin actual file hashes; historical runs are untouched. No provider-call interception is implied outside this host-guided contract.

`ceos art-output-normalize --file source.png --output normalized.png` safely crops alpha bounds and pads at 512×512 **without resampling** if the content fits. Otherwise it refuses to alter the output. Never remove a checkerboard by simply adding alpha. `ceos art-output-batch --manifest manifest.json` inspects a saved batch fail-fast but does not replace each immediate post-generation check. See `policies/art-producer.md`.

## Explicit attachment-quota blocker (0.5.10)

If the Web host or bridge explicitly reports `ATTACHMENT_QUOTA_EXHAUSTED` (for example, `Достигнут лимит прикрепления файлов` / `File attachment limit reached`), stop all attachment retries immediately. Generic upload failures and HTTP 429 are **not** proof of this quota. The limit's scope and reset time are unknown unless the provider supplies evidence. CEOS cannot see ChatGPT's account-level quota when the bridge does not expose it.

For an *active* enhanced Web-review run, preserve the exact failed-turn message in a project-local log and record the terminal blocker:

```powershell
ceos web-attachment-block latest --project . --phase midpoint --evidence artifacts/evidence/web-upload-error.txt --json
```

This records immutable evidence SHA-256 and the current cycle, stops the run with `BLOCKED / ATTACHMENT_QUOTA_EXHAUSTED`, does not increment repair/generation cycles, and cannot create a Web pixel receipt or be counted as visual acceptance. The `phase` must match the active checkpoint. Missing/ambiguous log messages fail closed **without changing the run**. Prior terminal runs are not rewritten; after quota recovery use a separately authorized fresh run.

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

For recovery of already-created art, use an explicit
`--art-mode VERIFIED_EXISTING_ART_REUSE` production-art run. The mode does not
attest or invoke Image Gen; it requires a current source-bound reuse contract
with real PNG hashes, dual-format/scene mapping, provenance, runtime pixels,
independent art acceptance, canon and clean blocking-findings evidence. See
`docs/execution-engine-0.5.16.md`.

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
