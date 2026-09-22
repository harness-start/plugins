# Presentation v4 to v5 migration

There is no compatibility reader or automatic converter. Preserve the old project separately and migrate source deliberately:

1. Replace every presentation-production schema id with its v5 counterpart. v4 input is rejected; there is no compatibility reader.
2. Add `headline.mode` to every storyboard slide. Use `label`, `finding`, or `question`; a finding also declares its evidence anchor.
3. Add `visual.logic`. Declare groups with encoding and item count, or declare diagram reading direction, topology, node typography roles, and relation path roles. A vertical sequence or branch on 16:9 also needs a direction rationale.
4. Add the `list` typography role and `paragraphSpaceAfterPt`, horizontal/vertical alignment, and margin to every role. Remove `spacing.paragraphGapIn`.
5. Add `tsconfig.json` and `src/text-layout.ts`. Migrate visible text to the scaffolded title, text, list, item, and node names. Replace `paraSpaceAfterPt` with PptxGenJS `paraSpaceAfter`; remove `fit: "shrink"` and `"resize"`.
6. Rebuild the PPTX and rerun lint, render, and probe. Old evidence, reviews, releases, and receipts are invalid.
7. Obtain a new independent v5 review containing seven deck checks and the five hash-bound audits on every page.
