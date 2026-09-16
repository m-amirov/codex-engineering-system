# Production Policy

Production defaults to **read-only**.

Allowed without additional authorization: health endpoints, logs, metrics, configuration inspection, DB SELECT/read queries, provider read endpoints.

Disallowed without explicit authorization: deployment, service restart, database writes, destructive commands, provider BUY, payment, product creation/update/publication, changing live financial guards.

A production-check workflow must report what sources were actually inspected and must not imply coverage of sources it could not access.
