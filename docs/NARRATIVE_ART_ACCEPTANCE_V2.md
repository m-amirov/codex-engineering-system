# NARRATIVE_ART_ACCEPTANCE_V2 — story-first visual acceptance

## Scope / invariant

**Default for newly created CEOS production-art runs in projects with**
`config/narrative-game.local.json` containing
`{"profile":"narrative-game","enabled":true}`. Other genres and old
persisted runs retain their previous acceptance contract. This profile
does not weaken mechanical art integrity, runtime tests, routing, actual
image receipt requirements or Yandex release evidence.

The purpose of Web High review is to ensure players understand **who is
present, what they do, where/when the event happens, and what they need
to notice**. It is *not* pixel-perfect consistency between incidental
decorations, nor a competition for aesthetic preference.

## Dialogue-first comprehension (narrative games)

**Default artistic interpretation for future independent reviews:** assess the
*combined player experience*, including source-bound dialogue, narration, the
original CG and the player-facing runtime screenshot. A CG is not a literal
illustration checklist. If the dialogue makes an action understandable, absence
of a separate visual depiction is normally **not a P1 defect**.

For example, a character removing a romantic label from a calendar while
retaining work commitments may be explained in dialogue without a visible
close-up of the edited calendar. It is blocking only if the authored scene
requires the change to be *seen* or the CG actually contradicts the action in
a way that materially misleads the player. Wrong actor/cast, meaningful
location and genuine narrative contradictions remain blocking.

Independent reviews should report P0-P3 exclusively, not major/minor.
Advisory P2/P3 findings belong in `findings`, not `unresolved`, and
permit an explicit independent `PASS`. Absence of a screenshot or image
receipt never qualifies. The reviewer must not blindly accept the owner's
opinion, and a previously recorded `REWORK` must not be overwritten.

For a genuinely missing visual cue, a reviewer may explicitly record
`visualRequired:false` and `materialPlayerImpact:false`; such a claim
cannot coexist with an open blocking P1 for a missing prop or unillustrated
action. CEOS rejects the inconsistent finding instead of manufacturing a
PASS. This optional metadata applies to new findings only and does not
retroactively invalidate historical reviews.

## Blocking classification (actual runtime first)

- **P0:** wrong critical cast/action, unusable primary controls, broken
  presentation or major narrative contradiction. BLOCK.
- **P1:** verified contradiction of the authored scene, wrong meaningful
  action/location/cast, materially invisible story-critical prop, or a
  key character impossible to recognize. BLOCK when tied to evidence.
- **P2:** compositional/crop/style/wardrobe imperfection. **Advisory
  by default**. BLOCK **only** when reviewer independently documents
  `materialPlayerImpact:true`, one of the approved P2 `impactCode`
  values, the exact authored cue, actual pixels, observed error, and a
  concrete impact on player comprehension or essential readability.
- **P3:** cosmetic preference, color nuances, background photographs,
  minor continuity of non-story objects, taste/style improvement. NEVER
  a blocking reason by itself.

Clothing matters when it contradicts the *story's time/activity* or a
specific authored continuity cue. Different acceptable folds/colors,
garment texture or insignificant accessory detail are not P1.
A hand, suitcase, key or folder is story-critical **only if the
authored cue requires the player to see it**; ordinary prose mentioning
an item does not automatically require its full visual display.

Use **player-facing runtime screenshots** with the dialogue UI to
judge framing. If the cue is still clear, a partially cropped limb,
secondary character or nonessential prop is not inherently a defect.
Source PNGs remain authoritative for genuine baked elements; runtime
CSS/crop can be fixed without touching source art.

## Structured independent findings

For new narrative V2 review receipts, the reviewer must explicitly
declare `artAcceptanceProfile:"NARRATIVE_ART_ACCEPTANCE_V2"`.

Example **non-blocking PASS with notes** (independent reviewer must
actually see current pixels and produce its own PASS receipt):

```json
{
  "artAcceptanceProfile": "NARRATIVE_ART_ACCEPTANCE_V2",
  "status": "PASS",
  "findings": [
    {
      "id": "S03-wall-photo",
      "severity": "P3",
      "status": "OPEN",
      "observation": "Incidental photograph differs between adjacent scenes"
    },
    {
      "id": "S03-hands",
      "severity": "P2",
      "status": "OPEN",
      "materialPlayerImpact": false,
      "observation": "Small secondary gesture near the edge"
    }
  ],
  "unresolved": []
}
```

