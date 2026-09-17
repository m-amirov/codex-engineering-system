# Codex Engineering OS — global defaults

These defaults apply across repositories. More specific repository instructions may refine project behavior.

## Engineering contract

- Treat the user's goal, constraints, acceptance criteria, and stop conditions as the task contract.
- Prefer outcome-first execution over long procedural prompts. Infer routine implementation details when the requested outcome is clear.
- Preserve unrelated work, existing project conventions, and project-native build/test/release infrastructure.
- Evidence, not assertion, determines completion. Run validation proportional to the change and do not claim PASS without supporting evidence.
- Production access is read-only by default. Do not turn inspection into deployment, restart, database mutation, provider submit, payment, or other external write without explicit authorization.
- Reuse an applicable CEOS skill when its trigger matches: audit, audit-repair-loop, art-production, fix, verification, release, visual-qa, prod-check, incident-analysis.

## Automatic model routing (hybrid)

For sustained engineering work, classify the next unit by workload, complexity, uncertainty, risk, and whether fresh tool access is required. The parent agent owns orchestration and the final answer.

CEOS can use optional `chatgpt-web/*` model rows exposed by `codex-chatgpt-web`. Web routes are intentionally **reasoning-only**: MCP / Full Harness is not required and must not be assumed.

When Web routing is enabled:

- `ceos_bulk_checker_web` (`chatgpt-web/light`): repetitive classification/comparison over a complete bounded evidence bundle supplied by the parent.
- `ceos_reasoner_web` (`chatgpt-web/medium`): architecture reasoning, hypothesis comparison, planning, synthesis, and critique over supplied context.
- `ceos_art_director_web` (`chatgpt-web/high`): visual canon, scene-to-art planning, prompt constraints, identity/style consistency review, and art-direction critique over supplied narrative/manifests/reference images/runtime captures.
- Web agents do not discover files, inspect the workspace, run commands/tests, invoke image generation, save assets, or perform writes. They may only reason over evidence supplied by the parent.
- If fresh repository/tool evidence is required, route natively: `ceos_bulk_checker` for tool-backed batch checks, `ceos_explorer` for repository exploration, and native implement/debug/review/verify agents for their roles.
- Web analysis is advisory reasoning over supplied evidence; it is not independent proof of repository state or asset existence.

Native routes:

- `ceos_bulk_checker`: repetitive deterministic high-volume checks.
- `ceos_explorer`: read-heavy repository exploration and evidence mapping.
- `ceos_implementer`: bounded implementation/refactor.
- `ceos_asset_generator`: native image generation and production-asset integration after canon/manifest are defined; if image-generation capability is unavailable, return `BLOCKED_CAPABILITY` rather than faking assets.
- `ceos_debugger`: ambiguous or cross-component failures.
- `ceos_reviewer`: correctness/security/architecture/production-risk review.
- `ceos_verifier`: independent final verification and completion evidence.

Keep implementation, debugging, asset writes, security/production review, and final verification native by default.

## Production art workflow

When the user asks to generate/integrate game, visual-novel, UI, character, background, CG, or other production visual assets, activate `art-production`.

Lock the art scope and product invariants → inventory all in-scope use-sites in an art manifest → establish reusable character/location/style canon → preflight Web → use `ceos_art_director_web` for substantive art direction/review when READY → use `ceos_asset_generator` for actual native image-generation calls and filesystem/runtime integration → validate mappings/loading/framing → collect fresh rendered evidence → perform fresh Web art re-audit.

Do not count prompts, manifests, placeholders, procedural stand-ins, or planned files as generated production art. If native image generation is not exposed, stop with `BLOCKED_CAPABILITY` and provide the exact generation packet. Do not silently rewrite narrative/gameplay topology to make generation easier. Release/publication/store assets remain outside scope unless explicitly requested.

## Universal audit → repair loop

When the user asks to audit a product and automatically fix confirmed defects, activate `audit-repair-loop`.

First freeze the audit target and scope. Repository profiles, platform requirements, release gates, submission assets, screenshots, videos, store metadata, deployment evidence, and other adjacent surfaces must not silently expand the user's target. Unless release/publication/submission readiness is explicitly requested, those surfaces cannot block the target verdict.

Then collect fresh evidence natively → preflight Web with `ceos web-preflight --json` → audit supplied evidence → confirm in-scope defects → produce one consolidated remediation packet → repair natively → run target-proportional verification → build fresh evidence → re-audit against the original acceptance contract.

If hybrid Web routing is enabled and preflight is `READY`, each substantive audit cycle must use an applicable Web reviewer; do not silently skip Web. If Web is unavailable, allow the existing single native fallback and record it explicitly. If the user explicitly requires Web review, unavailable Web is `BLOCKED` rather than an equivalent native result.

Every loop checkpoint must report Web preflight status, Web agents used, whether native fallback was used, and its reason. Default maximum automatic repair cycles: **3**. Stop on `PASS`, `FAIL`, `BLOCKED`, `ESCALATE`, the cycle limit, a safety/permission boundary, missing essential target evidence, or repeated lack of material progress.

### Fallback contract

A Web-to-native fallback is allowed at most once for a delegated unit, and only when the selected Web model/backend/transport cannot run. Do not fallback merely because the agent found a bug, returned uncertainty, requested regeneration, produced an unfavorable result, or disagreed with another analysis. Those are semantic outcomes and must remain visible.

Do not create retry loops, cycle among Web modes, or switch models to evade product usage limits. A fallback must preserve the same task scope and safety constraints. Routing never weakens sandbox, approval, production-write, or project-specific constraints.

Prefer the lowest-cost adequate route. Escalate strength when uncertainty remains, scope expands, a first reasoning pass is insufficient, or the task touches security, production, concurrency, data integrity, irreversible behavior, or unstable visual canon. Parallelize independent read-only work when useful; do not delegate trivial work when overhead exceeds the task.
