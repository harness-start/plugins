# Motion

Use motion only when it explains a state change, preserves spatial continuity, confirms input, or directs attention.

Decide in this order:

1. **Necessity** — if removal changes no understanding, continuity, confirmation, or attention, omit it.
2. **Purpose and frequency** — repeated controls stay faster and quieter than first-time orientation or rare completion moments.
3. **Tool** — use the cheapest mechanism already present in the project. Do not add a library for a transition CSS can express.
4. **Properties** — prefer transform and opacity; enumerate properties and never use `transition: all`.
5. **Timing** — map the use to existing semantic tokens first. If none exist, use [Motion tokens](motion-tokens.md); do not replace values by numerical proximity alone.
6. **Interruption, reversal, and exit** — rapid repeated input must converge on current state without stale timers or stranded closing classes. Do not use `setTimeout` or `setInterval` to guess when a CSS transition finishes. Prefer a CSS state model that needs no JavaScript cleanup. If cleanup is essential, use `transitionend`, filter the event by target and property, re-read the current desired state before cleanup, and replace or detach stale listeners when direction reverses. Exit may be shorter, but it must remain perceivable.
7. **Accessibility** — preserve focus, input, scroll position, and reading order. Implement `prefers-reduced-motion: reduce` as a meaningful alternative: remove travel and autoplay, keep essential state confirmation, and avoid flashing.
8. **Verification** — test realistic content, first open, close, immediate reopen, keyboard input, pointer input, and reduced motion.

Choose at most one authored entrance or transition moment for a surface. Routine feedback stays quiet and immediate. Use [Motion recipes](motion-recipes.md) for common interaction shapes, not as a requirement to animate them.

Decorative motion is not a substitute for hierarchy. If removing an animation changes no understanding or feedback, omit it.

Reduced motion must not depend on a transition event that may never fire. The no-motion path must reach its final accessible state immediately.
