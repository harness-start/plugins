---
name: project-capability-governance
description: Review and resolve project capability proposals only when a human explicitly invokes `$project-capability-governance`; interview the human one question at a time, audit existing or community Skills, and land accepted instructions, Skills, Scripts, or Hooks in the current project's Claude Code and Codex configuration.
---

# Project Capability Governance

Run this workflow only after the human explicitly invokes this Skill. A Stop notice is informational and must never trigger this workflow automatically.

## Prepare

1. Resolve the Git root and inspect `.project-capabilities/inbox/{pending,reviewing,deferred}/`.
2. Read [proposal-schema.md](references/proposal-schema.md) before judging an application.
3. Compare active applications with `AGENTS.md`, `CLAUDE.md`, `.claude/skills/`, `.agents/skills/`, `.claude/settings.json`, `.codex/hooks.json`, and existing project scripts.
4. Merge duplicate evidence conceptually, then process one application only. Do not begin the next application until the current one is deleted or deferred.
5. Start a pending application with the lifecycle command documented below.

## Interview

Apply the grill-me protocol directly; do not ask the human to invoke another Skill.

- Ask one question per turn.
- Ask only questions whose answers can change accept, reject, defer, mechanism, platform scope, or verification.
- Offer concrete choices and a recommended default when useful.
- Stop after at most five questions. Stop earlier once the exact mutation set and acceptance evidence are clear.
- Keep a write barrier until the human confirms the exact project paths and mechanism.

## Select the smallest capability

Use this order:

1. Reuse an existing project capability.
2. Search for a community Skill with `$find-skill` when available; otherwise use the public Skills CLI search flow.
3. Update the managed block in `AGENTS.md` when a short stable instruction is sufficient.
4. Create a project Skill.
5. Create a project Skill plus a deterministic Script.
6. Create a Hook only when its event and predicate form a credible causal chain to the target outcome.
7. Reject the proposal when future value is not established.

Audit external candidates under `.project-capabilities/scratch/<run-id>/`. Install an accepted community Skill into the current project for both applicable hosts; never install it into user-level directories.

## Project runtime targets

Read [platform-projection.md](references/platform-projection.md) before mutating runtime files.

| Capability | Claude Code | Codex |
|---|---|---|
| Skill | `.claude/skills/<id>/` | `.agents/skills/<id>/` |
| Hook registration | `.claude/settings.json` | `.codex/hooks.json` |
| Hook script | `.claude/hooks/<id>.*` | `.codex/hooks/<id>.*` |
| Root instruction | `CLAUDE.md` | `AGENTS.md` |

Keep platform mechanisms separate. If `CLAUDE.md` is a relative symlink to canonical `AGENTS.md`, edit only the allowed managed block in `AGENTS.md`.

Before mutation, dispatch a read-only subagent with only `PCG_REVIEW_REQUEST adoption`. It reviews the causal chain, reuse evidence, and whether a Hook is justified. Do not mutate project instructions until that reviewer approves. Then show the human the exact paths, whether each path is new or merged, the verification command, and the rollback boundary. Preserve unrelated changes.

## Resolve the application

Locate the plugin root before using its lifecycle command:

```bash
PCG_PLUGIN_ROOT="${PROJECT_CAPABILITY_GOVERNANCE_ROOT:-${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-}}}"
test -n "${PCG_PLUGIN_ROOT}"
```

Use these transitions from the Git root:

```bash
node "${PCG_PLUGIN_ROOT}/scripts/project-capability-manage.mjs" start --root "${PWD}" --proposal <id>
node "${PCG_PLUGIN_ROOT}/scripts/project-capability-manage.mjs" defer --root "${PWD}" --proposal <id> --condition "<revisit condition>"
node "${PCG_PLUGIN_ROOT}/scripts/project-capability-manage.mjs" block --root "${PWD}" --proposal <id> --reason "<verified blocker>"
node "${PCG_PLUGIN_ROOT}/scripts/project-capability-manage.mjs" reopen --root "${PWD}" --proposal <id>
```

Delete the Markdown only after one of these terminal decisions:

- `accepted`: implement the confirmed project capability and observe the stated outcome-level verification.
- `rejected`: obtain explicit human confirmation that the application is unnecessary.
- `duplicate`: merge its useful evidence into the retained application or existing project capability.

```bash
node "${PCG_PLUGIN_ROOT}/scripts/project-capability-manage.mjs" delete --root "${PWD}" --proposal <id> --outcome <accepted|rejected|duplicate>
```

On implementation failure, verification failure, cancellation, missing platform support, or missing authority, keep the application and record a blocker. Never create an archive, tombstone, decision ledger, or processed receipt.

## Verify

- Run targeted verification after the last mutation on each affected host.
- For a Hook, test the target world-state change, a negative case, and a near miss. Hook activation alone is not evidence of effectiveness.
- Confirm no files changed under user-level Claude, Codex, or shared Skill directories.
- Delete an accepted application only after verification succeeds.
