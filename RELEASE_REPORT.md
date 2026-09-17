# CEOS 0.3.2 Release Report

Date: 2026-09-17

## Intended verdict

`PASS_CEOS_0_3_2_SCOPED_OBSERVABLE_WEB_AUDIT`

## Why 0.3.2 exists

A real `audit-repair-loop` pilot exposed two contract defects in 0.3.1:

1. **Scope drift:** a product/narrative audit expanded into Yandex release-readiness and treated missing gameplay videos as the blocking verdict even though release submission artifacts were not the requested audit target.
2. **Silent native-only audit:** Web routing was merely optional (`when enabled and appropriate`), so the loop could complete without using `ceos_bulk_checker_web` or `ceos_reasoner_web` and without reporting that choice.

A separate runtime pilot also showed that an installed Web route can be unavailable when the local `codex-chatgpt-web` launcher/bridge is not running, producing repeated reconnects rather than a deterministic fallback decision.

## 0.3.2 contract

### Scope lock

Before audit, the loop freezes:

- target;
- in-scope surfaces;
- out-of-scope surfaces;
- acceptance contract;
- mutation boundary.

Repository profiles and platform requirements may select tooling and verification, but they may not silently redefine user scope.

Unless explicitly requested, release/publication/submission artifacts such as gameplay videos, store screenshots, marketing assets, metadata, publication forms, deployment evidence, and other marketplace deliverables are out of scope for product/content/runtime audits. They may be reported separately as `OUT_OF_SCOPE_OBSERVATION`, but they cannot cause `FAIL`, `BLOCKED`, or `ESCALATE` for the locked target.

### Observable Web routing

New command:

```text
ceos web-preflight --json
```

It reads the CEOS hybrid-routing manifest and probes the local `codex-chatgpt-web` health endpoint (`http://127.0.0.1:17841/healthz` by default).

States:

- `READY`
- `DISABLED`
- `NOT_CONFIGURED`
- `UNAVAILABLE`
- `NOT_ACCEPTING_TURNS`

When hybrid routing is enabled and preflight is `READY`, every substantive `audit-repair-loop` cycle must actually use `ceos_bulk_checker_web` and/or `ceos_reasoner_web` before confirming defects. The loop cannot silently choose native-only audit.

Every checkpoint must report:

- `web_preflight_status`;
- `web_agents_used[]`;
- `native_fallback_used`;
- `fallback_reason`.

If Web is unavailable, the existing single deterministic native fallback remains permitted. If the user explicitly requires Web review, a non-ready Web route is `BLOCKED` rather than an equivalent native audit.

## Architecture boundaries preserved

- Fresh repository/tool evidence remains native.
- Web agents remain reasoning-only over explicitly supplied context.
- Implementation remains native `ceos_implementer`.
- Ambiguous/root-cause work remains native `ceos_debugger`.
- Mechanical verification and final completion evidence remain native.
- Production access remains read-only unless separately authorized.
- No model shopping or retries for unfavorable semantic outcomes.

## Verification requirements

The 0.3.2 release gate must prove:

- `ceos version` reads `0.3.2`;
- all Node regression tests pass;
- new Web-preflight tests cover not-configured, disabled, ready, and unavailable states;
- audit-repair-loop contract tests prove scope lock and observable Web routing requirements;
- syntax/lint passes, including `src/web-preflight.mjs`;
- self-test passes;
- source package and SHA-256 artifact are produced;
- pull-request and post-merge `main` release gates both pass.

Final observed CI evidence and artifact digest will be appended only after the latest release gate succeeds.
