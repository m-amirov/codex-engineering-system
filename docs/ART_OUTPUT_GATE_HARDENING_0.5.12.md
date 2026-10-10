# CEOS 0.5.12 Art Output Gate hardening

Date: 2026-10-10
Scope: checkerboard detection, regression coverage, and read-only S26 audit.
Image Gen calls in this change: 0.

## Root cause of the Damir false-negative

The original `damir-doorway-neutral.png` was decoded directly and sampled at real pixels. Its canvas is `1024x1536`, SHA-256 is `190c4faa3f8ba52e2e61ead5cae0eafdad5bb14d7464c6a679f96420f9be002e`, and its corners are opaque (`alpha=255`). A 16-pixel phase sample at the upper-left corner produced alternating neutral values around `253/173` in the stable cells, followed by transition-row values around `212/198/215/196`.

The old detector used one fixed phase and aborted the candidate on the first same-parity deviation greater than six levels. It therefore rejected the real board before the existing `n >= 12` majority condition could be evaluated. Larger samples could also land on the same board parity and lose the required contrast. This was a detector sampling/scoring defect, not a PNG alpha decode defect.

The bounded fix samples three intra-cell phases (`.25`, `.5`, `.75`) and scores each parity by its median plus inlier majority. It still requires both parities, at least five inliers per parity, at least 12 total inliers out of 16, neutral opaque samples, and the existing contrast range. Alpha and corner validation were not changed.

## RED -> GREEN evidence

- RED before the fix: `node --test tests/art-output-gate.test.mjs` — 9 passed, 2 failed. The real Damir fixture and the synthetic phase/transition-row reproducer both returned `checkerboard.detected=false`.
- GREEN after the fix: the same command — 11 passed, 0 failed.
- Negative coverage remains green for colored clothing-like texture, grayscale background texture, smooth gradients, and a valid transparent sprite. The existing transparent checker-border case remains blocked.

The tracked real fixture is `tests/fixtures/art-output/s26-damir-doorway-neutral.png`; its SHA-256 is identical to the original source. The fixture is 1,971,739 bytes and is used by CI without changing the game repository.

## Read-only S26 classification

Each file was inspected independently with the target type and canvas: characters as `sprite`, `1024x1536`; props as `prop`, `512x512`. No source PNG or historical receipt was written.

| asset | SHA-256 | decoded dimensions | alpha histogram (`opaque/transparent/partial`) | corners | checkerboard | status | issues |
|---|---|---:|---:|---|---|---|---|
| alice-neutral | `11f17da19b3509267fb033ae60d26c5213d24230133f6f3630e49b62dd704171` | 1024x1536 | 1572864/0/0 | 255,255,255,255 | yes, tile 12 | BLOCKED | baked checkerboard; alpha missing/opaque; corners not transparent |
| alice-notebook | `4cc4959ce8419f056a21d49baad0f7ca92fc8a4dfadf2b93bbc91e7f48fdd53a` | 1024x1536 | 1572864/0/0 | 255,255,255,255 | yes, tile 12 | BLOCKED | baked checkerboard; alpha missing/opaque; corners not transparent |
| eric-neutral | `8c53533496a700fc2cfb99bfe2cc20969bad7810939e364b42bf32bac52eb217` | 1024x1536 | 1572864/0/0 | 255,255,255,255 | yes, tile 12 | BLOCKED | baked checkerboard; alpha missing/opaque; corners not transparent |
| eric-map | `c1995e3eafac4cb306fe6fa7e55bb3f2ca701afc4ed6492794ae19abfd42bcfd` | 1024x1536 | 1572864/0/0 | 255,255,255,255 | yes, tile 12 | BLOCKED | baked checkerboard; alpha missing/opaque; corners not transparent |
| nick-neutral | `b369f648f6111fdda50b4065ee770270c7062f18bbc99d60c80e0142f4d1bf07` | 1024x1536 | 1572864/0/0 | 255,255,255,255 | yes, tile 12 | BLOCKED | baked checkerboard; alpha missing/opaque; corners not transparent |
| nick-bottle | `ef767eb05379a6100ce32a905b1ca7fa1af99711eaa20af1eaa46ca9a4826f56` | 1024x1536 | 1572864/0/0 | 255,255,255,255 | yes, tile 12 | BLOCKED | baked checkerboard; alpha missing/opaque; corners not transparent |
| damir-neutral | `190c4faa3f8ba52e2e61ead5cae0eafdad5bb14d7464c6a679f96420f9be002e` | 1024x1536 | 1572864/0/0 | 255,255,255,255 | yes, tile 12 | BLOCKED | baked checkerboard; alpha missing/opaque; corners not transparent |
| damir-pot | `d19aaabbda93bd3372244df4af5d0d53d09553e334214a7b83836f17dd9efa3b` | 1024x1536 | 1572864/0/0 | 255,255,255,255 | yes, tile 12 | BLOCKED | baked checkerboard; alpha missing/opaque; corners not transparent |
| map | `70cdfc6ba7c00dedca64915a1fd68d861bff1716e543e3493656414828402c9b` | 1536x1024 | 0/601001/971863 | 1,0,0,0 | no | BLOCKED | canvas mismatch; corner alpha not transparent |
| notebook | `337a19de3a1fa523a2b780eee6c21941b6cf26c31688a95b76f7a20df4a8a321` | 1536x1024 | 0/981393/591471 | 0,0,0,0 | no | BLOCKED | canvas mismatch |
| water-bottle | `8e2ccb3ca8390a11e198995fcfd393c8a71a11abf13fae3207997c3154e850c2` | 1024x1536 | 0/965942/606922 | 0,0,0,0 | no | BLOCKED | canvas mismatch |
| empty-pot | `7a88f3734cc922b034c099de13f0e96a5c8a0d2019130864e0cdcf898d6aa7a6` | 1536x1024 | 0/892827/680037 | 0,0,0,0 | no | BLOCKED | canvas mismatch |

Result: `12/12 BLOCKED`, `8/8` character checkerboards detected, and `4/4` prop canvas mismatches detected. The corrected gate therefore classifies all 12 outputs as expected; this is a mechanical output-gate result, not artistic acceptance.

## Image Gen parameter audit (read-only)

The S26 art brief requires transparent isolated layers, no background, and `1024x1536` character / `512x512` prop outputs. The retry ledger records the producer role `ceos_asset_generator`, model `gpt-5.6-terra`, reasoning `medium`, native tool `image_gen.imagegen`, and 12 persisted output paths.

That ledger does not contain an attested provider request payload proving that a true-transparency/export parameter was passed to the provider. It records `providerReceipt: null` and explicitly says the native tool exposed only local generated-image output paths, with no provider-level byte receipt. Therefore the ledger proves neither that true transparency was supported by the provider nor that it was transmitted to the provider. The only confirmed output fact is the decoded pixels: all eight character files are opaque checkerboard composites; four prop files contain alpha but have the wrong canvas.

The exact upstream insertion point (provider limitation versus an ineffective/missing export parameter) cannot be proven from these historical records. No new generation, capability challenge, normalization, mapping update, receipt rewrite, or game-repository write was performed in this hardening change.
