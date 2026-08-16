Create `docs/guide.md` with exactly this Markdown body first (including the
jumped heading from `##` to `####`):

```markdown
# Guide

## Setup

#### Nested

Details here.
```

Use Write or apply_patch only for the first write. When engineering quality
reports the Markdown problem, fix the heading hierarchy so levels increase by
at most one. Keep `Guide`, `Setup`, and `Details`. Finish only after the repaired
file is valid. Quote the hook's bracketed title exactly if one was observed.
