# Art rework preflight: material defects first

Standalone, read-only CLI:
`node bin/art-rework-budget.mjs --request path/to/rework-request.json`

A request must contain a stable `scopeKey` (scene/cue/viewport), `proposedMethod` (generation, mapping, staging, crop, css), `proposedStrategyKey`, `transportState`, `findings[]` and `attempts[]`.

Each open P0/P1/P2 finding needs `id`, `status:"OPEN"`, `severity`, `authoredCue`, `observation`, `playerImpact`, `evidenceRef` and `actualPixelsReceived:true`. Purely subjective P3 suggestions cannot authorize more art generation.

Every attempt carries `scopeKey`, `method`, `strategyKey` and `outcome`. Two real generations or three distinct failed approaches trigger ESCALATE. An accepted scope must not be silently reopened. Transport failures stop immediately and do not consume generation attempts.

Denied or escalated results exit with code 2. `READY_FOR_SCOPED_REPAIR` only means the local budget policy permits a bounded repair; it does **not** prove that a reviewer saw the pixels or that production art passed. The host workflow must invoke this gate before mutation and must keep durable attempt ledgers. This tool does not intercept model calls or rewrite CEOS engine history.

Run tests: `node --test tests/art-rework-budget.test.mjs`.

This standalone Stage 2 capability is not yet wired into CEOS execution-engine stage transitions or the game's release gates.
