---
name: incident-analysis
description: Reconstruct and diagnose runtime incidents from logs and correlated evidence. Use for crashes, browser hangs, timeouts, service failures, automation failures, and unexplained runtime behavior.
metadata:
  ceos-version: "0.2.0"
---

# Skill: incident-analysis

At activation, run `ceos context --skill incident-analysis --project .` when the CEOS CLI is available. Treat the returned profile/policies as the resolved project contract. If CEOS is unavailable, do not invent the missing project policy; use repository instructions and state the evidence gap.

**Intent:** reconstruct a runtime incident from evidence and identify the most supported root cause.

Prefer a bounded timeline: symptom → preceding events → subsystem state → failure → recovery/terminal state. Correlate logs, screenshots, stack traces, browser state, task type and recent actions. Separate root cause from secondary fallout. State confidence and missing evidence explicitly.
