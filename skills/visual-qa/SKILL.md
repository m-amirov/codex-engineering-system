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

## Pixel and mechanical gate

Every visual verdict references current-runtime image evidence and records SHA-256, bytes, dimensions, current commit, viewport, state/cue and URL. A textual capture log, DOM assertion, OCR result, or `screenshot created` message is not visual evidence. Before independent multimodal review, validate that actual screenshot and character/reference pixels were supplied; otherwise return `BLOCKED`.

For each affected viewport assert mechanically: content reaches all four viewport edges, no document or internal scroll chain, readable text, and no overlap of the primary action with text or controls. For authored cues, capture before/after pairs and match observed event id and asset hash to the current coverage ledger. Stale or missing ledgers are evidence gaps. Playwright timeout, unavailable browser, or inaccessible screenshot is `BLOCKED`/`EVIDENCE_GAP`, never `PASS`; functional, DOM, save/load, pagination and route checks cannot promote visual acceptance.


## Web review transport discipline

When independent review uses a Web High route, follow `policies/web-transport.md`. Do not fire attachment-bearing review turns in parallel. Prefer one confirmed master/reference followed by one runtime screenshot per turn, and do not resend viewport frames that already have a valid pixel-backed verdict.

An explicit 429/"too many requests"/usage-limit signal is `RATE_LIMITED`, not a visual defect. Respect bounded cooldown and keep the current screenshots/assets unchanged. A generic `ChatGPT did not accept all prompt attachments` or disconnected attachment stream is `ATTACHMENT_TRANSPORT` unless a separate explicit rate-limit signal is present.

If `actualPixelsReceived=true` and the reviewer returns REWORK/FAIL, treat it as a semantic visual result and stop/rework according to the task contract; do not relabel it as transport failure.

Production reader/dialogue/navigation overlays visible in a runtime screenshot are expected runtime UI. They must not be classified as baked UI/text inside the generated CG. If ambiguous, supply the raw asset separately and judge baked content on the asset pixels.
