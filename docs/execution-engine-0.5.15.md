# CEOS 0.5.15 — verified existing-art reuse

`VERIFIED_EXISTING_ART_REUSE` is an explicit production-art trust-boundary
mode. It is selected when a run must validate and integrate existing project
assets without invoking Image Gen.

```powershell
ceos run production-art `
  --art-mode VERIFIED_EXISTING_ART_REUSE `
  --target "existing accepted art" `
  --in-scope "PNG files;manifest;runtime evidence" `
  --acceptance "all reuse evidence is current and complete" `
  --mutation-boundary "project evidence and CEOS checkpoints only"
```

The `GENERATING` checkpoint must provide `metadata.existingArtReuse` with:

- a current Git `sourceHead` and hashed dependency files;
- an asset manifest with real PNG bytes, SHA-256, PNG decoding and separate
  `portrait` and `desktop` entries;
- the narrative dual-format manifest when the project opts into the
  narrative-game profile;
- documented provenance, current canon, fresh runtime pixels and current
  independent `NARRATIVE_ART_ACCEPTANCE_V2` evidence;
- an empty P0/P1/material-P2 blocking-findings summary and intact receipt
  files;
- `generationInvoked: false`.

The engine pins every referenced file in the immutable checkpoint. Missing or
changed bytes, stale source-bound evidence, unknown provenance, incomplete
acceptance, and generation-specific fields return
`VERIFIED_EXISTING_ART_REUSE_BLOCKED`. A normal production-art run retains its
fresh native capability challenge, producer-route check and generated-output
gate. Historical runs without `artMode` are not retroactively changed.
