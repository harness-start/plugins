# Writing Chinese Prose Benchmark Archive

This maintainer-only corpus was moved out of
`plugins/professional-writing/skills/writing-chinese-prose/` so published
plugins do not ship blind inputs, target answers, issue-specific examples, or
benchmark-only instructions.

The Markdown files preserve the prior corpus and scoring notes. `run-eval.md`
describes the original evaluation harness, including `automation/eval/`
commands that are not part of this repository. Treat that runner as historical
documentation unless a repository-owned harness is added and verified.

Changes to the published Skill must be evaluated with synthetic,
responsibility-oriented acceptance cases. This archive must not be copied into
a plugin package or consumer Skill directory.
