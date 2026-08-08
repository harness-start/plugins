# Discovery via MCP (firecrawl technique → hard execution)

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
