---
name: test-driven-development-orchestrator
description: "Orchestrate test-first implementation with observed RED and GREEN evidence while the plugin Hook provides an advisory reminder."
---

# Test-driven development orchestration

## When to use

- Orchestrate test-first implementation with observed RED and GREEN evidence.

## Constraints

- Stay inside this Skill's documented boundary.

Before changing production code, load this plugin's `tdd-red-green` Skill and follow its red-green-refactor loop.

The Hook injects a short SessionStart reminder. It does not enforce file order, infer correspondence between tests and implementation, run tests, or judge RED/GREEN. First edit a public-seam test, run it and observe the relevant failure, make the smallest production change, then run it again and observe the relevant pass. The observed test results are the evidence. Skill load is not a Hook prerequisite.
