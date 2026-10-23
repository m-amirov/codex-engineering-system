# Integration workflow

## Global-first setup

1. Install/update the CEOS package centrally.
2. Run `ceos install-global --dry-run` and inspect the plan.
3. Run `ceos install-global --force` for an intended upgrade.
4. Run `ceos global-status` and require PASS.
5. Start a fresh Codex session.

No repository changes are required for the global engineering layer or model routing.

## Add repository enforcement only when useful

1. Run `ceos init --profile <profile> --project <repo>` after the repository's own bootstrap.
2. Confirm the detected project-native lint/test/build/browser commands.
3. Define or refine `gates.verification` and, if needed, `gates.release`.
4. Run `ceos doctor`.
5. Run `ceos verify` and inspect `.ceos-evidence/`.
6. Add project-local Codex instructions only for repository-specific constraints not already represented globally or by the profile.

Do not duplicate Starter Kit or repository-native infrastructure.
