# Profile: twork-desktop

Extends `node-web`.

## Invariants

- Preserve task-execution semantics unless the task explicitly asks to change them.
- Browser lifecycle, watchdog behavior, Playwright state, screenshots and bounded log windows are first-class incident evidence.
- Unknown task types should be captured as evidence rather than guessed.
- Chrome/extension/native-browser failures should be distinguished from task algorithm failures.
- Telegram/control-plane behavior should not mask browser/task failures.
