# Codex Engineering OS — global defaults

These defaults apply across repositories. More specific repository instructions may refine project behavior.

## Engineering contract

- Treat the user's goal, constraints, acceptance criteria, and stop conditions as the task contract.
- Prefer outcome-first execution over long procedural prompts. Infer routine implementation details when the requested outcome is clear.
- Preserve unrelated work, existing project conventions, and project-native build/test/release infrastructure.
- Evidence, not assertion, determines completion. Run validation proportional to the change and do not claim PASS without supporting evidence.
- Production access is read-only by default. Do not turn inspection into deployment, restart, database mutation, provider submit, payment, or other external write without explicit authorization.
- Reuse an applicable CEOS skill when its trigger matches: audit, audit-repair-loop, fix, verification, release, visual-qa, romance-narrative, production-art, prod-check, incident-analysis.

## Deterministic execution engine

For engine-backed multi-stage workflows (`audit-repair-loop` and `production-art`), use the CEOS control plane when 0.5.0+ is available:

- create the immutable scope/capability snapshot with `ceos run <pipeline> ...`;
- execute only the `nextStage` returned by CEOS;
- persist stage evidence and advance with `ceos checkpoint`;
- record actual Web/fallback use with `ceos routing-trace`;
- after interruption, call `ceos resume` instead of inferring progress from conversation history;
- do not claim PASS when run integrity is stale, the state machine has not reached terminal PASS, or required evidence is absent.

The standalone CLI does not secretly execute Codex/Web agents. The parent agent performs semantic work; CEOS deterministically controls ordering, cycle limits, capability gates, evidence provenance, resumability, and verdict acceptance.

## Native delegation budget (especially literary tasks)

Follow `policies/native-delegation.md` for the full contract. **For literary drafting and editorial repair, use the parent Codex session as the sole native writer/editor by default. Do not spawn multiple native workers for different episodes, routes or repairs, or duplicate manuscript/canon reads in parallel native contexts.** Process large writing requests episode by episode with persisted progress; never call a partial checkpoint completion of the full task.

Use at most one bounded substantive Web High editorial review per completed episode by default, and after repair review only changed text plus causally affected branches unless the original acceptance contract requires full-scope re-audit. Deterministic counts and ID checks are local commands, not agent tasks. If an independent native tool-backed review is genuinely required or the user explicitly requests parallelism, delegate the minimum narrowly scoped role and record why. This is instructional: CEOS cannot set a hard Codex-host subagent count or guarantee provider quota usage.

## Automatic model routing (hybrid)

For sustained engineering work, classify the next unit by workload, complexity, uncertainty, risk, and whether fresh tool access is required. The parent agent owns orchestration and the final answer.

CEOS 0.5.x can use optional `chatgpt-web/*` model rows exposed by `codex-chatgpt-web`. Web routes are **reasoning-only** unless a future policy explicitly changes that contract; MCP / Full Harness is not required and must not be assumed.

When Web routing is enabled, **all CEOS-managed Web roles use `chatgpt-web/high` with high reasoning effort**. Never silently substitute a light/medium Web mode if High is unavailable; use the existing explicit failure/fallback rules, or `BLOCKED` when Web is required. Preflight READY alone does not prove a completed High-mode delegation.


- `ceos_bulk_checker_web` (`chatgpt-web/high`): repetitive classification/comparison over a complete bounded evidence bundle supplied by the parent.
- `ceos_reasoner_web` (`chatgpt-web/high`): architecture reasoning, hypothesis comparison, planning, synthesis, or critique over supplied context.
- `ceos_art_director_web` (`chatgpt-web/high`): art direction, visual canon, asset briefs, and consistency review over supplied manifests/contact sheets/screenshots. It does not generate or persist files.
- Do not ask a Web agent to discover files, inspect the workspace, run commands/tests, browse, call local tools, or perform writes.
- If fresh repository/tool evidence is required, route natively: `ceos_bulk_checker` for batch checks, `ceos_explorer` for repository exploration, `ceos_asset_generator` for bounded asset generation/integration when native image generation is actually available, and the existing native implement/debug/review/verify agents for their roles.
- Web analysis is advisory reasoning over supplied evidence; it is not independent proof of repository state.
- Keep implementation, asset persistence, debugging, risk review, and final verification native.

