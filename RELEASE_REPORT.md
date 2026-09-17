# CEOS 0.4.0 Release Report

Date: 2026-09-17

## Intended verdict

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

## Release gate requirements

The 0.4.0 release gate must prove:

- version read-back = `0.4.0`;
- all Node regression tests pass;
- `production-art` is registered as a first-class Skill;
- `ceos_asset_generator` is installed and exposed in native routing;
- `ceos_art_director_web` is installed only through the hybrid Web route and remains reasoning-only;
- production-art fails closed when image generation is unavailable;
- Web art-director route uses the real `chatgpt-web/high` model row;
- existing audit-repair-loop and Web-preflight regressions remain green;
- syntax/lint passes;
- self-test passes;
- source archive and SHA-256 artifact are produced;
- PR and post-merge `main` release gates pass.

Observed CI evidence and final artifact digest will be recorded after the release gate succeeds.
