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
`config/narrative-game.local.json` and binds
`producerParentSessionId` to the current trusted Codex SessionStart marker.
It persists `nativeProducerRouteRequired=true`. Older runs retain
their original immutable contract. Other kinds of games are unaffected.

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
4. Run the route preflight:

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
