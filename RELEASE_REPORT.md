# CEOS 0.3.2 Release Report

Date: 2026-09-17

## Final verdict

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

## Verification evidence

Pre-merge PR #3 release gate:

- version read-back: PASS (`0.3.2`);
- Node regression tests: PASS, **53/53**;
- scope-drift regression: PASS;
- READY-Web-must-not-be-silently-skipped regression: PASS;
- `ceos web-preflight` CLI tests: PASS;
- Web-preflight state tests (`NOT_CONFIGURED`, `DISABLED`, `READY`, `UNAVAILABLE`): PASS;
- syntax/lint, including `src/web-preflight.mjs`: PASS;
- self-test: PASS;
- packaging: PASS;
- artifact upload: PASS.

PR #3 was squash-merged into `main` as commit `78586bc39765e084e68096d49b41dee19956cfae`.

Post-merge `main` release gate run `35234090870` passed version read-back, tests, lint, self-test, packaging, and artifact upload.

Resulting post-merge artifact:

- name: `codex-engineering-system-0.3.2`;
- artifact id: `10501999870`;
- size: `74709` bytes;
- digest: `sha256:74866f21f7d8ffb606b914a46cf4f10e6d09f0e256ac5f2b9d5edbb97a91f4c8`.

The release-report-only commit must also pass the same `main` release gate before this report is treated as final repository evidence.
