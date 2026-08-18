# Motion

Use motion only when it explains a state change, preserves spatial continuity, confirms input, or directs attention.

- Choose at most one authored entrance or transition moment for the surface. Routine feedback should stay quiet and immediate.
- Prefer transform and opacity so movement does not trigger avoidable layout work.
- Keep feedback short, interruption transitions bounded, and repeated interactions faster than first-time orientation.
- Preserve focus, input, scroll position, and reading order through animated state changes.
- Implement `prefers-reduced-motion: reduce` as a meaningful alternative: remove travel and autoplay, keep essential state confirmation, and avoid replacing motion with flashing.
- Verify motion at realistic content sizes and under rapid repeated input. Animation must not hide loading, error, or completion state.

Decorative motion is not a substitute for hierarchy. If removing an animation changes no understanding or feedback, omit it.
