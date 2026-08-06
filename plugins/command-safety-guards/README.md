# command-safety-guards

Deterministic PreToolUse and PostToolUse guards for high-risk commands and sensitive source patterns on Claude Code and Codex.

## Behavior

The plugin starts one Node.js process per matching event and evaluates consolidated checks in this order:

| Order | Check | Result |
| --- | --- | --- |
| 1 | Recursive `rm` against `/`, the current workspace, home, a top-level directory, or an `xargs`-supplied target | Deny |
| 2 | Bare `sed -i` or `sed --in-place` without a backup suffix | Deny |
| 3 | `cat` heredoc redirected to a repository file | Deny |
| 3 | `cat` heredoc redirected under `/tmp`, `/private/tmp`, or `$TMPDIR` | Report |
| 4 | Dangerous SQL/Redis, missing MySQL replication preflight, or unbounded active testing | Deny/report |
| 5 | Secret reads/leaks and `lark-cli --yes` | Report |
| 6 | Net-new TLS verification bypass, PII logging, or SQL encoding defects | PostToolUse report |
| 7 | Three plugin-local denies against the same target within ten minutes | Deny escalation |

Clean commands produce no stdout. Denials exit with status 0 and return the shared `permissionDecision: deny` JSON contract expected by both hosts.

## Migrated from

| Source | Target |
| --- | --- |
| `skills/command-safety-governance/src/hooks/dangerous-command-guard.ts` | `scripts/checks/dangerous-command.mjs` |
| `skills/command-safety-governance/src/hooks/sed-inplace-guard.ts` | `scripts/checks/sed-inplace.mjs` |
| `skills/command-safety-governance/src/hooks/cat-write-guard.ts` | `scripts/checks/cat-write.mjs` |
| `core/hook-support/src/hook-bash-git-shell-utils.ts` | Minimal tokenizer in `scripts/lib/shell-parse.mjs` |

The plugin is self-contained and has no `@harness/*` runtime dependency. Escalation state deliberately counts only denials emitted by this plugin because neither host exposes the source runtime's global telemetry contract. State is JSONL under `PLUGIN_DATA` or `CLAUDE_PLUGIN_DATA`; nothing is written into the plugin installation directory.

All fourteen inventory hooks are represented by the two event entries and seven check/state modules. Node.js runs them directly with no dependency installation, compilation, or vendored source tree.

## Verification

From the marketplace root:

```bash
find plugins/command-safety-guards/scripts -name '*.mjs' -print0 | xargs -0 -n1 node --check
node --test plugins/command-safety-guards/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin command-safety-guards
```

The unit suite only runs pure checks and local Node.js hook subprocesses. Live Claude Code and Codex acceptance is Docker-only and requires the repository `.env` described in [host acceptance](../../docs/host-acceptance.md).
