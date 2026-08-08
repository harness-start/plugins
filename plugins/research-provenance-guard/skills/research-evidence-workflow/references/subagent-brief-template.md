# Subagent inbound handoff template

Write JSON (≤32 KiB), then `research-workflow.mjs handoff-inbound --file …`.

```json
{
  "id": "discover-1",
  "role": "researcher",
  "objective": "List primary-source candidate URLs for the brief question",
  "non_goals": ["Final claims", "Sealing", "Outbound handoff"],
  "references": [".research/runs/<run-id>/brief.md"],
  "suggested_skills": ["research"],
  "allowed_tools": ["MCP source_discover when parent grants", "read workspace"],
  "forbidden": ["research_seal", "firecrawl CLI", "write handoffs/outbound", "write research.json"],
  "output_contract": "Result Card in handoffs/inbound/discover-1.result.md with candidate URLs and why primary",
  "dispatch_prompt": "You are a researcher subagent for run <run-id>. Read the brief at the reference path. Prefer official docs and specs. Do not seal. Write only the Result Card path outcomes; do not paste full pages into chat."
}
```

`dispatch_prompt` is required and must be the full text used for dispatch (auditable).
