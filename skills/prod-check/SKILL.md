---
name: prod-check
description: Inspect production safely in read-only mode by default. Use for production health, logs, metrics, configuration, database reads, provider status, and live-state verification without deployment or writes.
metadata:
  ceos-version: "0.2.0"
---

# Skill: prod-check

At activation, run `ceos context --skill prod-check --project .` when the CEOS CLI is available. Treat the returned profile/policies as the resolved project contract. If CEOS is unavailable, do not invent the missing project policy; use repository instructions and state the evidence gap.

**Intent:** inspect production safely.

Default: R0 read-only only. Report exactly which production surfaces were inspected. Never convert a read-only check into deploy/restart/DB write/provider submit. If write access is required to prove the requested condition, stop with `BLOCKED` and name the missing authorization/evidence.
