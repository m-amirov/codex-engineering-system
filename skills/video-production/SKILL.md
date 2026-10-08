---
name: video-production
description: Use when preparing gameplay recordings, platform-submission gameplay videos, trailers, cinematic showcases, promo edits, or release-video evidence from a real game/runtime.
metadata:
  ceos-version: "0.5.6"
---

# Skill: video-production

At activation, run `ceos context --skill video-production --project .` when CEOS is available and treat the returned profile/policies plus project-native media validators as authoritative.

## Intent

Produce polished video without confusing promotional editing with evidence. Preserve the original captures and prove the final file that will actually be used.

## Modes

### `gameplay-evidence`

Use for store/platform submission, release gates, and evidence.

- Capture real production runtime; do not fabricate gameplay, UI, choices, outcomes, or timing.
- Keep required locale/UI visible and correct.
- Exclude OS/editor/debug chrome and accidental external-provider UI.
- Transitions, cuts, fades, pacing, and audio cleanup are allowed only when they do not misrepresent gameplay.
- Do not treat promotional video as gameplay evidence.
- Validate the final MP4 itself: dimensions, duration, codec/container where required, bytes, SHA-256, language, gameplay ratio, and project-specific manual-review fields.
- Keep promotional video files out of release archives when the project contract requires exclusion.

### `promo-trailer`

Use for marketing/showcase output.

Cinematic pacing, title cards, licensed/owned music, sound design, stylized transitions, and stronger editorial treatment are allowed. Keep a clear provenance boundary from platform gameplay evidence; create a separate evidence render when both are needed.

## Workflow

1. **Lock the contract.** Choose mode, target platform, locales, aspect ratio, duration/size limits, and whether the output is evidence or promotion. Read project-native requirements instead of hardcoding platform rules.
2. **Build a shot list.** Prefer strong establishing art, readable character beats, one meaningful interaction/choice, route/location variety, and a clean closing frame. Avoid spoilers unless requested.
3. **Capture source clips.** Use the real runtime at the target resolution. Record source commit/HEAD, locale, scene/state, viewport, and capture path. Preserve raw clips.
4. **Assemble deterministically.** Prefer project-native tooling and `ffmpeg` for reproducible trim/concat/fade/audio-normalization/export operations.
5. **Optional Descript handoff.** When a connected Descript capability is exposed and external editing is authorized by the task, import only the bounded source clips needed for the edit. Use Descript for sequence refinement, pacing, captions/title treatment, or audio cleanup; preserve the local raw clips and export the result back for local verification. Descript is an editor, not release evidence authority.
6. **Verify the actual export.** Run `ffprobe`/project validators on the final file, recompute SHA-256 and size, review first/last frames and representative cuts, and run locale/presentation checks. A project URL, timeline, or editor preview is not proof of the exported MP4.
7. **Record evidence.** Persist a compact manifest with source HEAD, mode, source clips, edit toolchain, output path, hash, dimensions, duration, size, locale coverage, and manual-review evidence required by the project.

## Fail-closed rules

Return `BLOCKED` rather than claiming completion when the real runtime cannot be captured, required source clips are missing, the export cannot be inspected, locale/platform requirements are unresolved, or the final media differs from recorded evidence.

Do not upload/publish to a store, moderation flow, public video host, or external editor unless that write is authorized by the user's task. Do not replace accepted gameplay with generated footage in `gameplay-evidence` mode.

## Completion contract

A PASS requires the actual final media file to exist and match its evidence; project-native media/release validators to pass; required locale/version provenance to be current; and no known mismatch between what the video shows and the production runtime.
