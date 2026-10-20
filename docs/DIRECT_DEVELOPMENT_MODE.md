# Direct development mode (default for ordinary Codex work)

## Decision

CEOS is **optional infrastructure** for everyday coding, game narrative
authoring and normal tests. An ordinary Codex task no longer requires a
CEOS run ID, stage, exclusive claim, capability challenge, checkpoint or
historical-run recovery. These are available for explicitly opted-in
strict workflows, not prerequisites for new development.

```text
User goal -> Codex reads project instructions and existing plan
          -> change source/art briefs -> run project tests
          -> report real evidence -> commit intended changes
```

## Optional read-only context

```powershell
ceos direct --project . --json
```

Response `READY_FOR_DIRECT_DEVELOPMENT` provides current Git HEAD,
branch, dirty status and a bounded list of scripts declared in the project's
package.json. It deliberately **does not run these scripts**, inspect
historical CEOS runs, or create/modify anything. Untracked and dirty work
is visible rather than silently removed. It is a context report, **not**
an acceptance verdict or permission grant.

If the CLI is unavailable, proceed using ordinary Git, project instructions
and project-native test commands. Strict CEOS requirements can be enabled
per task when specifically called for by its owner.

## Acceptance is separate from execution orchestration

- **Narrative/code work:** use project-native validators and unit/runtime
  tests. A unit PASS proves only what those tests cover, not a release.
- **New art:** require genuine host-native generated source files, per-file
  bytes/SHA-256, actual dimensional/mechanical checks, rights and
  provenance, author mapping and independent review of current pixels.
  No fabricated Image Gen or Web High receipt is permitted.
- **Reuse:** do not reinterpret an unrelated scene as a verified image
  mapping. Preserve accepted original bytes and evidence.
- **Existing receipts:** stay immutable. Old REWORK/BLOCKED never becomes
  PASS merely because the direct workflow was selected.
- **Git:** never reset, clean, overwrite unrelated dirty work, force-push,
  merge or publish without applicable permission. Check remote state
  before changes that affect other people.
- **Release:** run full platform/media/SDK and external acceptance gates
  separately. `ceos direct` always has `releaseReady:false`.

## Compatibility / opt-in

All existing `ceos run`, `ceos continue`, `ceos checkpoint`,
`ceos art-progress`, `ceos art-output-verify`,
`ceos episode-art-finalize` and related strict commands remain available,
with their current integrity checks unchanged. Legacy runs and checkpoint
history are neither migrated nor deleted by direct mode.

The older `art-brief-verify` interface remains a *legacy Stage 9.4*
validator. It must not be treated as a mandatory gate for all future
episode identifiers or brief schemas. Projects may implement a
narrative-specific source-bound brief contract; Codex should validate
it against actual authored scene IDs and real references. Until a
matching validator exists, report that contract as `NOT_VERIFIED`,
not as an imagined CEOS PASS. This does not prevent preparing briefs or
performing unrelated narrative/code tasks.

When game-specific rules require strict CEOS for *every* task, the
project owner must explicitly update those project-owned rules to select
direct development. Installing this CEOS change alone does not silently
rewrite project policy.
