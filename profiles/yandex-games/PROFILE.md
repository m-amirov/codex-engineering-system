# Profile: yandex-games

Extends `node-web`.

## Invariants

- New projects are bootstrapped only through the official project Starter Kit/init-project profiles.
- CEOS must not create parallel engineering infrastructure that bypasses the Starter Kit.
- Reuse Starter Kit self-test/status/build/release checks when available.
- Release/visual QA should cover the project's declared desktop/mobile and locale matrix.
- Runtime console/page errors are release evidence.
- `@release` stabilizes the defined product; it does not silently redesign gameplay.

## Release evidence boundaries

- Starter Kit status/self-test drift is independent from product tests and blocks the gates that require healthy Starter Kit infrastructure; never hide managed drift by replacing hashes.
- Treat functional/E2E, visual/mobile pixels, Yandex platform/manual evidence, media and ZIP integrity as separate release domains.
- For full-bleed/mobile changes, require current-runtime edge/crop/scroll/overlap evidence at the declared viewport/orientation matrix; DOM-only checks are insufficient.
- Authenticated Draft/Console actions are explicit operations. Optional external runtime providers remain supporting evidence unless the project contract states otherwise.
