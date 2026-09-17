---
name: art-production
description: Plan, generate, integrate, and verify production visual assets with stable character/location canon, explicit asset manifests, native image generation, and Web art-direction review.
metadata:
  ceos-version: "0.4.0"
---

# Skill: art-production

At activation, run `ceos context --skill art-production --project .` when the CEOS CLI is available. Treat the returned profile/policies as the resolved project contract. If CEOS is unavailable, use repository instructions and state the evidence gap rather than inventing policy.

**Intent:** turn an existing product/scenario into a coherent production-art layer without letting asset generation silently rewrite the product.

## Scope lock

Before generation, freeze:

- `target`: the product/art surface being produced;
- `in_scope`: characters, locations, props, CGs, UI/game art, variants, runtime integration, and visual evidence actually requested;
- `out_of_scope`: narrative/gameplay/release/publication surfaces not explicitly requested;
- `product_invariants`: topology, state schema, character cores, scene/level count, endings, mechanics, or other accepted product structure that generation must preserve;
- `mutation_boundary`: project-owned paths that may be written.

Do not broaden the target into release readiness, store assets, publication metadata, marketing art, or unrelated redesign unless the user explicitly includes those surfaces.

## 1. Inventory before generation

Build or update a machine-readable or tabular **art manifest** before producing large batches. At minimum track:

- logical asset id;
- scene/level/use-site;
- asset family/type;
- required character/location/prop identity;
- expression/state/time/weather variant when relevant;
- canonical reference dependency;
- status (`MISSING`, `PLANNED`, `GENERATED`, `INTEGRATED`, `REJECTED`, `VERIFIED`);
- project path after generation;
- evidence/review note.

Do not create one-off images blindly when reusable canonical masters or variants are more appropriate.

## 2. Canon first

Before dependent batches, establish canonical references:

- character identity: face, age, proportions, silhouette, hairstyle, costume, distinctive features, palette;
- location identity: architecture/geography, spatial anchors, materials, palette, lighting baseline;
- project art direction: rendering style, line/paint treatment, perspective/camera conventions, detail density, UI/game readability constraints.

Generate/review canonical character sheets and location masters before high-volume dependent assets when the project requires recurring identities. Variants must derive from the approved canon instead of re-inventing the subject.

## 3. Routing contract

### Web art director

Run `ceos web-preflight --json` before the first Web art-direction delegation in a cycle when hybrid routing is configured.

When preflight is `READY`, use `ceos_art_director_web` for substantive art-direction work that benefits from visual reasoning over supplied evidence, such as:

- visual canon and consistency decisions;
- scene-to-art planning;
- prompt/generation constraints;
- reference-sheet critique;
- identity/style drift review;
- batch acceptance/rejection reasoning;
- fresh post-integration visual re-audit.

The Web art director is **reasoning-only**. It does not inspect the repository, invoke image generation, save assets, or prove that a file exists. Native evidence must be supplied by the parent.

If Web is unavailable, use at most one native fallback for the delegated review unit and record the reason. If the user explicitly requires Web art review, non-ready Web is `BLOCKED`.

### Native asset generator

Use `ceos_asset_generator` for actual generation and filesystem/runtime integration. It owns:

- invoking native image-generation capability when available;
- writing generated project-owned assets;
- updating art manifests and runtime mappings;
- validating files load and render;
- producing fresh runtime/screenshots for review.

If native image-generation capability is not exposed, do **not** fabricate completion or replace requested production art with placeholders/procedural stand-ins. Return `BLOCKED_CAPABILITY` plus an exact generation packet that can be executed on an image-capable surface.

## 4. Batch production

Produce coherent batches around shared canon/dependencies: one character family, one location family, one prop family, or one bounded CG set. For each batch:

1. use approved references and constraints;
2. generate actual assets natively;
3. integrate them into project-owned runtime/content paths;
4. validate mapping/loading/basic dimensions/framing;
5. collect fresh representative visual evidence;
6. review consistency and reject/regenerate confirmed defects before moving on.

Prefer reusable location masters + meaningful state variants over generating unique backgrounds for every scene/level when uniqueness is not product-relevant.

## 5. Acceptance

A production-art `PASS` requires evidence proportional to scope, including:

- manifest coverage of every in-scope use-site;
- no unintended placeholders counted as production assets;
- no missing/broken runtime mappings;
- approved recurring character/location identity consistency;
- fresh rendered evidence for representative desktop/mobile or target viewport/runtime states when applicable;
- project-native tests/build/lint or other affected gates;
- fresh Web art-direction re-audit when Web is required/ready;
- routing trace: `web_preflight_status`, `web_agents_used[]`, `native_fallback_used`, `fallback_reason`.

Do not claim `PASS` from prompt files, manifests, or planned assets alone. Generated files and integration evidence must exist.

Stop with `BLOCKED`/`BLOCKED_CAPABILITY` when required generation capability, references, permissions, or evidence are unavailable. Use `ESCALATE` when canon conflicts, identity drift, or product/art dependencies cannot be resolved safely within the locked scope.
