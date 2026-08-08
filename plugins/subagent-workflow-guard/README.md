# subagent-workflow-guard

`subagent-workflow-guard` makes a scoped application the durable handoff between a main agent and each governed subagent. Hook decisions then connect that application to dispatch, startup, tool scope, Result Card validation, and parent-run closure.

The plugin replaces `subagent-discipline`. `subagent-lifecycle-audit` remains separate: it records lifecycle facts for every subagent, while this plugin stores only application-bound workflow receipts.

## Runtime behavior

1. `subagent-plan-execution` opens a governed run.
2. `subagent-handoff` validates an application, copies it to the host's plugin data directory, and returns a one-time marker:

   ```text
   SUBAGENT_APPLICATION <application-id> <nonce>
   ```

3. On hook-capable Agent tools, `PreToolUse` reserves the marker. Missing, invalid, replayed, cross-run, or dependency-blocked applications are denied while a governed run is open.
4. `SubagentStart` binds the reservation to `agent_id` and injects the application artifact plus Result Card contract. A start without a reservation becomes `orphan-spawn` and must return `NEEDS_CONTEXT`.
5. Subagent `PreToolUse` denies nested dispatch, all reviewer/researcher shell commands, reviewer file mutations, and file-tool writes outside an implementer's `writeScope`.
6. `SubagentStop` requires non-empty Result Card sections, concrete evidence anchors, verification outcomes, and requested evidence terms before it records the authoritative terminal status. `PostToolUse(Agent)` only reconciles dispatch because asynchronous hosts may emit it before the subagent finishes.
7. Preparing the final reviewer seals the application graph. The main `Stop` hook blocks while the run is open, and `run-close` rejects stale final review before `DONE` or `DONE_WITH_CONCERNS`.

`SubagentStop` validates a Result Card; it cannot create one or prove that cited evidence is true. File-tool scope enforcement accepts only exact relative paths or `directory/**`, canonicalizes existing symlinks, and rejects targets that resolve outside the workspace or declared tree. Reviewer roles have no shell access, but implementer shell commands remain subject to host permissions rather than path-level sandboxing. The plugin does not replace independent verification.

Claude Code's `Agent` tool supplies the complete dispatch/start/stop hook chain and is the hard-gated path. In the tested Codex 0.146 runtime, `collaboration.spawn_agent` bypasses `PreToolUse` and `SubagentStart`; the plugin cannot prevent that API from starting an unregistered worker. Codex completion still cannot close as `DONE` through the workflow CLI without the sealed review graph, but that is not a dispatch sandbox. Do not treat the Codex manifest or SessionStart context as proof of pre-dispatch enforcement.

## Configuration

No project configuration is required. The only public setting is `<git-root>/.subagent-workflow-guard.mjs`:

```js
export default {
  dispatch: "workflow",
};
```

| Value | Behavior |
| --- | --- |
| `workflow` | Hard gate matched hook-capable dispatches while a governed run is open; report ordinary dispatches |
| `block` | Require an application for every matched hook-capable main-agent dispatch |
| `report` | Report invalid dispatches without denying them |
| `off` | Disable dispatch and scope decisions |

Legacy `.subagent-discipline.*` configuration is not executed. Its presence produces a migration warning.

## Workflow CLI

The bundled skills call `scripts/subagent-workflow.mjs`. With host plugin data and a session ID, commands update state directly:

```bash
node "${CLAUDE_PLUGIN_ROOT:-$PLUGIN_ROOT}/scripts/subagent-workflow.mjs" run-open \
  --host codex --session "$AI_EXPERTS_SESSION_ID" --cwd "$PWD" --run-id task-42

node "${CLAUDE_PLUGIN_ROOT:-$PLUGIN_ROOT}/scripts/subagent-workflow.mjs" prepare \
  --host codex --session "$AI_EXPERTS_SESSION_ID" --cwd "$PWD" --file /tmp/subagent-application.json

node "${CLAUDE_PLUGIN_ROOT:-$PLUGIN_ROOT}/scripts/subagent-workflow.mjs" run-close \
  --host codex --session "$AI_EXPERTS_SESSION_ID" --cwd "$PWD" --status DONE
```

Use `--host claude` with Claude Code only in controlled scripts that do not already carry the platform environment. Runtime files are separated under `CLAUDE_PLUGIN_DATA` or `PLUGIN_DATA` and written with mode `0600`. Claude `SessionStart` persists the exact hook session, authoritative host, and installed plugin root through the host-provided `CLAUDE_ENV_FILE`; Codex uses `CODEX_THREAD_ID` and its plugin cache. Normal skill commands omit `--host`; an explicit value that conflicts with the persisted host is rejected. An explicit `--session` is required to opt into direct plugin-data access; an implicit platform session always uses the bridge because an interactive shell's plugin-data view is not assumed to equal the hook's view. The CLI writes a `0600` request below a host- and session-hashed path in the repository's private Git directory. Only a hook carrying that same session identity can revalidate and import the request into platform-scoped state; no tracked workspace or cross-session fallback is used. Malformed mailbox or durable state data fails closed at dispatch and parent Stop.

## Upgrade from `subagent-discipline`

`scripts/install-all.sh` removes previously installed marketplace plugins before installing the current catalog, so its normal sync performs the rename. For a direct installation:

```bash
claude plugin uninstall subagent-discipline@harness-start -s user -y
claude plugin install subagent-workflow-guard@harness-start -s user

codex plugin uninstall subagent-discipline@harness-start --json
codex plugin add subagent-workflow-guard@harness-start --json
```

The migration does not delete `.subagent-discipline/` or old project configuration. Remove or archive those files only after reviewing them.

## Verification

From the repository root:

```bash
node --test plugins/subagent-workflow-guard/tests/*.test.mjs
SKIP_HOST_INSTALL=1 bash scripts/ci/validate-plugins.sh
./scripts/acceptance/run.sh --plugin subagent-workflow-guard
```