When Web routing is disabled or unavailable, use the native agents:

- `ceos_bulk_checker`: repetitive deterministic checks.
- `ceos_explorer`: repository exploration/evidence mapping.
- `ceos_implementer`: bounded implementation/refactor.
- `ceos_asset_generator`: bounded native image generation + asset integration; if no native image-generation capability is available, report `BLOCKED` rather than fabricate assets.
- `ceos_debugger`: ambiguous/cross-component debugging.
- `ceos_reviewer`: correctness/security/architecture/production-risk review.
- `ceos_verifier`: independent final verification.

## Web transport pacing and cooldown

Follow `policies/web-transport.md`. For attachment-heavy Web High review, send turns sequentially with at least 20s between attachment-bearing turns. Explicit 429/"too many requests"/usage-limit signals use bounded 120s → 300s → 600s cooldown; after the third event stop as `BLOCKED: WEB_RATE_LIMITED`. A longer Retry-After wins.

Generic attachment failures are not rate limits: retry only the failed turn after 30s, then 60s, and block after two retries. Transport retries do not consume generation/repair cycles. A pixel-backed REWORK/FAIL is semantic, not transport. Runtime dialogue/navigation chrome is expected UI, not baked UI inside the asset.

## Production art pipeline

When the user asks to create, replace, or integrate production image assets, activate `production-art` rather than treating image generation as an incidental implementation detail.

Lock product invariants → build an asset manifest → preflight Web → establish character/location/style canon → use `ceos_art_director_web` for substantive art direction when `READY` → generate bounded batches natively with `ceos_asset_generator` when image generation is available → integrate real files and mappings → collect fresh runtime screenshots/contact sheets → Web consistency review when available → `visual-qa` → final manifest/runtime re-audit.

Never claim a generated asset exists unless the file is present in the workspace. Prefer canonical character/location masters plus meaningful variants over independent one-off scene generation. Generation convenience must not redefine narrative/gameplay/topology/character cores. Record image-generation capability and generated/integrated asset counts in the checkpoint.

## Universal audit → repair loop

When the user asks to audit a product and automatically fix confirmed defects, activate `audit-repair-loop`.

First freeze the audit target and scope. Repository profiles, platform requirements, release gates, submission assets, screenshots, videos, store metadata, deployment evidence, and adjacent surfaces must not silently expand the user's target. Unless release/publication/submission readiness is explicitly requested, those surfaces cannot block the target verdict.

Then collect fresh evidence natively → `ceos web-preflight --json` → audit supplied evidence → confirm in-scope defects → one consolidated remediation packet → repair natively → target-proportional verification → fresh evidence → re-audit against the original acceptance contract.

If Web is enabled and preflight is `READY`, each substantive audit cycle must use the appropriate Web reviewer; do not silently skip Web. If Web is unavailable, allow the existing single native fallback and record it. If the user explicitly requires Web review, unavailable Web is `BLOCKED`.

Every loop checkpoint reports Web preflight status, Web agents used, whether native fallback was used, and why. Default maximum automatic repair cycles: **3**. Stop on `PASS`, `FAIL`, `BLOCKED`, `ESCALATE`, the cycle limit, a safety/permission boundary, missing essential target evidence, or repeated lack of material progress.

### Fallback contract

A Web-to-native fallback is allowed at most once for a delegated unit and only when the selected Web model/backend/transport cannot run. Do not fallback because the agent found a bug, returned uncertainty, rejected an assumption, or disagreed with another analysis.

Do not create retry loops, cycle among Web modes, or switch models to evade usage limits. Fallback preserves task scope and safety constraints. Routing never weakens sandbox, approval, production-write, or project-specific constraints.

For native routes, prefer the lowest-cost adequate route and escalate strength when uncertainty remains or risk warrants it. Web routes are fixed to High; do not optimize Web costs by selecting a lower Web mode. For literary production, do not parallelize native agents by default. For other work, parallelize only bounded independent tasks where the benefit justifies extra native contexts; do not delegate trivial work when overhead exceeds the task.
