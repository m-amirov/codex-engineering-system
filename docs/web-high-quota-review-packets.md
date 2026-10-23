# Quota-aware Web High review packets (preflight only)

This is a **read-only packet planner** for evidence that an independent Web High
reviewer still needs to see. It neither uploads images nor changes a CEOS run.
Do not treat its output as a Web receipt or a release/art acceptance verdict.

## Existing evidence → a tiny batch

Given a project-local coverage ledger (schema 1, exact 40-digit sourceHead,
unique frame IDs, scene/cue/viewport and both screenshot/asset SHA-256) and
existing accepted receipts, run:

~~~sh
node bin/web-high-review-packets.mjs \
  --ledger artifacts/production-art/coverage-ledger.json \
  --receipts artifacts/production-art/web-receipts.json \
  --max-attachments 2
~~~

The planner builds up to two attachment proposals. A proposal normally groups
three screenshots of the **same scene and authored cue** (desktop 1920x900,
mobile 390x844, mobile 360x640) as a single *candidate* contact sheet.

To actually create that candidate, compose the **existing checked PNG frames**
offline with no resampling: full-size 1920x900 desktop above the two mobile
images at original sizes side-by-side, separated/labeled for viewport and
cue. Preserve full source SHA-256 metadata and calculate the rendered sheet's
SHA-256. Verify labels, borders, source coordinates, absence of crops, artifact
integrity and image-size/byte constraints. If pixel-level inspection of
any source view is impaired by the Web host's image downsampling/thumbnail,
send that screenshot individually later. **One composite file is not
equivalent to three accepted observations**: ask the independent reviewer to
confirm *each* viewport, then save three independent scene/cue/hash-bound
receipts with actually observed pixels.

If the host cannot read composite pixels reliably, use
\`--max-frames 1 --max-attachments 2\` and upload two independent screenshots
instead. Never fabricate \`actualPixelsReceived=true\` on the basis of a local
sheet, alt text, checksum alone, or a model's summary.

## Quota and transport

Never guess available uploads from \`web preflight READY\`. The bridge does not
advertise ChatGPT's remaining file-upload quota. The CLI ceiling is voluntary,
not the actual account limit. Do not burst multiple Web turns. Preserve the
existing 20-second pacing rule, trace IDs, and bounded transport retry policy.

For a **real host message** stating file attachments are exhausted:

~~~sh
node bin/web-high-review-packets.mjs \
  --ledger ... --receipts ... --quota-log artifacts/evidence/real-quota-error.txt
~~~

The planner returns \`PAUSED_OBSERVED_ATTACHMENT_QUOTA\`, with an empty
\`nextPackets\`. It refuses generic 429s/upload timeouts as quota proof. Record
the terminal blocker in an active enhanced CEOS run using the existing
\`ceos web-attachment-block\` contract. The terminal run stays terminal;
a later reviewed invocation resumes from the **separate immutable coverage
ledger and accepted receipt registry** with a newly authorized run. There is
no fabricated reset time, background retries, model switching or bypass.

## Resume order for the present game (operator guidance only)

First confirm actual source/provenance, r7 21/21 repair captures, 66×3 runtime,
exact scene/cue/asset and fresh SHA-256. Scope Web High to changed visual beats
S01 airport, S01 Damir, S06 Eric/Alice, S07 spoon; also obtain exact current
authored S65 keys/hallway captures, **not** scene-start substitutions. Reuse
already valid receipts only under exact acceptance-contract rules. Maintain
198 runtime slots independently from the smaller required editorial Web High
subset. If quota is exhausted, keep \`BLOCKED\` without regenerating art.

## Explicit non-goals

Not a remote image store, not a provider-limit bypass, not a Web transport
driver, not a guarantee of 198 Web High reviews, not host attestation. A
correctly generated local composite is only a transfer-efficient candidate.
