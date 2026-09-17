# CEOS 0.4.0 Release Report

Date: 2026-09-17

## Final verdict

`PASS_CEOS_0_4_0_PRODUCTION_ART_PIPELINE`

## Why 0.4.0 exists

CEOS already supported Web-assisted reasoning, audit/repair, and visual QA, but production image creation still had no explicit engineering contract. A project could define staging and readability while still lacking real character art, expressions, backgrounds, or CG assets.

0.4.0 adds a dedicated production-art workflow without turning Web agents into unbounded tool users.

## Architecture

### Web art direction

`ceos_art_director_web`:

- `chatgpt-web/high`;
- reasoning-only;
- receives bounded manifests, references, contact sheets, screenshots, and scene context supplied by the native parent;
- defines or critiques visual canon, generation briefs, asset families, identity consistency, scene-to-art mappings, and remediation;
- cannot claim repository inspection, image-file generation, persistence, or runtime integration.

The `chatgpt-web/high` model row was separately verified against the current `miuuyy/codex-chatgpt-web` provider catalog before release configuration was finalized.

### Native generation/integration

`ceos_asset_generator`:

- native `gpt-5.6`, medium reasoning;
- workspace-write;
- executes bounded generation/integration from an approved canon and manifest;
- uses native image generation only if the current Codex runtime actually exposes it;
- if image generation is unavailable, returns `BLOCKED` rather than fabricating assets or silently accepting placeholders;
- persists real files, updates project-owned mappings/manifests, and gathers fresh runtime evidence.

### Production-art Skill

`production-art` provides:

1. scope/invariants lock;
2. asset inventory/manifest;
3. Web preflight;
4. character/location/style canon before volume generation;
5. bounded native generation batches;
6. immediate file/runtime integration;
7. batch consistency review;
8. fresh runtime visual QA;
9. final manifest/runtime re-audit.

## Preserved invariants

- Web routes remain reasoning-only.
- MCP / Full Harness is not required by CEOS.
- Actual file persistence and runtime verification remain native/tool-backed.
- Image-generation availability is observed at runtime, not assumed from agent registration.
- Production-art does not authorize deployment, publication, paid provider calls, or unrelated product mutations.
- Existing audit-repair-loop scope lock, Web preflight, deterministic fallback, BOM-safe Windows manifest handling, and project profiles remain intact.

## Verification evidence

PR #6 (`CEOS 0.4.0: add production-art pipeline`) was tested after correcting one over-literal regression assertion that did not change the production-art contract.

Final PR release gate:

- run: `35257778826`;
- head: `e6c402cbb6d64d0a029c08ca6c933ecab5f0cdcd`;
- version read-back: PASS (`0.4.0`);
- Node regression tests: PASS, **59/59**;
- production-art first-class Skill/native-route regression: PASS;
- Web art-director reasoning-only/hybrid-install regression: PASS;
- fail-closed missing-image-generation regression: PASS;
- existing audit-repair-loop, Web-preflight, and Windows BOM regressions: PASS;
- syntax/lint: PASS;
- self-test: PASS;
- packaging: PASS;
- artifact upload: PASS.

PR artifact:

- name: `codex-engineering-system-0.4.0`;
- artifact id: `10512582888`;
- size: `83679` bytes;
- uploaded-artifact digest: `sha256:e3daac4ac3c4d3502a271a1c457d3437af7c24dc0dd84497453d0039f12a5bbc`.

PR #6 was squash-merged into `main` as commit `f16dd456342867636f9297fc3ccf5d54db877545`.

Post-merge `main` release gate:

- run: `35257842082`;
- head: `f16dd456342867636f9297fc3ccf5d54db877545`;
- version read-back: PASS;
- tests: PASS;
- lint: PASS;
- self-test: PASS;
- packaging: PASS;
- artifact upload: PASS.

Post-merge artifact:

- name: `codex-engineering-system-0.4.0`;
- artifact id: `10513697998`;
- size: `83680` bytes;
- digest: `sha256:3094d9ee94d81ad5a0c618e352ae24a859bc3480db8545ac6ca9d7e247c5848d`.

This release-report-only commit must pass the same `main` release gate before the report is treated as final repository evidence. The artifact produced by that final gate supersedes the post-merge artifact above as the current release artifact because the archive includes this report.
