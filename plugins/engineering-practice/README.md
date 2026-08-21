# Engineering Practice

`engineering-practice` uses soft, fail-open routing on Claude Code and Codex. `SessionStart` supplies a short overview of the bundled methods. `UserPromptSubmit` suggests one relevant bundled Skill for implementation, read-only review, or verification. It does not register a completion gate or treat Skill loading as proof of an outcome.

| Scenario | Bundled Skill |
|---|---|
| Non-trivial implementation or refactoring | `engineering-judgment` |
| Read-only code review | `engineering-review` |
| Verification before a completion claim | `engineering-verification` |

The router is stateless, does not retain prompts, and emits nothing for malformed or unrelated input. A suggested Skill remains optional; users and agents may perform the task directly. User instructions, project instructions, safety rules, and platform rules take precedence.

Actual completion evidence comes from the requested artifact and fresh outcome-level verification, never from context injection, Skill loading, hook activation, or extra model turns. Review findings still require a severity, an exact `file:line` anchor, concrete evidence, and a verifiable fix or recovery path.

## Sources

- `engineering-judgment`: adapted from MIT-licensed `karpathy-guidelines`; see `licenses/karpathy-guidelines/`.
- `engineering-verification`: adapted from MIT-licensed Superpowers; see `licenses/obra-superpowers/`.
- `engineering-review`: first-party read-only review guidance.
