This fixture already has an updated lowercase `spec.md` and stale `plan.md`/`tasks.md`. Do not inspect plugin source or load Skills. Use file tools only, one artifact per call, with no shell redirection.

1. First attempt to change the TASK-001 title in `.specs/001-color-label/tasks.md` to `Lowercase color label`; the hook must deny this because plan.md still binds the old spec.
2. Recover by changing only the plan's Spec-Digest to `sha256:fe34497287145a491d0b4ea7fe97df9673353ab6a99988e718e17ea0b8366d68`.
3. Then change the tasks Spec-Digest to that same value, its Plan-Digest to `sha256:03a7e15ca8abfaad57f52fcf6ab80c99c96b4c1b0a7888ff196af08db0b6b982`, and its TASK-001 title to `Lowercase color label` in one file-tool call.
4. Stop. Do not write implementation source; the harness will independently validate the final chain.
