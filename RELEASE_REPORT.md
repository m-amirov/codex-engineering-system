# CEOS 0.3.0 Release Report

Date: 2026-09-17

## Intended verdict

`PASS_CEOS_0_3_0_REASONING_ONLY_WEB_ROUTING`

## Scope

CEOS 0.3.0 adds optional ChatGPT Web reasoning without making MCP / Full Harness a prerequisite. `codex-chatgpt-web` remains a separate transport project; CEOS uses its model rows when present and degrades to the unchanged native routing baseline when absent.

The corrected 0.3.0 contract explicitly separates reasoning over supplied context from tool-backed evidence gathering.

## Web routing

- `ceos_bulk_checker_web` → `chatgpt-web/light`, low, reasoning-only; for repetitive classification/comparison over a complete supplied evidence bundle.
- `ceos_reasoner_web` → `chatgpt-web/medium`, medium, reasoning-only; for architecture reasoning, hypothesis comparison, planning, synthesis, and critique over supplied context.
- `ceos_explorer_web` is removed from the corrected 0.3.0 contract because Browser-only Web models cannot independently inspect the workspace.
- `ceos_bulk_checker` → native `gpt-5.6-luna`, low, for tool-backed batch checks.
- `ceos_explorer` → native `gpt-5.6-terra`, medium, for repository exploration and fresh evidence gathering.
- `ceos_implementer` → native `gpt-5.6`, medium.
- `ceos_debugger` → native `gpt-5.6`, high.
- `ceos_reviewer` → native `gpt-5.6`, high.
- `ceos_verifier` → native `gpt-5.6`, high.

Critical writes, fresh repository inspection, terminal/tests/browser work, ambiguous debugging, security/production-risk review, and final acceptance remain native.

## MCP boundary

CEOS 0.3.0 does **not** require MCP / Full Harness. Browser sign-in, a passing browser smoke test, installed ChatGPT Web model rows, and a successful Web turn in Codex are sufficient for the optional Web reasoning routes.

Even if MCP is configured separately, the 0.3.0 routing policy does not automatically move tool-backed engineering roles to Web models. That expansion requires a later explicit policy change backed by real-project evidence.

## Evidence boundary

A Web agent may analyze only evidence supplied in its delegated context. It must not claim to have inspected files, repository state, command results, browser state, or external systems unless that evidence was supplied.

The supported pattern is native evidence collection → bounded evidence snapshot → Web reasoning → native implementation/verification. Web output is advisory analysis, not independent completion evidence.

## Capability and fallback contract

`scripts/install-hybrid.ps1` supports `auto|on|off`. In `auto`, Windows detection recognizes both a legacy CLI-style command and the packaged launcher at `%LOCALAPPDATA%\Programs\Codex Web GPT\Codex Web GPT.exe`.

The manifest is schema v2 and records `routingMode: reasoning-only`, `mcpRequired: false`, and `localToolsAssumed: false`.

A Web task may fall back to a native role at most once and only for model/backend/transport/runtime unavailability. A found defect, uncertainty, rejected hypothesis, disagreement, or otherwise unfavorable outcome is not a transport failure and does not cause model shopping or hidden double execution.

## Compatibility

- Node: >=22
- Project manifest schema: v1 unchanged
- Evidence schema: v1 unchanged
- Existing seven Skills and five Profiles unchanged
- Existing six native routes unchanged
- `codex-chatgpt-web`: optional; CEOS remains functional without it
- Earlier draft `ceos_explorer_web`: migrated away safely by the hybrid installer when CEOS-managed

## Verification gates for this release

- Existing Node regression suite must remain PASS.
- Web-agent static-contract tests must prove reasoning-only behavior and absence of the explorer Web agent.
- `npm run lint` must PASS.
- `npm run self-test` must PASS.
- `ceos version` must read `0.3.0`.
- Hybrid installer must recognize the packaged Windows launcher, protect unrelated agent files, emit the schema-v2 capability manifest, and preserve the single-fallback contract.
- Release packaging must complete only after all gates pass.
