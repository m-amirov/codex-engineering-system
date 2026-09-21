---
name: romance-narrative
description: Design and audit romance-first interactive fiction and visual novels. Use when the user wants a new romantic concept, character/route architecture, or a romance-focused script review; load alongside audit or audit-repair-loop when existing material is being examined.
metadata:
  ceos-version: "0.5.3"
---

# Skill: romance-narrative

## Scope and authority

At activation, run `ceos context --skill romance-narrative --project .` when available. If the CLI or this skill is not registered in the installed CEOS context, load this file directly and report that registration is unverified. Follow the active project profile, safety/evidence policies and user-approved creative brief. Do not impose romance-first rules on unrelated narrative genres. Treat the author's new brief as authoritative over the architecture, title, and canon of any previous project.

This is a semantic editorial contract, **not** a claim that automated tests can certify reader enjoyment or chemistry. Provide scene/choice evidence and clearly separate subjective editorial concerns, factual continuity defects, and unverified hypotheses.

## Before concept generation: reset the inherited story

- Summarize the requested emotional experience, intended audience, setting boundaries, protagonist agency, number of love interests only if specified, and any excluded themes/tropes. If not specified, propose alternatives rather than inventing hard requirements.
- Inventory reusable *engineering lessons* separately from old *story canon*. Never carry over previous scene counts, route counts, endings, relationship scales, supernatural mystery, plot twists, character biographies, titles, or art direction by default.
- Generate genuinely distinct premises with a concrete romantic hook, protagonist desire outside romance, differentiated romantic dynamics, credible external stakes, meaningful relationship obstacles, and a sustainable scene engine. A setting swap of the same mystery is not a new concept.
- Do not write a full season or change product files before the concept and creative direction are approved. Do not require a particular romance/mystery percentage or fixed number of dates/kisses/conflicts.

## Romance-first design review

1. **Narrative center:** identify the primary dramatic question and whether the major beats directly develop relationship, personal choice, or romantic consequences. Investigation, lore and external intrigue must support, not silently displace, an approved romance-first brief.
2. **Earned intimacy:** map attraction → mutual discovery → vulnerability/conflict → changed understanding/commitment, allowing non-linear development; point to dramatized actions, not merely affinity increments or declarations.
3. **Character autonomy:** each love interest has an independent goal, recognizable voice, boundaries, conflicting values and decisions outside the protagonist; protagonist actively initiates, rejects, apologizes, negotiates and chooses.
4. **Route differentiation:** distinguish routes by emotional premise, signature scenes, conflicts, costs and resolution rather than swapping names in common dialogue. Do not treat high affinity as the only condition for consequential outcomes.
5. **Choice causality:** for major choices, record what the player can understand beforehand, immediate response, later payoff, state/route effect and possible refusal or independent outcome. Avoid false choices, unexplained route locks and coercive romance framing presented as inherently desirable.
6. **Pacing and dialogue:** track scene-level emotional change, subtext, tension/release, natural introductions, physical location/time, who knows what, and redundancies. Do not demand conflict in every scene; quiet intimacy may be functional.
7. **Consistency and endings:** verify chronology, presence, objects, knowledge, promises, consent/boundaries, behavior patterns, route reachability and ending causality against project-owned canon/state contracts.
8. **Presentation:** after art exists, verify character identity and expression, staging, framing, mobile legibility and that key romantic beats have meaningful visual support. Do not classify missing assets as a script defect when concept-only work is in scope.

## Token-conscious execution and agent boundaries

Use `policies/native-delegation.md`. Long-form prose and editorial repair are owned by **one parent native Codex session** unless an explicitly justified exception applies. Do not spawn simultaneous native writers/reviewers for episodes or route variants; avoid rereading large approved manuscripts or copying shared text into every agent context. Preserve already completed work and process large requested scopes sequentially, one episode per checkpoint.

For each finished episode, request one **bounded Web High** independent editorial review when Web is enabled/required and actually callable. Web receives the complete relevant new text and necessary canon/choice excerpts, not the entire repository or repeated unchanged alternative paths. After fixes, inspect the changed passages and dependent transitions; respect any full-scope re-audit required by a locked acceptance contract. Use project commands for word counts, branch IDs and consistency checks. Native independent tool-backed review is an exception only when specifically required and cannot be evidenced by the parent plus Web; state the reason and keep it narrowly scoped.

## Evidence and gates

For an existing draft, produce a bounded scene/route matrix: scene ID, route, goal, emotional start/end, romantic beat, player agency, promised payoff, delivered payoff, and evidence location. For a *new concept*, use a premise/route-beat outline instead; full-script coverage cannot be demanded before the script exists.

Classify findings as CONFIRMED_DEFECT, EDITORIAL_RISK, INTENTIONAL_CHOICE, EVIDENCE_GAP or OUT_OF_SCOPE. Cite exact scene/choice references for confirmed defects. Avoid arbitrary numerical coverage thresholds, synthetic scores and PASS-by-checklist: a scene's presence is not evidence of convincing romance. Ask for an author decision when the issue depends on artistic preference rather than asserting one correct solution.

Route implementation/repair through the existing `audit-repair-loop` and native project verification. Re-audit fresh material after changes; preserve approved story structure unless the user authorizes a structural rewrite. Web reviewers can critique bounded supplied material only; they cannot claim to have inspected files or produced assets. Follow the audit-repair-loop Web preflight, fallback and evidence contracts.

## Stop conditions

Stop before full-season prose, runtime scaffolding, bulk asset generation, deployment or publication if only a concept/CEOS update was requested. If a required source, permission or canon decision is missing, label the affected assertion unverified rather than fabricating proof.
