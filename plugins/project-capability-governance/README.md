# project-capability-governance

`project-capability-governance` works on Claude Code and Codex. During ordinary
work, the parent agent may park a durable, project-specific capability proposal
in a schema-validated inbox. The plugin does not apply proposals automatically:
its Stop notice is a non-blocking message for a human maintainer. A maintainer
must explicitly invoke `$project-capability-governance` before project
instructions, Skills, Scripts, or Hooks are changed.

A proposal is something to review, not something to execute. Current-task
TODOs, one-offs, generic advice, secrets, raw transcript dumps,
machine-specific absolute paths, and Hook ideas without a credible causal chain
do not qualify.

## Runtime flow

```text
SessionStart
  -> publish qualification thresholds and the proposal boundary
parent observes a qualified candidate
  -> optionally ask an ordinary read-only subagent for advice
  -> verify the evidence itself
  -> create one schema-valid pending proposal directly
PreToolUse
  -> validate exact path, new-file semantics, schema, and shell bypasses
Stop
  -> emit one deduplicated, human-only, non-blocking notice
human explicitly invokes $project-capability-governance
  -> review one proposal, confirm mutations, implement, verify, then resolve it
```

The optional subagent has no plugin-defined role, marker, reservation, nonce,
lifecycle hook, write authority, or approval power. It is an ordinary platform
subagent whose response is advice. The parent owns the decision and proposal.

## Hook boundary

| Event | Effect | Boundary |
| --- | --- | --- |
| `SessionStart` | Publishes qualification and exclusion criteria. On Claude it also persists session/plugin-root environment values. | It does not scan source, history, transcripts, or create project files. |
| `PreToolUse` | Validates one exact new pending Markdown proposal, creates the ignored inbox workspace for that accepted write, rejects malformed or overwrite attempts, and blocks direct mutating shell commands under the inbox. | Enforcement covers only file and shell calls exposed through the host's `PreToolUse` seam. It does not inspect or govern subagent dispatch. |
| `Stop` | Compares active proposal revisions with `.notice-state.json` and emits a notice only for a new revision. | `deferred/` proposals are not announced; the notice has no blocking decision. |

Changing proposal text without incrementing `proposal_revision` does not produce
another notice. Review status, blocker text, directory moves, and notification
state are not substantive evidence changes.

## Local storage

```text
.project-capabilities/
├── .gitignore              # contains "*"
├── .notice-state.json      # latest announced active revision
├── inbox/
│   ├── pending/
│   ├── reviewing/
│   └── deferred/
└── scratch/
```

The plugin applies no proposal TTL and creates no archive, tombstone, processed
receipt, subagent mailbox, or lifecycle ledger. A pending or reviewing proposal
remains until the human workflow resolves it as `accepted`, `rejected`, or
`duplicate`. A blocked proposal remains in `reviewing/`; a deferred proposal
must be reopened before terminal resolution.

## Proposal schema

Each new proposal is
`.project-capabilities/inbox/pending/<proposal_id>.md`. The filename must match a
3–64 character lowercase letter, digit, or hyphen `proposal_id`.

```markdown
---
proposal_id: pc-release-check
proposal_revision: 1
kind: sop
title: Repeatable release verification
status: pending
---

## Evidence

- The same release check was needed in service release A.
- The same release check was needed in library release B.

## Reuse scenarios

- Future service releases.
- Future library releases.

## Acceptance

- Run the declared verification command and record its result.

## Counterexample

- A one-off deployment with no future reuse does not qualify.
```

`kind` must be `sop`, `instruction`, `skill`, or `hook`. Every proposal needs
the four sections above, at least two future reuse bullets, and non-empty
acceptance and counterexample evidence. Non-Hook proposals need at least two
evidence bullets unless an explicit human standardization request sets
`explicit_standardization: true`.

A Hook proposal also needs `risk: ordinary` or `risk: severe` and non-empty
`Event`, `Predicate`, `Harm`, `Recovery`, and `Near miss` sections. Ordinary
risk needs two concrete incidents; severe risk needs one. Hook activation,
formatting compliance, and extra model turns are not outcome evidence.

`proposal_revision` increases only when substantive evidence changes. See the
complete [proposal contract](skills/project-capability-governance/references/proposal-schema.md).

## Human review and adoption

After explicit invocation, the Skill processes one proposal at a time, compares
it with existing project capabilities, asks only decision-changing questions,
shows the exact mutation and rollback boundary, and chooses the smallest useful
mechanism. Any optional read-only subagent remains advisory; the parent verifies
its cited evidence and owns the final decision.

| Capability | Claude Code | Codex |
| --- | --- | --- |
| Root instruction | `CLAUDE.md` | `AGENTS.md` |
| Skill | `.claude/skills/<id>/` | `.agents/skills/<id>/` |
| Hook registration | `.claude/settings.json` | `.codex/hooks.json` |
| Hook script | `.claude/hooks/<id>.*` | `.codex/hooks/<id>.*` |

One host must not execute files from the other host's directory. If `CLAUDE.md`
is a relative symlink to canonical `AGENTS.md`, edit only the allowed managed
block in `AGENTS.md`. Audit community Skills under
`.project-capabilities/scratch/<run-id>/` and install accepted assets only into
project-owned paths.

## Lifecycle commands and recovery

```bash
PCG_PLUGIN_ROOT="${PROJECT_CAPABILITY_GOVERNANCE_ROOT:-${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-}}}"
test -n "${PCG_PLUGIN_ROOT}"

node "${PCG_PLUGIN_ROOT}/dist/cli/project-capability-manage.mjs" start --root "${PWD}" --proposal pc-release-check
node "${PCG_PLUGIN_ROOT}/dist/cli/project-capability-manage.mjs" block --root "${PWD}" --proposal pc-release-check --reason "<verified blocker>"
node "${PCG_PLUGIN_ROOT}/dist/cli/project-capability-manage.mjs" defer --root "${PWD}" --proposal pc-release-check --condition "<revisit condition>"
node "${PCG_PLUGIN_ROOT}/dist/cli/project-capability-manage.mjs" reopen --root "${PWD}" --proposal pc-release-check
node "${PCG_PLUGIN_ROOT}/dist/cli/project-capability-manage.mjs" delete --root "${PWD}" --proposal pc-release-check --outcome accepted
```

Invalid schemas, overwrites, symlink targets, duplicate ids, invalid lifecycle
transitions, and untrusted direct shell mutations fail closed. Review or
verification failure keeps the proposal in place with a concrete blocker or
revisit condition. Missing platform support never authorizes a user-level
configuration workaround.

Codex may not expose every built-in file mutation through `PreToolUse`, so this
plugin does not claim a host-wide sandbox. Outcome evidence is the validated
proposal file and the human adoption workflow, not hook activation.

## Verification

```bash
npx tsx --test plugins/project-capability-governance/tests/*.test.ts
./scripts/acceptance/run.sh --plugin project-capability-governance
```

The Docker acceptance suite covers the human-only notice, ordinary no-op work,
parent-owned proposal capture, and an ordinary platform subagent that is not
assigned a plugin role. Read-only storage checks:

```bash
find .project-capabilities/inbox -maxdepth 2 -type f -name '*.md' -print | sort
git status --short -- .project-capabilities
```
