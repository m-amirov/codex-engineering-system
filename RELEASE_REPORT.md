# CEOS 0.3.0 Release Report

Date: 2026-09-17

## Intended verdict

`PASS_CEOS_0_3_0_HYBRID_ROUTING`

## Scope

CEOS 0.3.0 adds an optional backend dimension to the existing role-based custom-agent routing. `codex-chatgpt-web` remains a separate transport project; CEOS uses its model rows when present and degrades to the unchanged native routing baseline when absent.

## Hybrid routing

- `ceos_bulk_checker_web` → `chatgpt-web/light`, low, read-only; native fallback `ceos_bulk_checker`.
- `ceos_explorer_web` → `chatgpt-web/medium`, medium, read-only; native fallback `ceos_explorer`.
- `ceos_implementer` → native `gpt-5.6`, medium.
- `ceos_debugger` → native `gpt-5.6`, high.
- `ceos_reviewer` → native `gpt-5.6`, high.
- `ceos_verifier` → native `gpt-5.6`, high.

The Web routes are deliberately bounded to read-only workloads in 0.3.0. Critical writes, ambiguous debugging, security/production-risk review, and final acceptance remain native.

## Capability and fallback contract

`scripts/install-hybrid.ps1` supports `auto|on|off`. In `auto`, it detects the `codex-chatgpt-web` executable and records the resulting state in `$CODEX_HOME/ceos/hybrid-routing.json`.

A Web task may fall back to its native peer at most once and only for model/backend/transport/runtime unavailability. A failed test, found defect, inconclusive investigation, rejected hypothesis, or otherwise unfavorable task outcome is not a transport failure and does not cause model shopping or hidden double execution.

## Compatibility

- Node: >=22
- Project manifest schema: v1 unchanged
- Evidence schema: v1 unchanged
- Existing seven Skills and five Profiles unchanged
- Existing six native routes unchanged
- `codex-chatgpt-web`: optional; CEOS remains functional without it

## Verification gates for this release

- Existing Node regression suite must remain PASS.
- New hybrid static-contract tests must PASS.
- `npm run lint` must PASS.
- `npm run self-test` must PASS.
- `ceos version` must read `0.3.0`.
- Web agent definitions must use the expected `chatgpt-web/*` rows and `read-only` sandbox.
- Hybrid installer must detect the bridge, protect unrelated agent files, emit the capability manifest, and preserve the single-fallback contract.

Actual validation evidence is reported in the release commit/response; this document describes the release contract rather than fabricating test results.
