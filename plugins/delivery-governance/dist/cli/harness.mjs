// harness-source-hash: sha256:c522b45b7aea50eddd02f21bc5741460ecc982a37227329f030c8303e3b3a1a6

// core/src/aio-cli.ts
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
var ownerCliInvocation = new AsyncLocalStorage();
function ownerCliModuleHandler(loader) {
  return async (args) => {
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    process.argv = [originalArgv[0] ?? process.execPath, originalArgv[1] ?? "owner-cli", ...args];
    process.exitCode = void 0;
    try {
      await loader();
      return typeof process.exitCode === "number" ? process.exitCode : 0;
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
    }
  };
}
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
  const publicArgv = [resolve(process.argv[1] ?? ""), ...input.argv];
  const result = await ownerCliInvocation.run(publicArgv, () => handler(args));
  return typeof result === "number" ? result : typeof process.exitCode === "number" ? process.exitCode : 0;
}
async function runOwnerCli(argv, handlers2) {
  const [resource, action] = argv;
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
  if (!routes[resource]?.[action] && !routes[resource]?.["*"]) {
    process.stderr.write(`[harness] unsupported command: ${resource} ${action}
`);
    process.exitCode = 2;
    return;
  }
  process.exitCode = await dispatchCliRoute({ argv, handlers: handlers2, routes });
}

// plugins/delivery-governance/src/entries/cli/harness.ts
var handlers = {
  "history:git-history-migration-execute": ownerCliModuleHandler(async () => {
    await import("../chunks/git-history-migration-execute-7BL22O2Q.mjs");
  }),
  "history:git-history-migration-preflight": ownerCliModuleHandler(async () => {
    await import("../chunks/git-history-migration-preflight-P4BVEZX4.mjs");
  })
};
await runOwnerCli(process.argv.slice(2), handlers);
