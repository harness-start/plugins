# workspace-integrity

`workspace-integrity` protects the representation and mutation boundaries of a working tree. It catches unsafe shell patterns before execution, protects generated or dependency-owned files, checks source encoding and backup artifacts, and applies narrow domain-aware mutation guards without publishing a language-skill encyclopedia.

Runtime logs from adb, Docker, Kubernetes, and journald must cross the bundled redaction boundary before their output reaches a host session:

```sh
adb logcat -d | node "$PLUGIN_ROOT/dist/cli/harness.mjs" logs sanitize
```

Bound the producer query first. The sanitizer redacts common credential assignments, bearer tokens, and URL passwords and rejects input larger than 16 MiB.

## Purpose

Many agent failures are independent of the requested feature: rewriting a lockfile with the wrong package manager, mutating a generated artifact directly, creating backup debris, introducing invalid UTF-8, or using a masked shell command that bypasses review. This owner provides one predictable integrity floor for Claude Code and Codex.

## Design

The owner dispatches Hook events in process to implementations under `src/domains/`. Generic responsibilities are owned by `commands`, `source`, and `quality`. Domain mutation guards are implemented by `android`, `go`, `ios`, `java`, `kubernetes`, `nix`, `php`, `python`, `react-native`, `rust`, and `web`. Every domain shares the owner's Hook, Skill, test, acceptance, license, and build boundaries.

Domain guards classify protected paths and dangerous mutation shapes before a write, run bounded deterministic validators after an observed mutation, and report selected semantic risks. Advisory checks can be set to `report` or `off`; a project configuration that requests `block` is clamped to `report`. Deterministic checks support `block`, `report`, and `off`. The bundled engineering Skills remain available without becoming Hook prerequisites. Installing the owner activates all protections; there are no capability profiles.

## Capabilities

| Area | Modules | What is protected |
| --- | --- | --- |
| Shell and command safety | `commands` | Destructive or opaque shell mutations, masked verification, sensitive reads, and project-defined allow/deny/report rules |
| Source representation | `source` | Backup artifacts, garbled replacement characters, BOMs, invalid UTF-8, and path-specific overrides |
| Shared quality floor | `quality` | Source-file line budgets and deterministic Markdown structure checks |
| Mobile and Apple projects | `android`, `ios`, `react-native` | Generated project files, dependency locks, manifests, and framework-specific mutation boundaries |
| Backend and systems languages | `go`, `java`, `php`, `python`, `rust` | Language-specific generated files, locks, metadata, and bounded protected targets |
| Web projects | `web` | Frontend package targets and lock ownership while yielding React Native-specific targets to its module |
| Declarative operations | `kubernetes`, `nix` | Helm/Kubernetes dependency state, manifests, and Nix-generated or lock-owned paths |

## When to use it

Use it for any repository where agents can run shell commands or modify source. It is particularly valuable in polyglot workspaces, generated-code projects, mobile repositories, package-managed applications, infrastructure repositories, and teams that want a common command/source integrity contract before domain workflows begin.

## When not to use it

Do not use it as a substitute for project tests, compiler checks, security scanning, code review, or a language IDE. It does not promise to lint or format every supported language, teach language engineering, or validate arbitrary business semantics. Kubernetes operational methods are exposed by `delivery-governance`; this owner only applies the matching workspace integrity protections.

## Runtime behavior

At `PreToolUse`, one aggregate domain route invokes all matching policies alongside the generic handlers. Any deterministic deny is returned immediately; advisory contexts can be combined. The quality handler projects direct `Write`, `Edit`, `MultiEdit`, and `apply_patch` content so a predictable line-budget violation is denied before mutation. At `PostToolUse`, domain validators and scans plus `commands`, `quality`, and `source` inspect observed writes. A blocking deterministic domain finding creates plugin-data debt keyed by workspace, session, policy, check, and path. `Stop` revalidates that debt and blocks completion while the file is still invalid or cannot be verified. While debt remains, `PreToolUse` also denies unrelated actions but allows direct repair or deletion of the affected path, covering hosts that do not emit `Stop` before a completion attempt. A clean rerun or deletion clears the debt. Persistence fails open when session/plugin-data identity is unavailable, while the immediate post-write check still runs. `stop_hook_active` retries do not loop. A Skill name is never a prerequisite for enforcement.

Path extraction covers host file tools, patches, moves, redirects, and common shell writers. Each module is scoped to evidence in the current tool call and repository; the presence of a language file elsewhere does not authorize broad automatic workflows.

## Public interfaces

The public catalog is intentionally compact: ten implicit domain entry Skills for Android, Go, iOS, Java, Nix, PHP, Python, React Native, Rust, and web engineering, plus the explicit-only `workspace-integrity-config` Skill. Specialized framework, testing, migration, and performance methods are progressive references inside their owning domain entry instead of independently discoverable Skills. Kubernetes operating methods remain owned by `delivery-governance`; this owner retains only the Kubernetes integrity Hook policy.

`workspace-integrity-config` covers the existing `.command-safety.mjs`, `.source-integrity.mjs`, `.engineering-quality.mjs`, and domain `.*-engineering.mjs`/`.kubernetes-operations.mjs` files without renaming or merging their runtime schemas. The public `logs` CLI resource exposes only the deterministic `sanitize` action through `dist/cli/harness.mjs`; this owner exposes no MCP server.

## 2.0 Skill migration

Version 2.0 removes specialist Skill aliases. Android Compose/testing/R8 methods now live under `android-engineering`; SwiftUI/concurrency/testing under `ios-engineering`; Spring/JUnit/Jakarta under `java-engineering`; React Native navigation/performance/upgrades under `react-native-engineering`; Rust rules under `rust-engineering`; and React/Vue/Angular methods under `web-frontend-engineering`. The former three configuration Skills map to `workspace-integrity-config`. Kubernetes methods must be invoked from `delivery-governance`; only its integrity policy remains here.

## Configuration and state

Project-owned JavaScript configuration can add narrow path rules, change supported check modes, and tune bounded thresholds. `commands` may keep session-local escalation state; `quality` and deterministic domain checks can keep completion debt under host-provided plugin data. Invalid configuration entries are rejected or ignored according to each module's schema while built-in protections remain available.

## Boundaries

Hooks can constrain only tool activity visible to Claude Code or Codex; they are not an operating-system sandbox. A denied write proves that a known unsafe shape was stopped, while an allowed write does not prove correctness. Domain handlers intentionally cover mutation integrity rather than comprehensive language enforcement. Generated-file ownership and lockfile rules still depend on recognizable project evidence and cannot infer undocumented custom generators.

## Verification

```bash
node --import tsx --test \
  plugins/workspace-integrity/tests/*.test.ts \
  plugins/workspace-integrity/tests/domains/**/*.test.ts
npm run check:dist
```

Run live dual-host cases only through `./scripts/acceptance/run.sh --plugin workspace-integrity`, which applies the mandatory Docker host-acceptance policy.
