---
name: narrative-dialogue-editor
description: Edit dialogue in interactive fiction or visual novels. Use for distinct character voices, subtext, scene rhythm, dialogue localization, and branch-sensitive line editing.
metadata:
  ceos-version: "0.5.12"
  origin: "Adapted principles; original CEOS implementation, not imported third-party code."
---

# Skill: narrative-dialogue-editor

## Scope and authority

This skill complements `romance-narrative`; the project-owned Story Bible, current script, routes, locales, and author-approved voice canon are authoritative. Use `ceos context --skill narrative-dialogue-editor --project .` when available. Never change route topology, state effects, romance boundaries, visual mapping or character canon merely to improve a sentence. For a narrative without romance, use this skill independently.

## Three-layer dialogue review

For each requested conversation or bounded scene, distinguish:
1. **Surface text:** who speaks, natural register, voice-specific vocabulary, rhythm, sentence length and cadence. Test whether the speaker is distinguishable without the name tag, but do not fabricate artificial catchphrases.
2. **Subtext:** what the character wants, withholds, fears, misunderstands or cannot say directly; not every line requires a hidden agenda.
3. **Dramatic context:** established knowledge, previous choice, power and trust, physical action, location, consent/boundaries, and likely response.

Label **CONFIRMED_DEFECT** only when contradicted by source/canon/route state or demonstrably incorrect localization. Label taste-level concerns **EDITORIAL_RISK** or **SUGGESTION**, not an automatic blocker. Avoid mechanical templates, forced interruptions, adverb bans, clichés substituted with new clichés, or "all dialogue must be indirect" rules.

## Bounded procedure

1. Load only requested scene, voice profiles, adjacent continuity beats, and applicable RU/EN strings. Do not reread full season unless scope demands it.
2. Record per-speaker evidence: utterance/choice id, source quote (short), voice marker, emotional starting point, line function, immediate response and route conditions.
3. Detect same-voice leakage, flat exposition between people who already know the facts, unnatural syntax, repetitive information, broken attribution, contradictions in knowledge/consent and unintended localization drift.
4. Propose the **minimum** line edits with before/after IDs and editorial rationale. Preserve branching IDs, cue-to-art mapping, effects and all locales; when altering a cue or stateful meaning, explicitly request scope expansion and relevant tests.
5. Verify original and translated intent, gender/person references, speaker identity, pronouns, punctuation, timing, and long-line mobile readability. Translate dramatic function, not word-for-word phrasing.
6. Reinspect only dependent dialogue and affected route transitions. Run project dialogue/localization tests when available. Independent Web review is bounded and subject to quota/actual-evidence rules.

## Bounded episode handoff

For the next dialogue beat, load only authoritative prior route/choice state, character knowledge, changed relationship tension/boundaries, outstanding material promise IDs and neighboring scene/cue references. Revalidate this context against the actual source, not a previous model's memory. When setup/payoff is under review, check that spoken action naturally supports the expectation, without forced exposition or a reminder in every conversation. Preserve route/locale semantics and mark unwritten outcomes `planned`, not accepted.

## Output

For each finding include scene/cue/speaker, route/locale, evidence, class (CONFIRMED_DEFECT/EDITORIAL_RISK/INTENTIONAL_CHOICE/EVIDENCE_GAP), suggested edit, and whether changes require author approval. "More romantic" or "sounds AI-written" alone is not a mechanically proven defect. Stop after the agreed scope and bounded repair attempts; do not rewrite an entire episode on speculative style grounds.
