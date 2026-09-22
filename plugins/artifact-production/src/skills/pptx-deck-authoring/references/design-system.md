# Design system

Freeze one semantic system before slide implementation:

- sRGB color roles: `canvas`, `surface`, `textPrimary`, `textSecondary`, `accent`, `success`, `warning`, and `error`.
- Typography roles: `display`, `title`, `section`, `body`, `list`, `caption`, and `numeric`, each with an installed font family, point size, `lineSpacingMultiple`, `paragraphSpaceAfterPt`, `charSpacingPt`, `maxLines`, `scriptPolicy`, horizontal and vertical alignment, and text-box margin. Body and list roles are left/top aligned.
- Spacing: page margin at least 0.3 in, one positive base unit, and an explicit block gap. Paragraph spacing belongs to the typography role and is emitted through PptxGenJS `paraSpaceAfter`.
- Data color: use categorical colors only for distinct peers; sequential lightness for magnitude; diverging colors only around a meaningful midpoint.

Use the content hierarchy to choose layouts; do not repeat a decorative template mechanically. Prefer a dominant visual or evidence object, a compact display title, generous negative space, and alignment to a small grid. Keep the full assertion in the storyboard and make the visual prove it. Use labels, symbols, patterns, or direct annotation in addition to color.

The scaffold calls out brief leakage, formulaic title chains, repeated layouts, centered faux lists, autofit, and decorative connectors as anti-patterns, but listing them is not proof of quality. The probe emits headline, composition, text-rhythm, and page-layout evidence; the independent reviewer decides whether a signal exposes a real problem.

The probe requires at least 4.5:1 contrast for primary and secondary text against canvas and verifies the emitted OOXML for every used semantic text object. Treat 22 pt as the normal body-text floor and use caption text sparingly. Do not use `fit: "shrink"` or `"resize"`; PptxGenJS cannot deterministically apply the later PowerPoint autofit action. For mixed CJK/Latin slides, test both scripts at the declared line spacing and line cap. If brand colors fail contrast, preserve the hue for non-text accents and choose a compliant text role.
