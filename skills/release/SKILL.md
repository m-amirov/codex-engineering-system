---
name: release
description: Prepare and verify a release candidate using project-native release gates without unrequested redesign. Use for RC preparation, release readiness, packaging, and final release validation.
metadata:
  ceos-version: "0.2.0"
---

# Skill: release

At activation, run `ceos context --skill release --project .` when the CEOS CLI is available. Treat the returned profile/policies as the resolved project contract. If CEOS is unavailable, do not invent the missing project policy; use repository instructions and state the evidence gap.

**Intent:** prepare/verify a release candidate without unrequested product redesign.

Typical required chain: repo state → lint/typecheck → unit/integration → E2E/browser → production build → runtime smoke → profile-specific checks → artifact validation → release report.

Use manifest/profile gates instead of assuming every project has identical commands. A missing mandatory gate is `BLOCKED`, not PASS. For release recovery or any flow with a recorded release baseline, run release verification with `--baseline-ref <ref-or-sha>` (or project `release.baseline_ref`); CEOS must prove that current HEAD descends from that baseline. `RELEASE_RECOVERY_BASE_MISMATCH` is a provenance blocker and must not be bypassed by switching the report or evidence path.
