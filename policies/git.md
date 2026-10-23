# Git Policy

## GitHub-first task preflight

When a repository has an authorized GitHub upstream, the **remote is the reference for current committed state**, not an instruction to discard local commits or uncommitted work. Before reading task-critical files or mutating a checkout, verify the actual repository root, branch, HEAD, remote URL, dirty status and upstream divergence. Run an actual fetch to distinguish stale local tracking refs from the current remote; a healthy connection or previously reported SHA is not evidence.

Use the mechanically guarded CLI when available:

```powershell
ceos git-preflight --project . --remote origin --branch main --expect-repo owner/repo --fetch --json
# Only after a BEHIND_FAST_FORWARD_AVAILABLE verdict, with a clean target branch:
ceos git-preflight --project . --remote origin --branch main --expect-repo owner/repo --fetch --apply --json
```

`git-preflight` defaults to read-only. `--fetch` updates *remote tracking refs only*; `--apply` requires `--fetch` and permits only `git merge --ff-only` with a clean worktree and a matching branch. It never stashes, resets, cleans, rebases, commits, checks out another branch or pushes. Failure to fetch means **freshness not verified**, not IN_SYNC. An invocation without `--fetch` may inspect stale tracking information and is not sufficient for a GitHub-first task.

Treat `BLOCKED_BRANCH`, `BLOCKED_REMOTE_MISMATCH`, `BLOCKED_DIRTY`, `BLOCKED_DIVERGED`, `AHEAD_LOCAL`, `BLOCKED_FETCH` and similar results as an explicit reconciliation boundary; investigate and preserve parallel work rather than silently switching branches or resetting. A dirty but already synchronized checkout may report `IN_SYNC_DIRTY`; do not confuse this with permission to overwrite user files. In detached-HEAD/worktree workflows, choose the intended branch explicitly or stop safely.

After an authorized implementation: run scoped checks, inspect diff/status, commit only in-scope changes, fetch again, prove non-divergence and push without force. Verify the final remote SHA. Never claim a GitHub file absent until `origin/main` has been refreshed or the remote file was read directly.

- Inspect branch, HEAD and worktree before mutation.
- Keep one permanent `main` checkout for the owner. Codex task worktrees should be isolated and short-lived, with branches named `ceos/task/<topic>`. Report checkout path, branch, HEAD, dirty state and PR to avoid accidental cross-branch edits.
- Inspect local siblings using `ceos worktrees inspect --project <repo> --json`; historical branches require `--include-legacy` for an opt-in cleanup plan. Only `ceos worktrees cleanup ... --apply` with exact eligible path, SHA and plan token may remove a clean, fully integrated local branch/worktree. Never force-remove ignored user data or source-bound evidence, and never delete remote branches automatically.
- Preserve unrelated user changes.
- Do not reset/clean/checkout away user work to simplify the task.
- Record starting and final HEAD when meaningful.
- A dirty worktree is evidence, not automatically an error; release profiles may require cleanliness.
- Do not create commits unless the task/project workflow calls for them.


## Evidence provenance

- Engine checkpoints record the current Git HEAD and worktree state automatically.
- When terminal PASS evidence declares `sourceHead`, it must equal the actual current HEAD.
- Release-grade profiles may require a clean worktree and remote/ancestry evidence in addition to the universal CEOS provenance record.
- Evidence from an older HEAD must be regenerated; do not relabel it as current.
- Recovery from a recorded release baseline must fail closed when ancestry cannot be proved.
