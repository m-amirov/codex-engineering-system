# Stop Conditions

Return `BLOCKED` rather than guessing when any required condition is true:

- missing credentials/access needed for required evidence;
- required irreversible/financial operation lacks authorization;
- contradictory acceptance criteria cannot be reconciled from project evidence;
- real runtime or mandatory verification cannot be executed;
- required screenshot pixels or reference-image pixels cannot be supplied to the independent visual reviewer;
- required Web review remains rate-limited after the bounded 120s → 300s → 600s cooldown sequence, or attachment delivery remains unavailable after two bounded retries;
- a screenshot is inaccessible, stale, text-only, or cannot be tied to the current commit and viewport;
- an approved required asset/input is unavailable;
- external submit state is ambiguous and retry could duplicate an operation;
- task scope would have to expand into explicitly forbidden behavior.
