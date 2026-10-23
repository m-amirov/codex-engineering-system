# Token Efficiency

CEOS treats token use as an engineering metric.

Primary mechanisms:

- short routing `AGENTS.md`;
- load only the selected Skill and resolved Profile;
- move repeated prose constraints into policies/gates;
- retain machine-readable evidence instead of re-explaining past verification;
- avoid correction turns by making PASS mechanically constrained.

Suggested project metric:

`total task tokens = user prompt + loaded instructions + correction turns + completion context`

Target for mature repeated workflows: at least 40% reduction in total task tokens without loss of acceptance quality, and 80–95% reduction in repeated user instruction text.
