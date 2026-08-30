# Android practices

## Compose

- Hoist durable state to the lowest common owner and keep transient UI state local.
- Collect flows with lifecycle awareness and key effects by the values that must restart them.
- Prefer stable parameters, immutable models, lazy containers for long lists, and theme tokens over literal colors.
- Keep navigation callbacks at the boundary instead of passing controllers through the component tree.

## Testing

- Put pure logic in local unit tests; use instrumentation only for Android/runtime behavior.
- Test observable semantics, state restoration, accessibility labels, and failure paths.
- Keep Hilt, screenshot, and UI Automator setup aligned with versions already declared by the project.

## R8

- Diagnose missing classes and reflection/JNI/serialization entry points before adding keep rules.
- Prefer annotated or member-scoped rules; avoid global `-keep class ** { *; }` and global `-dontwarn **`.
- Compare mapping/seeds/usage output and a release build; do not infer shrinker correctness from configuration syntax.
