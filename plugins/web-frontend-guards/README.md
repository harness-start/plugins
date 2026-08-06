# Web Frontend Guards

Target-native JavaScript guards for frontend encoding, WXML/WXSS/Taro and mini-program configuration, net-new form validation debt, Vue/Svelte checks, environment detection, and stylelint coverage. Existing project-local or `PATH` Vue/Svelte checkers are reused; the plugin never installs them. Node.js 20 executes the scripts directly, with no compilation step.

The implementation consolidates 15 source hooks into three event entries and two check modules. Shared SDK, Registry, telemetry, and worker code are intentionally not migrated.

## Verification

```bash
node --test plugins/web-frontend-guards/tests/*.test.mjs
```
