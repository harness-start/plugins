# Dual-host acceptance

Run from the repository root with `scripts/acceptance/run.sh --plugin research-provenance-guard`. Both cases require fresh Claude Code and Codex sessions with the plugin MCP server and hooks loaded.

- `01-workspace-anchor-seal`: captures a fixture, anchors it, generates canonical artifacts, and completes with a real seal.
- `02-unverified-limitation`: demonstrates an honest no-source result with a visible limitation.
- `03-ordinary-bypass`: confirms that ordinary answers are not forced into research mode.
- `04-direct-firecrawl-denied`: confirms the active PreToolUse barrier rejects direct CLI discovery.

Offline unit tests cover stale epochs, post-seal mutation, artifact tampering, fabricated/unknown anchors, status cardinality, URL safety, direct `.research/` writes, and MCP `roots/list` binding.
