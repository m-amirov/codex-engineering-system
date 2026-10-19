# DEV-only Web High transport

## Scope and architecture decision

CEOS now has an optional `dev-web-review` host adapter for independent visual
review through the installed Codex Web GPT DEV profile. It does not modify the
Codex provider, re-enable Stable routing, or start the Stable Responses proxy.
The adapter is deliberately a host-side transport: CEOS remains the source of
truth for scope, Git HEAD, hashes, receipt validation, retry classification and
continuation state.

The verified DEV 6.1.11 installation exposes two relevant layers:

- `dev chat` is a text-oriented harness. In `browser-only` mode it sets
  `localToolsEnabled=false`; its old smoke records are not evidence of local
  tools or visual delivery.
- The launcher-owned `browser-helper.cjs` protocol accepts a
  `prepared_selected_ack` frame containing `text` and inline `images`. The
  helper performs the existing launcher/browser upload and prompt submission.

The adapter reuses that second layer. It launches the helper executable and
script advertised by the DEV `runtime/launcher-browser.json` descriptor, with
`ELECTRON_RUN_AS_NODE=1` and an isolated DEV environment. It does not expose a
new CDP endpoint, copy cookies/tokens, read the Stable profile, or use
`http://127.0.0.1:17841`.

## Request and receipt contract

`DevWebHighTransport.review()` accepts one source-bound request:

- `sceneId`, `sourceHead`, and textual `context`;
- at least one `original` and one `runtime` image;
- project-relative image paths and caller-supplied SHA-256 values.

Before a browser turn it resolves the real project `git rev-parse HEAD` itself.
An optional CLI `--head` is only an assertion against that value; it cannot
replace it. The request HEAD, actual project HEAD and reviewer HEAD must all
match. It then recomputes every image hash, checks PNG signatures and byte
limits, and converts the bytes to inline data URLs. A mismatch is a
`PROVENANCE_FAILURE` and no DEV turn is started.

Each turn selects `chatgpt-web/gpt-6-sol` with `reasoning=high`,
`modelFamily=6`, and `localToolsEnabled=false`. The prompt requires exactly one
JSON object containing `sourceHead`, `reviewedItems`, `evidenceRefs`,
`receivedEvidenceRefs`, `actualPixelsReceived`, `decision`, `findings`,
`unresolved`, the V2 profile, and one `visualEvidence` observation for every
attached original/runtime ref. The normalizer accepts a single fenced JSON
object, and deterministically removes only invalid Markdown punctuation escapes
(`\[`, `\]`, `\_`) from one otherwise parseable object. It still rejects
multiple objects and arbitrary malformed candidates. It verifies the reviewer's
paths and SHA-256 values against the files that were attached.

The raw response is persisted append-only beside the requested evidence
artifact before validation. The receipt (or `NOT_VERIFIED` result) records the
raw artifact path, response hash, extraction format, source HEAD and image
hashes. If the first response has complete substantive observations but only a
format/envelope defect, the adapter may issue one text-only correction turn in
the same retained conversation (`prepareResume`/`requireRetainedConversation`)
with no re-uploaded images. A missing or incomplete pixel observation never
qualifies for this repair and can never be promoted to `PASS`.

The independent reviewer prompt now applies the `NARRATIVE_ART_ACCEPTANCE_V2`
dialogue-first rubric: it must judge scene comprehension using story text
and runtime pixels together. Literal CG depiction of a narrated action is
not mandatory unless source-bound cues require it. P0/P1 blocking findings
still require material, observed contradictions; advisory P2/P3 issues
are not grounds for automatic regeneration. The owner cannot force
reviewer PASS, and an earlier REWORK remains immutable.

The adapter never fills in a missing observation or reviewer verdict. Missing
or malformed observations return `NOT_VERIFIED`; a valid reviewer `PASS`,
`REWORK`, or `BLOCKED` is preserved as-is. The browser helper's host trace is
stored as transport evidence, not as a provider-signed CEOS `reviewTraceId`.
An open P0/P1 or material P2 V2 finding is incompatible with reviewer `PASS`
and returns `NOT_VERIFIED` with `NARRATIVE_VERDICT_CONTRADICTION` rather than
creating a false acceptance receipt.

