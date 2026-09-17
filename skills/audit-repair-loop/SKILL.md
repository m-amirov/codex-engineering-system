---
name: audit-repair-loop
description: Run a bounded audit, remediation, repair, verification, and fresh re-audit cycle for any product artifact or engineering surface. Use when the user wants discovered defects to be fixed automatically and rechecked to an evidence-based verdict.
metadata:
  ceos-version: "0.3.2"
---

# Skill: audit-repair-loop

At activation, run `ceos context --skill audit-repair-loop --project .` when the CEOS CLI is available. Treat the returned profile/policies as the resolved project contract. If CEOS is unavailable, use repository instructions and explicitly state the policy/evidence gap.

**Intent:** convert an audit into a bounded repair cycle without allowing the reviewing model to mutate the product directly.

## Scope lock

Before auditing, freeze an explicit audit contract:

- `target`: the artifact/product surface the user actually asked to audit;
- `in_scope`: defects that can affect the target verdict;
- `out_of_scope`: adjacent surfaces that may be observed but cannot affect the target verdict;
- `acceptance_contract`: what PASS means for this target;
- `mutation_boundary`: what may be changed automatically.

Do not silently broaden the target because the repository profile contains additional gates, platform requirements, release evidence, deployment assets, store metadata, screenshots, videos, marketing material, publication forms, or other adjacent deliverables. Project profiles select relevant tooling and verification; they do not redefine user scope.

Unless the user explicitly requests release/publication/submission readiness, those surfaces are out of scope for a product/content/runtime audit. An out-of-scope issue may be reported as `OUT_OF_SCOPE_OBSERVATION`, but it must not turn the target verdict into `FAIL`, `BLOCKED`, or `ESCALATE`.

If the user's wording is broad (for example, "audit the product"), keep the audit centered on the product itself: behavior, content, UX, runtime, data/configuration, and other intrinsic product surfaces evidenced by the task. Treat publication packaging and marketplace submission evidence as a separate release-readiness audit unless explicitly included.

## Web routing contract

The audit phase must be observable rather than silently choosing any backend.

1. Before the first Web delegation in a cycle, run `ceos web-preflight --json` when available.
2. If hybrid Web routing is enabled and preflight returns `READY`, at least one substantive audit unit in that cycle **must** be delegated to `ceos_bulk_checker_web` or `ceos_reasoner_web` before defects are confirmed.
3. Use `ceos_bulk_checker_web` for repetitive consistency/classification over a complete bounded evidence bundle. Use `ceos_reasoner_web` for cross-cutting reasoning, ambiguity, causal analysis, architecture, UX/product logic, synthesis, or remediation consolidation.
4. Web routes receive explicit bounded context only. They never discover repository state, run commands/tests, or mutate files.
5. If preflight reports `DISABLED`, `NOT_CONFIGURED`, `UNAVAILABLE`, or `NOT_ACCEPTING_TURNS`, allow exactly one native fallback for that delegated unit and record the reason. Do not spend repeated reconnect attempts merely to prove the same transport failure.
6. If the user explicitly says Web review is mandatory (for example, "обязательно через Web" / "Web audit required"), Web unavailability is `BLOCKED`; native fallback does not satisfy that explicit requirement.
7. Never silently skip Web when routing is enabled and ready.

Every final checkpoint must include a routing trace:

- `web_preflight_status`
- `web_agents_used[]`
- `native_fallback_used`
- `fallback_reason`

A claimed Web-backed audit with no Web agent in the trace is non-compliant.

## Universal loop

1. **Scope and acceptance** — resolve and freeze the scope lock, user constraints, invariants, acceptance criteria, mutation boundary, and stop conditions.
2. **Native evidence collection** — use native tool-backed routes to inspect current files/state, run safe checks, and assemble a bounded evidence snapshot.
3. **Audit** — apply the Web routing contract above. When Web is ready, substantive review must use Web. When Web is unavailable, use the single explicit native fallback unless Web was required by the user.
4. **Confirm defects** — separate confirmed in-scope defects from uncertainty, intentional behavior, missing evidence, rejected findings, and out-of-scope observations. Do not repair speculative findings.
5. **Build one remediation packet** — consolidate compatible confirmed defects into a single repair task for native Codex. For each defect include evidence/location, violated expectation, required outcome, invariants/non-goals, acceptance criteria, and dependencies/conflicts. Prefer outcomes and constraints over procedural edit instructions.
6. **Native repair** — route implementation to `ceos_implementer`; escalate ambiguous/root-cause work to `ceos_debugger`. Web agents remain reasoning-only and must not write files, run commands, or claim fresh state.
7. **Mechanical verification** — run project-native checks proportional to the target and changed surface. Do not import unrelated release gates into the target verdict.
8. **Fresh re-audit** — construct a new evidence snapshot from the repaired state and review it afresh against the original scope/acceptance contract. If Web is ready, the fresh re-audit must again include substantive Web review; do not ask the reviewer merely to validate its previous recommendations.
9. **Verdict** — return `PASS`, `FAIL`, `BLOCKED`, or `ESCALATE` for the locked target, plus routing trace, evidence, remaining in-scope defects, and any separate out-of-scope observations.

## Loop limits

- Default maximum automatic repair cycles: **3**.
- Stop immediately on a safety/permission boundary, destructive or external write not explicitly authorized, irreconcilable in-scope requirements, missing essential target evidence, or repeated failure with no material progress.
- If the same material defect survives two repair attempts, route one deeper native debug/reasoning pass before another mutation.
- Never switch/retry Web models merely to obtain a more favorable semantic answer or evade usage limits.
- Production access remains read-only unless the project/user explicitly authorizes a controlled write path.

## Remediation packet contract

Produce a compact artifact with:

- `target`
- `in_scope`
- `out_of_scope`
- `acceptance_contract`
- `routing_trace`
- `confirmed_defects[]`
  - `id`
  - `severity`
  - `evidence`
  - `violated_expectation`
  - `required_outcome`
  - `invariants`
  - `acceptance`
  - `dependencies`
- `non_goals`
- `verification_required`
- `stop_conditions`

The packet is advisory input to the native repair agent, not evidence that a repair was performed.

## Product-agnostic behavior

Apply the same loop to software behavior, UI/UX, narrative/content, configuration, data transformations, integrations, release readiness, visual quality, documentation, or other auditable product surfaces. The user-selected target decides which surface is authoritative for the verdict. Select domain-specific checks from the active project profile and repository evidence without allowing adjacent surfaces to hijack scope.
