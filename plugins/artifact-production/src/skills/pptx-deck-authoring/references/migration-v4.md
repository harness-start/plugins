# Presentation v4 migration

There is no compatibility reader or automatic converter. Preserve the old project separately and migrate source deliberately:

1. Replace every presentation-production schema id with its v4 counterpart.
2. Replace the audience string with `primary`, `context`, `desiredAction`, and `addressing`. Add `explicitRationale` only when `addressing` is `explicit`.
3. Rename storyboard and manifest `title` to `displayTitle`, keep it on one line and within 20 display-width units, and retain the full claim in `assertion`.
4. Replace free-form `visualType` with `visual.type` and optional `variant`. Move SVG diagram metadata into `visual` with `mode: "svg"`.
5. For native relationship diagrams, declare nodes and relations and name the rendered title, nodes, edge segments, and break markers with the scaffolded `pptx:*` protocol.
6. Add `src/semantic-layout.ts`, rebuild the PPTX, and rerun lint, render, and probe. Old evidence, reviews, releases, and receipts are invalid.
7. Obtain a new independent v4 review containing all five required quality checks before release.
