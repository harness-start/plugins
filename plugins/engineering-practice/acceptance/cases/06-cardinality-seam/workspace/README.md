# Pipeline combination contract

`Pipeline.combine(...groups)` is the public combination seam. It accepts zero or more stage groups, removes duplicates, and preserves every ordering constraint explicitly present within a group. Previously accepted two-group calls remain valid. Independent stages must not create conflict warnings; genuinely opposite constraints do.

`Pipeline.stages` combines all constructor groups with that same public seam.
