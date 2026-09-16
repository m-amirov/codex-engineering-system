---
name: visual-qa
description: Verify rendered UI or game presentation in real browser/runtime evidence. Use for desktop/mobile visual QA, clipping, overflow, localization, responsive layout, touch controls, and console/runtime presentation defects.
metadata:
  ceos-version: "0.2.0"
---

# Skill: visual-qa

At activation, run `ceos context --skill visual-qa --project .` when the CEOS CLI is available. Treat the returned profile/policies as the resolved project contract. If CEOS is unavailable, do not invent the missing project policy; use repository instructions and state the evidence gap.

**Intent:** verify rendered presentation in the real runtime/browser.

Inspect declared viewport/locale/input matrix. Look for clipping, overflow, overlaps, unreadable text, stale/wrong locale, touch/control defects, console/page errors and runtime 404s. Source review alone does not satisfy a runtime visual claim when browser execution is available.
