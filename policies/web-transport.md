# Web Transport, Rate Limit & Attachment Policy

CEOS treats Web semantic review results separately from Web transport failures. This policy applies whenever a CEOS workflow uses a ChatGPT Web route, especially attachment-heavy visual review.

## Failure classes

Classify the failed turn before retrying:

- `SEMANTIC_REVIEW` — the reviewer received the required evidence (for visual review, `actualPixelsReceived=true`) and returned PASS / REWORK / FAIL / uncertainty. This is not a transport failure and must not trigger transport fallback, cooldown retries, or result shopping.
- `RATE_LIMITED` — the UI/bridge/backend explicitly reports "too many requests", HTTP 429, a usage/rate limit, a cooldown, or an explicit Retry-After. An attachment error accompanied by an explicit rate-limit signal is `RATE_LIMITED`.
- `ATTACHMENT_TRANSPORT` — required attachments were not accepted or the attachment stream disconnected and there is no explicit rate-limit signal. For visual review, `actualPixelsReceived` is not true.
- `WEB_UNAVAILABLE` — bridge/backend/runtime is unreachable, unhealthy, or not accepting turns for a non-rate-limit reason.

Do not infer `RATE_LIMITED` from a generic attachment error alone.

## Conservative pacing

For attachment-heavy Web High review, send turns sequentially. Do not burst parallel review turns.

CEOS uses a conservative default pacing of at least **20 seconds between attachment-bearing Web High turns**. This is an internal anti-burst policy, not a provider SLA or claim about an exact platform limit.

Reuse an accepted master/reference within the same review session when possible. For visual review, prefer one runtime screenshot per turn after reference pixels are confirmed. Do not resend already accepted screenshots merely because a later turn failed.

## Rate-limit cooldown

When `RATE_LIMITED` is explicit, do not immediately retry:

1. first consecutive rate-limit event: cooldown **120 seconds**;
2. second consecutive event: cooldown **300 seconds**;
3. third consecutive event: cooldown **600 seconds**, then stop the automated Web route as `BLOCKED: WEB_RATE_LIMITED` rather than continuing a retry storm.

If the backend/UI supplies a longer Retry-After or cooldown deadline, the explicit longer value wins.

A successful Web turn resets the consecutive rate-limit counter.

Do not switch Web modes/models, parallelize sessions, or use native fallback merely to evade a usage limit. If Web review is optional, the existing single native fallback contract may be used after the Web unit is classified unavailable. If the user or acceptance contract explicitly requires Web review, native fallback does not satisfy the gate.

## Attachment transport retry

For `ATTACHMENT_TRANSPORT` without an explicit rate-limit signal:

- retry only the failed turn, not the whole review batch;
- wait at least **30 seconds** before the first retry and **60 seconds** before a second retry;
- after two retries fail, stop that required review as `BLOCKED` instead of regenerating assets or resending accepted frames.

Attachment/transport retries do **not** consume image-generation, repair, or regeneration cycle budgets. A semantic REWORK does.

## Visual-review evidence

For each visual Web turn record, when available:

- scene/event id and viewport;
- screenshot/reference SHA-256;
- review/trace id;
- `actualPixelsReceived`;
- failure class when non-PASS;
- retry attempt;
- applied cooldown / Retry-After;
- final verdict.

Production runtime overlays (dialogue sheet, navigation controls, scene text, application chrome) are expected in runtime screenshots. They are not "baked UI/text". Baked UI/text means interface-like elements embedded inside the underlying generated image asset itself. When this distinction is material, review the raw asset and runtime screenshot separately.

## Stop rule

Never claim visual or Web-backed PASS while required evidence was not received. If bounded cooldown/retry handling is exhausted, preserve current assets/evidence and return `BLOCKED`; do not regenerate or mutate unrelated product state to work around transport pressure.
