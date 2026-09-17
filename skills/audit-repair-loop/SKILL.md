---
name: audit-repair-loop
description: Run a bounded audit, remediation, repair, verification, and fresh re-audit cycle for any product artifact or engineering surface. Use when the user wants discovered defects to be fixed automatically and rechecked to an evidence-based verdict.
metadata:
  ceos-version: "0.3.1"
---

# Skill: audit-repair-loop

At activation, run `ceos context --skill audit-repair-loop --project .` when the CEOS CLI is available. Treat the returned profile/policies as the resolved project contract. If CEOS is unavailable, use repository instructions and explicitly state the policy/evidence gap.

**Intent:** convert an audit into a bounded repair cycle without allowing the reviewing model to mutate the product directly.

## Universal loop

1. **Scope and acceptance** — resolve the target artifact/product surface, user constraints, invariants, acceptance criteria, allowed mutation boundary, and stop conditions.
2. **Native evidence collection** — use native tool-backed routes to inspect current files/state, run safe checks, and assemble a bounded evidence snapshot. Web routes never discover repository state themselves.
3. **Audit** — delegate complete supplied bundles to `ceos_bulk_checker_web` for repetitive consistency/classification work when Web routing is enabled and appropriate. Use `ceos_reasoner_web` for cross-cutting reasoning, ambiguity, causal analysis, architecture, UX/product logic, or consolidation. When Web routing is unavailable, use the corresponding native routes.
4. **Confirm defects** — separate confirmed defects from uncertainty, intentional behavior, missing evidence, and non-actionable observations. Do not repair speculative findings.
5. **Build one remediation packet** — consolidate compatible confirmed defects into a single repair task for native Codex. For each defect include: evidence/location, violated expectation, required outcome, invariants/non-goals, acceptance criteria, and dependencies/conflicts with other fixes. Prefer outcomes and constraints over procedural edit instructions.
6. **Native repair** — route implementation to `ceos_implementer`; escalate ambiguous/root-cause work to `ceos_debugger`. Web agents remain reasoning-only and must not write files, run commands, or claim fresh state.
7. **Mechanical verification** — run project-native tests/gates proportional to the change. Treat test/config/infra failures distinctly from product defects. No PASS without evidence.
8. **Fresh re-audit** — construct a new evidence snapshot from the repaired state and review it afresh. Do not ask the reviewer merely to validate its previous recommendations. Re-check the product against the original acceptance contract.
9. **Verdict** — return `PASS`, `FAIL`, `BLOCKED`, or `ESCALATE` with evidence and remaining defects.

## Loop limits

- Default maximum automatic repair cycles: **3**.
- Stop immediately on a safety/permission boundary, destructive or external write not explicitly authorized, irreconcilable requirements, missing essential evidence, or repeated failure with no material progress.
- If the same material defect survives two repair attempts, route one deeper native debug/reasoning pass before another mutation.
- Never switch/retry Web models merely to obtain a more favorable semantic answer or evade usage limits.
- Production access remains read-only unless the project/user explicitly authorizes a controlled write path.

## Remediation packet contract

Produce a compact artifact with:

- `target`
- `acceptance_contract`
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

Apply the same loop to software behavior, UI/UX, narrative/content, configuration, data transformations, integrations, release readiness, visual quality, documentation, or other auditable product surfaces. Select domain-specific checks from the active project profile and repository evidence; do not hard-code narrative, game, web, or backend assumptions into the loop.
