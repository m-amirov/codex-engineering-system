---
name: narrative-continuity-engine
description: Audit route-conditioned time, location, knowledge, inventory, promises, consent and save-state continuity in visual novels and interactive fiction.
metadata:
  ceos-version: "0.5.12"
  origin: "Adapted narrative consistency concepts; implementation remains project-owned."
---

# Skill: narrative-continuity-engine

## Source of truth and trust

Load the authored canonical scene data and real executable route graph independently. Do not infer actual reachable state from the manuscript alone. This skill extends \`romance-narrative\` invariants and the project's optional Starter Kit \`narrative-game\` validator. A PASS from a JSON example is not proof the game runtime shares that graph; require extraction from production data or runtime reachability evidence.

## Continuity model

Track a small per-scene, per-route ledger of:
- **Event chronology:** order, date/time, explicit flashbacks, arrival/departure, location and object presence.
- **Knowledge provenance:** character learns a fact on a reachable path before acting on it.
- **Character promises and boundaries:** creation, fulfillment, refusal, acknowledgement, no implied consent.
- **State and inventory:** choices, route affinity, inventory, career, promises, established flags and one-shot actions.
- **Payoff obligations:** material established state has either an intended payoff or documented intentional non-use.
- **Save/Back:** a restored scene and state preserves route, knowledge, flags and one-shot effects. Back cannot reissue rewards or accidentally rewrite history.

## Mechanical versus semantic

A graph/model checker can prove *declared* edge validity, reachability, conditions, state constraints and save serializability within its bounded state space. It cannot prove the dialogue actually refers to the right character or that a promise was emotionally honored. Use anchored scene/cue excerpts and an independent editorial assessment for the latter. Full-season PASS requires explicit complete route/branch coverage, not zero counters or one happy-path run.

## Workflow

1. Start from a single authoritative game-head and canon revision; identify the affected scene/route graph.
2. Capture each relevant state effect and antecedent (fact source, prerequisite event, actor/location). Preserve actual code-derived IDs.
3. Run project-local \`narrative-game\` graph checks when opted in: all edges, endings, guards/effects, locale dialogue and save fixtures.
4. Run focused narrative semantic checks over paths involving revised beats: unreachable facts, unexplained moves, repeated one-shot acts, wrong route locks, knowledge from unvisited paths.
5. Confirm failures in production runtime or executable data before editing code. Distinguish model/harness defect from real game defect.
6. Record minimal impacted routes/tests and revalidate changed dependencies; do not regenerate prose or assets as a shortcut.

## Verdicts and output

Report CONFIRMED_DEFECT, EDITORIAL_RISK, EVIDENCE_GAP or PASS_SCOPED_CONTINUITY. Preserve exact scene/cue, affected route/state, proof path, observed vs expected condition, and correction scope. For a partially explored state space, report PARTIAL_COVERAGE/BLOCKED rather than PASS. Never silently broaden a player's choices or change route endings without authorization.
