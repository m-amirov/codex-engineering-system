# Profile: yandex-games

Extends `node-web`.

## Invariants

- New projects are bootstrapped only through the official project Starter Kit/init-project profiles.
- CEOS must not create parallel engineering infrastructure that bypasses the Starter Kit.
- Reuse Starter Kit self-test/status/build/release checks when available.
- Release/visual QA should cover the project's declared desktop/mobile and locale matrix.
- Runtime console/page errors are release evidence.
- `@release` stabilizes the defined product; it does not silently redesign gameplay.
