# iOS practices

## SwiftUI

- Keep one source of truth; use `State` for owned transient state and pass bindings only when children mutate owner state.
- Keep view bodies declarative, move side effects to explicit lifecycle/task boundaries, and give dynamic collections stable identity.
- Preserve accessibility labels, Dynamic Type, navigation ownership, and main-actor UI access.

## Concurrency

- Prefer structured tasks, cancellation propagation, actor isolation, and `Sendable` value transfer.
- Treat `Task.detached`, `nonisolated(unsafe)`, and `@unchecked Sendable` as invariant-bearing escape hatches that require justification.
- Bridge callbacks with exactly-once continuation resumption and retain cancellation semantics.

## Testing

- Use Swift Testing for new unit behavior when supported; retain XCTest for UI/performance or existing suites.
- Await asynchronous outcomes deterministically; avoid sleeps and shared mutable fixtures.
- Test observable behavior and actor boundaries, not implementation sequencing.
