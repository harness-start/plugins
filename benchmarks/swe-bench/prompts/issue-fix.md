You are fixing a real open-source GitHub issue inside a local repository checkout.

## Issue

Repository: {{repo}}
Instance ID: {{instance_id}}
Base commit (historical): {{base_commit}}

{{problem_statement}}

## Constraints

- Work only with files in the current workspace.
- Do not use web search, web fetch, external repositories, or package registries.
- Do not attempt to recover future Git history; this checkout has one sealed base commit.
- Before editing production code, add or update a focused regression test and run it to
  observe the intended test failure. Only then edit production code, and rerun the test
  to observe it pass.
- Make the smallest correct production change and run relevant existing tests.
- Leave edits uncommitted so the benchmark runner can collect the patch.

## Success criteria

Resolve the issue without unrelated refactors or edits to benchmark infrastructure.
