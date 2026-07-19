# yandex-release-validation

## Purpose
Reusable workflow for yandex release validation without duplicating global instructions.

## Use when
The task needs this specialized workflow, evidence, and repeatable checks.

## Do not use when
The task is trivial, unrelated, or the project has a stricter local workflow.

## Inputs
Project path, selected profiles, acceptance criteria, changed components, risks, and available test commands.

## Steps
1. Inspect existing code, tests, docs, and profile requirements.
2. Define expected result and acceptance criteria.
3. Classify risks and choose the smallest coherent plan.
4. Execute changes or audit steps.
5. Run targeted checks and required release gates when applicable.
6. Update only affected documentation.
7. Produce evidence-based PASS/PARTIAL/FAIL result.

## Required checks
Targeted lint/type/unit/integration/E2E where available; high-risk failure paths; documentation impact; skipped checks list.

## Result format
Summary, evidence commands, findings, skipped checks, risks, recommendation.

## PASS / PARTIAL / FAIL
PASS means criteria and mandatory checks passed. PARTIAL means useful progress with explicit gaps. FAIL means criteria unmet or critical check failed.

## Safety limits
No secrets, publication, destructive commands, arbitrary shell from YAML, or unbounded automation.

## Local references and templates
- `references/`
- `templates/`
