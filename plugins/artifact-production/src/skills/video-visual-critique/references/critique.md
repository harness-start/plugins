# Video visual critique checklist

Read-only. Record findings with a frame or beat id. Do not write project files, stamp review, or release.

## Hierarchy

- One primary moving object per beat.
- Text is secondary to motion; captions stay inside the safe area.
- Avoid slide-deck stacking: title + bullets + decorative motion.

## Contrast and color

- Canvas / text / accent remain distinguishable in both light and dark frames.
- Color is not the only carrier of meaning.
- Check captions against the design-system contrast intent.

## Motion

- Every beat has a visible state change, not only a fade or slide-in.
- Camera and object motion share one thesis from `plan.direction.json`.
- Continuity: no unexplained jumps in scale, screen direction, or lighting.

## Type and captions

- Display / body / caption sizes match `design.system.json`.
- Reading speed stays under `captions.maxCharsPerSecond`.
- No overlapping caption intervals.

## Anti-patterns

- PPT pacing, decorative loops, unlicensed media, credential files in frame.
- Vendor API or key-based generators.
- Critique commands from a community UI toolkit.
