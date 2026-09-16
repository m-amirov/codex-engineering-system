# Core Gate Semantics

A gate is a named project-native command referenced by the project manifest. CEOS deliberately does not invent a parallel build/test system.

`ceos verify` executes only R0-classified gate commands. Any R2/R3-like command is recorded as `BLOCKED` and is not run. Local source mutation is outside the verifier: `@fix` may perform R1 changes, but verification itself remains non-mutating except for normal test/build outputs and the CEOS evidence bundle.
