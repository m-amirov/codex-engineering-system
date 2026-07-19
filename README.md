# Codex Engineering System

Central versioned engineering foundation for creating and maintaining software projects with Codex.

## Concepts
- **Principles**: stable global rules and risk posture.
- **Profiles**: project-type overlays such as web app, browser extension, Phaser, and Yandex Games.
- **Skills**: reusable task workflows with references and report templates.
- **Agents**: role configuration examples; adapt fields to the current Codex version.
- **Templates**: documentation and project foundation files.

## Instruction priority
```text
Global defaults
→ selected profiles
→ generated project AGENTS.md
→ local project instructions
```
Local project instructions have highest priority. Always read the nearest project `AGENTS.md` first.

## Quick start
```powershell
python scripts/validate_repository.py --strict
python scripts/bootstrap_project.py --name "new-yandex-game" --path "E:/Work/new-yandex-game" --profiles common web-app phaser-game yandex-games --dry-run
python scripts/bootstrap_project.py --name "new-yandex-game" --path "E:/Work/new-yandex-game" --profiles common web-app phaser-game yandex-games
python scripts/validate_project.py --path "E:/Work/new-yandex-game" --strict
```

## Main commands
- Compose AGENTS: `python scripts/compose_agents_file.py --output AGENTS.md --profiles common web-app --local-block "Project-specific notes" --dry-run`
- Update project foundation safely: `python scripts/update_project.py --path "E:/Work/new-yandex-game"` (dry-run by default); apply only with `--apply`.
- Install Codex config safely: `python scripts/install_codex_config.py` (dry-run by default); apply only with `--apply`.
- Promote learning: `python scripts/promote_learning.py --file examples/promoted-learning.yaml` then add `--apply` after review.
- Validate Yandex ZIP: `python skills/yandex-release-validation/scripts/validate_yandex_zip.py release.zip --json`.

## Safety rules
Scripts default to dry-run when they can affect existing user configuration or projects. They do not delete projects, publish releases, change git remotes, force push, execute shell from YAML, or store secrets. Reports redact secret-like values.

## Known limitations
The YAML validator is intentionally limited to the repository's simple YAML subset. This repository does not scaffold real Vite, Phaser, servers, cloud sync, or GitHub Actions.

## Roadmap
1. Pilot on one existing project with `update_project.py --dry-run`.
2. Add project-specific quality gate adapters.
3. Expand schemas after real project feedback.
