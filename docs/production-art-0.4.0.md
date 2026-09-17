# CEOS 0.4.0 — Production Art Architecture

## Goal

Provide a repeatable workflow for turning an approved product/art direction into real project-owned image assets while preserving CEOS safety, evidence, and hybrid-routing invariants.

## Role split

### `ceos_art_director_web`

- backend: `chatgpt-web/high`;
- reasoning-only;
- receives bounded context/evidence supplied by the parent;
- defines or critiques character/location/style canon, generation briefs, reusable asset families, scene-to-art mappings, contact sheets, and visual consistency;
- does not inspect the repository, invoke local tools, generate image files, or claim persistence.

### `ceos_asset_generator`

- backend: native `gpt-5.6` medium;
- workspace-write;
- executes bounded generation/integration from an approved manifest and canon;
- uses native image generation only when the current runtime actually exposes it;
- if generation capability is absent, returns `BLOCKED` instead of fabricating files or silently treating placeholders as production output;
- persists actual files, updates project-owned mappings/manifests, and collects fresh runtime evidence.

## Workflow

```text
scope/invariants lock
  → inventory / asset manifest
  → ceos web-preflight --json
  → Web art direction when READY
  → canonical character/location/style references
  → native generation batches
  → file persistence + runtime integration
  → contact sheets / screenshots / manifest evidence
  → Web consistency critique
  → visual-qa
  → project-native verification
  → fresh final re-audit
```

## Asset manifest contract

At minimum each required asset use site should record:

- stable asset id/path;
- family/type (`character`, `expression`, `background`, `CG`, etc.);
- subject or location identity;
- state/expression/variant;
- intended scene/use sites;
- dimensions/aspect ratio;
- transparency/background requirement;
- canonical reference used;
- generation/integration status;
- runtime mapping/status.

The exact storage format is project-owned. CEOS does not impose a parallel asset database when the repository already has an appropriate manifest structure.

## Canon before volume

Mass generation must not begin from independent one-off prompts. Establish reusable references first:

- character identity anchors;
- wardrobe/props and invariant distinguishing features;
- location masters;
- palette/material/lighting rules;
- camera/framing intent;
- allowed variation by emotion, time, weather, damage/state, or narrative layer.

Prefer canonical masters plus meaningful variants over one image per scene when reuse is visually and product-correct.

## Runtime capability boundary

The presence of `ceos_asset_generator` in the CEOS installation does not prove image-generation availability. The execution environment must expose a usable native image-generation capability. This is deliberately a runtime observation.

If absent:

```text
image_generation_capability = unavailable
verdict = BLOCKED
```

No generated-file claim may be made without an actual workspace file.

## Evidence and completion

A production-art PASS requires:

- complete required manifest coverage for the locked scope;
- real generated files and valid runtime/project mappings;
- zero unintended placeholders/missing required assets;
- zero confirmed character/location/style identity drift;
- zero confirmed wrong scene/state mappings;
- representative fresh runtime visual evidence at required viewport classes;
- relevant project-native tests/lint/build passing;
- routing trace recording Web preflight, Web agent use, native generator use, generation capability, generated/integrated counts, and any fallback.

## Non-goals

Production-art does not itself authorize deployment, publication, paid provider calls, store submission, or unrelated product rewrites. It also does not replace `visual-qa`; generation correctness and runtime presentation are separate evidence surfaces.