Successful complete observations produce a receipt consumable by the existing
`web-review-verify` and `routing-trace` paths. The receipt uses
`visual-content` semantics and records scene ID, source HEAD, image refs and
SHA-256 values, runtime/original observations, model/effort, local transport
trace, and `stableBridgeUsed:false`. A host transport trace is not presented
as a provider-signed `reviewTraceId`.

## Failure and retry policy

The adapter keeps semantic outcomes separate from transport outcomes:

- `PASS`, `REWORK`, and reviewer `BLOCKED` are reviewer decisions;
- `NOT_VERIFIED` means the completed response did not prove the required pixel
  observations;
- `BLOCKED` with a transport classification is an infrastructure/capability
  stop, not a semantic pass;
- `ATTACHMENT_TRANSPORT` retries only the failed turn after 30 s and 60 s;
  two failed retries stop the operation;
- explicit attachment quota and rate-limit errors are not silently retried as
  ordinary upload failures;
- batch reviews are sequential and wait at least 20 s between attachment turns;
- the same minimum is persisted in a DEV-profile runtime pacing state shared by
  separate CLI processes. An atomic lease serializes concurrent uploads,
  heartbeats while a turn is active, and expires safely after a crashed/stale
  owner. Lease wait timeout returns `ATTACHMENT_PACING_BLOCKED` rather than
  overlapping turns.

No semantic `REWORK` is retried by the adapter, and no delegated-agent retry
cycle is created.

Schema repair is text-only and is attempted at most once. It sets
`requireRetainedConversation:true`, reuses the same conversation key, and
sends no images. If the DEV host cannot restore that conversation, the result
is `BLOCKED` with `RETAINED_CONVERSATION_UNAVAILABLE`; the adapter never starts
a replacement image review or presents a new conversation as a continuation.

## CEOS and `continue`

The CLI command writes only a new project-relative receipt when a valid
reviewer response exists; raw responses are written for both valid and
`NOT_VERIFIED` responses:

```text
ceos dev-web-review --project <game> --request-file <request.json> \
  --receipt artifacts/evidence/dev-web/S24.json --json
ceos web-review-verify --kind production-art --phase acceptance \
  --record-file artifacts/evidence/dev-web/S24.json --head <HEAD> \
  --visual --assurance visual-content --json
```

Recording into an engine-backed run remains explicit and append-only through
the existing `ceos routing-trace ... --dry-run` then record flow. `ceos
continue` remains a planner/claim mechanism: it does not invoke the browser
helper from Node or infer a Web PASS. A host continuation action can execute
this adapter, pass its fresh receipt through the existing routing preflight,
and then continue the persisted workflow. Historical runs, checkpoints and
receipts are never edited or reopened by this adapter. If continuation finds
multiple historical progress candidates, it remains `BLOCKED_AMBIGUOUS_PROGRESS`
until an explicit supported run reference is supplied; this adapter does not
guess between them.

## Source audit anchors

The implementation was audited against the installed DEV 6.1.11 bundle:

- `C:\Users\user\.codex-chatgpt-web-dev\config.json` — isolated
  `browser-only`, release `6.1.11`, Sol availability;
- `C:\Users\user\.codex-chatgpt-web-dev\runtime\launcher-browser.json` —
  development launcher identity and helper paths;
- `...\versions\6.1.11-win32-x64\app\cli.js` — model mapping and DEV chat
  behavior;
- `...\versions\6.1.11-win32-x64\app\browser-helper.cjs` — image schema,
  launcher protocol, upload confirmation and browser response collection.

The separate source checkout found locally is 6.1.7 and was used only to
cross-check the helper protocol shape; production execution is pinned to the
installed 6.1.11 DEV descriptor and fails closed on another release.
