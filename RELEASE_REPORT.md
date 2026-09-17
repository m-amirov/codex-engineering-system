# CEOS 0.4.0 Release Report

Date: 2026-09-17

## Intended verdict

`PASS_CEOS_0_4_0_ART_PRODUCTION_ROUTING`

## Why 0.4.0 exists

The first production-art planning pass exposed a missing CEOS capability boundary: existing Web agents could reason about visual evidence, but CEOS had no dedicated art-director role and no native role responsible for actual image generation plus filesystem/runtime integration. Treating Web reasoning as if it had generated files would violate CEOS evidence rules; forcing every art task through the generic implementer would lose visual-canon and capability-specific safeguards.

## 0.4.0 architecture

### Web art director

New optional hybrid route:

- `ceos_art_director_web` → `chatgpt-web/high`;
- reasoning-only, read-only;
- accepts supplied narrative context, art manifests, canonical references, generated assets, and runtime captures;
- owns visual canon, scene-to-art planning, generation constraints, identity/style consistency reasoning, batch critique, and fresh visual re-audit;
- does **not** inspect the repository, invoke image generation, save files, or prove asset existence.

### Native asset generator

New base global route:

- `ceos_asset_generator` → `gpt-5.6`, medium;
- workspace-write;
- invokes native image-generation capability when the current Codex runtime exposes it;
- writes only project-owned generated assets, updates mappings/manifests, and runs targeted load/framing validation;
- if image generation is unavailable, returns `BLOCKED_CAPABILITY` with the exact generation packet instead of claiming prompt-only or placeholder completion.

### `art-production` Skill

New globally installed Skill enforces:

- scope/product-invariant lock;
- art manifest before high-volume generation;
- canonical character/location/style references before dependent variants;
- coherent batch production rather than unrelated scene-by-scene improvisation;
- Web preflight and observable routing for art-direction review;
- actual generated-file + runtime evidence for PASS;
- explicit separation from release/publication/store-art scope unless requested.

### Policy and installation

- new `policies/art-production.md` defines capability truthfulness, project-owned mutation boundary, canon consistency, evidence, and external/release boundaries;
- `policies/model-routing.md` now distinguishes Web art direction from native image-generation/write responsibility;
- global install/status/manifest tracks `ceos_asset_generator` and `art-production`;
- hybrid installer adds/removes `ceos_art_director_web` with the existing deterministic single-fallback contract;
- existing BOM-safe `hybrid-routing.json` behavior is preserved.

## Release acceptance

The 0.4.0 release gate must prove:

- version read-back: `0.4.0`;
- all Node regression tests pass;
- global install includes `ceos_asset_generator` and `art-production`;
- routing table includes the native asset generator;
- hybrid static contract includes `ceos_art_director_web` → `chatgpt-web/high`;
- Web/native art-role separation and `BLOCKED_CAPABILITY` behavior are mechanically covered;
- existing audit-repair-loop, Web preflight, BOM, safety, evidence, profile, and installation regressions remain green;
- syntax/lint and self-test pass;
- source ZIP + SHA-256 artifact are produced;
- both PR and post-merge `main` release gates pass.

Final observed CI evidence and artifact digest will be recorded after the release gates succeed.
