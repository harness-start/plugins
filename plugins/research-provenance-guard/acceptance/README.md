# Dual-host acceptance

Run from the repository root with `scripts/acceptance/run.sh --plugin research-provenance-guard`. Both cases require fresh Claude Code and Codex sessions with the plugin MCP server and hooks loaded.

- `01-workspace-anchor-seal`: orchestrator entry, captures a fixture, anchors it, seals, completes with a real trailer.
- `02-unverified-limitation`: honest no-source result with a visible limitation.
- `03-ordinary-bypass`: ordinary answers are not forced into research mode (no project workflow run).
- `04-direct-firecrawl-denied`: open run + PreToolUse rejects direct Firecrawl CLI discovery.

Offline unit tests cover stale epochs, post-seal mutation, artifact tampering, fabricated/unknown anchors, status cardinality, URL safety, direct `.research/` writes, and MCP `roots/list` binding.
