# Profile: platibridge

Extends `node-web`.

## Invariants

- Production defaults to read-only.
- Provider BUY/payment/product writes are R3 and require explicit concrete authorization.
- Ambiguous provider submit states are not automatically retried.
- Idempotency, financial guards and pipeline state transitions are release-critical.
- Health/readiness, DB state and provider read endpoints should be preferred for production verification.
