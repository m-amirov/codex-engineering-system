# CEOS Continue V2 — autonomous continuation with bounded recovery

Phase 03 extends the existing `ceos continue` planner. It does not introduce
another workflow engine or a background service.

## Short command contract

`ceos continue` reads the selected run, immutable scope, current source state,
persisted checkpoints, recovery state and capability snapshot. It returns one
of the following without invoking a host-only tool:

- one bounded next action;
- a linked session recovery already supported by the execution engine;
- a wait/user-action/hard-blocked decision with `reasonCode`, `nextAction` and
  the saved progress that remains valid.

The host adapter performs the action, records actual evidence, and calls
`continue` again. `--mode auto` selects the same bounded path; it never grants
mutation, generation, payment, push, merge or publication authority.

## Capability Broker

`src/capability-broker.mjs` is read-only. It consumes the persisted live
capability snapshot and identifies the route for the next stage. It can expose
the browser-only DEV Web High route (`chatgpt-web/gpt-6-sol`) and the configured
`gpt-5.6-sol` fallback candidate, but it cannot claim either route is
available without current host evidence. A missing run-scoped/current-turn
Image Gen challenge returns `requiresFreshCapabilityChallenge`; it does not
unlock generation or create an attestation.

## Persisted recovery state

New runs contain an optional `recovery` object in `run.json`; old runs without
it remain readable. The object stores the source HEAD, finite technical retry
policy, retry count, next retry time, processed operation IDs, last event and a
bounded event history. Writes use the existing run lock and atomic JSON replace.

Technical retries are independent from execution-engine artistic cycles and
from Candidate Ledger generation attempts. They do not consume PNG candidates,
reset budgets, rewrite receipts or alter accepted bytes.

To persist an actual host-observed technical failure without invoking a tool:

```text
ceos recovery-event RUN_ID --event-file artifacts/recovery-event.json --json
```

The event must be source-bound to the current checkout. Repeating the same
`operationId` is idempotent. An unknown external result, source drift,
checkpoint/integrity failure, missing evidence, provenance/SHA mismatch or
artistic REWORK is not automatically retried.

## Error categories

Every classified decision uses one category:

| Category | Meaning |
| --- | --- |
| `AUTO_RECOVERABLE` | bounded retry of the same technical operation |
| `WAIT_EXTERNAL` | dependent external service must recover; unrelated work may continue |
| `NEEDS_USER_ACTION` | fresh challenge, permission or explicit decision is required |
| `HARD_BLOCKED` | stop and repair the source, scope, evidence or integrity problem |

The category is accompanied by `reasonCode`, `nextAction`, retry count and
saved-state details. No category can turn a mechanical result into artistic
acceptance, and no recovery path can convert historical V2/V3 receipts into a
new review.

When a persisted `WAIT_EXTERNAL` event is followed by a fresh capability
snapshot showing the dependency available, `continue` returns a bounded
`EXTERNAL_RECOVERY_OBSERVED` retry of the saved operation. It does not rewrite
the failure history, invent a success receipt or consume an artistic attempt;
the host must still verify the operation result and checkpoint it normally.

## Safety and compatibility

Existing claims/leases, checkpoints, source-bound validation, capability
attestation, DEV Web High transport, `PASS_WITH_NOTES`, Candidate Ledger,
owner exceptions, Wardrobe V1 compatibility and release gates remain the
authoritative mechanisms. Phase 03 does not generate EP3 PNGs, change accepted
images, modify historical receipts or publish a release.
