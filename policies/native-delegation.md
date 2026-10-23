# Native delegation budget and literary workflow

This policy governs **how CEOS asks its host Codex session to use native subagents**. It does not change model-provider quotas, configure Codex's internal scheduler, or provide a hard runtime cap on host subagents.

## Default for literary production and editorial repair

- For romance-narrative and other long-form writing, the **parent Codex session is the sole native writer/editor by default**. The parent reads only the relevant approved canon and current episode, edits the owned literary file, runs simple local checks directly, and records a compact progress checkpoint.
- **Do not spawn native writer, researcher, scene reviewer, verifier or bulk-checker subagents merely because several episodes, routes, or scenes exist.** Do not delegate the same editorial repair simultaneously to Poincare/Pascal/Carson-style workers, or replicate a full manuscript and shared canon in parallel native contexts.
- A specialized **Web High** agent may perform substantive independent literary review over a bounded supplied text. Web agents remain reasoning-only, do not edit files, and never replace necessary native tool-backed evidence.
- For a normal episode production task, finish the complete episode (including required choice alternatives) before **one bounded Web High editorial review**. Repair confirmed defects in the parent session; re-review changed passages and all causally affected branch transitions. A full re-audit of the entire episode/season is justified only when changes or the agreed acceptance contract require it.
- Count words, validate IDs/branch access, compare timestamps and inspect diffs using existing project scripts/commands rather than asking a language model to repeat deterministic checks. Avoid rereading approved earlier episodes or submitting duplicated common scenes for each alternate playthrough. Use a compact canon summary and exact relevant scene references.
- When a requested task is larger than one episode, preserve the full requested scope but process **one episode sequentially at a time** with a durable handoff: completed scenes, unresolved choices/payoffs, targeted files, evidence and next uncompleted step. Never declare the whole request PASS after finishing a partial checkpoint. Do not start extra agents simply to finish the user's multi-episode request faster.
- An existing in-progress host session with active subagents must **not be restarted or assumed cancelled** by this policy. On resume, inspect actual worktree/checkpoints, avoid duplicating already completed edits and continue within the remaining scope.

## Exceptions and other engineering tasks

- Native subagents are allowed when the user explicitly asks for parallel/multiagent execution, when an independent **tool-backed** audit cannot be satisfied through the Web route or parent-only checks, or when distinct high-risk engineering specialties require separation of duties. State the reason and narrow owned files/outputs; do not delegate overlapping writes.
- For ordinary engineering, prefer the parent doing small local work directly. Delegate only when expected quality, independence, tool isolation or latency demonstrably offsets the added native contexts. Don't spawn agents merely because role TOMLs exist.
- User-approved workload, mandatory Web gates, safety, authority, project verification and evidence integrity remain binding. If an independent native verifier is genuinely required for a specific claim, do not mislabel parent self-review as independent; use the minimum required independent role or mark the claim unverified/BLOCKED.
- This is an **instructional policy** enforced through CEOS-managed global instructions and skill guidance, not a Codex host-side limit on number of agents. Record actual native agents used, and be explicit when host capabilities prevent compliance.
