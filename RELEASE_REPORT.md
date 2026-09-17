# CEOS 0.3.3 Release Report

Date: 2026-09-17

## Intended verdict

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

## Regression requirements

The 0.3.3 release gate must prove:

- `ceos version` reads `0.3.3`;
- all Node regression tests pass;
- a BOM-prefixed enabled hybrid-routing manifest produces `READY` when the health endpoint is healthy;
- existing `NOT_CONFIGURED`, `DISABLED`, `READY`, and `UNAVAILABLE` preflight behavior remains intact;
- installer static contract proves UTF-8-no-BOM writing and rejects the old `Set-Content ... -Encoding utf8` pattern;
- lint/syntax passes;
- self-test passes;
- package and SHA-256 artifact are produced;
- both PR and post-merge `main` release gates pass.

Final observed CI evidence and artifact digest will be recorded after the latest release gate succeeds.
