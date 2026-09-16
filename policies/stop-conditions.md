# Stop Conditions

Return `BLOCKED` rather than guessing when any required condition is true:

- missing credentials/access needed for required evidence;
- required irreversible/financial operation lacks authorization;
- contradictory acceptance criteria cannot be reconciled from project evidence;
- real runtime or mandatory verification cannot be executed;
- an approved required asset/input is unavailable;
- external submit state is ambiguous and retry could duplicate an operation;
- task scope would have to expand into explicitly forbidden behavior.
