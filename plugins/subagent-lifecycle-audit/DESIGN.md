# subagent-lifecycle-audit design

## Responsibility

Record host-observed subagent starts and stops as append-only lifecycle
metadata. Preserve missing or inconsistent events as audit facts without
inventing success, failure, or work-content conclusions.

## Event flow

```text
SubagentStart ─┐
SubagentStop ──┼─> normalize -> session lock -> append JSONL -> report
               │
PreToolUse ────┘   protect audit root only
```

The protection hook is not a work collector. No `PreToolUse` or `PostToolUse`
payload is written to the trail.

## Schema `subagent-lifecycle/v1`

```json
{
  "schema": "subagent-lifecycle/v1",
  "event": "started",
  "observed_at": "2026-08-08T00:00:00.000Z",
  "host": "codex",
  "session_id": "session-1",
  "agent_id": "agent-1",
  "agent_type": "explorer",
  "parent_agent_id": null,
  "started_at": "2026-08-08T00:00:00.000Z",
  "ended_at": null,
  "duration_ms": null,
  "correlation": "open",
  "monotonic_ns": "1234567890",
  "provenance": {
    "session_id": "session-1",
    "trigger_from": "subagent-lifecycle-audit:start"
  }
}
```

`monotonic_ns` is captured from the host OS monotonic clock. A matched Stop
uses the persisted Start value to calculate `duration_ms`; a negative,
missing, or unparsable delta produces `null`.

## Correlation

Within one session file, each agent ID owns a stack of unmatched Starts.

1. First Start appends `open`.
2. Another Start before a matching Stop appends `duplicate-start`.
3. Stop pairs with the most recent unmatched Start and appends `matched`.
4. Stop without an unmatched Start appends `orphan-stop`.
5. Events without `agent_id` append `missing-agent-id` and are never paired.

The report derives `stopped`, `open`, and `orphan-stop` views from this trail.
It never maps lifecycle state to task outcome.

## Write and failure policy

- Plugin: create layout and append one complete JSON line while holding a
  bounded per-session lock.
- Agent tools: direct file-tool targets and recognized shell mutation forms
  under `.subagent-lifecycle-audit/` are denied.
- Recording failure: warn on stderr and exit zero.
- Explicit trail mutation: return `PreToolUse` deny.
- Retention: none; cleanup is an external operator decision.

File modes are `0700` for directories and `0600` for generated files. The
trail is project-local and ignored by Git.

## Non-goals

- Prompt or response capture
- Command, file, tool, token, or cost telemetry
- Return-quality scoring or lifecycle blocking
- Proof that the subagent completed successfully
- WORM or off-host evidence storage
- Complete prevention of indirect or external trail mutation
