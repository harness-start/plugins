# Subagent Workflow Guard design

## Outcome and boundary

The hard outcome is narrow: during an active governed run, a main agent cannot dispatch through a host tool that actually emits the matched `PreToolUse` event without first registering a valid, single-use application. A governed run cannot close as completed through the deterministic command until application-bound subagents return valid Result Cards and the review graph validates.

The causal chain is:

```text
application artifact
  -> prepare receipt
  -> PreToolUse reservation
  -> SubagentStart agent_id binding
  -> scoped tool decisions
  -> SubagentStop terminal receipt
  -> review graph validation
  -> main Stop release
```

`SessionStart` advertises and restores the contract. It is not evidence that a task succeeded. `PostToolUse(Agent)` records dispatch observation only; asynchronous hosts can emit it before `SubagentStop`.

## State and correlation

Each host uses its own plugin data variable and directory. Session state is keyed by a SHA-256 digest of `session_id` and the resolved workspace. Application artifacts are separate `0600` JSON files. Updates use a bounded lock plus atomic rename. Claude `SessionStart` persists the event's exact session ID, authoritative host, and installed plugin root for later Bash commands through `CLAUDE_ENV_FILE`; Codex exposes `CODEX_THREAD_ID` and resolves its plugin cache. Normal skill commands omit `--host`; if a caller supplies one that conflicts with the persisted platform host, the CLI rejects it. CLI commands without explicit `--session` use a request below a host- and session-hashed path in the repository's private Git directory, even if the interactive shell happens to expose plugin data. A later hook with the same session identity revalidates and imports it into platform state. Another session cannot claim the request, and malformed mailbox or durable-state JSON/schema fails closed at the dispatch and parent-Stop seams.

A receipt moves through:

```text
prepared -> reserved -> bound -> delivered
              |
              +-> prepared  (dispatch failure before SubagentStart)
```

Reservation uses the application ID, random nonce, active run, session/workspace state, dependencies, and `tool_use_id` when available. `SubagentStart` binds by the marker repeated in the agent prompt and the real `agent_id`; it does not assume the host repeats `tool_use_id` across events.

## Roles and review graph

Applications use `implementer`, `spec-reviewer`, `quality-reviewer`, `final-reviewer`, or `researcher`. Reviewers and researchers have neither file mutation nor shell access. Preparing the final reviewer seals an ID-and-artifact graph digest; later applications and stale final review are rejected. A successful run close requires every application to be delivered, both reviewer roles for each implementer, and one delivered final reviewer bound to that sealed graph. The orchestrator limits fix/review to two rounds and keeps blocker/major findings open until an independent reviewer rechecks them.

At most three undelivered applications may coexist. `prepare` rejects unmet dependencies and overlapping declared write scopes. The orchestrator uses isolated worktrees for parallel writers; the hook does not pretend a path matcher creates process isolation.

## Failure behavior

- Invalid dispatch in hard mode: `PreToolUse` deny.
- Ordinary dispatch in default mode: soft context only.
- Spawn without reservation: inject `orphan-spawn` and require `NEEDS_CONTEXT`.
- Invalid or evidence-empty Result Card: `SubagentStop` block once; respect `stop_hook_active` to avoid a permanent loop.
- Open parent run: main `Stop` block until deterministic close or exact user abort.
- Unexpected non-governance hook/runtime error: fail open with an English diagnostic; no fabricated receipt is written.
- Unreadable or invalid workflow mailbox at dispatch or parent Stop: fail closed, because otherwise a corrupted bridge could bypass an active run.
- Unreadable or invalid durable workflow state on an Agent or bound-subagent tool seam: fail closed. A stale lock also prevents reservation or closure; after confirming no workflow CLI or hook process is active, remove only that state file's adjacent `.lock` and retry.

Claude Code 2.1.170 emits the required `PreToolUse -> SubagentStart -> SubagentStop` chain for `Agent`, and live acceptance proves the deny occurs before start. Codex 0.146 does not emit `PreToolUse` or `SubagentStart` for its namespaced `collaboration.spawn_agent` API; changing a manifest matcher cannot create a missing host event. The Codex manifest retains the supported hook definitions for compatible tool seams, but the plugin makes no Codex pre-dispatch hard-gate claim until a host trace proves that causal chain.
