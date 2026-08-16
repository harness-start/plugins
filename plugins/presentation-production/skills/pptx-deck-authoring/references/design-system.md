# Design system

Freeze one semantic system before slide implementation:

- sRGB color roles: `canvas`, `surface`, `textPrimary`, `textSecondary`, `accent`, `success`, `warning`, and `error`.
- Typography roles: `display`, `title`, `section`, `body`, `caption`, and `numeric`, each with an installed font family and point size.
- Spacing: page margin at least 0.3 in, one positive base unit, and consistent block gaps.
- Data color: use categorical colors only for distinct peers; sequential lightness for magnitude; diverging colors only around a meaningful midpoint.

Use the content hierarchy to choose layouts; do not repeat a decorative template mechanically. Prefer a dominant visual or evidence object, a short assertion title, generous negative space, and alignment to a small grid. Use labels, symbols, patterns, or direct annotation in addition to color.

The probe requires at least 4.5:1 contrast for primary and secondary text against canvas. Treat 22 pt as the normal body-text floor and use caption text sparingly. If brand colors fail contrast, preserve the hue for non-text accents and choose a compliant text role.
