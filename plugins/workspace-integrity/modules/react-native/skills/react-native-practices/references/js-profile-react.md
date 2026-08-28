---
title: Profile React Performance
impact: MEDIUM
tags: profiling, devtools, re-renders, flamegraph
---

# Skill: Profile React Performance

Identify unnecessary re-renders and performance bottlenecks with the React Native DevTools Profiler. This workflow is self-contained: it uses the app's existing Metro/Dev Menu entry and accepts exported profiler data when the agent cannot inspect the visual UI.

## When to Use

- App interactions feel sluggish or janky.
- A list, form, or navigation transition appears to render too often.
- A proposed memoization, compiler, or state-management change needs evidence.

## Prerequisites

- The app runs in development mode and can open React Native DevTools from Metro (`j`) or the Dev Menu.
- React Native DevTools is compatible with the app's React and React Native versions.
- Release-build profiling uses [`@callstack/inspector`](https://github.com/callstackincubator/inspector#inspector) only when the project explicitly adopts it.

## Record a Bounded Session

1. Open React Native DevTools and select the Profiler tab.
2. Start recording immediately before the exact interaction under review.
3. Perform that interaction once with a documented starting state.
4. Stop recording immediately afterward.
5. Record commit times, re-render counts, slow components, and the heaviest commit.
6. Export the profile when another agent must inspect it. If export or visual access is unavailable, ask the user for those concrete measurements and mark the gap; do not infer a result.

For a release app, install and connect `@callstack/inspector` only with project approval:

```bash
npm install @callstack/inspector
npx inspector start
```

Import it as the first module in the app entrypoint, wrap Metro config with `withInspector(config, true)`, then build and run the release app. Expo Go is not a release-build profiling target.

## Analyze Results

Use the flame graph, ranked chart, component chart, and exported profile to answer:

- Which commit exceeded the interaction budget?
- Which components rendered, how many times, and for what recorded reason?
- Did props, state, context, or a parent render cause the expensive commit?
- Is the same pattern present in a production or release-like build when timing matters?

| Symptom | Likely cause to verify | Candidate response |
|---|---|---|
| Cascading component renders | State or context is broader than the interaction | Move state down or split the subscription |
| Callback props change every commit | Inline callback identity matters in this measured path | Use `useCallback` only if the evidence supports it |
| One component dominates commit time | Heavy synchronous render work | Reduce work or defer non-urgent computation |
| Long JS task outside React commits | Non-React CPU work | Use the platform CPU profiler instead |

Only propose callback, dependency-array, memoization, or compiler changes when the profile or a reproducible bug shows they matter. Component-tree depth and count are secondary context, not the baseline.

## Common Pitfalls

- Profiling a different flow than the reported problem.
- Comparing development timing directly with release timing.
- Treating a screenshot of the flame graph as sufficient without component names and durations.
- Claiming improvement without repeating the same interaction and measurement after the change.

## Related References

- [js-react-compiler.md](./js-react-compiler.md) - Automatic memoization
- [js-atomic-state.md](./js-atomic-state.md) - Narrow state subscriptions
- [js-bottomsheet.md](./js-bottomsheet.md) - Bottom-sheet callback re-renders
- [js-measure-fps.md](./js-measure-fps.md) - Frame-rate evidence
