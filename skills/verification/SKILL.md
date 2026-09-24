---
name: verification
description: Independently verify implementation or acceptance claims using project-native checks and evidence. Use when work is said to be complete or when the user asks to check, validate, confirm, or test a result.
metadata:
  ceos-version: "0.2.0"
---

# Skill: verification

At activation, run `ceos context --skill verification --project .` when the CEOS CLI is available. Treat the returned profile/policies as the resolved project contract. If CEOS is unavailable, do not invent the missing project policy; use repository instructions and state the evidence gap.

**Intent:** independently test whether stated acceptance criteria are actually satisfied.

Treat implementation claims as hypotheses. Map each acceptance criterion to evidence, run the strongest safe project-native checks available, and produce exactly one overall verdict: `PASS`, `FAIL`, or `BLOCKED`.

Do not promote a narrow green check to a broader PASS. Distinguish functional behavior, runtime presentation, authored content/cue correctness, release materials and infrastructure availability. Missing or stale evidence is `BLOCKED`; a failed check is `FAIL`. Visual claims require current-runtime pixels and proof that actual image content was supplied to an independent reviewer, not a text-only assertion.
