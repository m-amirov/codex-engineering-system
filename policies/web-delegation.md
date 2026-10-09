# Web High delegation: multi-stage evidence policy

CEOS now favors **more substantive, bounded Web High delegations** rather than one late approval request. This policy applies to medium/high-complexity engineering, narrative, art, visual QA, audits and release work. The parent remains the orchestrator; Web agents have no implied filesystem, browser, terminal, Git or mutation tools.

## Required opportunities

1. **Analysis:** native Codex collects fresh source/trace/screenshot evidence; Web High independently compares hypotheses, story/context, UX or design risks before remediation is fixed.
2. **Midpoint:** after a material repair batch, pass changed code, current runtime pixels and before/after states for independent review **before** closing it. Skip a pointless midpoint only when a zero-defect audit has no product change.
3. **Acceptance:** capture fresh exact-HEAD results and send changed/affected states for independent re-review. Acceptance must not recycle an earlier verdict.

Large audits: deduplicate equivalent cases by unique route/scene/cue/state, use bounded batches (up to four shards recommended), cover every distinct high-risk family, and sequentialize Web image-attachment turns. A Web reviewer may return FINDINGS; that is a meaningful outcome, not a transport failure. Missing/denied evidence is NOT_VERIFIED.

## Model and trust boundary

- CEOS-managed Web roles use explicit GPT-6 Sol High (`chatgpt-web/gpt-6-sol`), requiring Codex Web GPT 6.1.6 or newer. Do not silently downgrade to GPT-5.6.
- `ceos_reasoner_web`: architecture, semantics, causal alternatives, UX/narrative.
- `ceos_bulk_checker_web`: bounded, individually grounded text/ledger classification.
- `ceos_art_director_web`: supplied images, art canon, composition, framing.
- Native parent/tools: repository access, code changes, browser capture, tests, Git and provenance.
- A Web reply is an independent judgment **over supplied material**, not independently collected production evidence.

Use `ceos web-plan --kind visual-qa --complexity high --items 627 --visual` at the start. Engine-backed `ceos run` enables enhanced stage gates; standalone skills should use the planner and preserve equivalent review records. Planning does not automatically invoke remote Web subagents; the Codex host must perform the bounded calls.

## Review receipt record

Persist one JSON record per actual response and pass it to
`ceos routing-trace latest --web-review-file <record.json>` for engine-backed runs:

```json
{
  "phase": "analysis",
  "agent": "ceos_reasoner_web",
  "taskId": "S02-visual-presence-analysis",
  "reviewTraceId": "actual-provider-review-id",
  "sourceHead": "0123456789abcdef0123456789abcdef01234567",
  "status": "FINDINGS",
  "reviewedItems": ["S02:roadside-cafe:p18"],
  "evidenceRefs": ["s02-mobile-p18-actual-pixels"],
  "receivedEvidenceRefs": ["s02-mobile-p18-actual-pixels"],
  "actualPixelsReceived": true,
  "decision": "Four-person group is missing two active actors",
  "findings": [{"id": "S02-cast", "severity": "P1"}],
  "unresolved": ["S02-cast"],
  "evidenceArtifact": "artifacts/evidence/s02-web-analysis.json"
}
```

Use `PASS` at midpoint and acceptance only when the reviewer has actually examined the supplied evidence and no defects remain. If earlier Web review returned unresolved finding IDs, acceptance must include `resolvedFindings: [{ "id": "S02-cast", "evidenceRef": "s02-after-pixels" }]` and receipt of that new evidence. Never invent a provider trace ID or pretend `actualPixelsReceived=true` merely because a screenshot path exists.

The engine hashes each report file, stores per-cycle review telemetry, rejects stale HEAD/undelivered evidence, and prevents enhanced stage advancement without the appropriate phase review when Web is READY. A bare `--web-agents` name cannot satisfy the enhanced gate.

## Cost, transport, recovery

Do not spawn an agent per scene/page. Deduplicate, prefer a compact source excerpt plus necessary screenshots, and batch repeatable checks. Do not fire concurrent attachment-heavy turns. Observe `policies/web-transport.md`, respect explicit rate limits and bounded cooldowns, and never retry based on semantic disagreement. Optional Web absent/disabled → native-only; unexpected ready→unavailable transition → record explicit transport reason and native fallback. Explicit `--web-required` → BLOCKED on inability to use Web.

## Claim discipline

Web review `PASS` is not a native test result. Verify current-source assertions and scope separately. A reviewer-requested additional screenshot or unresolved defect cannot be closed by metadata reclassification alone. If Web did not receive actual pixels for a visual claim, mark that claim `WEB_REVIEW_NOT_VERIFIED`.


## Opt-in visual-content assurance (game art / visual QA)

Default `strict` retains mandatory real taskId/reviewTraceId. For visual `production-art` or `visual-qa` only, `visual-content` accepts independent image-content review without unavailable per-call provider identifiers. **This is not cryptographic remote attachment attestation.** It never changes platform rules or a project's release validator.

- `ceos web-plan --kind production-art --visual --assurance visual-content`
- `ceos run production-art ... --web-review-assurance visual-content`
- `ceos web-review-verify --kind production-art --phase acceptance --record-file review.json --visual --assurance visual-content`

Every Web review must retain a real response with sourceHead, reviewedItems, evidenceRefs, receivedEvidenceRefs, actualPixelsReceived=true, substantive decision, findings and unresolved. Each screenshot additionally needs `visualEvidence` with a unique matching ref, physical project-relative image path, actual 64-character SHA-256 and image-specific observation of at least 20 characters; CEOS verifies local bytes on ingest and upon resume. A missing screenshot, nonmatching hash, missing actual pixels, missing reference, stale head, generic observation, REWORK or unresolved finding blocks.

Example `visualEvidence` value:

```json
[{"ref":"S38-mobile","path":"artifacts/evidence/S38-390x844.png","sha256":"<actual file SHA-256>","observation":"Alice and Nick are both visible holding museum tickets; no camera appears."}]
```

Real provider IDs should be preserved when available; never invent them or replace them with agent IDs. A semantic receipt is limited to **what the model described seeing**, not proof that the host delivered byte-identical files. When transport evidently loses/changes an image, mark that review NOT_VERIFIED. `visual-content` requires deliberate selection at creation time; it never retroactively upgrades existing runs or changes a separate game's art acceptance schema. Security-sensitive or auditable workflows keep `strict`.
