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

Use manifest/profile gates instead of assuming every project has identical commands. A missing mandatory gate is `BLOCKED`, not PASS.

## Release identity and proof domains

Before release work, freeze repository/worktree identity, branch, starting HEAD and any expected release/base HEAD. If lineage does not match the frozen source, stop; do not switch/reset/stash away parallel work to force continuity.

Map the release contract across distinct proof domains: functional/tests, production runtime, visual/mobile, authored content where applicable, platform/manual evidence, media, package/artifact integrity and external infrastructure. A local green suite cannot replace a required manual/platform/visual/media domain.

Infrastructure outages (GitHub/DNS/provider/bridge) are blockers for the affected gate, not evidence that product correctness passed or failed. Final release readiness requires current evidence tied to the exact packaged source.
