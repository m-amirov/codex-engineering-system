---
name: production-art
description: Plan, generate, integrate, and verify production image assets with a Web art-director + native asset-generation workflow. Use for character sheets, expressions, backgrounds, CGs, visual canon, asset manifests, image-generation batches, consistency review, and runtime integration.
metadata:
  ceos-version: "0.5.0"
---

# Skill: production-art

## Deterministic execution contract

When CEOS 0.5.0+ is available, start a persisted `ceos run production-art` instead of tracking the pipeline only in prose. Use `ceos checkpoint` for inventory, canon, generation, integration, visual verification, and fresh re-audit; use `ceos resume` after interruption.

The engine mechanically prevents generation before the capability snapshot says native image generation is `available`, hashes persisted evidence, enforces stage order/cycle limits, and refuses a final PASS when required observable Web review is missing. Refresh host capability attestation with `ceos resume <run> --refresh-capabilities --image-generation available|unavailable|unknown` when the runtime changes.

The parent Codex agent remains responsible for actual Image Gen calls, file integration, browser evidence, and Web art-direction delegation. CEOS run-state proves orchestration, not the content of an image.

At activation, run `ceos context --skill production-art --project .` when the CEOS CLI is available. Treat the returned profile/policies as the resolved project contract. If CEOS is unavailable, use repository instructions and state the evidence gap.

## Intent

Turn an approved product/art direction into real project-owned image assets without letting generation convenience redefine product behavior.

## Pipeline

1. **Lock scope and invariants.** Freeze the product surfaces that generation must not alter: story/gameplay topology, state schema, character core, mechanics, release scope, and any accepted staging constraints.
2. **Inventory before generation.** Build a machine-readable or clearly structured asset manifest mapping each required use site to asset family, subject/location, state/expression/variant, dimensions/aspect ratio, transparency/background requirement, current status, and runtime mapping.
3. **Preflight Web.** Run `ceos web-preflight --json` when available. If Web is `READY`, delegate substantive art-direction work to `ceos_art_director_web`. The Web agent is reasoning-only: it may define canon, generation briefs, consistency criteria, and review supplied visual evidence, but it must not claim to generate or persist files. Before delegation, validate the evidence bundle: every screenshot and character/location reference must be readable image content with hash and dimensions recorded. A filename, path, DOM summary, OCR/text description, or message that a screenshot was created is not pixel evidence. If actual pixels cannot be supplied, visual acceptance is `BLOCKED`.
4. **Establish canon first.** Before mass generation, define reusable character/location/style references: identity anchors, palette/material/lighting rules, wardrobe/props, camera/framing intent, and allowed variation. Prefer canonical masters + meaningful variants over one-off generation per scene.
5. **Generate natively.** Delegate bounded batches to `ceos_asset_generator`. It may use native image generation only if that capability is actually available in the current Codex environment. If image generation is unavailable, stop with `BLOCKED` rather than creating placeholders while claiming production completion.
6. **Integrate immediately.** Persist actual generated files under project-owned paths, update the asset manifest and runtime mappings, and avoid orphaned files. Do not silently overwrite unrelated user assets.
7. **Review each batch.** Check identity/style drift, wrong emotion/state, wrong location/time layer, composition, transparency/cropping, naming, missing/broken assets, and accidental placeholder retention. When Web is `READY`, send contact sheets/screenshots/manifest excerpts as bounded evidence to `ceos_art_director_web` for critique.
8. **Runtime verification.** Use `visual-qa` for fresh desktop/mobile/browser/runtime evidence after integration. Source inspection alone does not prove staging, crop, readability, or scene-to-art correctness. Verify the authored visual event before and after the cue that triggers it, recording expected event id, observed asset source/hash and runtime state; filename similarity is not coverage.
9. **Fresh final re-audit.** Re-evaluate the completed asset set against the original manifest and canon, not merely against previous recommendations.

## Completion contract

A `PASS` requires evidence that:

- required manifest coverage is complete for the locked scope;
- generated files actually exist and are referenced by runtime/project mappings;
- unintended placeholders/missing assets are zero for required production surfaces;
- no confirmed character/location/style identity drift remains;
- no confirmed wrong scene/state mapping remains;
- representative runtime evidence passes visual QA at required viewport classes;
- project-native tests/lint/build relevant to the change pass;
- Web routing trace is recorded when Web review is required or used.

Use `BLOCKED` when required image-generation capability, references, permissions, or essential evidence are missing. Use `ESCALATE` when repeated regeneration fails the same material consistency defect or the requested canon itself is ambiguous/inconsistent.

## Routing trace

Record at least:

- `web_preflight_status`;
- `web_agents_used[]`;
- `native_asset_generator_used`;
- `image_generation_capability` (`available`, `unavailable`, or `unknown`);
- `generated_asset_count`;
- `integrated_asset_count`;
- `native_fallback_used` and reason, if any.

Production-art does not grant permission for deployment, publication, store submission, paid generation services, or other external writes beyond the user's existing authorization.
