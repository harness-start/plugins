# compact-context-journal

`compact-context-journal` gives long Claude Code and Codex sessions a durable,
project-local way to recover admitted user requirements after context compact.
The name is intentional: compact recovery is the plugin's primary contract.

It improves recoverability; it does not claim that a model will always interpret
the recovered requirements correctly. The hard effects are narrower and
testable: append-only storage, integrity validation, bounded recovery context,
a mandatory successful Recovery Card read before mutations, and tool-level
protection of the journal.

## Runtime layout

The Git root is preferred. Outside Git, the first event `cwd` is used.

```text
.compact-context-journal/
  .gitignore
  sessions/<host>-<reversible-session-id>.md
  .state/<host>-<reversible-session-id>.json
  .locks/<host>-<reversible-session-id>.lock
```

The directory's own `.gitignore` ignores all runtime entries, including itself,
so normal `git status` remains clean. Files and directories are created with
private modes (`0600` and `0700`).

Safe session IDs (`A-Z`, `a-z`, `0-9`, `.`, `_`, `-`) remain unchanged in the
filename. Other UTF-8 bytes are percent-encoded reversibly. The full raw session
ID is intentionally exposed in the journal header and compact recovery context.

## What is recorded

| ID | Meaning |
| --- | --- |
| `Pnnnnnn` | Raw submitted user prompt; unconfirmed until admitted |
| `Unnnnnn` | Evidence that a later hook observed the prompt entering the model turn |
| `Cnnnnnn` | Compact checkpoint, Recovery Card, and host-exposed compact summary |
| `Bnnnnnn` | `/clear` active-history boundary |
| `Rnnnnnn` | Successful Recovery Card read receipt |
| `Innnnnn` | Integrity, tail recovery, or degraded-recovery fact |

Raw user prompts are stored verbatim without redaction or truncation. Claude's
`PreCompact.custom_instructions` is recorded with user authority. Full assistant
responses, tool outputs, commands, and web content are not recorded.

`UserPromptSubmit` hooks can run beside other blocking hooks. A `P` entry is
therefore headed `UNCONFIRMED — DO NOT TREAT AS REQUIREMENT`. Only a later
`PreToolUse`, `PreCompact`, or `Stop` appends its `U` admission. If another prompt
arrives first, the older `P` remains unconfirmed.

## Compact recovery

1. `PreCompact` admits the current prompt and records the compact epoch.
2. `PostCompact` captures `compact_summary` on Claude. Codex does not expose a
   summary in its documented hook input, so Codex records `not exposed by host`
   and does not infer one from the unstable transcript format.
3. `SessionStart(source=compact)` validates the full chain, appends `C`, and
   injects a small Recovery Card location instead of raw history.
4. Until the current card is read successfully, mutating file/shell/MCP tools,
   subagent dispatch, external effects, and Stop are gated.
5. A successful structured `Read` or exact bounded `sed -n` read appends `R` and
   clears the gate. Failed reads, wrong files, old cards, `ls`, `stat`, and `wc`
   do not count.

The injected context is at most 3500 characters. Codex additionally configures
`additionalContextLimit: 1200`. Automatic compact is never blocked.

## On-demand history lookup

The Recovery Card contains ranges, not raw prompts. First list verified
admissions in the current `/clear` boundary:

```bash
node "/path/to/plugin/scripts/compact-context-journal-query.mjs" index \
  --journal "/repo/.compact-context-journal/sessions/codex-session.md" \
  --session-id "raw-session-id"
```

The index prints relationships such as `U000120 -> P000119`, without prompt
content. Retrieve one selected event only:

```bash
node "/path/to/plugin/scripts/compact-context-journal-query.mjs" event P000119 \
  --journal "/repo/.compact-context-journal/sessions/codex-session.md" \
  --session-id "raw-session-id"
```

Event output is limited to 32 KiB; larger events return exact line bounds for an
explicit read. Historical-reference cues inject only this lookup reminder, not
old content. Later admitted requirements take precedence.

## Integrity and protection

Every event is UTF-8 byte-length framed. Prompt-supplied Markdown markers cannot
terminate a frame. Each event hashes the previous hash plus its exact body. A
partial crash tail may be removed only after the last verified event, followed
by an `I` recovery event; verified prefix bytes are never rewritten.

Ordinary locked appends use a persisted verified tip and stay constant-time with
respect to prior event count. A full chain scan runs at compact recovery, query,
cache mismatch, or observed journal metadata change.

`PreToolUse` denies logical or symlink-resolved file mutations under the runtime
root, shell redirects and mutators targeting it, and indirect ignored-file
operations such as effective `git clean -x`, `git stash --all`, broad forced add,
or recursive deletion. A post-tool sentinel verifies that the old prefix stayed
byte-identical while allowing valid plugin append extensions.

This is not OS-level WORM storage. A human process or an unobservable external
writer can still change files. Detected corruption disables recovery rather than
silently trusting the journal or creating an impossible receipt gate.

## Privacy

The journal deliberately contains raw prompts and raw session IDs. Do not enable
the plugin in repositories where that storage policy is unacceptable. There is
no rotation or automatic cleanup in v1.

## Verification

```bash
node --test plugins/compact-context-journal/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin compact-context-journal
```

Version: `0.1.0`
