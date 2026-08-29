# activity-audit

`activity-audit` records a bounded, project-local account of the file operations and shell commands performed by agents in Claude Code and Codex. It is intended for operational traceability: answering what an agent attempted, when it happened, and whether the host reported success or failure without copying full tool output into an audit log.

## Purpose

Agent sessions can change many files and run many commands before a human reviews the result. This plugin creates one JSONL trail per host session so maintainers can reconstruct that activity, investigate an unexpected change, or support a handoff. Command output and file contents are deliberately excluded to keep the trail smaller and reduce accidental secret capture.

## Design

The owner contains an `activity` domain under `src/domains/`. It exposes a single Hook entrypoint per host and dispatches `PreToolUse`, `PostToolUse`, and `PostToolUseFailure` events to that domain in process. The domain records a pending event before a tool runs and closes or appends the terminal event after the result is observed.

The plugin is self-contained: its Hook runtime, configuration Skill, tests, and storage logic ship together. Installing it activates the complete surface; there are no capability profiles and no dependency on Skills installed elsewhere.

## Capabilities

| Capability | Mechanism | User-visible result |
| --- | --- | --- |
| Command activity trail | Pre/post Hooks | Command, host, status, timestamps, duration, and optional exit code |
| File activity trail | Pre/post Hooks | Read, write, or update operation with project-relative paths |
| Concurrent-event handling | JSONL writer | Pending records are closed only when the tool ID matches; otherwise a terminal record is appended |
| Audit-path protection | PreToolUse Hook | Agent file tools and shell commands cannot rewrite the audit directory |
| Secret minimization | Deterministic redaction | Common credential shapes are masked and command text is length-bounded |
| Project configuration | `agent-activity-audit-config` Skill | Initialize or diagnose `.agent-activity-audit.mjs` |

## When to use it

Use this plugin when you need a lightweight history of agent activity in a repository, want to diagnose which session touched a path, need evidence for an engineering handoff, or operate agents in a workspace where command/file traceability matters. It is especially useful for long implementation sessions and shared repositories where the final Git diff alone does not explain attempted commands or failed operations.

## When not to use it

Do not use it as a security boundary, compliance archive, terminal recorder, or replacement for Git history. It does not capture human terminal activity, full stdout/stderr, tool-response bodies, or file contents. If you require tamper-resistant WORM storage, centralized retention, identity attestation, or operating-system-level monitoring, use a dedicated audit platform.

## Runtime behavior

`PreToolUse` appends a `pending` record. `PostToolUse` and failure events add the observed outcome. When the latest pending record has the same non-empty tool ID, only that last line is replaced; parallel or unmatched results are appended instead of rewriting older history. Missing success evidence is recorded as `unknown`, not guessed as success.

The audit tree is protected from agent-originated mutations. Runtime errors fail open so an unavailable audit directory does not make the repository unusable. Both hosts use the same schema, while their Hook manifests and environment variables remain platform-specific.

## Public interfaces

This owner has no public CLI or MCP server. Its public interfaces are:

- the `agent-activity-audit-config` Skill for configuration and diagnosis;
- the Claude Code and Codex lifecycle Hooks declared in `hooks/`;
- the `agent-activity/v1` JSONL records written under the configured audit root.

## Configuration and state

The default project configuration file is `.agent-activity-audit.mjs`. Supported settings include `enabled`, `auditRoot`, and `maxCommandChars`. Secret redaction is a fixed safety invariant and cannot be disabled. By default, state is written below `.agent-activity-audit/sessions/<session-id>.jsonl`; the plugin creates an ignore file inside that working directory and does not modify the repository root `.gitignore`.

## Boundaries

The trail proves only what the host exposed to the plugin Hooks. It does not prove that an external side effect completed, that a command output was truthful, or that another process did not alter local files. The redactor reduces common secret exposure but is not a universal data-loss-prevention engine. Hook activation is evidence that observation ran, not evidence that the underlying task succeeded.

## Verification

From the marketplace repository root:

```bash
node --import tsx --test \
  plugins/activity-audit/tests/*.test.ts \
  plugins/activity-audit/tests/domains/activity/*.test.ts
npm run check:dist
```

Live Claude Code and Codex acceptance must use `./scripts/acceptance/run.sh --plugin activity-audit`, which runs through the repository's Docker host-acceptance policy.
