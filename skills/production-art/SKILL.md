---
name: production-art
description: Plan, generate, integrate, and verify production image assets with a Web art-director + native asset-generation workflow. Use for character sheets, expressions, backgrounds, CGs, visual canon, asset manifests, source-bound Terra image-generation batches, consistency review, and runtime integration.
metadata:
  ceos-version: "0.5.0"
---

# Skill: production-art

## Deterministic execution contract

When CEOS 0.5.0+ is available, start a persisted `ceos run production-art` instead of tracking the pipeline only in prose. Use `ceos checkpoint` for inventory, canon, generation, integration, visual verification, and fresh re-audit; use `ceos resume` after interruption.

The engine mechanically prevents generation before the capability snapshot contains fresh trusted native Image Gen presence, hashes persisted evidence, enforces stage order/cycle limits, and refuses a final PASS when required observable Web review is missing. When Image Gen has not yet been observed for the current run/session/turn, use `ceos capability-challenge <run>`, inspect the current Codex callable tool surface without invoking Image Gen, and answer with `ceos capability-attest`. `PRESENT + serviceAvailability=UNKNOWN` is sufficient for the first real generation attempt; CLI/environment overrides are diagnostic-only and do not unlock generation.

The parent Codex agent owns CEOS orchestration, scope, integration and browser evidence. A dedicated Terra Medium native asset producer may perform actual Image Gen calls **only when that producer context has the real tool and satisfies the run-scoped capability gate**. Parent-only tool availability cannot be delegated by assertion. CEOS run-state proves orchestration, not the content of an image.

At activation, run `ceos context --skill production-art --project .` when the CEOS CLI is available. Treat the returned profile/policies as the resolved project contract. If CEOS is unavailable, use repository instructions and state the evidence gap.

## Intent

Use `policies/web-delegation.md`: where Web High is READY, plan an art-direction analysis before generation, independent midpoint review of integrated asset batches, and fresh visual acceptance review. Attach real current source/reference/runtime pixels with verified receipt and exact source HEAD. Persist phase-specific review records through CEOS routing trace; a single Web agent name is not enough. Native image generation, tool-backed runtime verification and file writes stay native.

Turn an approved product/art direction into real project-owned image assets without letting generation convenience redefine product behavior.

## Pipeline

1. **Lock scope and invariants.** Freeze the product surfaces that generation must not alter: story/gameplay topology, state schema, character core, mechanics, release scope, and any accepted staging constraints.
2. **Inventory before generation.** Build a machine-readable or clearly structured asset manifest mapping each required use site to asset family, subject/location, state/expression/variant, dimensions/aspect ratio, transparency/background requirement, current status, and runtime mapping.
3. **Preflight Web.** Run `ceos web-preflight --json` when available. If Web is `READY`, delegate substantive art-direction work to `ceos_art_director_web`. The Web agent is reasoning-only: it may define canon, generation briefs, consistency criteria, and review supplied visual evidence, but it must not claim to generate or persist files. Before delegation, validate the evidence bundle: every screenshot and character/location reference must be readable image content with hash and dimensions recorded. A filename, path, DOM summary, OCR/text description, or message that a screenshot was created is not pixel evidence. If actual pixels cannot be supplied, visual acceptance is `BLOCKED`.
4. **Establish canon first.** Before mass generation, define reusable character/location/style references: identity anchors, palette/material/lighting rules, wardrobe/props, camera/framing intent, and allowed variation. Prefer canonical masters + meaningful variants over one-off generation per scene.
5. **Generate natively.** Delegate bounded batches to `ceos_asset_generator` on GPT-5.6 Terra Medium, distinct from the parent and the independent Sol High Web reviewer. Before every new candidate, write a source-bound art brief and run `ceos art-brief-verify --project . --file <brief.json>`. The brief must name scene/cue, current HEAD, authored narrative actions, references with locally verified SHA-256, forbidden props, character continuity, and separate desktop/portrait framing; see `policies/art-producer.md`. A passing brief is only read-only structural verification; it cannot unlock Image Gen. Before the first real generation in a run, require a fresh run-scoped capability challenge bound to the current Codex session and turn. Inspect the callable tool surface only; never generate an image as a capability probe. A callable `image_gen.imagegen` tool is `PRESENT` with service availability `UNKNOWN` until a real invocation provides stronger evidence. If fresh trusted presence cannot be established **in the producing agent's execution context**, stop with `BLOCKED` rather than creating placeholders while claiming production completion. Do not silently substitute the parent's tool inventory or fake a new tool provider. If image generation is unavailable, stop with `BLOCKED`.
6. **Integrate immediately.** Persist actual generated files under project-owned paths, update the asset manifest and runtime mappings, and avoid orphaned files. Do not silently overwrite unrelated user assets.
7. **Review each batch.** Track actual generation attempts per asset/cue/variant, max two under one scoped repair unless explicitly reauthorized. A second candidate requires the previous candidate's pixel-backed FAIL evidence and a materially revised brief; after two semantic failures stop/escalate instead of a third near-identical generation. Web attachment retries are not image-generation attempts. Check identity/style drift, wrong emotion/state, wrong location/time layer, composition, transparency/cropping, naming, missing/broken assets, and accidental placeholder retention. When Web is `READY`, send contact sheets/screenshots/manifest excerpts as bounded evidence to `ceos_art_director_web` for critique.
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

## Terra image producer and candidate-budget evidence

A new generation is not authorized merely because the reviewer disliked an image: establish the source-art vs mapping vs CSS/runtime root cause first. Track producer role/model, actual native rendering tool if accessible, input reference SHA-256, output SHA-256 and dimensions, attempt ordinal, viewport-specific acceptance, and reviewer receipt. The agent model is **not** the pixel generator. Native Image Gen access must be observed in the actual invoking context; Sol Web reviews remain independent and read-only. The `art-brief-verify` command validates only the brief and physical references (no Web/remote byte attestation) and cannot enforce a hard host-wide image-attempt quota.

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


## Web High rate-limit and attachment handling

Independent art review follows `policies/web-transport.md`. Pace attachment-heavy turns sequentially, reuse accepted reference context when possible, and send runtime screenshots one per turn when multi-attachment delivery is unstable.

Rate-limit or attachment-transport retries do not consume the bounded generation/regeneration cycle count. Do not regenerate an accepted/current asset because the reviewer failed to receive attachments. Only a semantic REWORK/FAIL after the reviewer actually received the required pixels can justify a repair/regeneration cycle.

If Web review is required and the bounded cooldown/retry policy is exhausted, keep the current integrated assets/evidence intact and return `BLOCKED`.
