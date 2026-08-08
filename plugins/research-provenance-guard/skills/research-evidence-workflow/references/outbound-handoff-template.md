# Outbound handoff templates (post-seal only)

## handoffs/outbound/handoff.md

```markdown
# Research outbound handoff

- Run: <run-id>
- Report: .research/runs/<run-id>/report.md
- Manifest: .research/runs/<run-id>/research.json
- Seal: <sha256:…>

## For downstream

- Consume only claims in the sealed report (status sourced via claim labels).
- Treat UNVERIFIED / INFERENCE / CONTESTED as bounded, not as proven facts.
- Suggested next skills: <prd / adr / implementation-planning / …>

## Open gaps

- <limitations from unverified claims>
```

## handoffs/outbound/prompt.md

Store the **exact** prompt that will start the next session or skill, for example:

```text
Continue from sealed research run <run-id>.
Read .research/runs/<run-id>/report.md and handoffs/outbound/handoff.md.
Do not re-research sealed claims unless the user expands scope.
Next goal: <user-stated downstream goal>.
```

Then run `research-workflow.mjs handoff-outbound` and optionally the community `handoff` skill for OS-temp compaction.
