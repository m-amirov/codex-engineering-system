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
    {"path":"narrative/assets.json","sha256":"<sha256>"}
  ],
  "expectedScenes": 17,
  "expectedPairs": 16,
  "expectedRuntimeCaptures": 111,
  "scenes": [
    {"id":"S24","pairId":"ep2_s24"}
  ],
  "pairs": [
    {
      "id":"ep2_s24",
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
      "raw":{"path":"artifacts/evidence/S24-review.raw.txt","sha256":"<sha256>"}
    }
  ],
  "runtimeReport":{"path":"artifacts/evidence/runtime.json","sha256":"<sha256>"},
  "narrativeReport":{"path":"artifacts/evidence/narrative-validation.json","sha256":"<sha256>"},
  "reconciliation":{"path":"artifacts/evidence/ep2-reconciliation.json","sha256":"<sha256>"}
}
```

The snippet is **schematic**; provide all expected scenes and pairs rather
than just S24. In `sourceDependencies`, include every relevant narrative
source file (including `narrative/assets.json`). If no historical accepted
pairs are needed because all scenes have independent current reviews,
`progressIndexes:[]` is valid. When supplied, each historical progress
index is revalidated from actual files by the existing `art-progress`
inspector and contributes only individually verified batch pair IDs.

Each `reviews[]` receipt must be a real independent V2 production-art
acceptance decision with `PASS`, `actualPixelsReceived:true`, complete
per-image `visualEvidence`, matching source HEAD and refs, and valid P0-P3
findings. The raw reviewer response must parse as the same decision and
observations; a made-up JSON wrapper is not a substitute for delivered
reviewer output. Historical accepted pairs may be covered by separately
revalidated art-progress; remaining scenes require explicit independent
reviews. A scene mapped to a historical accepted pair is considered covered
only because that original pair's batch gate already independently passed.

`runtimeReport` requires a machine-readable `status` starting with PASS,
matching `sourceHead`, empty consoleErrors/requestFailures/httpErrors arrays,
and one `captures[]` record per expected screenshot. Each record has
`screenshot` and `screenshotSha256` and points to real PNG bytes.

`narrativeReport` must contain
`{"status":"PASS","sourceHead":"...","validatedScenes":["Sxx"],"errors":[]}`
for exactly all inventory scenes. `reconciliation` must be an existing
hash-pinned PASS artifact, not a fabricated substitute for scene coverage.
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
