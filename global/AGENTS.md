# Codex Engineering OS — global defaults

These defaults apply across repositories. More specific repository instructions may refine project behavior.

## Engineering contract

- Treat the user's goal, constraints, acceptance criteria, and stop conditions as the task contract.
- Prefer outcome-first execution over long procedural prompts. Infer routine implementation details when the requested outcome is clear.
- Preserve unrelated work, existing project conventions, and project-native build/test/release infrastructure.
- Evidence, not assertion, determines completion. Run validation proportional to the change and do not claim PASS without supporting evidence.
- Production access is read-only by default. Do not turn inspection into deployment, restart, database mutation, provider submit, payment, or other external write without explicit authorization.
- Reuse an applicable CEOS skill when its trigger matches: audit, audit-repair-loop, fix, verification, release, visual-qa, prod-check, incident-analysis.

## Automatic model routing (hybrid)

For sustained engineering work, classify the next unit by workload, complexity, uncertainty, risk, and whether fresh tool access is required. The parent agent owns orchestration and the final answer.

CEOS 0.3.x can use optional `chatgpt-web/*` model rows exposed by `codex-chatgpt-web`. The baseline is intentionally **reasoning-only Web routing**: MCP / Full Harness is not required and must not be assumed.

When Web routing is enabled:

- Use `ceos_bulk_checker_web` (`chatgpt-web/light`) only for repetitive classification, comparison, or consistency checks over a complete bounded evidence bundle already supplied in the delegated prompt.
- Use `ceos_reasoner_web` (`chatgpt-web/medium`) for architecture reasoning, hypothesis comparison, planning, synthesis, or critique over context already supplied by the parent.
- Do not ask a Web agent to discover files, inspect the workspace, search the repository, run commands/tests, browse, call external tools, or perform writes unless a future policy explicitly enables a tool-capable Web route.
- If fresh repository/tool evidence is required, route natively: `ceos_bulk_checker` for tool-backed batch checks, `ceos_explorer` for repository exploration, and the existing native implement/debug/review/verify agents for their roles.
- A native agent may collect a bounded evidence snapshot and the parent may then delegate that snapshot to a Web reasoning agent. Web analysis is advisory reasoning over supplied evidence; it is not independent proof of repository state.
- Keep `ceos_implementer`, `ceos_debugger`, `ceos_reviewer`, and `ceos_verifier` on their native models by default. They form the critical write/debug/risk/final-verification path.

When Web routing is disabled or unavailable, use the native agents exactly as before:

- `ceos_bulk_checker`: repetitive, deterministic, high-volume checks; log/file batches; simple classification.
- `ceos_explorer`: read-heavy repository exploration, dependency tracing, locating implementations, broad evidence gathering.
- `ceos_implementer`: bounded implementation or refactor after the desired behavior and affected area are understood.
- `ceos_debugger`: ambiguous failures, cross-component bugs, concurrency/state problems, failed acceptance gates, or unclear root cause.
- `ceos_reviewer`: correctness/security/risk review, architecture-sensitive changes, production-risk analysis.
- `ceos_verifier`: independent final verification, acceptance criteria, release readiness, and completion claims.

## Universal audit → repair loop

When the user asks to audit a product and automatically fix confirmed defects, activate `audit-repair-loop` rather than treating audit and repair as unrelated tasks.

The loop is product-agnostic. It may cover software behavior, UI/UX, visual presentation, narrative/content, configuration, data transformations, integrations, documentation, release readiness, or other auditable product surfaces.

Use this orchestration contract:

1. Resolve the target, acceptance criteria, invariants, mutation boundary, and stop conditions.
2. Collect fresh evidence natively. Web agents receive only explicit bounded context and never discover repository/tool state themselves.
3. Audit the supplied evidence. Use `ceos_bulk_checker_web` for bounded repetitive review and `ceos_reasoner_web` for cross-cutting reasoning when appropriate; use native equivalents when Web routing is unavailable.
4. Confirm defects. Separate actionable defects from uncertainty, intentional behavior, missing evidence, and rejected findings.
5. Consolidate compatible confirmed defects into one remediation packet. State evidence, violated expectation, required outcome, invariants/non-goals, acceptance criteria, dependencies, required verification, and stop conditions. Prefer outcome constraints over step-by-step edit recipes.
6. Give the remediation packet to native `ceos_implementer`; use `ceos_debugger` when root cause or repair remains ambiguous. Web agents do not mutate files or external systems.
7. Run mechanical/project-native verification proportional to the repair.
8. Build a fresh post-repair evidence snapshot and perform a fresh re-audit against the original acceptance contract. Do not merely ask the reviewer to confirm its previous recommendation.
9. Return `PASS`, `FAIL`, `BLOCKED`, or `ESCALATE` with evidence and remaining defects.

Default maximum automatic repair cycles: **3**. Stop earlier on a safety/permission boundary, missing essential evidence, irreconcilable requirements, destructive/external write without authorization, or repeated failure without material progress. If the same material defect survives two repair attempts, perform one deeper native debugging/reasoning pass before another mutation.

### Fallback contract

A Web-to-native fallback is allowed at most once for a delegated unit of work, and only when the selected Web model/backend/transport cannot run. Do not fallback merely because the agent found a bug, returned uncertainty, rejected an assumption, produced an unfavorable result, or disagreed with another analysis. Those are semantic/task outcomes and must remain visible.

Do not create retry loops, cycle among Web modes, or switch models to evade product usage limits. A fallback must preserve the same task scope and safety constraints. Routing never weakens sandbox, approval, production-write, or project-specific constraints.

Prefer the lowest-cost adequate route. Escalate role/model strength when uncertainty remains, scope expands, a first reasoning pass is insufficient, or the task touches security, production, concurrency, data integrity, or irreversible behavior. De-escalate repetitive follow-up checks after the hard reasoning is complete. Parallelize independent read-only work when useful; do not delegate trivial work when overhead exceeds the task.
