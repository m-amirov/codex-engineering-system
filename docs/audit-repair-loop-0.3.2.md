# audit-repair-loop 0.3.2

## Target lock

A loop verdict belongs to the user-selected target. Before audit, record `target`, `in_scope`, `out_of_scope`, `acceptance_contract`, and `mutation_boundary`.

Project profiles and platform requirements may choose checks but do not redefine the target. Release/publication/submission artifacts are separate unless the user explicitly includes them.

## Web routing

Run `ceos web-preflight --json` before substantive Web review.

- `READY`: use `ceos_bulk_checker_web` and/or `ceos_reasoner_web` for substantive audit.
- `DISABLED`, `NOT_CONFIGURED`, `UNAVAILABLE`, `NOT_ACCEPTING_TURNS`: use at most one native fallback and record the reason.
- Explicit Web-required request + non-ready Web: `BLOCKED`.

Each checkpoint records `web_preflight_status`, `web_agents_used[]`, `native_fallback_used`, and `fallback_reason`.

## Repair cycle

```text
scope lock
→ native evidence
→ Web preflight
→ Web audit when READY
→ confirmed in-scope defects
→ consolidated remediation packet
→ native repair/debug
→ target-proportional verification
→ fresh evidence
→ fresh Web re-audit when READY
→ PASS | FAIL | BLOCKED | ESCALATE
```

Default maximum automatic cycles: 3.
