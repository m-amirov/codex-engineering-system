# EPISODE_ART_FINALIZATION_V1

## Purpose

A **read-only final episode art evidence gate** for projects with complete
production assets and existing independent artistic receipts, but ambiguous
or damaged historical CEOS runs. A missing historical scope.json or drifted
checkpoint is **never repaired, selected, reclassified or overwritten**.

This inspector evaluates a *new*, explicitly pinned evidence manifest
and the actual on-disk bytes. It does not call DEV Web High or Image Gen.

```sh
ceos episode-art-finalize --project /path/to/game \
  --manifest artifacts/episode-finalization-v1.json --json
```

A complete result is `PASS_EPISODE_ART_FINALIZATION`, with
`releaseReady:false`. Any invalid/missing input returns `NOT_VERIFIED`
with exact problems and nonzero CLI exit code. This is an **episode art**
verdict, not a historical CEOS run PASS, not release approval, not a
replacement for Yandex media/video/SDK/contract checks.

## V1 manifest

The file is project-relative, e.g. `artifacts/episode-finalization-v1.json`.
Every referenced object is `{"path":"project/relative.file","sha256":"64 hex"}`.
The artifact author must pin **actual** file hashes, not invented values.

```json
{
  "schemaVersion": 1,
  "kind": "EPISODE_ART_FINALIZATION_V1",
  "episodeId": "EP2",
  "sourceHead": "<40-hex narrative baseline HEAD>",
  "sourceDependencies": [
    {"path":"narrative/episodes/ep-02.json","sha256":"<sha256>"},
    {"path":"narrative/graph.json","sha256":"<sha256>"},
    {"path":"narrative/assets.json","sha256":"<sha256>"}
  ],
  "authoritativeInventory": {
    "episode":{"path":"narrative/episodes/ep-02.json","sha256":"<same sha256>"},
    "graph":{"path":"narrative/graph.json","sha256":"<same sha256>"},
    "assets":{"path":"narrative/assets.json","sha256":"<same sha256>"}
  },
  "expectedScenes": 17,
  "expectedPairs": 16,
  "expectedRuntimeCaptures": 111,
  "scenes": [
    {"id":"ep2_refusal_response","assetId":"ep2-refusal-response-cg","pairId":"ep2_s24"}
  ],
  "pairs": [
    {
      "id":"ep2_s24",
      "assetIds":["ep2-refusal-response-cg"],
      "portrait":{"path":"assets/ep2/s24-portrait.png","sha256":"<sha256>"},
      "landscape":{"path":"assets/ep2/s24-landscape.png","sha256":"<sha256>"}
    }
  ],
  "progressIndexes": [
    {"path":"artifacts/art-progress-index.json","sha256":"<sha256>"}
  ],
  "reviews": [
    {
      "receipt":{"path":"artifacts/evidence/S24-review.json","sha256":"<sha256>"},
      "sceneIds":["ep2_refusal_response"],
      "raw":{"path":"artifacts/evidence/S24-review.raw.txt","sha256":"<sha256>"}
    }
  ],
  "runtimeReport":{"path":"artifacts/evidence/runtime.json","sha256":"<sha256>"},
  "narrativeReport":{"path":"artifacts/evidence/narrative-validation.json","sha256":"<sha256>"},
  "rightsManifest":{"path":"artifacts/evidence/rights-manifest.json","sha256":"<sha256>"},
  "reconciliation":{"path":"artifacts/evidence/ep2-reconciliation.json","sha256":"<sha256>"}
}
```

The snippet is **schematic**; provide every scene and unique binary pair from
the authored episode inventory. `authoritativeInventory` pins the episode
script, graph and assets document; counts or IDs supplied only by the
finalization manifest are never an authoritative scope. The graph scene ID,
scene asset ID, asset variant paths and variant SHA-256 values must agree.
Both `landscape` and legacy `desktop` asset variant names are supported, but
the logical runtime mapping is always portrait/landscape.

`rightsManifest` is required and must contain a hash-bound permission entry
for every accepted production PNG. A pending visual-review status is separate
from rights; denied, blocked, revoked or missing permission is not accepted.

Each `reviews[]` receipt must be a real independent V2 production-art
acceptance decision linked to the current reconciliation by path and SHA-256.
Current DEV receipts require the raw reviewer response and exact selected-field
equality. Existing historical batch formats are supported only when their
original receipt is hash-pinned by reconciliation, retains provenance, has
`PASS`, actual-pixel and empty-unresolved evidence, and links to the current
canonical production bytes. A historical `REWORK`, `BLOCKED`, damaged receipt
or origin run is never promoted to PASS. `pixelEvidence` is accepted only as
the existing aggregate receipt format and every item must itself be PASS.

`runtimeReport` requires a machine-readable `status` starting with PASS,
matching `sourceHead`, empty consoleErrors/requestFailures/httpErrors arrays,
and one `captures[]` record per expected screenshot. Each record has
`sceneId`, `assetId`, `format`, `source`, `screenshot` and
`screenshotSha256`; the scene/asset/source tuple is compared with the
authoritative inventory and points to real PNG bytes.

`narrativeReport` must contain
`{"status":"PASS","sourceHead":"...","validatedScenes":["scene-id"],"errors":[]}`
for exactly all inventory scenes, or a reconciliation artifact with equivalent
current narrative technical evidence. `reconciliation` must be an existing
hash-pinned artifact whose accepted scene records link every authoritative
scene to its original receipt, receipt source HEAD and provenance. The allowed
`SCENE_LEVEL_ACCEPTANCE_COMPLETE_EPISODE_WIDE_NOT_VERIFIED` status records
that the old episode-wide gate was not verified; it is not itself a final
PASS and cannot bypass the per-scene receipt checks.
The manifest does **not** create these reports automatically: produce them
with existing game-specific validators, then pin their exact output.

## Provenance boundaries

- The source HEAD must be an ancestor of the current Git HEAD. All later
  committed changes must be under `artifacts/`; any tracked/untracked
  authored-source worktree changes outside `artifacts/` also block.
  This prevents stale pixel receipts being used after narrative/source drift.
- Every declared source dependency, production image, runtime screenshot,
  review receipt and raw response is SHA-256-rechecked from disk.
- Both production formats are decoded and dimension-checked.
- Exact scene/pair inventory counts, mapping, unique IDs and coverage are
  validated. Assertions about aggregate counts alone never yield PASS.
- Accepted pair IDs can come only from revalidated historical batches or
  from actual independent reviewer receipts covering the mapped scenes.
- No historical run, scope, checkpoint, ledger or receipt is edited.
- This contract does not perform provider cryptographic attestation beyond
  the existing CEOS `visual-content` independent-pixel evidence standard.
- Missing/unverifiable evidence keeps the episode art status `NOT_VERIFIED`.

**Application to Season of Broken Hearts EP2:** use the existing 17-scene
reconciliation, 16 art-pairs, source-bound accepted batches, S24–S26 DEV
receipts and real runtime captures. If prior accepted scene receipts cannot
be proven with existing material, stop with their IDs; never silently
inherit an old run PASS. Even a successful art finalization leaves Yandex
release video/media/contract gates independent.
