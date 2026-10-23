# Profile: yandex-games

Extends `node-web`.

## Invariants

- New projects are bootstrapped only through the official project Starter Kit/init-project profiles.
- CEOS must not create parallel engineering infrastructure that bypasses the Starter Kit.
- Reuse Starter Kit self-test/status/build/release checks when available.
- Release/visual QA should cover the project's declared desktop/mobile and locale matrix.
- Runtime console/page errors are release evidence.
- `@release` stabilizes the defined product; it does not silently redesign gameplay.

## Opt-in narrative-game validation

For visual novels and interactive fiction only, if the Starter Kit project explicitly enables `narrative-game`, use its `tools/narrative/narrative-game-check.mjs` to verify actual exported route graph, localized dialogue, state constraints and save fixtures before editorial acceptance. The profile is disabled by default and must not change unrelated Yandex games or run as an implicit packaging dependency. Structural graph PASS does not establish runtime/cloud save proof or reader/visual acceptance. Use `romance-narrative` and its focused dialogue, continuity and cold-reader companions for semantic assessments; preserve Web High quota/evidence boundaries.
