# Discovery workers → MCP evidence

Hard runs block direct `firecrawl` / `npx firecrawl` shell commands. Map firecrawl CLI teaching to MCP:

| Firecrawl idea | Hard-run execution |
| --- | --- |
| `firecrawl search "q" --json` | MCP `source_discover` `{ query, category, limit }` |
| `--categories developer` | `category: "developer"` |
| news / github / research / pdf | matching `category` enum |
| `firecrawl scrape <url>` | MCP `source_capture` `{ url }` (or `{ path }` for workspace) |
| write under `.firecrawl/` | Do **not** treat as evidence; capture again through MCP |

Discovery results are always `discovery_only: true` until `source_capture` + `source_anchor`.

If Firecrawl is unavailable, capture known URLs and workspace files directly; mark gaps `unverified` with limitations.

## arxiv-search boundary

`arxiv-search` may suggest academic candidates, but its title and abstract output is untrusted discovery data. It is never an anchor source by itself.

1. Prefer an explicit arXiv identifier and version. Capture `https://arxiv.org/abs/<id>vN` when available rather than an unversioned latest-paper URL.
2. If the worker output has no identifier or URL, use MCP `source_discover` with `category: "research"` and the exact title to resolve candidates. Do not guess when titles collide.
3. Capture the authoritative paper page with `source_capture`, inspect it with `source_read`, and create claim anchors with `source_anchor`.
4. If the worker returns nothing, lacks its Python dependency, or cannot resolve one unambiguous paper, continue without it and record an `unverified` limitation for unsupported claims.
