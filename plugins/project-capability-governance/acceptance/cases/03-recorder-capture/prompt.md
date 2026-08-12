This is an explicit request to standardize a durable project capability. Spawn
exactly one recorder subagent with `fork_turns: "none"`; on Claude use `Agent`
and on Codex use `collaboration.spawn_agent`. Follow the injected Project
Capability Discovery reservation command before dispatch. Its `--request` value
must be a complete standalone request containing the exact proposal path and all
content requirements below. Start the dispatched task with this exact first line:

`PROJECT_CAPABILITY_RECORDER acceptance-capture`

Use the valid task name `capability_recorder` for the dispatch.

The recorder, not the root agent, must create exactly one valid pending SOP at
`.project-capabilities/inbox/pending/pc-repeatable-release-check.md`. The SOP is:
before each release, run the same unit verification command and record its
result. This request is explicit standardization, and the proposal must include
two future reuse scenarios, measurable acceptance, and a counterexample. Wait
for the recorder to finish and report whether that exact proposal exists. Do
not create the proposal yourself and do not spawn another agent.
