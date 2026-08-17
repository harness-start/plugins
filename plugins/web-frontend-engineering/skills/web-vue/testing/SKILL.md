---
name: vue-testing-best-practices
version: 1.0.0
license: MIT
author: github.com/vuejs-ai
description: Use for Vue.js testing. Covers Vitest, Vue Test Utils, component testing, mocking, testing patterns, and Playwright for E2E testing.
---

Vue.js testing best practices, patterns, and common gotchas.

### Testing
- Setting up test infrastructure for Vue 3 projects → See [testing-vitest-recommended-for-vue](testing-vitest-recommended-for-vue.md)
- Tests keep breaking when refactoring component internals → See [testing-component-blackbox-approach](testing-component-blackbox-approach.md)
- Tests fail intermittently with race conditions → See [testing-async-await-flushpromises](testing-async-await-flushpromises.md)
- Composables using lifecycle hooks or inject fail to test → See [testing-composables-helper-wrapper](testing-composables-helper-wrapper.md)
- Getting "injection Symbol(pinia) not found" errors in tests → See [testing-pinia-store-setup](testing-pinia-store-setup.md)
- Components with async setup won't render in tests → See [testing-suspense-async-components](testing-suspense-async-components.md)
- Snapshot tests keep passing despite broken functionality → See [testing-no-snapshot-only](testing-no-snapshot-only.md)
- Choosing end-to-end testing framework for Vue apps → See [testing-e2e-playwright-recommended](testing-e2e-playwright-recommended.md)
- Tests need to verify computed styles or real DOM events → See [testing-browser-vs-node-runners](testing-browser-vs-node-runners.md)
- Testing components created with defineAsyncComponent fails → See [async-component-testing](async-component-testing.md)
- Teleported modal content can't be found in wrapper queries → See [teleport-testing-complexity](teleport-testing-complexity.md)

## Reference

- [Vue.js Testing Guide](https://vuejs.org/guide/scaling-up/testing)
- [Vue Test Utils](https://test-utils.vuejs.org/)
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
