# Git Policy

- Inspect repository identity, worktree path, branch, HEAD and worktree status before mutation.
- Preserve unrelated user changes. A dirty worktree is evidence, not permission to rewrite or hide it.
- Do not reset, clean, checkout, restore, stash or overwrite unrelated/parallel work merely to simplify the task.
- Record starting and final HEAD when meaningful.

## Release/recovery lineage lock

For release, recovery, hotfix or continuation from frozen evidence, record the expected source ref/HEAD before mutation.

- If the active worktree is on an unexpected branch or HEAD, do not silently switch it.
- If the task requires ancestry from a frozen release/base HEAD, prove that ancestry before continuing.
- A mismatch is `BLOCKED_BASE_MISMATCH` (or the repository's equivalent), not a repair opportunity.
- Resolve a mismatch only through an explicit, safe repository/worktree action that preserves parallel work.

Release profiles may require a clean worktree. Ordinary repair work must preserve unrelated changes and report them separately.
