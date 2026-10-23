# Narrative-game production art: mandatory dual-format CG contract

**Effective for new CEOS production-art runs in projects with the enabled project-owned
`config/narrative-game.local.json` profile.** Other game genres and historical
immutable run checkpoints are unaffected.

## Base rule for visual novels

Every unique, production-required full-scene CG must have **two independently authored,
separately persisted variants**:

| Variant | Native target | Minimum accepted | Usage |
| --- | --- | --- | --- |
| `portrait` | 1024 x 1536 (2:3) | 768 x 1152, near 2:3 | Portrait mobile |
| `desktop` | 1920 x 1080 (16:9) | 1280 x 720, near 16:9 | Desktop/wide display |

The landscape image is a real, coherent *widescreen composition*, not a resized/cropped
portrait, blurred side fill, stretched image or a mobile screenshot. Outpainting may
contribute, but does not waive independent scene/canon and actual-pixel acceptance.
Neither viewport is allowed to lose the authored cast, facial identity, time of day,
location, actions or important props. Composition and relative placement may adapt for
each format, provided narrative continuity remains true.

Adjacent scenes may intentionally reuse the same CG pair when their physical setting and
action truly match. Do not generate one image for every line merely to satisfy a count.
Sprites remain an explained exception to the CG-first policy, not a way to bypass
dual-format production art by renaming scene images.

## Fail-closed production gate

The opt-in narrative profile is identified by:
`config/narrative-game.local.json` with `profile: "narrative-game"` and `enabled: true`.

New `ceos run production-art` runs in these projects gain
`narrativeDualFormatRequired=true`. The `INTEGRATED` checkpoint and a passing final
`REAUDITED` checkpoint MUST supply `metadata.dualFormatManifest`, a project-relative
path to the complete episode manifest. Without a real, verified pair for each mapped
scene, the checkpoint is refused. Existing runs remain governed by their persisted
original requirements and are not rewritten.

Example (`artifacts/production-art/ep1-dual-format.json`):

```json
{
  "schemaVersion": 1,
  "profile": "narrative-game",
  "sourceHead": "40-character-current-git-commit-sha",
  "episode": 1,
  "sceneAssets": {
    "ep1_arrival": "cg-arrival",
    "ep1_gate": "cg-gate"
  },
  "assets": {
    "cg-arrival": {
      "portrait": {
        "path": "assets/production/cg/ep1-arrival-portrait.png",
        "sha256": "64-character-actual-file-sha256",
        "width": 1024,
        "height": 1536
      },
      "desktop": {
        "path": "assets/production/cg/ep1-arrival-desktop.png",
        "sha256": "64-character-actual-file-sha256",
        "width": 1920,
        "height": 1080
      }
    }
  }
}
```

Example fields are placeholders, **not verified evidence**. The real manifest must map
**every scene ID from `graph.scenes` with matching `episode`**, across choices and
routes. Each referenced asset must be declared with both format variants. Real asset
files must be inside the project, full-decodable PNG, independently hashed, with correct
dimensions/aspect ratios and different paths/hashes. The graph is loaded from the
project-owned profile's `modelPath`, not invented from the art manifest.

Manifest inspection yields `PASS_DUAL_FORMAT_ART_MECHANICAL` only for structural/file
coverage; it always returns `visualAcceptance: NOT_VERIFIED`. A fake header-only PNG,
a different SHA, a missing variant, a wrong aspect ratio, a symlink escape, or a
shortened scene coverage list must BLOCK.

## Separate visual acceptance

Run actual runtime/browser captures for mobile portrait and desktop widescreen; review
each composition independently with Web High or equivalently trusted actual-pixel
evidence. Also compare portrait vs desktop for identity, wardrobe, props and chronology.
Keep distinct acceptance records for `portrait` and `desktop`, source HEAD, actual
image SHA and viewport. A mechanical PASS cannot be promoted to artistic PASS.
Prioritize P0/P1 story/cast/location/crop defects. P3 aesthetic notes alone do not
justify repeated generation.

The responsive runtime must select the real variant by viewport/aspect ratio and handle
resize, preloading, decoded crossfade, stale requests, Back, save/load and failed asset
requests. No save-state or route identifier may depend on the orientation asset name.

A completed episode can claim production-art PASS only when **all scoped scenes are
covered by real pairs and both orientations have independent runtime artistic acceptance**.
No premium paywalls, release artifacts or production art for unrelated games are implied.
