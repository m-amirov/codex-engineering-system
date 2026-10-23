# Narrative Art Acceptance V3 — story-first, major defects only

## Scope
V3 is **opt-in** in `config/narrative-game.local.json`:
```json
{"profile":"narrative-game","enabled":true,"artAcceptanceProfile":"NARRATIVE_ART_ACCEPTANCE_V3"}
```
It applies to **new** narrative production-art runs only. Historical V2 runs,
receipts and artwork stay unchanged. V3 does not publish or mark Yandex release ready.

## Single review contract
There is ONE independent per-scene artistic decision for character identity,
wardrobe, main action, story continuity and portrait/landscape framing.
`wardrobeAssessments` are a *subsection of that same review*, not a second
standalone veto. If the project still enables the optional Starter Kit
`WARDROBE_VISUAL_ACCEPTANCE_V1`, that legacy gate remains in effect for those
old reviews: migrate the project profile explicitly, do not bypass it silently.

A V3 reviewer receives real original PNGs, current player-facing runtime
captures, canonical character references where relevant, and the authored
narrative cue. The reviewer emits an explicit:
- `PASS`: material identity, costume, action and usability fit.
- `PASS_WITH_NOTES`: only P2/P3 cosmetic issues; no regeneration required.
- `REWORK`: material P0/P1 contradiction supported by exact source cue,
  image ref, actual-pixel observation and concrete player comprehension impact.

A narrated item need not literally appear in the CG if dialogue already makes
the plot understandable and the image does not contradict it. Cosmetic clothing
folds, tiny buttons/accessories, anatomy quirks not compromising identity or
action, incidental background, normal lighting and justified outfit repetition
must be advisory, not blockers. Wrong character, materially inappropriate
costume, contradicting action/location, essential invisible plot object or
unreadable UI are blocking.

A blocking P2 claim is rejected: reclassify as independently supported P0/P1
rather than slipping a cosmetic issue into the gate. The independent reviewer
must explicitly classify the material issue; no local forced PASS.
`unresolved` lists only open blocking P0/P1 IDs. Advisory findings remain in
`findings`, including on accepted `PASS_WITH_NOTES`.

## Evidence and migration
The V3 verifier validates finding semantics and nested character/wardrobe
observations, while existing Web/transport, SHA, source-bound and rights
validators still independently verify delivery, real pixels and exact data.
Neither a host-generated JSON nor `solAvailable` proves independent review.
Historical `REWORK` cannot be promoted without a fresh independent review and
explicit resolution evidence.

### Selective follow-up review
`ceos art-impact-plan --project . --file impact-scope.json --json` is a **read-only
planner**, not an acceptance gate. It compares a verified prior source commit
against the current Git HEAD, scene assets, authored scene projections,
dependency fingerprints and original review receipt SHA. Materially changed
scenes are `needsReview`. Scenes where all relevant inputs remain unchanged
are merely `reuseCandidates` carrying
`REVALIDATION_REQUIRED_NOT_ACCEPTED`: the independent Web and episode
finalization gates must validate source lineage and prior acceptance before
any completed PASS. Unknown runtime, shared style or mapping changes
conservatively require re-review. Changes to docs/tests/evidence alone do not
trigger new art generations.

## CLI
```sh
ceos web-review-verify --kind production-art --phase acceptance \
  --record-file artifacts/evidence/review-v3.json --art-profile NARRATIVE_ART_ACCEPTANCE_V3 \
  --visual --assurance visual-content --json
ceos art-impact-plan --project . --file artifacts/evidence/art-impact-scope.json --json
```
The CLI performs validation; it does not invoke or impersonate a Web reviewer.
