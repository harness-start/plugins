# engineering-workflow

`engineering-workflow` owns durable, language-independent workflows for changing software: evidence-first debugging, specification-driven delivery, and test-first implementation. It provides both agent methods and mechanical gates so a workflow can survive a long session or resume from repository artifacts.

## Purpose

General engineering advice is not enough when a failure needs a reproducible causal record, a large change needs traceable requirements, or a behavior change must demonstrate RED before implementation. This plugin turns those situations into explicit workflows while leaving ordinary feature work and simple edits unencumbered.

## Design

Three private modules live under `modules/`: `debugging`, `specification`, and `testing`. Skills own diagnosis, planning, task decomposition, and red/green judgment. Hooks own only mechanically verifiable constraints such as binding an active debug ledger, protecting workflow artifacts, enforcing specification order, and requiring a corresponding test change before an implementation write.

The owner exposes one public dispatcher and one unified deterministic CLI. Installing it enables the complete Hook and Skill surface for Claude Code and Codex; there are no capability profiles or language-specific branches.

## Capabilities

| Module | Capability | Durable artifact or gate |
| --- | --- | --- |
| `debugging` | Reproduction, hypothesis tracking, root-cause evidence, multi-bug isolation, attempt receipts, pause/resume, and completion checks | Append-only `.debug-workflow` ledger and a session lease |
| `specification` | Specify → plan → tasks → build progression with digest freshness and requirement traceability | `.specs` artifacts and ordering/freshness validation |
| `testing` | Test-first orchestration and source-write order enforcement | Corresponding test must change before a behavior-changing implementation target |

Public Skills include `debug-workflow`, `sdd`, `sdd-specify`, `sdd-plan`, `sdd-tasks`, `sdd-build`, `tdd-red-green`, and `test-driven-development-orchestrator`.

## When to use it

Use `debugging` for a concrete error, failing test, regression, flaky behavior, performance fault, or a resumable bug investigation. Use `specification` when a change spans several requirements or modules and needs durable intent, plan, tasks, and verification recipes. Use `testing` when the public behavior has a stable test seam and implementation should be driven by an observed RED/GREEN loop.

## When not to use it

Do not start the debug workflow for speculative review, feature design, a production incident that still needs containment, or a conceptual explanation. Do not create SDD artifacts for a one-line mechanical change with an obvious oracle. Do not force TDD onto generated files, pure documentation edits, or work without a meaningful public test seam. Engineering review and general completion discipline belong to `session-governance`.

## Runtime behavior

`SessionStart` reports resumable debug/testing context. `PreToolUse` protects debug and specification ledgers and enforces test-before-source ordering. `PostToolUse` records observed debug receipts and advances specification evidence; failures remain visible to the debug state. `Stop` blocks only an activated debug workflow whose declared completion evidence is incomplete.

Installing the plugin does not automatically open a debug ledger or create `.specs`. Hard workflow behavior is activated by durable project artifacts and official writer commands, not by mentioning a Skill name or merely loading a Skill.

## Public interfaces

The public CLI protocol is:

```bash
node "${PLUGIN_ROOT}/dist/cli/harness.mjs" <resource> <action> [arguments]
```

Resources:

- `debug`: forwards actions such as `init`, `activate`, `claim`, `affect`, `add-bug`, `pause`, `resume`, `status`, `close`, and `abort` to the debug ledger writer;
- `spec`: exposes `check` to validate the current specification artifacts.

Skills remain the normal entrypoint for open-ended work; the CLI is the deterministic writer/validator seam used by Skills, users, and Hooks.

## Configuration and state

The debug workflow stores repository-owned ledgers under `.debug-workflow` and binds active work to a session/epoch lease. Specification state lives in `.specs` and uses content digests to detect stale downstream artifacts. The testing module derives correspondence from repository paths, imports, symbols, and Git changes rather than keeping a separate task database. Module-specific project configuration can tune supported patterns without introducing a language profile.

## Boundaries

The Hooks can prove ordering, artifact validity, observed command outcomes, and current digest relationships. They cannot prove that a hypothesis is scientifically sound, that a failing test fails for the intended reason, or that a passing suite covers all behavior. The parent agent must interpret RED/GREEN and root-cause evidence. Generated or unobservable mutations remain outside the host Hook boundary.

## Verification

```bash
node --import tsx --test \
  plugins/engineering-workflow/tests/*.test.ts \
  plugins/engineering-workflow/modules/*/tests/*.test.ts
npm run check:dist
```

Live Claude Code and Codex acceptance uses `./scripts/acceptance/run.sh --plugin engineering-workflow` and therefore runs in Docker.
