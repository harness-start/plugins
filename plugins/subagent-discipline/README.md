# subagent-discipline

Inject a compact engineering contract into every spawned Claude Code or Codex
subagent, and optionally enforce **return hygiene** when a usable `agent_id` is
present.

## Behavior

### Always (SubagentStart)

Injects:

- **`[Subagent Contract]`** — scope, safety, evidence, no whole-file dumps,
  context discipline.
- **`[Return Hygiene]`** — no empty acknowledgements, prefer `path:line`,
  avoid restating the parent brief, summarize diffs/checks.

This injection does **not** require `agent_id`.

### Gated flow (requires `agent_id`)

When the hook event carries a non-empty, path-safe `agent_id` / `agentId`, the
plugin **enters** the hygiene state machine on Start and Stop:

1. **Cleanup** files under `.subagent-discipline/` older than **24 hours**
   (mtime).
2. **Ensure** the git root `.gitignore` contains `.subagent-discipline/`
   (create or append; no-op if already present). Only when a git root can be
   resolved.
3. **Start:** write `.subagent-discipline/spawns/<agentId>.json`.
4. **Stop:** score the candidate return; write
   `.subagent-discipline/returns/<agentId>-<stamp>.json`.

If **`agent_id` is missing or invalid**, the plugin **does not enter** this
flow: no ledger, no cleanup, no `.gitignore` mutation, no Stop scoring/block.

### Stop scoring (default soft)

Hard fail reasons (block mode only):

| Reason | Meaning |
| --- | --- |
| `empty-return` | Near-empty reply without substance |
| `whole-file-dump` | Oversized fenced block without a short summary |
| `brief-echo` | High overlap with stored parent brief (opt-in; see config) |

Default **`mode: soft`**: write ledger only; never `decision: block`.  
**`mode: block`**: reject the return (same shape as other Stop gates) until
fixed or `maxAttempts` forces pass.  
**`mode: off`**: no Stop scoring even with `agent_id`.

This plugin does **not** require a Result Card or fixed response headings. It
does **not** prove citations are true or replace sandboxing, approvals, or
independent verification.

## Configuration (optional)

`<git-root>/.subagent-discipline.mjs`:

```js
export default {
  evidence: {
    mode: "soft", // soft | block | off
    maxFenceLines: 80,
    minReturnChars: 40,
    echoThreshold: 0.72,
    maxAttempts: 2,
    ledgerTtlHours: 24,
    // Privacy: default false — brief-echo needs excerpt on disk when true
    storeBriefExcerpt: false,
    injectPathHints: true,
    agentTypeMap: {},
  },
};
```

## Platform behavior

| Platform | Hooks | Plugin root |
| --- | --- | --- |
| Claude Code | `SubagentStart`, `SubagentStop` | `CLAUDE_PLUGIN_ROOT` |
| Codex | `SubagentStart`, `SubagentStop` | `PLUGIN_ROOT` |

Codex requires users to review and trust non-managed plugin hooks before they
run. Use `/hooks` to inspect the installed definition.

Official field notes: both hosts document `agent_id` on SubagentStart/Stop.
Without it, only static contract injection runs.

## Related controls

Host capabilities that can enforce stronger boundaries (not enabled here):

- Claude Code `PreToolUse` receives `agent_id` / `agent_type` inside a
  subagent; agent teams use `TaskCompleted` / `TeammateIdle`.
- Claude agent definitions can limit tools, turns, worktree isolation, nested
  depth.
- Codex custom agents: `sandbox_mode`, concurrency caps.
- Coexistence: `language-output-governance` may also `SubagentStop` block; reasons are
  independent (possible double rewrite).

## Verification

From the repository root:

```bash
node --test plugins/subagent-discipline/tests/*.test.mjs
SKIP_HOST_INSTALL=1 bash scripts/ci/validate-plugins.sh
./scripts/acceptance/run.sh --plugin subagent-discipline
```
