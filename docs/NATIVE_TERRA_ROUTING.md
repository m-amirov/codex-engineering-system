# Native Terra producer: verified routing, not task-name steering

## What CEOS can and cannot guarantee

The default native art producer is the separately configured
`ceos_asset_generator` (`gpt-5.6-terra`, reasoning effort `medium`).

Codex Multi-Agent V2 may expose a restricted `spawn_agent` tool with only
`task_name`, `message`, and `fork_turns`. Naming a task
`ceos_asset_generator` is **not** selecting that custom role. Such a child
can inherit the primary model and its effort even though CEOS installed the
correct TOML. Do not continue image-generation under a falsely claimed Terra
role; do not modify `$CODEX_HOME` model catalogs or silently switch hosts.

CEOS is a Node control plane, **not** the Codex host agent scheduler.
It cannot create a genuine subagent or change the tool's available parameters.
It can reject a workflow when real runtime evidence contradicts the route.

## New-run contract (enabled narrative-game profile only)

A new CEOS `production-art` run reads
`config/narrative-game.local.json` and persists
`nativeProducerRouteRequired=true`, `producerBindingMode=CURRENT_TURN`,
and `producerParentSessionId=null`. **Null is the expected deferred binding, not a mismatch.**
At generation, the official `ceos producer-route-check` resolves the
effective parent session from the consumed run-scoped capability attestation
and matching capability snapshot. The actual child rollout must name this
parent, not the null field. Historical PINNED_PARENT runs retain their own
persisted binding; other kinds of games are unaffected.

Before **any** native image generation:

1. Run `ceos global-status --json`; verify installed
   `$CODEX_HOME/agents/ceos-asset-generator.toml` has the correct model and
   effort. Installation alone is not an executed subagent.
2. Inspect the *actually callable* `spawn_agent` tool schema. If it lacks
   `agent_type` (or a documented equivalent verified custom-role selector),
   do not use `task_name` as a workaround: declare
   `BLOCKED_NATIVE_AGENT_ROUTING_UNAVAILABLE` for strict Terra routing.
3. If supported, start **one** bounded producer subagent with
   `agent_type=ceos_asset_generator`, with no speculative image generation.
   Inspect the real Codex child rollout JSONL written inside
   `$CODEX_HOME/sessions`.
4. The **parent Codex orchestrator** runs the official route preflight for the existing run ID and actual child trace. For CURRENT_TURN runs this is the *only authoritative CEOS parent-matching calculation*. The Terra child must not re-compare the trace to `run.producerParentSessionId=null` or issue its own legacy PINNED_PARENT mismatch based on that field:

```powershell
ceos producer-route-check latest --project . --trace 'C:\Users\user\.codex\sessions\YYYY\MM\DD\rollout-...jsonl' --json
```

It requires these actual rollout records, not a hand-written receipt:

```text
session_meta.payload.id                       = child-session-id
session_meta.payload.source.subagent.thread_spawn.parent_thread_id = bound parent session
session_meta.payload.source.subagent.thread_spawn.agent_role       = ceos_asset_generator
turn_context.payload.model                   = gpt-5.6-terra
turn_context.payload.effort                  = medium
```

All observed turn contexts in that rollout must match. A child with
`agent_role:null`, a parent/self rollout, incorrect effort or inherited
Sol model receives a specific `BLOCKED_NATIVE_AGENT_*` verdict.

When the official gate returns `PASS_NATIVE_AGENT_ROUTE_HOST_OBSERVED`,
the parent records the run ID, exact trace path, actual resolved
`parentSessionId`, bindingMode, and attestation reference. The producer
can use this parent-observed PASS to proceed to its **own** callable Image Gen
tool check; the producer does **not** perform another parent check against the
nullable run field. The parent revalidates the real trace when recording
`GENERATING`. A claimed PASS without the genuine gate result, a changed
trace, a new parent session, missing capability, or incorrect Terra model
does not authorize generation.

5. Only after independent image-generation capability attestation **inside
   the producer's actual execution context**, perform a source-bound art-brief
   verification and issue real Image Gen tool calls. If the tool is not callable
   within Terra, declare `BLOCKED_ART_GENERATION_CAPABILITY`. The model
   itself does not generate PNG bytes.
6. The `GENERATING` checkpoint for the new narrative run must include
   `metadata.producerTraceFile` with the verified actual child rollout path,
   as well as `metadata.artOutputs` with real image files. CEOS re-checks
   the host rollout rather than trusting a `producerModel: "terra"` string.
   Prior image output verification and dual-format checks remain mandatory.

Example checkpoint metadata (paths and bytes must be real; not a receipt):

```json
{
  "producerTraceFile": "C:/Users/user/.codex/sessions/YYYY/MM/DD/rollout-...jsonl",
  "artOutputs": [
    {"path":"assets/production/cg/ep1-cg-portrait.png","kind":"background","width":1024,"height":1536}
  ]
}
```

## Supported claims and limits

