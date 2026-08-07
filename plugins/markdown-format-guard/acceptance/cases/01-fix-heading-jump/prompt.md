Create `docs/guide.md` with exactly this Markdown body first (including the
jumped heading from `##` to `####`):

```markdown
# Guide

## Setup

#### Nested

Details here.
```

Use Write or apply_patch only for the first write. When the markdown format
guard reports the problem, follow its recovery instructions and fix the
heading hierarchy so levels increase by at most one (for example change
`#### Nested` to `### Nested`). Keep the title `Guide`, section `Setup`, and
the word `Details`. Finish only after the repaired file is valid. In the final
response, quote the hook's bracketed title exactly as it appeared in the real
hook message; do not invent a title if no hook message was observed.
