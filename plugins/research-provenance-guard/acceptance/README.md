# Dual-host acceptance

Run from the repository root with `scripts/acceptance/run.sh --plugin research-provenance-guard`. All cases require fresh Claude Code and Codex sessions with the plugin MCP server and hooks loaded.

The Docker DeepSeek catalog declares `supports_search_tool: false`: this compatibility endpoint does not expose Codex hosted `tool_search`, and claiming otherwise makes Codex 0.146 defer the bundled MCP tools behind an unavailable loader. The suite also exercises Codex's empty-`roots/list` behavior and the plugin's explicitly forwarded launch-workspace fallback.

- `01-workspace-anchor-seal`: orchestrator entry, captures a fixture, anchors it, seals, and reaches the hook-owned `complete` phase with a real trailer.
- `02-unverified-limitation`: honest no-source result with a visible limitation and completed lifecycle.
- `03-ordinary-bypass`: ordinary answers are not forced into research mode (no project workflow run).
- `04-direct-firecrawl-denied`: open run + PreToolUse rejects direct Firecrawl CLI discovery, then the run seals and completes.

Offline unit tests cover Codex MCP packaging and empty-roots fallback, stale epochs, seal/run binding, post-seal immutability, terminal lifecycle ownership, outbound handoff freshness, artifact tampering, symbolic-link escape, fabricated/unknown anchors, status cardinality, URL safety, direct `.research/` writes, and MCP `roots/list` binding.
