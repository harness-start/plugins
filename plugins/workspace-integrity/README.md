# workspace-integrity

`workspace-integrity` protects the representation and mutation boundaries of a working tree. It catches unsafe shell patterns before execution, protects generated or dependency-owned files, checks source encoding and backup artifacts, and applies narrow domain-aware mutation guards without publishing a language-skill encyclopedia.

## Purpose

Many agent failures are independent of the requested feature: rewriting a lockfile with the wrong package manager, mutating a generated artifact directly, creating backup debris, introducing invalid UTF-8, or using a masked shell command that bypasses review. This owner provides one predictable integrity floor for Claude Code and Codex.

## Design

The owner dispatches Hook events in process to implementations under `src/domains/`. Generic responsibilities are owned by `commands`, `source`, and `quality`. Domain mutation guards are implemented by `android`, `go`, `ios`, `java`, `kubernetes`, `nix`, `php`, `python`, `react-native`, `rust`, and `web`. Every domain shares the owner's Hook, Skill, test, acceptance, license, and build boundaries.

Domain guards classify protected paths and dangerous mutation shapes before a write, and selected bounded source scans can report findings after an observed mutation. They do not run automatic language lint or format workflows after every edit. Their bundled engineering Skills remain available from this owner without becoming Hook prerequisites. Installing the owner activates all protections; there are no capability profiles.

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

At `PreToolUse`, the dispatcher invokes matching domain and generic handlers. Any deterministic deny is returned immediately; advisory contexts can be combined. The quality handler projects direct `Write`, `Edit`, `MultiEdit`, and `apply_patch` content so a predictable line-budget violation is denied before mutation. At `PostToolUse`, the domain scans plus `commands`, `quality`, and `source` perform bounded checks on observed writes. A post-write line-budget finding is report-only because the completed operation cannot be undone; unpredictable shell writes therefore do not carry a hard pre-write guarantee. Instead, an observed violation creates session debt and the `Stop` Hook requires the file to be reduced or split before completion. A Skill name is never a prerequisite for enforcement.

Path extraction covers host file tools, patches, moves, redirects, and common shell writers. Each module is scoped to evidence in the current tool call and repository; the presence of a language file elsewhere does not authorize broad automatic workflows.

## Public interfaces

The public Skills include configuration and diagnosis methods plus the domain engineering references bundled with this owner. The configuration Skills are:

- `command-safety-config` for `.command-safety.mjs`;
- `source-integrity-config` for `.source-integrity.mjs`;
- `engineering-quality-config` for `.engineering-quality.mjs`.

Domain Skills include Android, Go, iOS, Java, Kubernetes, Nix, PHP, Python, React Native, Rust, and web engineering methods under `skills/`. This owner exposes no public CLI or MCP server. Its runtime interface is the platform-specific Hook manifest plus the three project configuration files above.

## Configuration and state

Project-owned JavaScript configuration can add narrow path rules, change supported check modes, and tune bounded thresholds. `commands` may keep session-local escalation state; `source` and `quality` analyze the observed target or content and do not create a second language workflow state machine. Invalid configuration entries are rejected or ignored according to each module's schema while built-in protections remain available.

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
