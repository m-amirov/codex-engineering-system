# Global Codex Instructions

Read the nearest project `AGENTS.md` first; project instructions override these defaults. Follow the engineering cycle: investigate current state, define expected result and acceptance criteria, identify components and risks, plan the minimum coherent change, implement, run targeted unit/integration/E2E verification, review independently, update docs, run release gate when needed, report evidence, and promote reusable learning.

Mandatory rules: fix root cause, inspect code/tests/docs before changing, avoid unrelated refactoring, justify dependencies, never claim completion without executed checks, list skipped checks, separate facts from assumptions, use targeted tests during development, run full E2E before release candidates or shared infrastructure changes, synchronize documentation for behavior/architecture/data/config/release changes, protect secrets, and avoid destructive commands without explicit permission. Potentially dangerous scripts must support and use dry-run first.

Final report: summary, files changed, commands with results, skipped checks, risks, and next step. Details live in `global/principles/` and `standards/`.
