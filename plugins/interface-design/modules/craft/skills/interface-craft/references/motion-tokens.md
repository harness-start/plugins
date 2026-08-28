# Motion tokens

Use existing project motion tokens first. Match by usage, not by choosing the numerically nearest duration or curve. A close number with the wrong interaction purpose is not a valid substitution.

If the project has no motion scale, propose the following semantic fallback roles in its existing token syntax; do not inject a second token namespace without need.

| Role | Fallback | Intended usage |
| --- | --- | --- |
| `motion-duration-micro` | `80ms` | press feedback, path or tooltip delay |
| `motion-duration-quick` | `150ms` | repeated feedback and exits |
| `motion-duration-standard` | `250ms` | popover, dialog, tab, and position changes |
| `motion-duration-emphasis` | `400ms` | rare orientation or completion moments |
| `motion-ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | direct manipulation and entrances |
| `motion-ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | reversible state changes |
| `motion-distance-small` | `4px` | text or compact feedback |
| `motion-distance-medium` | `8px` | popover, toast, or panel orientation |
| `motion-scale-press` | `0.98` | pointer press feedback |
| `motion-scale-surface` | `0.96` | surface entrance when scale conveys depth |

Entrances and exits may use different roles: exits are usually quick because the user has already oriented. Repeated interactions must be interruptible and converge on the latest state. Preserve the current rendered value when reversing rather than restarting from the original endpoint.

For `prefers-reduced-motion: reduce`, remove nonessential travel, scale, blur, parallax, and autoplay. Keep immediate opacity or state confirmation when it is necessary to understand the result. Token presence alone does not prove reduced-motion behavior or motion quality.
