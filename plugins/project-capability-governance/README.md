# project-capability-governance

`project-capability-governance` is a dual-host plugin for Claude Code and Codex. During ordinary work it can capture hard-qualified, project-specific capability proposals through a dedicated recorder subagent. It does not automatically adopt those proposals: the Stop notice is informational, and a human maintainer must explicitly invoke `$project-capability-governance` before any project instruction, Skill, Script, or Hook is changed.

A proposal is evidence to review, not an instruction to execute. Current-task TODOs, one-offs, generic advice, secrets, raw transcript dumps, machine-specific absolute paths, and Hook ideas without an outcome-level causal chain do not qualify.

## Runtime flow

```text
SessionStart
  -> publish qualification and recorder-reservation instructions
UserPromptSubmit
  -> open a new prompt epoch; clear the prior reservation
root agent observes a qualified candidate
  -> reserve one standalone recorder request
  -> dispatch at most one recorder subagent for the epoch
SubagentStart
  -> bind the first matching child to the reservation
recorder
  -> create up to three schema-valid files in inbox/pending
Stop
  -> compare active proposal revisions with notice state
  -> emit one deduplicated, human-only, non-blocking notice
human explicitly invokes $project-capability-governance
  -> review one proposal, confirm exact project mutations, implement, verify
  -> delete only after accepted, rejected, or merged as a duplicate
```

If reservation or recorder startup fails, the plugin creates no proposal and ordinary work continues. A notice must not cause an agent to invoke the governance Skill, change completion status, or block the current or a later task.

## What the Hooks observe

| Event | Observed input and effect | Boundary |
| --- | --- | --- |
| `SessionStart` | Injects qualification thresholds, exclusions, and the exact recorder reservation shape. On Claude it also persists the session id and plugin root into the host environment file. | It does not scan source, history, or user files for proposals. |
| `UserPromptSubmit` | Increments a session-and-project prompt epoch and clears recorder dispatches and reservations from the prior epoch. | It does not create or review a proposal. |
| `PreToolUse` | Where the host emits the event, inspects agent-dispatch markers, file targets and proposed content, plus shell command text and working directory. It enforces one recorder reservation, one exact pending Markdown target per write, proposal schema checks, no overwrite, a three-proposal limit, and no direct mutating shell command under the inbox. | Enforcement covers only tool calls exposed through the host's `PreToolUse` seam. See [Codex lifecycle limits](#codex-lifecycle-limits). |
| `SubagentStart` | Reads the child identity and recorder marker, consumes the current reservation, binds the first matching child, and injects the standalone request and recorder contract. Unbound children receive a return-without-changes instruction. | Binding authorizes a recorder; it is not proof that every later file tool is interceptable. |
| `Stop` | Scans real, non-symlink Markdown files in `pending/` and `reviewing/`, compares `proposal_id` and `proposal_revision` with `.notice-state.json`, and emits a notice only for a new revision. | `deferred/` proposals are not announced. The output has no blocking or permission decision. |

Changing proposal text without incrementing `proposal_revision` does not produce another notice. Review status, blocker text, directory moves, and notification state are not substantive evidence changes and must not increment the revision.

## Local storage and retention

The plugin creates this project-local workspace at the Git root:

```text
.project-capabilities/
├── .gitignore              # contains "*"; runtime contents stay out of Git
├── .notice-state.json      # latest announced revision for active proposals
├── inbox/
│   ├── pending/            # recorded, not yet under review
│   ├── reviewing/          # current review; may include a blocker field
│   └── deferred/           # retained until an explicit revisit condition is met
└── scratch/                # temporary audits of external capability candidates
```

The plugin has no proposal TTL and performs no automatic archival. A pending or reviewing proposal remains until a human workflow deletes it after one of three terminal outcomes: `accepted`, `rejected`, or `duplicate`. A blocked proposal remains in `reviewing/`; a deferred proposal remains in `deferred/` and cannot be deleted until it is reopened.

Deletion removes the Markdown and its notification entry. It does not create an archive, tombstone, processed receipt, or decision ledger. `.notice-state.json` is only a deduplication snapshot; if it is missing or malformed, the next Stop rebuilds it from active proposals and may announce those proposals again.

Recorder reservations and bindings are separate from the inbox. They are stored under the host's plugin-data directory, keyed by a hash of the project root and session id, with file mode `0600` and a lock around updates. When the host supplies no plugin-data directory, the implementation falls back to the operating system temporary directory. This session state can contain the standalone recorder request; the plugin does not apply its own TTL, so cleanup follows the host or temporary-directory policy.

