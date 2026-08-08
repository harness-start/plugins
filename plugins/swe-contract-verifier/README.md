# SWE Contract Verifier

This plugin closes two common SWE repair gaps after the final source mutation:

- a standalone relevant test command must succeed;
- a fresh, read-only subagent must independently review the issue contract and boundary matrix.

The reviewer report covers normal behavior, empty/zero input, boundaries, error behavior, and regression scope. A later source edit invalidates both receipts. State is stored in host plugin data, not in the candidate repository.

The workflow is intentionally narrower than the public skills that informed it. It adopts fresh-evidence discipline from [Superpowers verification-before-completion](https://github.com/obra/superpowers/tree/main/skills/verification-before-completion), independent review from [Superpowers subagent-driven-development](https://github.com/obra/superpowers/tree/main/skills/subagent-driven-development), and boundary review dimensions from [Addy Osmani's code-review-and-quality](https://github.com/addyosmani/agent-skills/tree/main/skills/code-review-and-quality). It does not import their plan, worktree, commit, or multi-model workflow into sealed SWE runs.

Use it with `verification-provenance-guard`: this plugin proves that review and testing happened after the final edit; the provenance plugin validates the claims made in the final response.

## Verification

```bash
node --test plugins/swe-contract-verifier/tests/*.test.mjs
```
