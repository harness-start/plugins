# Web frontend practices

## React

- Derive values during render instead of mirroring them through effects; keep effect dependencies complete.
- Prefer composition, explicit variants, and owner-level state over boolean-prop matrices or duplicated state.
- Separate server and client boundaries deliberately and measure hydration, rerenders, and bundle changes.

## Vue

- Prefer Composition API with `<script setup>` when consistent with the project; keep props down and events up.
- Do not destructure reactive state without preserving reactivity; use Vue Router for production routing.
- Test components by observable behavior and await Vue/Promise queues deterministically.

## Angular

- Preserve standalone/module conventions already in use; use dependency injection and typed reactive boundaries consistently.
- Keep templates declarative, prefer framework routing/forms/testing tools, and avoid manual DOM ownership.

## Shared verification

- Test accessibility semantics, keyboard/focus behavior, error/loading/empty states, and responsive layouts.
- Measure performance before adding memoization; verify production builds and representative browsers for affected behavior.