## Proposal schema

Each new proposal is `.project-capabilities/inbox/pending/<proposal_id>.md`. The filename must exactly match `proposal_id`, whose accepted form is 3–64 lowercase letters, digits, or hyphens, beginning with a letter or digit.

The base contract is:

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

- The project-local capability runs the declared verification command and records its result.

## Counterexample

- A one-off deployment with no future reuse does not qualify.
```

`kind` must be `sop`, `instruction`, `skill`, or `hook`. Every proposal requires the four level-two sections shown above, at least two future reuse bullets, and non-empty acceptance and counterexample evidence. `sop`, `instruction`, and `skill` proposals require at least two evidence bullets unless a direct human request to standardize future work sets `explicit_standardization: true` in the frontmatter.

A Hook proposal also requires `risk: ordinary` or `risk: severe` and these non-empty sections:

```markdown
## Event
## Predicate
## Harm
## Recovery
## Near miss
```

An ordinary-risk Hook needs at least two concrete incidents; a severe-risk Hook needs at least one. The event and deterministic predicate must establish a credible causal chain to the target harm. Hook activation, formatting compliance, or an extra model turn is not outcome evidence.

`proposal_revision` starts at `1` and increases only when the recorder adds substantive evidence. See the complete [proposal contract](skills/project-capability-governance/references/proposal-schema.md).

## Human review and adoption boundary

Automatic recording may create only proposal Markdown and a non-blocking notice. It must not modify `AGENTS.md`, `CLAUDE.md`, host configuration, project Skills, Scripts, or Hooks. The main agent must not write proposal Markdown; the dedicated recorder owns proposal creation.

After a maintainer explicitly invokes `$project-capability-governance`, the Skill:

1. inspects `pending/`, `reviewing/`, and `deferred/`, merges duplicate evidence conceptually, and processes one proposal at a time;
2. compares the proposal with existing project instructions, Skills, Hooks, and scripts;
3. asks one decision-changing question per turn, at most five, while maintaining a write barrier;
4. shows the exact project paths, merge/new status, verification command, and rollback boundary before mutation;
5. chooses the smallest adequate mechanism: reuse, project instruction, project Skill, Skill plus deterministic Script, or a Hook with an observable causal chain;
6. writes accepted capabilities only to project-owned host-native paths and verifies the target outcome before deleting an accepted proposal.

| Capability | Claude Code | Codex |
| --- | --- | --- |
| Root instruction | `CLAUDE.md` | `AGENTS.md` |
| Skill | `.claude/skills/<id>/` | `.agents/skills/<id>/` |
| Hook registration | `.claude/settings.json` | `.codex/hooks.json` |
| Hook script | `.claude/hooks/<id>.*` | `.codex/hooks/<id>.*` |

One host must not execute files from the other host's directory. If `CLAUDE.md` is a relative symlink to canonical `AGENTS.md`, the workflow edits only the repository-approved managed block in `AGENTS.md`. Community Skills are audited under `.project-capabilities/scratch/<run-id>/` and, if accepted, installed into the current project for the applicable hosts—not into user-level directories. See [platform projection](skills/project-capability-governance/references/platform-projection.md).

## Lifecycle commands and recovery

Run lifecycle commands from the Git root. First resolve the installed plugin root and choose one proposal id:

```bash
PCG_PLUGIN_ROOT="${PROJECT_CAPABILITY_GOVERNANCE_ROOT:-${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-}}}"
test -n "${PCG_PLUGIN_ROOT}" || { echo "project-capability-governance plugin root is unavailable" >&2; exit 1; }
PROPOSAL_ID="pc-release-check"
```

Use only the transition valid for the proposal's current state:

```bash
# pending -> reviewing
node "${PCG_PLUGIN_ROOT}/scripts/project-capability-manage.mjs" start \
  --root "${PWD}" --proposal "${PROPOSAL_ID}"

# reviewing -> reviewing, with a verified blocker retained in frontmatter
node "${PCG_PLUGIN_ROOT}/scripts/project-capability-manage.mjs" block \
  --root "${PWD}" --proposal "${PROPOSAL_ID}" \
  --reason "Codex project Hook loading is not verified"

# pending or reviewing -> deferred
node "${PCG_PLUGIN_ROOT}/scripts/project-capability-manage.mjs" defer \
  --root "${PWD}" --proposal "${PROPOSAL_ID}" \
  --condition "Revisit when Codex project Hooks can be verified"

