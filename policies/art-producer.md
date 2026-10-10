# Terra Image Producer: bounded art direction and native generation

## Role separation

The parent Codex session (e.g., Luna Very High) owns scope, manuscript/asset integration, tests, git, CEOS state transitions and release controls. Delegate one **bounded** production-art unit to the separate `ceos_asset_generator` role on **GPT-5.6 Terra Medium**, not to a clone of the parent reasoning context. The producer reads only the approved scene excerpt, source-bound brief, character/location references and target asset paths. It should not ingest an entire season or rewrite narrative.

The independent `ceos_art_director_web` on **GPT-6 Sol High** is **reasoning-only**. It reviews actual reference, source-image and runtime pixels and provides specific actionable findings. Web High cannot be assumed to generate, export or persist a PNG/WebP into the Codex workspace. Distinguish an agent's language model from the native Image Gen tool/provider actually rendering pixels.

## Before first image

1. Freeze the exact project HEAD, authored scene/cue/paragraph, cast, actions, location/time, surrounding beat continuity, existing accepted art and style canon.
2. Supply real local character-reference images (not names, URLs, summaries, or screenshots claimed but not received) and their SHA-256. Each required character needs a reference. Include forbidden props and wardrobe; do not invent occupational tools absent from a scene merely because a character has that profession.
3. Independently specify **desktop and portrait compositions**: required visible cast, camera distance, faces, hands, footwear/ground contact, UI-safe areas, mobile crop.
4. Write a JSON `art-brief.json` matching the `ceos art-brief-verify` fields; run:
   ```sh
   ceos art-brief-verify --project . --file artifacts/production-art/art-brief.json --json
   ```
   `READY_TO_GENERATE` verifies the local source HEAD, structural contract and SHA-256 of referenced files **only**. It is not a quality PASS, authorization, native tool attestation, or proof of remote Image Gen access. `BLOCKED_ART_BRIEF` forbids proceeding under this CEOS workflow.
5. At the `GENERATING` stage run the existing run-scoped CEOS Image Gen capability challenge and make sure the **actual producer's execution context** has the callable native Image Gen tool. A tool available only to the parent does not imply subagent access. If a subagent cannot meet the trusted current-session/turn attestation contract, report `BLOCKED` instead of borrowing a parent's attestation. Host-specific API names/available image models must be observed; do not guess that a particular GPT Image model can be selected.

## Mandatory source-image output gate (0.5.12)

**Immediately after EACH native Image Gen output, before requesting the next image**, save the actual PNG to the project and run:

```sh
ceos art-output-verify --project . --file assets/generated/alice-pose.png --kind sprite --width 1024 --height 1536 --receipt artifacts/production-art/alice-output-gate.json --json
ceos art-output-verify --project . --file assets/generated/notebook.png --kind prop --receipt artifacts/production-art/notebook-output-gate.json --json
```

Do not ask Image Gen for another asset in the batch until the current output returns `PASS_ART_OUTPUT_MECHANICAL`. `BLOCKED_ART_OUTPUT` means **STOP the batch immediately** and preserve the invalid original, its SHA-256, failed receipt and prior ledger. One bad opaque checkerboard must stop the batch before seven more sprites are produced. The gate is deterministic and read-only; it cannot intercept calls the host makes outside the CEOS workflow.

The gate checks decoded PNG raster dimensions, alpha histogram, genuine fully transparent outer corners, nonempty visible subject, and strong alternating gray checkerboard pattern at image corners. Sprites and props require real alpha, not a painted checkerboard. Props default to 512×512. The decoder supports 8-bit noninterlaced RGB/RGBA PNG and fails closed for other direct-output formats; conversion into PNG requires separate explicit preparation and truthful original provenance. Passing this mechanical gate **never** implies faces, anatomy, props, composition or source-content visual acceptance.

`ceos art-output-normalize --file <prop.png> --output <new-512.png>` may losslessly crop the nonzero alpha bounds and center/pad at 512×512 **only if every occupied source pixel fits**. It never rescales, stretches, fills, erases a baked checkerboard, or overwrites originals. Large content that would need downsampling receives `NORMALIZE_REQUIRES_RESAMPLING` and needs separately authorized processing plus independent pixel QA.

For a new CEOS 0.5.12+ `production-art` run, the `GENERATING` checkpoint with `CONTINUE` must include `metadata.artOutputs` (array of `{path,kind,width,height}` for each actual PNG). CEOS revalidates those files and pins their SHA-256 as checkpoint artifacts. Old runs lacking `artOutputGateRequired` retain historical behaviour and **must not** be rewritten. If any output fails, submit a truthful `BLOCKED` checkpoint with the failed gate receipt; do not claim an integrated/accepted production asset. Optional `art-output-batch --manifest` is for a read-only inventory and stops at the first invalid file, but cannot replace the mandatory per-output gate in the host orchestration.

## Candidate/rework budget

- Default maximum **2 generation candidates per asset/cue/variant** within the authorized repair scope. This is a **host orchestration policy** plus a read-only brief check, not a host-level hard budget or an API usage limiter. Every real invocation must be accounted for in the parent's attempt ledger. Do not reset counters through a new brief/run to bypass repeated semantic failure.
- Candidate 1 uses a source-bound brief. For candidate 2, attach the first candidate's genuine pixel-backed rejection evidence with its SHA-256, exact failures, and a materially revised composition/brief. A third candidate is not allowed by the default policy; stop as `ESCALATE` or `BLOCKED` until there is a specifically authorized new approach.
- Missing Web images, lost attachment transport, quota exhaustion and invalid receipts **do not** justify new generated candidates. Retain the last genuine asset and evidence.
- Separate **source-art quality** (eyes, hands, anatomy, identity, surfaces, coherent lighting, props), **narrative consistency** (characters do what the cue says), **mobile framing** (all required visible cast, no cropping) and **runtime integration**. Fix only the confirmed root cause; don't sharpen/upscale a structurally wrong image.
- Record producer model, actual generation tool/provider if observable, candidate ordinal, prompt/brief SHA-256, input-reference hashes, output paths, output SHA-256/dimensions, scene/cue, source HEAD, and independent reviewer evidence. This must be factual, not fabricated.

## Independent acceptance

Art review requires actual pixels of the resulting asset and live runtime at contract-required viewports. For Web review use the selected CEOS receipt assurance (`strict` or deliberately opted-in `visual-content`) and do not synthesize provider trace IDs, byte attestation, `actualPixelsReceived` or PASS.

Local tests and successful image decoding are not visual acceptance. Keep S18 and other accepted assets immutable unless a new evidenced defect specifically expands the repair scope. No deploy, merge or release gate bypass is authorized by an art brief.
