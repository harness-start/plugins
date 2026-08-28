# Work-item normalization

Convert collected evidence into `action → result → impact → evidenceIds`.

- Group related commits or sessions into one work item.
- Do not invent metrics. Qualitative impact with a locator beats a fabricated number.
- Activity-only lines ("worked on X") are not items until they have a result and an evidence id.
- Missing evidence stays a data gap. Do not silently drop the item.
