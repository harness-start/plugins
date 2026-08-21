# Engineering Practice

`engineering-practice` uses soft, fail-open routing on Claude Code and Codex. `SessionStart` supplies a short overview of the bundled methods. `UserPromptSubmit` suggests one relevant bundled Skill for implementation, a high-risk review checkpoint, read-only review, or verification. It does not register a completion gate or treat Skill loading as proof of an outcome.

| Scenario | Bundled Skill |
|---|---|
| Non-trivial implementation or refactoring | `engineering-judgment` |
| High-risk implementation checkpoint or explicit request to summon an engineering critic | `engineering-review-checkpoint` |
| Read-only code review | `engineering-review` |
| Verification before a completion claim | `engineering-verification` |

The router is stateless, does not retain prompts, and emits nothing for malformed or unrelated input. High-risk routing covers cross-module or public-contract work and security, persistence, migration, concurrency, data-integrity, deployment, runtime-state, recovery, and observability risk. A suggested Skill remains optional; users and agents may perform the task directly. User instructions, project instructions, safety rules, and platform rules take precedence.

The checkpoint dispatches at most one generic host-native read-only reviewer and selects one professional lens: `breaker`, then `operator`, then `maintainer`. It does not install or require a platform-specific custom agent. The parent reopens every returned anchor and owns disposition. If no subagent is available, the parent performs a labeled fallback review; that fallback is not independent.

Actual completion evidence comes from the requested artifact and fresh outcome-level verification, never from context injection, Skill loading, hook activation, a Result Card, or extra model turns. Review findings still require a severity, an exact `file:line` anchor, concrete evidence, and a verifiable fix or recovery path.

## Sources

- `engineering-judgment`: adapted from MIT-licensed `karpathy-guidelines`; see `licenses/karpathy-guidelines/`.
- `engineering-verification`: adapted from MIT-licensed Superpowers; see `licenses/obra-superpowers/`.
- `engineering-review`: first-party read-only review guidance.
