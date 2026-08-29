// harness-source-hash: sha256:87edcd1579b4ff2d54622f1cf214f0ef3b926d4443a88bb193de2d2038e5df07

// core/src/aio-cli.ts
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
function pluginRoot() {
  const configured = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT;
  if (configured) return resolve(configured);
  const entry = process.argv[1];
  if (!entry) return process.cwd();
  return resolve(dirname(entry), "../..");
}
async function dispatchCliRoute(input) {
  const [resource, action, ...rest] = input.argv;
  if (!resource || !action) return 2;
  const route = input.routes[resource]?.[action] ?? input.routes[resource]?.["*"];
  if (!route) return 2;
  const handler = input.handlers[route.handler];
  if (!handler) throw new Error(`${route.handler}: owner CLI handler is not registered`);
  const args = [...route.args ?? [], ...route.forwardAction ? [action, ...rest] : rest];
  const result = await handler(args);
  return typeof result === "number" ? result : typeof process.exitCode === "number" ? process.exitCode : 0;
}
function runAioCli(argv = process.argv.slice(2), handlers) {
  const [resource, action, ...rest] = argv;
  if (!resource || !action) {
    process.stderr.write("Usage: harness <resource> <action> [arguments]\n");
    process.exitCode = 2;
    return;
  }
  const root = pluginRoot();
  let routes;
  try {
    routes = JSON.parse(readFileSync(resolve(root, "routes", "cli.json"), "utf8"));
  } catch (error) {
    process.stderr.write(`[harness] unable to load CLI routes: ${String(error)}
`);
    process.exitCode = 1;
    return;
  }
  const route = routes[resource]?.[action] ?? routes[resource]?.["*"];
  if (!route) {
    process.stderr.write(`[harness] unsupported command: ${resource} ${action}
`);
    process.exitCode = 2;
    return;
  }
  if (handlers) {
    return dispatchCliRoute({ argv, handlers, routes }).then((status) => {
      process.exitCode = status;
    });
  }
  const legacyRoute = route;
  const moduleRoot = resolve(root, "modules", legacyRoute.module);
  const args = [...legacyRoute.args ?? [], ...legacyRoute.forwardAction ? [action, ...rest] : rest];
  const result = spawnSync(process.execPath, [resolve(moduleRoot, legacyRoute.script), ...args], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      PLUGIN_ROOT: moduleRoot,
      CLAUDE_PLUGIN_ROOT: moduleRoot,
      AI_EXPERTS_TRIGGER_FROM: process.env.AI_EXPERTS_TRIGGER_FROM ?? `harness:${resource}:${action}`
    }
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

// plugins/delivery-governance/src/entries/cli/harness.ts
runAioCli();
