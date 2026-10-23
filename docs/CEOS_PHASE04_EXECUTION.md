# CEOS Phase 04 — bounded execution and source-bound replay

`ceos verify` now launches only documented adapters (`npm test`, `npm run
<script> [-- literal-args]`, `node <project-relative.mjs|js|cjs>`, `node
--check <script>` or `node --version`). Manifest shell strings, `node -e`,
unsupported executables, and shell operators are blocked before spawning.
Npm scripts remain trusted repository-controlled code; this is not a shell
sandbox or a guarantee that arbitrary npm script internals are safe.

Each executable gate has a 5-minute default deadline (50 ms to 30 minutes
through `--gate-timeout-ms`) and 2 MiB combined output limit. Timeout or
overflow produces a non-PASS gate with `GATE_TIMEOUT` or
`GATE_OUTPUT_LIMIT`. The process supervisor stops spawned descendants via
POSIX process groups or Windows `taskkill /PID ... /T /F`. Evidence records
termination reason, signal, elapsed duration, adapter and exact result.

`ceos verify --replay-from <prior-evidence-dir>` validates the preceding
checkout identity, exact Git HEAD, SHA-256 of actual modified/untracked source
bytes (not only Git status filenames), and gate evidence
before running the entire current suite again. Prior PASS is never reused as
current PASS. A gate that commits/changes source mid-run causes the overall
verification to become `BLOCKED / SOURCE_DRIFT_DURING_GATES`, regardless of
its own exit status.

The browser-only DEV helper has a 15-second startup deadline, a finite turn
deadline and bounded graceful/forced shutdown. Timeout results are technical
failures, never artistic approvals. A local protocol stub exercises these
behaviors without claiming real Web High entitlement, browser availability or
delivery of actual pixels.

The Ubuntu and Windows release CI jobs now exercise process supervision,
local Git worktree safety, exact-source replay, and helper protocol tests.
The separate platform-installation gates remain unchanged. Release still
requires real CI results and any application-specific manual acceptance.

For branch/worktree organization and opt-in local cleanup see
[`WORKTREE_HYGIENE.md`](WORKTREE_HYGIENE.md).
