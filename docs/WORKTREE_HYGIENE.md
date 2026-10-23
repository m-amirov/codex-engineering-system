# CEOS local worktrees: one permanent main, disposable task branches

## Recommended setup

Keep one permanent user-facing checkout on `main` per repository. For Codex changes,
open a separate short-lived `ceos/task/<topic>` branch in a temporary Git worktree.
Open a Draft PR when code and tests are ready; merge only through normal protected
review and required CI. After the task is integrated into a locally updated `main`,
inspect and optionally remove the temporary worktree. Do **not** do engineering
concurrently directly in `main`, and do not keep long-lived task folders.

CEOS never assumes historical `feature/*`, PR branches, orphaned checkout paths,
or unmerged commits can be deleted. Old worktrees remain visible for manual review.
To evaluate an older non-`ceos/task/` branch, run `ceos worktrees inspect
--include-legacy --project <repo> --json`. Such a branch can be removed only
with `--include-legacy` again on the exact-target cleanup command, and only
when all other safety checks succeed.

## Inspection (safe, default)

```powershell
ceos worktrees inspect --project 'E:\Work\YandexGames\starter-kits\codex-engineering-system' --json
```

For each locally registered worktree, inspect `eligible`, `reasonCodes`,
`head`, `branch`, `path`, and `planToken`. Exclusions include:

- Primary checkout, active checkout, and the `main`/`master` branch.
- Unmerged HEAD, unmanaged branch name, registered Git lock, or missing path.
- Dirty/untracked state, ignored files (potentially unique user data), and
  `.ceos-runs`/`.ceos-evidence`/`artifacts/evidence` payloads.

If a worktree is blocked, stop and inspect its work before making any separate
manual decision. A branch may be stale on GitHub but still contain unique work
on the PC. CEOS does not infer safety from age or PR status alone.

Worktree identity is filesystem-based rather than a raw string comparison.
Git for Windows may report forward-slash paths, a different drive-letter case,
or a long/short path spelling while Node receives a native path. CEOS compares
existing directories by filesystem identity and `realpathSync.native`; this
also rejects merely similar directory names. Cleanup still requires the
registered inventory entry, exact HEAD, and the current `planToken`, so path
canonicalization only prevents false negatives and does not authorize a new
cleanup target.

## Optional exact-target cleanup (destructive; only after checking)

After refreshing the local `main` and confirming that a task worktree is
`eligible: true`, use its **exact** absolute path, HEAD and `planToken`:

```powershell
ceos worktrees cleanup --project 'E:\Work\YandexGames\starter-kits\codex-engineering-system' --target 'E:\Work\YandexGames\starter-kits\temp-worktree' --expect-head '<full SHA>' --plan-token '<audit token>' --apply --json
```

Cleanup rechecks everything under a Git-common-dir lock. It uses plain
`git worktree remove` (never force) and `git branch -d` (never `-D`). It does
not touch any remote branch or unrelated directory. A changed HEAD, new file,
new run evidence, competing cleanup or changed integration status makes the
confirmation stale and stops the operation.

These commands do not run on user computers remotely; run them in your own
checkout after inspecting the inventory. Old `.git` metadata or abandoned
branches are **not** automatically pruned.

## Keeping Codex and the user on the same page

At each task start record `project`, `branch`, `HEAD`, worktree path, dirty
status and upstream. Codex should show the current branch in its progress
report, use one task branch, and leave PRs as Draft until their gates pass.
After a merge refresh `main` with the guarded `ceos git-preflight --fetch
--apply` workflow. A dirty main checkout must be reconciled manually, never
overwritten by automatic checkout, reset, stash or clean.
