---
name: reader-experience-review
description: Evaluate narrative comprehension, pacing, emotional engagement, romance payoff and route distinctiveness with a bounded blind reader review.
metadata:
  ceos-version: "0.5.12"
  origin: "Adapted editorial-reader testing; independent critique, not an automated enjoyment metric."
---

# Skill: reader-experience-review

## Intent

Evaluate whether an actual reader can follow the delivered words, not whether the author or an assistant can explain the intended plot. For existing text, use a bounded **cold read**; for concepts, review only the proposed reader promise. Complement \`romance-narrative\` without requiring romance in all stories.

## Blind review protocol

1. Lock episode, path, locale, exact HEAD and supplied text. Provide the reviewer with player-visible material and necessary choice history only. Withhold Story Bible, author explanations and future-scene spoilers until the initial answers are recorded.
2. First-pass comprehension: who is here, what changed, what each character knows, what the protagonist wants, what caused the choice, and where/when events occur.
3. Engagement: places where pacing stalls, repeated exposition, missed hooks, choices that interrupt a scene, and surprises that were not earned.
4. Emotional credibility: attraction and conflict dramatized in actions; clear consent and independent goals; ending payoff follows choices rather than affinity-score magic.
5. Route differentiation: compare *actually reachable* alternative text and outcomes, not route names alone. Don't require full divergent branches when meaningful state-dependent variation exists.
6. After blind impressions, optionally compare against canon and game-state evidence to classify concrete continuity defects separately from reader hypotheses and aesthetic preferences.

## Evidence

For each finding identify route, locale, scene/paragraph, the reader's first-pass interpretation, supplied player text, and why the intended meaning is unsupported/ambiguous. Report **CONFIRMED_DEFECT**, **COMPREHENSION_RISK**, **EDITORIAL_PREFERENCE**, or **EVIDENCE_GAP**. An independent human or Web reviewer is desirable but not assumed available; when unavailable record NOT_VERIFIED rather than inventing a cold reader.

## Efficiency and stop

One parent Codex orchestrates. Use at most one independent reviewer per scoped episode/path unless a material change demands targeted rereview. Keep outputs compact and persist only new questions and supported findings. Never replace gameplay tests, reachability proof, save regression or Web High art acceptance with reader sentiment. Never assert quantitative enjoyment or guaranteed commercial results. Stop after the agreed review scope.
