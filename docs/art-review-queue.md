# Art review coverage queue — read-only checkpoint planner

This is a deterministic reporting utility. It does **not** attach images, create Web receipts, mutate CEOS engine runs, reclassify terminal runs or issue independent art acceptance. The existing Web High validator and game's release gate remain authoritative.

Commands:
- `node bin/art-review-queue.mjs --ledger path/to/coverage.json --receipts path/to/receipts.json --limit 6`
- `node --test tests/art-review-queue.test.mjs`

Coverage ledger schema: `{ "schemaVersion":1, "sourceHead":"<40-hex>", "items":[{"id":"S65:0,29:390x844","sceneId":"S65","cue":"0,29","viewport":"390x844","screenshotSha256":"<64-hex>","productionAssetSha256":"<64-hex>"}] }`.

Receipts are a JSON array (or `{"records":[]}`). Each carries `itemId`, matching source HEAD and both hashes, `actualPixelsReceived:true`, `status` (PASS, REWORK, BLOCKED) and an image-specific observation of at least 20 characters. A PASS superseding REWORK also requires nonempty `resolvedFindings`. The authoritative Web host must independently validate every receipt; this local planner cannot attest transport or reviewer identity.

Coverage counts each unique frame once; `receiptCount` and `matchedRecords` distinguish review attempts. `nextBatch` contains only NOT_REVIEWED or BLOCKED; REWORK remains under `requiresRepair`. Old-HEAD / changed-pixel receipts are rejected, not silently reused. Exact-HEAD strictness is intentional; safe dependency-based reuse is future work.

`READY_FOR_INDEPENDENT_ACCEPTANCE_GATE` is **not** a production-art PASS or CEOS stage transition. This tool is a preparatory checkpoint-reporting foundation only.
