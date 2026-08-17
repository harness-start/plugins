---
name: test-driven-development-orchestrator
description: Orchestrate test-first implementation while the plugin Hook independently enforces observed RED and GREEN evidence.
---

# Test-driven development orchestration

Before changing production code, load this plugin's `tdd-red-green` Skill and follow its red-green-refactor loop.

Use this plugin's Hook only as an independent evidence gate: first edit a public-seam test, observe the relevant failure, make the smallest production change, and observe the relevant pass. A Hook activation or state record is not proof that the behavior is correct.
