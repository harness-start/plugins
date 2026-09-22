# Presentation v5 to v6 migration

There is no compatibility reader or automatic converter. Preserve the v5 project separately and migrate source deliberately:

1. Replace every `presentation-production` schema id with its v6 counterpart. v5 input is rejected.
2. Remove `directionRationale`. Sequence and branch diagrams must use `left-to-right`; only hierarchy may use `top-to-bottom`.
3. Replace loose body lines and arrow presets with declared native nodes and relations. Keep arrowless decorative dividers explicitly named as `pptx:separator:*`.
4. Convert cross-product claims to the matrix contract with every row-column cell, status, and visible label. Convert option comparisons to shared criteria with one visible value per option and criterion. Use metric logic only for finite numeric values with evidence anchors.
5. Use the v6 semantic helpers for matrix cells, comparison cells, metrics, separators, nodes, and edges. Size text boxes explicitly; automatic-wrap overflow now fails rendered validation.
6. Rebuild and rerun lint, render, and probe. Old evidence, reviews, releases, and receipts are invalid. Resolve every blocking deck signal by changing the deck.
7. Obtain a new independent v6 review containing eight deck checks and six hash-bound audits on every page, including audience coverage and presentation-distance legibility.
