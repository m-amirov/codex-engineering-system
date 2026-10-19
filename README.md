<div align="center">

# Codex Engineering OS

**Give Codex a workflow it can resume — and results it can prove.**

An open-source execution and verification layer for [OpenAI Codex](https://github.com/openai/codex).
Define the goal once, work in bounded stages, and keep the evidence when a conversation ends.

[![CEOS Release Gate](https://github.com/m-amirov/codex-engineering-system/actions/workflows/release-0.5.7.yml/badge.svg)](https://github.com/m-amirov/codex-engineering-system/actions/workflows/release-0.5.7.yml)
![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white)
![Windows installer](https://img.shields.io/badge/installer-Windows%20PowerShell-0078D4?logo=windows&logoColor=white)

[**Quick start**](#quick-start) · [**How it works**](#how-it-works) · [**Workflows**](#workflows) · [**Documentation**](#documentation)

</div>

---

## Why CEOS?

AI coding agents are good at making changes. Longer projects have a different problem: **knowing what was requested, what really happened, what passed verification, and where to resume after an interruption.**

CEOS adds a persistent control plane around Codex. It does not replace the agent or its tools; it gives multi-stage work a scope, an execution order, evidence requirements, and explicit outcomes.

| Without a durable workflow | With CEOS |
| --- | --- |
| Repeat a long prompt after a new conversation | Resume from persisted run state with `ceos continue` |
| Rely on a summary of what was tested | Link checkpoints to real files, tests, and SHA-256 evidence |
| Let an agent quietly move to the next step | Enforce legal stages, scope, and bounded retries |
| Confuse “generated” or “looks fine” with “accepted” | Separate mechanical checks, runtime QA, and independent review |
| Lose track of why work stopped | Get explicit `PASS`, `BLOCKED`, `FAIL`, or `ESCALATE` outcomes |

> **The operating principle:** evidence determines acceptance. Missing or stale proof produces a blocker, not an optimistic success message.

## What you get

| Capability | What it does |
| --- | --- |
| **Persistent runs** | Stores scope, capabilities, stage transitions, checkpoints, and verdicts in the project. |
| **One-step continuation** | `ceos continue` plans the next authorized action without asking you to reconstruct the task. |
| **Verification gates** | Checks repository conditions and project-specific test, build, browser, or release requirements. |
| **Evidence integrity** | Pins checkpoint artifacts to file paths, sizes, hashes, and current source when required. |
| **Codex skills and agent roles** | Supplies reusable instructions for audits, fixes, reviews, QA, art production, and releases. |
| **Optional Web High reviews** | Supports independent, evidence-backed review through configured Web routes. |
| **Production-art pipeline** | Tracks briefs, image provenance, real PNG output, runtime presentation, and artistic acceptance. |
| **Safe recovery** | Detects stale sessions, modified evidence, and blocked runs; only permits explicitly supported recovery. |

### Who is it for?

Developers and teams using Codex for work that takes **more than one prompt**: repository audits, bug-fix cycles, test-driven implementation, browser QA, interactive narratives, game art pipelines, and controlled release preparation.

CEOS includes profiles for `generic`, `node-web`, `yandex-games`, `twork-desktop`, and `platibridge`. You can use the generic profile without adopting the specialized game workflows.

## How it works

CEOS coordinates the work; **Codex still executes it**.

```text
Your goal + constraints
          │
          ▼
   Lock the scope
          │
          ▼
    Check capabilities
          │
          ▼
  Codex does the work ◄─────┐
          │                 │
          ▼                 │
 Record real evidence       │
          │                 │
          ▼                 │
   Verify / re-audit ── fix ┘
          │
          ▼
 PASS · BLOCKED · FAIL · ESCALATE
```

The run survives a chat restart. Its state lives under:

```text
your-project/
└── .ceos-runs/
    └── <run-id>/
        ├── run.json
        ├── scope.json
        ├── capabilities.json
        ├── checkpoints/
        ├── artifacts/
        └── evidence/
```

Each stage advances only when its required evidence is available. The CLI does **not** invent test results, call Image Gen, impersonate reviewers, or publish your project on its own.

## Quick start

**Requirements:** Node.js **22+**, npm, Git, an installed Codex CLI, and **PowerShell on Windows** for the supported global installer. Optional Web High features require a separately working Web integration.

### 1. Install CEOS

Open PowerShell:

```powershell
git clone https://github.com/m-amirov/codex-engineering-system.git
cd codex-engineering-system
.\scripts\install-global.ps1 -Web auto
```

The installer builds an isolated npm package, installs the `ceos` CLI globally, and sets up Codex-facing configuration. It does **not** bind the global installation to the source checkout.

Verify installation:

```powershell
ceos version
ceos global-status
```

Restart Codex after installation. If prompted to trust the CEOS lifecycle hooks, review and authorize them in Codex; some native workflows require those hooks.

`-Web auto` configures optional routing based on the supported local setup. It does **not** guarantee that a Web reviewer is accessible or has returned a response. Use `ceos web-preflight` to inspect Web readiness.

### 2. Connect a project

For a **new** project, initialize the relevant profile:

```powershell
cd C:\path\to\your-project
ceos init --profile node-web --project .
ceos doctor --project .
```

For an **existing** project, preview adoption before changing anything:

```powershell
ceos adopt --project . --dry-run --json
ceos adopt --project . --profile node-web
ceos doctor --project .
```

Use `generic` instead of `node-web` for a repository without a Node web-app structure. Adoption is designed to preserve existing application code and project-owned build tooling.

### 3. Start a bounded task

For example, an audit and repair cycle:

```powershell
ceos run audit-repair-loop `
  --project . `
  --target "Investigate flaky tests" `
  --in-scope "tests;related source files" `
  --out-of-scope "deployment;unrelated refactors" `
  --acceptance "Reproduced issue, verified fix, passing relevant tests" `
  --mutation-boundary "tests and directly affected source files"
```

Then inspect the next step:

```powershell
ceos continue --project . --mode inspect --json
```

Tell Codex:

> Continue this CEOS run. Follow the locked scope, execute the next authorized stage, record genuine evidence, and report any blocker without bypassing a gate.

CEOS provides the plan and checkpoint contracts; the Codex host performs the actual file edits, commands, testing, and permitted tool calls.

### 4. Resume instead of repeating the prompt

```powershell
ceos continue --project .
ceos run-status latest
```

For a read-only check, use `ceos continue --mode inspect --json`. A persisted run is not a background job: Codex must still be active to carry out its next action.

## Workflows

<details>
<summary><strong>Audit → fix → verify</strong></summary>

The `audit-repair-loop` pipeline keeps the investigation, confirmed defects, repair attempts, tests, and independent re-audit separate.

```text
SCOPE_LOCKED → CAPABILITIES_CHECKED → EVIDENCE_COLLECTED
→ AUDITED → DEFECTS_CONFIRMED → REPAIRING
→ VERIFIED → REAUDITED → verdict
```

Unresolved findings, failed verification, or missing evidence prevent a false PASS.

[Learn about the execution engine](docs/execution-engine-0.5.0.md) · [Audit skill](skills/audit-repair-loop/SKILL.md)

</details>

<details>
<summary><strong>Production art → runtime QA → independent acceptance</strong></summary>

The `production-art` pipeline manages source-bound briefs, verified outputs, provenance, integration, visual QA, and independent review.

```text
SCOPE_LOCKED → CAPABILITIES_CHECKED → INVENTORIED
→ CANON_READY → GENERATING → INTEGRATED
→ VISUAL_VERIFIED → REAUDITED → verdict
```

Existing, independently accepted artwork can be handled using `VERIFIED_EXISTING_ART_REUSE` without generating new images. A **scoped batch PASS is not the same as episode-level or release acceptance**.

Actual native Image Gen availability and the producing agent's route must be verified for new generation. A declared model or a screenshot of a generated image is not evidence of a saved production asset.

[Production-art skill](skills/production-art/SKILL.md) · [Art acceptance policy](docs/NARRATIVE_ART_ACCEPTANCE_V2.md)

</details>

<details>
<summary><strong>Verification, release preparation, and specialized profiles</strong></summary>

Use `ceos doctor`, `ceos gates`, and `ceos verify` to inspect and execute the project's configured checks. Other shipped skills cover incident analysis, browser/visual QA, narrative writing, production inspection, and release preparation.

For Yandex Games, CEOS complements the project's Starter Kit; it does not replace the game's SDK, deployment, or storefront requirements.

[Agent map](AGENTS.md) · [Available skills](skills/) · [Profiles](profiles/)

</details>

## Design principles

- **Scoped, not unbounded.** A run has a target, explicit inclusion/exclusion boundaries, and acceptance criteria.
- **Fail closed.** Invalid provenance, stale source, missing reviewer observations, or unverified tool access are blockers.
- **Keep history intact.** Accepted checkpoints and their referenced evidence are not silently rewritten to make a later gate pass.
- **Separate different kinds of PASS.** A passing unit test, mechanical PNG check, artistic review, batch, and release are different decisions.
- **Human control remains.** CEOS does not grant new permissions to Codex or bypass host-side approvals. External writes, merges, and publication follow their own authorization rules.
- **Use existing infrastructure.** Profiles and skills sit alongside the project's own test/build/release tooling.

## Common commands

| Command | Purpose |
| --- | --- |
| `ceos help` | Show available commands and options |
| `ceos global-status` | Inspect global installation |
| `ceos status --project .` | Inspect project integration |
| `ceos doctor --project .` | Diagnose project configuration |
| `ceos verify --project .` | Run configured verification gates |
| `ceos run …` | Create a bounded execution run |
| `ceos continue --mode inspect --json` | Read the next action without claiming or executing it |
| `ceos run-status latest` | Inspect a saved run and its integrity |
| `ceos resume latest` | Revalidate persisted execution state |
| `ceos web-preflight` | Inspect optional Web routing readiness |
| `ceos self-test` | Run CEOS's installed self-test |

## Documentation

| Start here | For |
| --- | --- |
| [Installation notes](INSTALL.md) | Installer, optional Web routes, and platform-specific setup |
| [Continue workflow](docs/CEOS_CONTINUE_V1.md) | Safe next-action planning, recovery, and work claims |
| [Simple workflow](docs/CEOS_SIMPLE_WORKFLOW.md) | Development versus acceptance boundaries |
| [Execution engine](docs/execution-engine-0.5.0.md) | Stages, checkpoints, and state handling |
| [Native generation routing](docs/NATIVE_TERRA_ROUTING.md) | Genuine agent provenance and tool attestation |
| [Web delegation](policies/web-delegation.md) | Independent reviews and required receipts |
| [Web transport policy](policies/web-transport.md) | Attachment failures, limits, and retry rules |
| [Art acceptance](docs/NARRATIVE_ART_ACCEPTANCE_V2.md) | Story-first visual acceptance and severity |
| [Changelog](CHANGELOG.md) | Release-by-release implementation details |

### Updating

From your CEOS source checkout on Windows:

```powershell
git pull --ff-only
.\scripts\install-global.ps1 -Web auto
ceos version
ceos global-status
```

Restart Codex to load updated global instructions, agents, and hooks. Keep Web integration optional; `READY` is only a preflight state, not proof of an independent response.

---

<div align="center">

**CEOS makes progress inspectable, continuation predictable, and acceptance evidence-based.**

[Report a bug or suggest an improvement](https://github.com/m-amirov/codex-engineering-system/issues) · [View changes](CHANGELOG.md)

</div>
