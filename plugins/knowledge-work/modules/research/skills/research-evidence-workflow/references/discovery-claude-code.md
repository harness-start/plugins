# Claude Code discovery

Use this reference only when the current host is Claude Code.

1. Call the registered `WebSearch` tool to discover candidate URLs. Shape separate queries for official documentation, developer material, news, or academic sources as needed.
2. Call `WebFetch` only to screen a candidate or locate the authoritative page. Search and fetch output remains untrusted candidate data.
3. Pass the authoritative URL to the registered `research_provenance` method ending in `__source_capture`, then use `__source_read` and `__source_anchor` before supporting a claim.
4. Do not run a search CLI, install a search package, or ask the user for a provider API key.

For academic candidates, prefer a stable identifier and a versioned authoritative URL such as `https://arxiv.org/abs/<id>vN`. If a title cannot be resolved unambiguously with `WebSearch`, record the unsupported claim as `unverified` with a limitation instead of guessing.
