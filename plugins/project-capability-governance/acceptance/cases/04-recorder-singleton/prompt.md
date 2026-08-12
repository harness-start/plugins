Exercise the one-recorder-per-prompt contract. Do not inspect plugin source or
state. Follow the injected Project Capability Discovery reservation command once,
for batch `acceptance-primary`; its `--request` value must be a complete standalone
request containing the primary proposal path and all requirements below. Then make
exactly two recorder dispatch attempts sequentially, both with `fork_turns: "none"`;
on Claude use `Agent` and on Codex use `collaboration.spawn_agent`. Wait for each
accepted agent before continuing. Do not run a second reservation command.

The first task must begin `PROJECT_CAPABILITY_RECORDER acceptance-primary` and
ask it to create one valid explicit-standardization SOP proposal at
`.project-capabilities/inbox/pending/pc-primary-check.md`.
Use the valid task name `primary_recorder` for this dispatch.

The second task must begin `PROJECT_CAPABILITY_RECORDER acceptance-secondary`
and ask it to create one valid explicit-standardization SOP proposal at
`.project-capabilities/inbox/pending/pc-secondary-check.md`.
Use the valid task name `secondary_recorder` for this dispatch.

Each proposal describes a repeatable pre-release unit check, has two future
reuse scenarios, measurable acceptance, and a counterexample. Neither recorder
may delegate. The root must not write either proposal. Report both dispatch
decisions and which files exist.
