# OpenAI Codex alignment (checked 2026-09-16)

CEOS 0.2.0 intentionally uses documented Codex discovery and delegation surfaces:

1. Codex loads persistent global guidance from the Codex home: non-empty `AGENTS.override.md` first, otherwise `AGENTS.md`; project guidance is then layered on top.
2. Personal custom agents live under `~/.codex/agents/` and may set `model`, `model_reasoning_effort`, `sandbox_mode`, and other supported session config keys.
3. Local Codex can delegate because applicable `AGENTS.md` or Skill instructions request it; the parent orchestrates and collects results.
4. Personal Skills live under `$HOME/.agents/skills` and apply across repositories.
5. Current Codex model guidance recommends `gpt-5.6` for demanding ambiguous work, `gpt-5.6-terra` for faster/lower-cost exploration and supporting work, and `gpt-5.6-luna` for narrow, repeatable, high-volume work.

CEOS therefore implements automatic multi-model execution through custom subagent delegation rather than a private wrapper or undocumented model switch.

References:

- https://developers.openai.com/codex/subagents
- https://developers.openai.com/codex/guides/agents-md
- https://developers.openai.com/codex/skills
