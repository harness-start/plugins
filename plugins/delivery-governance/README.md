# delivery-governance

`delivery-governance` covers the transition from a changed working tree to a safely delivered result. It governs Git mutation boundaries, explicit CI-gated merge-request delivery, history-preserving repository extraction, and Kubernetes operational work.

## Purpose

Delivery failures occur at boundaries that ordinary code generation does not own: accidental bulk staging, unresolved conflict markers, an unapproved worktree, stale CI evidence, force-pushed history, or a repository split that loses commits. This plugin groups those responsibilities by delivery outcome rather than by programming language.

## Design

Three private runtime modules live under `modules/`: `git`, `ci`, and `history`. `git` owns always-relevant repository mutation checks. `ci` owns an explicitly invoked merge-request state machine and remote evidence requirements. `history` owns a sealed preflight/execute protocol that keeps the source repository unchanged while creating a filtered target.

Kubernetes operational methods are bundled as public Skills because they belong to deployment and delivery; the related mutation-integrity Hook remains in `workspace-integrity`. Installing this owner enables its whole surface for Claude Code and Codex; there are no capability profiles.

## Capabilities

| Area | Module or Skill | Capability |
| --- | --- | --- |
| Git safety | `git` | Rejects dangerous bulk pathspecs, unsolicited worktrees, protected receipt writes, unsafe conflict-marker states, and invalid commit boundaries |
| CI-gated delivery | `ci` | Explicit review/CI/default-branch supervision with current-head evidence and SHA-bound merge/push authorization |
| History migration | `history` | Preflight sealing, selected-path filtering, source immutability checks, target isolation, verification, and recovery receipts |
| Kubernetes delivery | `kubernetes-operations`, `kubernetes-operations-playbook` | Manifest/Helm operational method, workload hardening, rollout diagnosis, resource and API-drift guidance |

Configuration and orchestration Skills include `git-delivery-config`, `ci-gated-mr-workflow`, and `repository-history-migration`.

## When to use it

Use it when preparing commits, resolving merge boundaries, creating an explicitly requested worktree, supervising a merge request through review and CI, extracting selected paths into a new repository with history, or designing/reviewing Kubernetes delivery changes. It is most valuable when remote state, branch identity, or history preservation is part of acceptance.

## When not to use it

Do not invoke the CI workflow for every ordinary code change; it is intentionally explicit-only. Do not use history migration for a normal file copy, a same-repository move, or an import where history is deliberately discarded. Do not treat Kubernetes guidance as proof that a live cluster is healthy. Source-code correctness and test-first development belong to `engineering-workflow`.

## Runtime behavior

`PreToolUse` classifies Git, CI, and migration commands before they run. `UserPromptSubmit` records explicit worktree intent for the Git module. `PostToolUse` checks observable repository outcomes such as conflict state and delivery receipts. Remote delivery actions require evidence bound to the current head rather than a plausible SHA appearing elsewhere in text.

History migration uses a two-stage protocol: preflight records the clean source head, plan digest, filter version, include paths, and isolated target; execute rejects stale seals before creating the target. Temporary filtering failure leaves the source unchanged and removes only the operation's own temporary clone.

## Public interfaces

The public deterministic CLI is:

```bash
node "${PLUGIN_ROOT}/dist/cli/harness.mjs" migration preflight [arguments]
node "${PLUGIN_ROOT}/dist/cli/harness.mjs" migration execute [arguments]
```

The `migration` resource is the only public CLI resource. Git, CI, and Kubernetes open-ended work is entered through the bundled Skills listed above. There is no public MCP server.

## Configuration and state

Git delivery rules can be configured through `.git-delivery.mjs` and `commit-boundaries.json` using `git-delivery-config`. CI workflow state is repository-local and binds observed remote evidence to the current revision. Migration plans and seals are explicit input/output artifacts rather than implicit global state. Host credentials for GitHub, GitLab, or Kubernetes are never installed or authenticated by this plugin.

## Boundaries

Hooks observe commands and repository state available to the host; they do not grant remote permissions, approve a merge, or guarantee that a deployment succeeded. CI evidence can become stale after the head changes. A history receipt proves the performed filter inputs and results, not organizational approval to publish the target. Kubernetes recommendations still require cluster-specific authorization, dry runs, and rollout observation.

## Verification

```bash
node --import tsx --test \
  plugins/delivery-governance/tests/*.test.ts \
  plugins/delivery-governance/modules/*/tests/*.test.ts
npm run check:dist
```

Live acceptance must use `./scripts/acceptance/run.sh --plugin delivery-governance` so both hosts execute inside the mandated Docker environment.
