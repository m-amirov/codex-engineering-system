# CEOS 0.5.1 Release Report

Date: 2026-09-18

## Intended verdict

`PASS_CEOS_0_5_1_WINDOWS_INSTALL_ISOLATION`

## Release objective

Eliminate recurring Windows worktree drift around `bin/ceos.mjs` by isolating the globally installed npm package from the source Git checkout.

## Root cause addressed

The prior Windows installer executed:

```powershell
npm install -g $Root
```

where `$Root` was the live CEOS Git worktree. Local-package global installation can couple the global npm package/shim to the source directory instead of producing an independent package installation. The same checkout therefore remained part of the runtime installation path.

0.5.1 replaces that with:

```text
Git worktree
    ↓
npm pack → OS temp directory
    ↓
temporary .tgz
    ↓
npm install -g <temporary .tgz>
    ↓
delete temporary package
```

The repository also gains `.gitattributes` to make source/text EOL normalization deterministic across Windows and Unix checkouts.

## Implemented changes

- `scripts/install-global.ps1`
  - creates a unique OS-temp packaging directory;
  - runs `npm pack $Root --pack-destination $PackRoot --json`;
  - validates JSON output and package filename;
  - verifies the tarball exists;
  - installs the tarball with `npm install -g $PackagePath`;
  - always removes the temporary package directory in `finally`;
  - no longer contains `npm install -g $Root`.
- `.gitattributes`
  - explicit LF policy for `mjs/js/json/md/yml/yaml/toml/ps1`.
- Regression coverage
  - static installer contract;
  - metadata/archive validation contract;
  - EOL policy contract;
  - real Windows installation smoke.
- Documentation
  - supported installation path now explicitly avoids direct global install from the source worktree.

## Compatibility

No changes to:

- deterministic execution-engine state machine;
- `audit-repair-loop` or `production-art` semantics;
- native/Web routing;
- global agent definitions;
- safety and production-write boundaries;
- project manifests or evidence schema.

## Release gates

A final PASS requires:

- version `0.5.1`;
- all Node tests PASS;
- lint/syntax PASS;
- capability CLI smoke PASS;
- self-test PASS;
- source package artifact PASS;
- `windows-latest` installation smoke PASS;
- post-install `git status --porcelain` empty on Windows;
- global npm package directory is not a reparse-point link;
- PR gate PASS;
- post-merge main gate PASS.

Observed CI evidence will be appended after successful gates.
