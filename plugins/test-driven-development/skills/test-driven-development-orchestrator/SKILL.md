---
name: test-driven-development-orchestrator
description: Orchestrate test-first implementation while the plugin Hook independently enforces observed RED and GREEN evidence.
---

# Test-driven development orchestration

Before changing production code, load the required community `test-driven-development` Skill declared in `skill-deps.json`. If it is missing or unreadable, stop this orchestration and report the dependency gap; never reproduce its method from memory.

Use the community Skill to plan the test-first loop. Use this plugin's Hook only as an independent evidence gate: first edit a public-seam test, observe the relevant failure, make the smallest production change, and observe the relevant pass. A Hook activation or state record is not proof that the behavior is correct.
