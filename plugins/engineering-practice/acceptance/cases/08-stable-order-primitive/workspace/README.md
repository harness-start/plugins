# Chain registry contract

`ChainRegistry.combine(...chains)` is the public seam and always returns a plain array. It combines every chain at once, removes duplicates, and preserves each chain's dependencies.

Independent ready stages are emitted in chain declaration order before their successors. A genuine cycle records exactly one warning that identifies the original conflicting chains, for example `cycle in chains: ["first","second"] <> ["second","first"]`, and falls back to unique first-appearance order. The repository's stable ordering utility defines these semantics.
