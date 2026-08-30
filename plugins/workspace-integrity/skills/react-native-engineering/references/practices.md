# React Native practices

## Performance

- Measure release builds on representative devices; separate JavaScript, UI, native, memory, startup, and bundle evidence.
- Keep render state narrow, use stable list identities, virtualize long lists, and clean up subscriptions/timers.
- Prefer platform-native capabilities and project-compatible libraries over large polyfills.

## Navigation

- Keep route params serializable and typed; own navigation at screen/boundary layers.
- Preserve safe areas, back behavior, deep links, restoration, accessibility, and modal lifecycle.

## Native modules and upgrades

- Treat JavaScript, iOS, Android, Codegen, autolinking, and architecture toggles as one versioned contract.
- Use official/template diffs as evidence, apply them selectively, and preserve repository customizations.
- Validate clean installs, both platform builds, startup, reload, and changed native behavior; never edit generated Codegen output.
