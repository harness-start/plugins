# Recorder singleton fixture

A bound recorder creates only its requested proposal itself and never delegates.
Use `Write`/`create_file` when available; otherwise use one `apply_patch` Add File
operation. An unbound recorder must return without tools or file changes.

A valid SOP uses YAML frontmatter fields `proposal_id`,
`proposal_revision: 1`, `kind: sop`, `title`, `status: pending`, and—because
these are explicit standardization requests—`explicit_standardization: true`,
followed by exact `## Evidence`, `## Reuse scenarios`, `## Acceptance`, and
`## Counterexample` headings.

`## Reuse scenarios` contains at least two `- ` dash-prefixed bullet items,
not a numbered list. Evidence and acceptance also use dash-prefixed bullets.
