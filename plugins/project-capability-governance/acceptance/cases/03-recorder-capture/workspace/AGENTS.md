# Recorder capture fixture

- The root dispatches exactly one recorder and never writes the proposal.
- A spawned recorder whose task starts with `PROJECT_CAPABILITY_RECORDER` must
  create the requested proposal itself. It must not delegate or spawn another
  agent. Use `Write`/`create_file` when available; otherwise use one
  `apply_patch` Add File operation.
- A valid SOP uses YAML frontmatter fields `proposal_id`,
  `proposal_revision: 1`, `kind: sop`, `title`, `status: pending`, and—because
  this is an explicit standardization request—`explicit_standardization: true`,
  followed by exact `## Evidence`, `## Reuse scenarios`, `## Acceptance`, and
  `## Counterexample` headings.
- `## Reuse scenarios` contains at least two `- ` dash-prefixed bullet items,
  not a numbered list. Evidence and acceptance also use dash-prefixed bullets.
