---
name: test-driven-development-orchestrator
description: Orchestrate test-first implementation while the plugin Hook enforces that corresponding tests change before implementation.
---

# Test-driven development orchestration

Before changing production code, load this plugin's `tdd-red-green` Skill and follow its red-green-refactor loop.

The Hook only enforces file order against git HEAD. It does not run tests or judge RED/GREEN. First edit a public-seam test, run it and observe the relevant failure, make the smallest production change, then run it again and observe the relevant pass. Hook permission is not proof that the behavior is correct.
