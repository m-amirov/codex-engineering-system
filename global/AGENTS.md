# Codex Engineering OS — global defaults

These defaults apply across repositories. More specific repository instructions may refine project behavior.

## Engineering contract

- Treat the user's goal, constraints, acceptance criteria, and stop conditions as the task contract.
- Prefer outcome-first execution over long procedural prompts. Infer routine implementation details when the requested outcome is clear.
- Preserve unrelated work, existing project conventions, and project-native build/test/release infrastructure.
- Evidence, not assertion, determines completion. Run validation proportional to the change and do not claim PASS without supporting evidence.
- Production access is read-only by default. Do not turn inspection into deployment, restart, database mutation, provider submit, payment, or other external write without explicit authorization.
- Reuse an applicable CEOS skill when its trigger matches: audit, fix, verification, release, visual-qa, prod-check, incident-analysis.

## Automatic model routing (hybrid)

For sustained engineering work, classify the next unit by workload, complexity, uncertainty, and risk. The parent agent owns orchestration and the final answer.

CEOS 0.3.0 supports an optional `codex-chatgpt-web` transport. Its installer records transport availability in `$CODEX_HOME/ceos/hybrid-routing.json`. Treat Web routing as enabled only when that manifest exists with `enabled: true` and the corresponding Web agent is available in the current Codex session.

When hybrid routing is enabled:

- Prefer `ceos_bulk_checker_web` (`chatgpt-web/light`) for repetitive, deterministic, high-volume read-only checks. Native fallback: `ceos_bulk_checker`.
- Prefer `ceos_explorer_web` (`chatgpt-web/medium`) for read-heavy repository exploration, dependency tracing, locating implementations, and broad evidence gathering. Native fallback: `ceos_explorer`.
- Keep `ceos_implementer`, `ceos_debugger`, `ceos_reviewer`, and `ceos_verifier` on their native models by default. They form the critical write/debug/risk/final-verification path in 0.3.0.

When hybrid routing is disabled or the manifest is absent, use the native agents exactly as before:

- `ceos_bulk_checker`: repetitive, deterministic, high-volume checks; log/file batches; simple classification.
- `ceos_explorer`: read-heavy repository exploration, dependency tracing, locating implementations, broad evidence gathering.
- `ceos_implementer`: bounded implementation or refactor after the desired behavior and affected area are understood.
- `ceos_debugger`: ambiguous failures, cross-component bugs, concurrency/state problems, failed acceptance gates, or unclear root cause.
- `ceos_reviewer`: correctness/security/risk review, architecture-sensitive changes, production-risk analysis.
- `ceos_verifier`: independent final verification, acceptance criteria, release readiness, and completion claims.

### Fallback contract

A Web-to-native fallback is allowed at most once for a delegated unit of work, and only when the selected Web model/backend/transport cannot run: unavailable model route, unavailable browser/harness, connector failure, or explicit transport/runtime failure. Do not fallback merely because the agent found a bug, returned uncertainty, failed a test, rejected an assumption, or produced an unfavorable result. Those are semantic/task outcomes and must remain visible.

Do not create retry loops, cycle among Web modes, or switch models to evade product usage limits. A fallback must preserve the same task scope and sandbox. Routing never weakens sandbox, approval, safety, production-write, or project-specific constraints.

Prefer the lowest-cost adequate route. Escalate role/model strength when uncertainty remains, the scope expands, a first reasoning pass is insufficient, or the task touches security, production, concurrency, data integrity, or irreversible behavior. De-escalate repetitive follow-up checks after the hard reasoning is complete. Parallelize independent read-only work when useful; do not delegate trivial work when overhead exceeds the task.
