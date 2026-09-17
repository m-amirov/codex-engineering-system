# CEOS 0.3.1 Release Report

Date: 2026-09-17

## Intended verdict

`PASS_CEOS_0_3_1_UNIVERSAL_AUDIT_REPAIR_LOOP`

## Scope

CEOS 0.3.1 adds a universal `audit-repair-loop` Skill on top of the 0.3.0 reasoning-only Web routing baseline. The loop is product-agnostic and can be used for software behavior, UI/UX, visual presentation, narrative/content, configuration, data transformations, integrations, documentation, and release-readiness work.

The workflow is:

```text
native evidence collection
→ web/native audit
→ confirmed defects
→ consolidated remediation packet
→ native implement/debug
→ project-native verification
→ fresh evidence snapshot
→ fresh web/native re-audit
→ PASS | FAIL | BLOCKED | ESCALATE
```

## Audit-repair contract

- Fresh repository/tool evidence is collected natively.
- `ceos_bulk_checker_web` may perform bounded repetitive review over complete supplied evidence.
- `ceos_reasoner_web` may perform cross-cutting reasoning, synthesis, causal analysis, architecture/product critique, and remediation consolidation over supplied context.
- Web agents remain reasoning-only and never mutate files or external systems.
- Confirmed compatible defects are consolidated into one remediation packet containing evidence, violated expectation, required outcome, invariants/non-goals, acceptance criteria, dependencies, required verification, and stop conditions.
- Native `ceos_implementer` performs bounded repairs; `ceos_debugger` handles ambiguous root-cause or repeated repair failures.
- Mechanical verification remains project-native and evidence-based.
- Post-repair review uses a fresh evidence snapshot and the original acceptance contract rather than merely confirming earlier recommendations.

## Loop boundaries

- Default maximum automatic repair cycles: 3.
- Exit states: `PASS`, `FAIL`, `BLOCKED`, `ESCALATE`.
- Stop on safety/permission boundaries, missing essential evidence, irreconcilable requirements, destructive/external writes without authorization, or repeated lack of material progress.
- If the same material defect survives two repair attempts, require one deeper native debugging/reasoning pass before another mutation.
- Production remains read-only by default.

## Web routing baseline

- `ceos_bulk_checker_web` → `chatgpt-web/light`, reasoning-only.
- `ceos_reasoner_web` → `chatgpt-web/medium`, reasoning-only.
- `ceos_bulk_checker` → native `gpt-5.6-luna`, low, for tool-backed batch checks.
- `ceos_explorer` → native `gpt-5.6-terra`, medium, for repository exploration and fresh evidence gathering.
- `ceos_implementer` → native `gpt-5.6`, medium.
- `ceos_debugger` → native `gpt-5.6`, high.
- `ceos_reviewer` → native `gpt-5.6`, high.
- `ceos_verifier` → native `gpt-5.6`, high.

Critical writes, fresh repository inspection, terminal/tests/browser work, ambiguous debugging, security/production-risk review, and final acceptance remain native.

## MCP boundary

CEOS 0.3.1 does **not** require MCP / Full Harness. Browser sign-in, installed ChatGPT Web model rows, and a successful Web turn in Codex are sufficient for optional Web reasoning routes. Tool-backed roles stay native unless a future explicit policy changes that boundary.

## Compatibility

- Node: >=22
- Project manifest schema: v1 unchanged
- Evidence schema: v1 unchanged
- Eight global Skills, including `audit-repair-loop`
- Five Profiles unchanged
- Six native custom-agent routes unchanged
- Two optional Web reasoning routes unchanged from corrected 0.3.0 baseline
- `codex-chatgpt-web`: optional; CEOS remains functional without it

## Verification gates for this release

- `ceos version` must read `0.3.1`.
- Node regression suite must PASS.
- Skill-shape tests must include `audit-repair-loop`.
- Global installation tests must prove the new Skill is installed/checksummed and does not overwrite unrelated user targets.
- Hybrid Web-agent static-contract tests must continue proving reasoning-only behavior and absence of a Web explorer route.
- `npm run lint` must PASS.
- `npm run self-test` must PASS.
- Release packaging must complete only after all gates pass.
- GitHub Actions release gate must run for pull requests to `main` and pushes to `main`.

## Observed pre-merge evidence

The first 0.3.1 PR run reached the Node regression suite and reported 43/44 passing tests. The only failure was a stale test assertion hard-pinned to `VERSION === 0.3.0`; the product/runtime behavior was not implicated. The assertion was generalized to the 0.3.x reasoning-only baseline.

A subsequent PR run passed version read-back, all Node regression tests, syntax/lint, self-test, source packaging, and artifact upload before release-metadata cleanup. Final release verdict requires the latest post-cleanup PR run to complete successfully.
