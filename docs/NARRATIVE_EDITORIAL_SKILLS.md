# Focused narrative editorial skills

CEOS provides three original companion skills to `romance-narrative`:

- `narrative-dialogue-editor`: voice, subtext, attribution, exposition, RU/EN line editing.
- `narrative-continuity-engine`: scene/branch-conditioned chronology, inventory, knowledge, promises, consent, save/Back; with optional project-provided Starter Kit `narrative-game` mechanical graph checks.
- `reader-experience-review`: bounded cold-reader comprehension, emotional payoff, route differentiation.

The parent `romance-narrative` remains the principal romance-story skill. Activate companions only when their expertise is needed; never run four separate agents for every scene.

## External inspiration and boundaries

Reviewed public material includes `interactive-fiction`, `dialogue` and `character-arc` from [jwynia/agent-skills](https://github.com/jwynia/agent-skills), and [rhavekost/author-toolkit](https://github.com/rhavekost/author-toolkit) `fiction-workshop`. Their general editorial methods were compared against existing CEOS contracts. This implementation does **not** vendor external SKILL.md, reference files, prompts or source code. Before any future literal copying, recheck individual licenses and upstream contents.

## Evidence discipline

Structural reachability and serializability prove properties only of the supplied model. Web High reader replies establish interpretation only over actual delivered material. An author's planned events cannot stand in for a cold reader's first response, and neither substitutes for browser/runtime SDK/save evidence. Keep verdicts `PASS_SCOPED`, `EVIDENCE_GAP`, or `EDITORIAL_RISK` with scene/cue/route receipts; avoid synthetic engagement scores.

Run: `node --test tests/narrative-editorial-skills.test.mjs`.
