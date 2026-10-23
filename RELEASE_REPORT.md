# CEOS 0.5.1 Release Report

Date: 2026-09-18

## Final verdict

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

## Verification evidence

PR #8 (`CEOS 0.5.1: isolate Windows global install from worktree`):

- PR head: `79d542dde06289023d9ae0ea37ef93ce92d1a7ab`;
- release gate run: `35311246655`;
- unit/regression tests: **74/74 PASS**;
- self-test: **74/74 PASS**;
- lint/syntax: PASS;
- capability CLI smoke: PASS;
- Windows install-isolation job: PASS;
- Windows post-install worktree: clean;
- Windows global npm package: not a reparse-point link;
- Windows `bin/ceos.mjs`: `i/lf w/lf attr/text eol=lf`;
- PR artifact id: `10533720084`;
- PR artifact size: `102032` bytes;
- PR artifact digest: `sha256:c4abfcb0e96b22de4e6ab91b27c620e08e142c5936d0a8d43319c8631d12df1c`.

PR #8 was squash-merged into `main` as:

- `63a29b48af1948dab39d5ccf72d945c778f4055b`.

Post-merge `main` release gate:

- run: `35311329050`;
- unit/regression tests: **74/74 PASS**;
- self-test: **74/74 PASS**;
- lint/syntax: PASS;
- capability CLI smoke: PASS;
- Windows install-isolation job: PASS;
- Windows post-install worktree: clean;
- Windows global npm package: isolated from source worktree;
- Windows `bin/ceos.mjs`: `i/lf w/lf attr/text eol=lf`;
- artifact id: `10533700225`;
- artifact size: `101819` bytes;
- artifact digest: `sha256:8c8795cbc023370b71cc76876f29063237a81200afe436a264b4339d77af3d0c`.

The release-report-only commit must pass the same Ubuntu and Windows gates before this report is considered final repository evidence.
