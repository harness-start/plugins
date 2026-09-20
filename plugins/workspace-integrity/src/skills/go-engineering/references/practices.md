# Go practices

- Keep package APIs small; accept interfaces at consumer boundaries and return concrete types by default.
- Wrap errors with operation context while preserving `errors.Is` and `errors.As` behavior.
- Make goroutine ownership, cancellation, channel closure, and shutdown order explicit.
- Avoid shared mutable state when message passing or ownership transfer is simpler.
- Prefer table-driven tests for repeated behavior and add race testing when concurrency changes.
- Generate mocks/code through project commands and verify the generated diff rather than editing it directly.
