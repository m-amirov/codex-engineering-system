# Install and integrate CEOS 0.2.0

## Windows: upgrade the central CEOS installation

Replace/update the central CEOS folder, then reinstall the package globally:

```powershell
npm install -g E:\Tools\codex-engineering-os
ceos version
```

Expected:

```text
0.2.0
```

## Install CEOS globally into Codex

Run once for the user account:

```powershell
ceos install-global --mode copy --force
ceos global-status
ceos routing
```

`install-global` writes only CEOS-owned global surfaces:

- a managed marked block inside the active Codex global instructions file;
- CEOS custom agents under `$CODEX_HOME\agents`;
- CEOS Skills under `$HOME\.agents\skills`;
- `$CODEX_HOME\ceos\installation.json` for drift/version checks.

If a non-empty `$CODEX_HOME\AGENTS.override.md` exists, Codex uses it as the global instruction source, so CEOS updates that file. Otherwise it uses `$CODEX_HOME\AGENTS.md`. Existing user text outside the CEOS markers is preserved.

Before replacing an existing CEOS agent or Skill that differs, installation fails unless `--force` is supplied. A forced replacement first creates a timestamped backup under `$CODEX_HOME\ceos\backups`. A target that is not recognizably CEOS-managed is never overwritten, even with `--force`; it must be moved or renamed explicitly.

For a no-write preview:

```powershell
ceos install-global --dry-run --mode copy
```

For development from a central checkout, link the Skills instead of copying them:

```powershell
ceos install-global --mode link --force
```

For the common Windows case, run this from the extracted CEOS folder instead of the three manual commands:

```powershell
.\scripts\install-global.ps1
```

The script installs the current folder with npm, runs the global installer, and requires `global-status` PASS.

After installation, start a new Codex session so the new global instructions and agent catalog are loaded consistently.

## Verify the global layer later

```powershell
ceos global-status
```

A PASS verifies the active managed instruction block, all six agent definitions, all seven Skills, and the installation manifest against the installed CEOS version. Drift is reported per target.

## Repository-specific integration (optional)

Global CEOS works without modifying individual repositories. Add a project manifest only when you need CEOS Profiles/Gates/Evidence:

```powershell
$project = 'E:\Work\YandexGames\MyGame'
ceos init --profile yandex-games --project $project --force
ceos doctor --project $project
ceos gates --project $project
ceos verify --project $project
```

For Yandex Games, create a new project through the official Starter Kit first, then attach CEOS. CEOS must not replace Starter Kit bootstrap/runtime infrastructure.

Available profiles:

```text
generic
node-web
yandex-games
twork-desktop
platibridge
```

## Diagnose failed verification

```powershell
ceos failures --project $project --tail 200
```

Missing configured npm scripts are `CONFIGURATION_ERROR`; non-zero test gates remain real test/command failures.

## Evidence

`ceos verify` writes project evidence under:

```text
<repo>\.ceos-evidence\<timestamp>-<mode>\
```

Add `.ceos-evidence/` to `.gitignore` if the repository does not intentionally track it.
