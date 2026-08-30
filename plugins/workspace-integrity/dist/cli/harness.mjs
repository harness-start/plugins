// harness-source-hash: sha256:9fbebb317a20b6e425ce30504bb183d58ba62162fc6c0b0a96104f7e8df73e32
import "../chunks/chunk-JOC5D5YB.mjs";

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
async function runOwnerCli(argv, handlers) {
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
  process.exitCode = await dispatchCliRoute({ argv, handlers, routes });
}

// plugins/workspace-integrity/src/entries/cli/harness.ts
await runOwnerCli(process.argv.slice(2), {
  "commands:runtime-log-sanitize": ownerCliModuleHandler(async () => {
    await import("../chunks/runtime-log-sanitize-4G4OCI6S.mjs");
  })
});
