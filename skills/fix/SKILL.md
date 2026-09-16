---
name: fix
description: Reproduce, diagnose, repair, and verify a software defect with regression coverage. Use when the user asks to fix a bug, failure, hang, regression, or incorrect behavior.
metadata:
  ceos-version: "0.2.0"
---

# Skill: fix

At activation, run `ceos context --skill fix --project .` when the CEOS CLI is available. Treat the returned profile/policies as the resolved project contract. If CEOS is unavailable, do not invent the missing project policy; use repository instructions and state the evidence gap.

**Intent:** reproduce, identify root cause, repair and verify a defect.

Required shape: `reproduce → diagnose → minimal repair → regression coverage → verification`.

Do not stop at a plausible hypothesis when the defect can be investigated. Preserve unrelated behavior and unrelated working-tree changes. Prefer the smallest systemic fix over symptom masking. A fix is incomplete until the relevant verification passes or a concrete blocker is proven.
