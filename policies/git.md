# Git Policy

- Inspect branch, HEAD and worktree before mutation.
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