# deferred -> pending; clears blocker and revisit condition
node "${PCG_PLUGIN_ROOT}/scripts/project-capability-manage.mjs" reopen \
  --root "${PWD}" --proposal "${PROPOSAL_ID}"

# reviewing -> deleted after a verified terminal decision
node "${PCG_PLUGIN_ROOT}/scripts/project-capability-manage.mjs" delete \
  --root "${PWD}" --proposal "${PROPOSAL_ID}" --outcome accepted
```

The command prints one JSON result on success and exits with code `2` on invalid arguments or transitions. `--outcome` must be `accepted`, `rejected`, or `duplicate`.

Recovery rules:

| Failure | Recovery |
| --- | --- |
| Reservation, dispatch, or recorder startup fails | Create no proposal, finish the user's task, and retry the candidate in a later prompt epoch if it still qualifies. |
| Recorder write is rejected as invalid | Correct the schema within the same bound recorder; rejected attempts do not consume the three accepted-proposal slots. |
| A second recorder is dispatched in one prompt epoch | Only the first reservation can bind. Start a new user-prompt epoch before retrying; do not reuse stale authorization. |
| Review, implementation, or verification fails | Keep the proposal. Record a concrete blocker with `block`, or move it to `deferred/` with an explicit revisit condition. Restore affected project paths using the rollback boundary shown before mutation. |
| Platform support or authority is missing | Do not write user-level configuration as a workaround. Keep the proposal blocked or deferred until project-local support or authority exists. |
| A deferred proposal needs a terminal decision | Run `reopen` first, review it again, then delete only after the accepted, rejected, or duplicate condition is verified. |
| Proposal ids are duplicated, malformed, or represented by symlinks | Lifecycle commands fail closed. A human maintainer must back up the inbox, leave one real Markdown file whose filename matches `proposal_id`, and then rerun the command. |

## Codex lifecycle limits

The current compatibility contract documents these Codex limitations explicitly:

- `collaboration.spawn_agent` emits `SubagentStart` and `SubagentStop`, but with `fork_turns: "none"` the child context does not expose the spawn message. The root must therefore persist a standalone request with the reservation command before dispatch. `SubagentStart` consumes that request and injects it into the bound recorder.
- The tested Codex runtime does not emit a dispatch `PreToolUse` event. Unlike Claude Code, the plugin cannot reject the second recorder before it starts; it binds only the first current reservation and tells later children that they are unauthorized.
- Codex's built-in custom `apply_patch` does not emit `PreToolUse`. The plugin therefore does not claim a Codex-wide file-write sandbox or a hard denial for every root-agent write under the inbox. Live acceptance records this boundary instead of reporting a false guarantee.
- Because that file-tool seam is absent, Codex outcome evidence comes from the reservation/binding protocol and post-run validation of the created proposal. Hook activation alone is not treated as success.

These limits do not permit automatic adoption. The human-only notice and explicit review boundary are the same on both hosts.

## Verification

Run unit tests from the repository root. They cover schema policy, notice deduplication, recorder binding and limits, lifecycle transitions, overwrite/symlink rejection, and Codex reservation behavior:

```bash
node --test plugins/project-capability-governance/tests/*.test.mjs
```

Expected result: exit code `0`, with no failed or skipped tests.

Run live dual-host acceptance through the repository's Docker wrapper; do not launch Claude Code or Codex acceptance sessions directly on the host:

```bash
./scripts/acceptance/run.sh --plugin project-capability-governance
```

The acceptance suite verifies outcome-level behavior rather than Hook presence alone:

| Case | Required outcome |
| --- | --- |
| `01-human-only-notice` | One new revision produces one human-only, non-blocking notice and no automatic adoption. |
| `02-ordinary-no-notice` | Ordinary work creates no proposal and no notice. |
| `03-recorder-capture` | One real recorder creates one schema-valid proposal and triggers the notice. |
| `04-recorder-singleton` | Only the first recorder in a prompt epoch creates a proposal. |
| `05-main-write-denied` | Claude denies an unbound root file write; Codex records the custom `apply_patch` boundary without claiming a denial. |

After a live or manual run, these read-only checks confirm local storage and Git isolation:

```bash
find .project-capabilities/inbox -maxdepth 2 -type f -name '*.md' -print | sort
git status --short -- .project-capabilities
```

The first command lists retained proposals by lifecycle directory. The second should print nothing because `.project-capabilities/.gitignore` excludes runtime state. For more detail, see the [acceptance contract](acceptance/README.md).
