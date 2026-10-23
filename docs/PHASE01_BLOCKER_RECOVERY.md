# CEOS 0.6 phase 01 — unblock legacy contracts safely

This is an incremental opt-in hardening branch, **not** a completed autonomous
execution engine and **not** a release. It preserves historical runs/receipts.

- Scene identifiers: new authored IDs must exist in narrative/graph.json;
  legacy S-numbered IDs remain supported. No aliases are manufactured.
- Episode finalization derives episode document and graph membership from
  EP1, EP2, EP3, etc.; release acceptance stays independent.
- Generation candidates: default maximum remains two. Candidate #3 requires
  a SHA-bound OWNER_AUTHORIZED_ART_EXCEPTION_V1 file, independent host
  confirmation of the actual user's approval, and a source-bound ledger
  showing candidates #1/#2 were invoked. A file alone is not proof of consent.
- The candidate ledger records actual tool invocations as INVOKED,
  OUTPUT_SAVED or OUTPUT_LOST; losing an output does **not** reset usage.
  Preserve legacy records and import only source-verified historical attempts.
- A Web outage, rate limit or model entitlement failure pauses the affected
  review. It does not rewrite earlier PASS/REWORK, unlock Image Gen or authorize
  reopening terminal runs. Separately authorized nondependent work may continue.

Example request for one owner-authorized third candidate:

\`\`\`sh
ceos art-brief-verify --project . --file artifacts/production-art/stage9.13/briefs/ep3-old-photo.json \
  --candidate-ledger artifacts/production-art/candidate-ledger.json \
  --owner-exception artifacts/production-art/stage9.13/owner-exception-v1.json \
  --owner-exception-sha256 ACTUAL_FULL_SHA256 --owner-approval-observed --json
\`\`\`

The host must verify that user authorization exists before supplying
--owner-approval-observed. No automatic generation or history import is
performed by this command. Local user-approved exception files with other
schemas need **explicit** safe conversion; do not silently infer permission.

Before integrating into a local CEOS installation compare this branch
against the unpublished local HEAD and retain its newer DEV Web routing fixes.

To record a genuine invocation use `ceos art-candidate-record --project . --file artifacts/production-art/candidate-ledger.json --attempt-file artifacts/production-art/native-attempt.json --expected-ledger-sha256 <CURRENT_HASH> --json`. A new ledger requires an existing parent directory. `tracePath` and `traceSha256` must point to actual trace bytes within the project. Earlier entries remain unchanged; an optimistic SHA guard prevents lost concurrent updates. The trace must have a JSON payload.
