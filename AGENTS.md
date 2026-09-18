# Codex Engineering OS — Agent Map

Keep this file short. Load only the skill/profile/policy required by the task.

## Routing

- Audit without product mutation → `skills/audit/SKILL.md`
- Reproduce + repair a defect → `skills/fix/SKILL.md`
- Independent completion check → `skills/verification/SKILL.md`
- Prepare a release candidate → `skills/release/SKILL.md`
- Browser/presentation QA → `skills/visual-qa/SKILL.md`
- Production image assets / character sheets / backgrounds / CG integration → `skills/production-art/SKILL.md`
- Production inspection → `skills/prod-check/SKILL.md`
- Runtime/log incident diagnosis → `skills/incident-analysis/SKILL.md`

Always load `policies/safety.md`, `policies/evidence.md`, and the resolved project profile. Load other policies only when relevant.

## Invariants

1. Evidence, not assertion, determines PASS.
2. Default production access is read-only.
3. Unknown permission is not permission.
4. Reuse project-native infrastructure; do not build parallel test/build systems unless the task explicitly requires it.
5. Prefer goal + constraints + acceptance criteria over prescriptive multi-thousand-line prompts.
6. Repeated prose rules should migrate into mechanical gates.
7. If required evidence cannot be obtained, return `BLOCKED`, not a guessed PASS.

Use `ceos status`, `ceos doctor`, `ceos gates`, and `ceos verify` for local contracts. For engine-backed workflows use `ceos capabilities`, `ceos run`, `ceos checkpoint`, and `ceos resume`; do not bypass their persisted stage order.
