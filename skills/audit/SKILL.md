---
name: audit
description: Audit an existing software project without changing product behavior. Use for codebase audits, quality reviews, regression-risk assessment, readiness checks, and evidence-based defect discovery.
metadata:
  ceos-version: "0.2.0"
---

# Skill: audit

At activation, run `ceos context --skill audit --project .` when the CEOS CLI is available. Treat the returned profile/policies as the resolved project contract. If CEOS is unavailable, do not invent the missing project policy; use repository instructions and state the evidence gap.

**Intent:** assess current state without changing product behavior.

1. Load safety/evidence/git policies and project profile.
2. Inspect repository state, architecture, existing verification paths and relevant runtime evidence.
3. Run safe read-only/local verification that materially increases confidence.
4. Classify findings by severity and distinguish product defects, test defects, infra defects and evidence gaps.
5. Do not turn the audit into a broad refactor.
6. Return findings first, then evidence/gaps, then verdict.

Default mutation mode: **read-only**.
