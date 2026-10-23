# Phase 04 — execution and CI hardening

## Goal

Make CEOS verification and provider execution bounded, auditable and portable, while making a single `main` checkout the normal user workspace. Temporary feature worktrees must be inspectable and removable only when doing so cannot discard user work or live evidence.

## Decisions and tradeoffs

- **Recommended:** permanent `main` + short-lived named task branches in isolated worktrees; Draft PRs stay remote until reviewed. `main` is never used for concurrent Codex edits. Compared with always writing to `main`, this avoids cross-task contamination. Compared with keeping persistent worktrees, cleanup is explicit and safe.
- No global branch purge, force-delete, auto-stash, reset, worktree prune or remote-branch deletion. CEOS provides a read-only inventory and exact-target guarded local cleanup for eligible temporary worktrees.
- Verification commands use a limited argv adapter and no arbitrary manifest shell evaluation. Existing inline `node -e` samples migrate to fixture scripts. Npm scripts remain repository-controlled code, not an OS sandbox.
- Gate processes have finite timeout, bounded output and process-tree teardown; provider helper startup, requests and shutdown have independent timeouts.
- CI covers Ubuntu and Windows for provider protocol, command execution and source-bound replay, alongside existing installation checks. Provider integration is simulated; genuine host-attested multimodal acceptance remains separate.

## Invariants

- Pre-existing dirty worktrees, untracked/ignored data, active evidence, main checkout and branches not proven integrated are not removed.
- Source-bound replay records cannot be promoted after HEAD or checkout identity drift, nor can sibling worktree artifacts be silently adopted.
- All external actions remain under CEOS risk authority; technical recovery does not grant Image Gen, PR merge, release or publication permission.
- Worktree management must work with Git paths containing spaces on Windows and Linux.
- Evidence includes exit code, reason, elapsed time, timeout/termination cause, command adapter, source HEAD and project root.

## Boundaries

Implementation is scoped to CEOS verification, DEV Web High helper lifecycle, Git worktree hygiene, documentation, and CI/test contracts. It does not rewrite the existing EP3 game workspace or delete historical branch directories on the user's PC.
