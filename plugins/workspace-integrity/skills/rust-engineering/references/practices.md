# Rust practices

## Ownership and APIs

- Model invalid states out with enums/newtypes; borrow when ownership transfer is unnecessary.
- Accept slices and `str` at read-only boundaries, return explicit domain errors, and preserve error sources.
- Treat public API, MSRV, features, and serialization shape as compatibility contracts.

## Async and concurrency

- Keep task ownership and cancellation explicit; do not hold blocking or synchronous locks across `.await`.
- Bound channels and concurrency where load can grow; propagate shutdown and join failures.

## Unsafe and performance

- Minimize every unsafe region and document the `SAFETY:` invariant immediately nearby.
- Test unsafe assumptions with focused tests and Miri when available; review manual `Send`/`Sync` separately.
- Measure before optimizing; avoid unnecessary allocation/collection in proven hot paths.

## Testing

- Use unit tests for local invariants, integration tests for public behavior, properties for algebraic/state-space behavior, and benchmarks only for stable performance questions.
