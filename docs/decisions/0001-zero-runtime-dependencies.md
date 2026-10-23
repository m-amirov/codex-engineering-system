# ADR 0001 — Zero runtime dependencies for 0.1.0

CEOS 0.1.0 uses Node 22 built-ins only. The manifest supports JSON and a deliberately restricted YAML subset. This keeps bootstrap cheap and makes the verifier usable before dependency installation. Unsupported YAML structures fail explicitly rather than being guessed.