`PASS_NATIVE_AGENT_ROUTE_HOST_OBSERVED` means only that one supplied local
Codex rollout has the expected child role and effective model/effort under
the bound parent. It is not a cryptographic signature, provider usage
receipt, image-generation permission, or guarantee that the host cannot
be spoofed by someone who can modify its session files.

A `BLOCKED` verdict is safer than silently spending the parent model's
budget. If current Codex does not support custom-role selection,
do not change the contract to PASS; record the exact schema and
Codex version. A separately started `codex exec -m gpt-5.6-terra` might
be an **independent process**, but it is not an in-app CEOS custom agent,
and its Image Gen tools / authentication / sandbox must be assessed
independently. Never automatically treat it as satisfying a strict custom
agent role.

### Routine diagnostics

```powershell
codex --version
codex features list
ceos version
ceos routing
ceos global-status --json
```

Stop and report a root-cause finding if the selected model is not available
in the current host, `spawn_agent` cannot select a role, the child rollout
lacks effective model evidence, or image generation is inaccessible. Do not
regenerate images to test model routing.

## Large genuine Codex rollouts (CEOS 0.5.19+)

Image-generation child rollouts may grow beyond 32 MiB because the Codex host
records many unrelated message/tool payloads. The route checker now reads genuine
`$CODEX_HOME/sessions/**/*.jsonl` traces incrementally, parses every complete
JSONL record, retains only relevant producer routing fields, and SHA-256 hashes
**all original bytes**. It does not accept a shortened/re-serialized JSONL,
caller-authored summary, or copied session_meta as replacement evidence.

The reader caps source files at **512 MiB** and individual JSONL records at
**64 MiB**, detects changes during read, and still verifies a unique
`session_meta`, distinct child identity, exact parent session, real
`ceos_asset_generator` role, and every `turn_context` as `gpt-5.6-terra`
with effort `medium`. Invalid UTF-8, malformed JSONL, missing/duplicate
metadata and disallowed role/model/parent still block.

For Stage 9.4 recovery, upgrade the installed CEOS before checking the
**original unmodified** 43.42-MiB child trace. Compare the returned SHA-256
with the preserved evidence. Do not rewrite terminal `BLOCKED` checkpoints;
use an explicitly authorized fresh run and CEOS-supported evidence reuse,
retaining original PNG bytes and previous receipts. An accepted route trace is
not a production-art or Web High artistic PASS.

## Immutable multi-cycle capability evidence (CEOS 0.5.38)

Each successful `capability-attest` writes its original JSON **once** to
`.ceos-runs/<RUN_ID>/capability-attestation/attestations/<challengeId>.json`.
The `current.json` file is only a discovery pointer to the latest issued
challenge; the `GENERATING` checkpoint SHA-pins the immutable per-challenge
file, never the mutable pointer.

A new cycle requires a new challenge and a refreshed capability snapshot,
but cannot rewrite the prior checkpoint's attestation. Existing pre-0.5.38
`image-generation.json` records remain readable when `current.json`
is absent; new challenges do **not** overwrite that legacy singleton.

**Historical damage is not silently repaired.** If an old singleton was
already overwritten after a checkpoint pinned its original SHA-256, CEOS
continues to report `INTEGRITY_BLOCKED`. Recover the original *byte-identical*
attestation from an authentic backup if available, verifying its checkpoint
SHA-256 before restoration. Otherwise preserve the damaged run as evidence
and use an explicitly authorized new scoped recovery run with independent
revalidation of accepted PNGs. Do not edit checkpoint hashes or declare
integrity PASS based only on a newer attestation.

## CEOS 0.5.39: verified legacy attestation recovery

Only the **pre-0.5.38** singleton overwrite defect can be repaired with the
following supported, narrowly scoped procedure. It never changes checkpoints,
ledger, generated PNG bytes, or their claims.

```powershell
ceos capability-recover 7acf22 --project "<GAME_WORKTREE>" --json
# Inspect READY_LEGACY_ATTESTATION_RECOVERY and its exact checksum.
ceos capability-recover 7acf22 --project "<GAME_WORKTREE>" --apply --json
ceos resume 7acf22 --project "<GAME_WORKTREE>" --json
```

The repair is available only for an active production-art run at GENERATING,
when **every integrity error** is precisely the changed historical
`capability-attestation/image-generation.json`. The original consuming
challenge metadata is reserialized in its known historical format; only an
**exact SHA-256 match** to the historical GENERATING checkpoint permits
restoration. The newer overwritten bytes are backed up separately under
`capability-attestation/overwritten-backups/` before replacing the singleton
with its mathematically verified original bytes.

Multiple distinct historical checkpoint hashes for the same singleton path,
missing/invalid consumption metadata, an UNKNOWN service-evidence payload that
cannot be reconstructed, unrelated integrity failures, or any checksum
mismatch **block recovery**. Do not guess old JSON or edit old checkpoints.

After successful repair, issue/consume a **fresh** challenge via the immutable
0.5.38+ per-challenge path. The restored historic attestation is not a fresh
capability grant. If reconstruction is impossible, preserve the original run
and follow explicitly authorized new scoped recovery with independent proof.