Other required Web fields (exact current HEAD, attachment refs and
received refs, per-frame observations, actualPixelsReceived, reviewer
trace or configured visual-content assurance) remain mandatory.

**Blocking** findings require `id`, `severity`, `status:"OPEN"`,
`authoredCue`, `observation`, `playerImpact`, `evidenceRef`,
`actualPixelsReceived:true` and appropriate `impactCode`.
For P2 also require `materialPlayerImpact:true`.

Allowed P0/P1 impact codes:

```text
WRONG_CHARACTER, WRONG_ACTOR_OR_ACTION, WRONG_LOCATION_OR_TIME,
STORY_CRITICAL_PROP_MISSING, STORY_CRITICAL_PROP_OBSCURED,
ESSENTIAL_CHARACTER_UNRECOGNIZABLE, NARRATIVE_CONTINUITY_CONTRADICTION,
DIALOGUE_OR_CONTROLS_UNREADABLE, CRITICAL_SCENE_MAPPING
```

Allowed **exceptional blocking P2** codes:

```text
ESSENTIAL_GESTURE_UNREADABLE, ESSENTIAL_SUBJECT_CROPPED,
STORY_ACTION_UNREADABLE, MATERIAL_RUNTIME_READABILITY
```

Naming an impact code is not proof of the impact; evidence and actual
story context are required. A parent agent must not simply downgrade
an existing independent P1/REWORK to P3. A changed verdict requires a
**fresh independent review** or documented independent re-adjudication
of the unchanged pixels and source-bound cue. Keep prior receipts
unaltered; record resolutions and references.

## Enforced surfaces

- **New narrative CEOS runs:** `run.artAcceptanceProfile` is persisted;
  `validateWebReview` rejects final V2 acceptance receipts with any
  open blocking finding, invalid findings or a missing V2 profile.
  Legacy runs are not retroactively changed.
- **Coverage queue:** ledger may set
  `acceptanceProfile:"NARRATIVE_ART_ACCEPTANCE_V2"`. Independent
  receipt status must agree with classified findings; P2/P3-only
  `REWORK` is rejected, **not converted into PASS**. A genuine
  reviewer must explicitly return PASS for that exact frame.
- **Rework preflight:** request may set that same `acceptanceProfile`.
  Only P0/P1 and specifically evidenced severe P2 authorize a local
  repair. P3 and ordinary P2 are advisory. Keep two-candidate / three
  failed-strategy budget; do not reset attempts by renaming files.
- **Web High:** reviewer must decide by narrative correctness and
  reader comprehension. Source art, UI overlays and image mappings are
  separate root causes. Cosmetic notes do not occupy
  `unresolved[]`; it is for genuine blockers.

`PASS_ART_ACCEPTANCE` requires real independent observations,
complete validated per-image coverage, correct hashes, and all
contractual approvals. If transport failed or evidence was not
delivered, return BLOCKED, never PASS. Mechanical PASS alone remains
insufficient.

## Bounded work and no review treadmill

Diagnose root cause before mutation: mapping/CSS/frame versus underlying
image. Fix only independently confirmed blocking issues in **one
consolidated repair batch**, re-review only changed images and causally
affected continuity. No new visual requirements after generation unless
a previously missed material narrative error is demonstrated. Aesthetic
P3 iteration is optional future polish, never a reason to reject the
episode. Do not regenerate a full CG because of a background photo or
irrelevant accessory mismatch. The existing producer candidate budget
remains hard policy.

### EP1 examples: interpretation, not automatic verdict

- Lobby guide hand: if the cue/action remains understandable after
  mobile framing fix, no further repair solely to perfectly display
  every finger. Background wall-photo differences are P3 unless
  the photograph is a plot object.
- Matteo Office keys/folder: P1 **only if** a precise narrative cue
  needs the player to visually recognize the objects. Otherwise note
  possible improvement without blocking.
- Staff Laundry: Elio need not be entirely visible if his identity,
  presence and meaningful action can be recognized. Authored clothing
  changes must be judged against passage/time/location, not a
  speculative pixel-perfect wardrobe requirement.
