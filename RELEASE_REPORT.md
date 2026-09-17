# CEOS 0.3.3 Release Report

Date: 2026-09-17

## Final verdict

`PASS_CEOS_0_3_3_WINDOWS_BOM_SAFE_WEB_PREFLIGHT`

## Why 0.3.3 exists

A real Windows installation of CEOS 0.3.2 exposed a compatibility defect in `ceos web-preflight`:

```text
WEB NOT_CONFIGURED  invalid hybrid-routing manifest: Unexpected token '﻿'
```

The hybrid routing manifest itself was valid JSON, but Windows PowerShell had written it as UTF-8 with BOM. Node read the BOM as `U+FEFF`, and the 0.3.2 preflight passed the raw string directly to `JSON.parse`, which rejects that leading character.

This defect affected runtime Web-readiness detection only. The base global CEOS installation and native agents/Skills remained valid.

## 0.3.3 fix

- `src/web-preflight.mjs` strips a single leading UTF-8 BOM before parsing `hybrid-routing.json`.
- Existing BOM-prefixed manifests created by CEOS 0.3.2 therefore work without manual migration.
- `scripts/install-hybrid.ps1` no longer uses `Set-Content -Encoding utf8` for the manifest.
- The installer writes `hybrid-routing.json` through `System.IO.File.WriteAllText` with `System.Text.UTF8Encoding($false)`, giving explicit UTF-8 without BOM on Windows PowerShell and PowerShell 7.
- No audit-routing, scope-lock, safety, fallback, model, or project-manifest semantics are changed.

## Verification evidence

Pre-merge PR #4 release gate:

- version read-back: PASS (`0.3.3`);
- Node regression tests: PASS, **55/55**;
- BOM-prefixed manifest → healthy `READY`: PASS;
- BOM-free Windows installer write contract: PASS;
- existing Web-preflight state regressions: PASS;
- syntax/lint: PASS;
- self-test: PASS;
- package creation: PASS;
- artifact upload: PASS.

PR #4 was squash-merged into `main` as commit `c8aa074e9310842aa961c286af36728c9f2e6020`.

Post-merge `main` release gate run `35238521880` also passed version read-back, tests, lint, self-test, packaging, and artifact upload.

Post-merge artifact:

- name: `codex-engineering-system-0.3.3`;
- artifact id: `10504736751`;
- size: `74355` bytes;
- digest: `sha256:c259cbbbe71f3aabab17b8faac51b7ed21b31215045187086b04a53a6b3ab36c`.

The release-report-only commit must pass the same `main` release gate before this report is considered final repository evidence.
