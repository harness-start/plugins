# compact-context-journal design

## Causal contract

The target outcome is more stable requirement recovery after context compact.
Hook activation or an extra model turn is not sufficient evidence. The causal
chain implemented here is:

```text
submitted P -> later admission U -> verified compact C -> bounded card injection
  -> successful card read R -> mutations resume -> selected U points to raw P
```

The model receives no automatic raw-history dump. This limits stale authority,
prompt injection, and context growth. Recovery still depends on model reasoning,
so the plugin claims recoverability and enforced read-before-write, not perfect
task performance.

## Authority model

- `P` is unconfirmed because `UserPromptSubmit` hooks run concurrently.
- Only a later lifecycle signal admits the latest pending `P` with `U`.
- An older unadmitted `P` remains stored but cannot become a requirement.
- Claude compact custom instructions are stored as a `P`/`U` pair.
- `/clear` appends `B`; default lookup ignores earlier events.
- Within admitted active history, later requirements override earlier ones.

Hook-generated Stop continuation feedback is not classified from prompt text and
is not archived as a user demand. Root sessions carrying `agent_type` remain root
sessions; only explicit subagent identity fields are skipped.

## Frame and chain

```text
<!-- ccj:start {seq,type,prefix,body_bytes,prev_hash} -->
<exact body_bytes bytes>
<!-- ccj:end {seq,event_hash} -->
```

`event_hash = SHA256(prev_hash + NUL + exact_body_bytes)`. The body begins with
hashed event metadata that must agree with the outer sequence, prefix, and type.
The first `prev_hash` is SHA-256 of the exact per-session header bytes.

The parser advances by `body_bytes`; it never searches prompt content for an end
marker. Markdown uses a fence longer than any backtick run in the raw value.

## State and concurrency

Journal writes and state updates run under a bounded per-session directory lock.
State writes use atomic rename. Receipt candidates and mutation sentinels are
keyed by tool-use ID, so parallel tools cannot overwrite each other.

The state caches the verified sequence, byte offset, next line, inode, and tip
hash. A normal append validates file identity/size and extends that tip without
rescanning old bodies. Full verification runs on compact, query, cache mismatch,
or changed metadata; this avoids cumulative O(N²) work in long sessions.

The state sidecar is not an authority source. Recovery content comes only from a
fully verified journal. If the journal is missing or invalid, recovery becomes
unavailable and the mutation gate is removed; the plugin emits a warning rather
than deadlocking the session.

If the state sidecar is missing or malformed, a full journal scan reconstructs
the latest `B`, pending latest `P`, `C`, and matching `R` before tool policy runs.

## Host boundary

| Capability | Claude Code | Codex |
| --- | --- | --- |
| `PreCompact.trigger` | yes | yes |
| Custom compact instructions | documented | not exposed |
| `PostCompact.compact_summary` | documented | not exposed |
| Compact continuation injection | `SessionStart(compact)` | `SessionStart(compact)` |

Codex `transcript_path` is documented as unstable. V1 records its byte offset for
diagnostics but never treats transcript fields as compact summary authority.

## Recovery gate

`C` places the Recovery Card before the host summary and records its exact lines.
Only successful `PostToolUse` for a pre-registered structured `Read` or exact
`sed -n` covering those lines appends `R`. While pending, pure reads may run but
do not grant a receipt. Unknown tools are treated as effectful.

The first ordinary Stop returns `decision: block`. A Stop continuation marked by
`stop_hook_active` appends `recovery_unconfirmed` and ends without another loop;
the pending requirement remains durable.

## Protection boundary

Logical and physical path checks deny structured writes through symlink aliases.
Shell policy covers direct mutation syntax and repository-wide ignored-file
operations that need not mention the runtime root. Effective destructive
operations are denied; `git clean --dry-run` stays available for inspection.

Before an observable mutation, a sentinel hashes the entire verified prefix.
After success, the old bytes must be identical and the resulting file must still
verify. A valid plugin append extension is allowed. Prefix mutation, replacement,
shrinkage, invalid framing, or inode replacement marks the session compromised.

## Non-goals

- Capturing assistant responses, tool results, or shell history
- Summarizing with a second LLM
- Inferring a Codex compact summary from undocumented transcript internals
- Rotation, redaction, cleanup, or cross-repository synchronization
- Preventing human/root filesystem changes
- Guaranteeing that a model obeys or correctly interprets recovered requirements
