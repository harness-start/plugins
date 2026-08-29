import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type OwnerCliRoute = {
  handler: string;
  args?: string[];
  forwardAction?: boolean;
};

type OwnerCliRoutes = Record<string, Record<string, OwnerCliRoute>>;
export type OwnerCliHandler = (args: string[]) => number | void | Promise<number | void>;

const ownerCliInvocation = new AsyncLocalStorage<string[]>();

export function currentOwnerCliArgv(): string[] {
  return ownerCliInvocation.getStore() ?? [resolve(process.argv[1] ?? ""), ...process.argv.slice(2)];
}

export function ownerCliModuleHandler(loader: () => void | Promise<void>): OwnerCliHandler {
  return async (args) => {
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    process.argv = [originalArgv[0] ?? process.execPath, originalArgv[1] ?? "owner-cli", ...args];
    process.exitCode = undefined;
    try {
      await loader();
      return typeof process.exitCode === "number" ? process.exitCode : 0;
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
    }
  };
}

function pluginRoot(): string {
  const configured = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT;
  if (configured) return resolve(configured);
  const entry = process.argv[1];
  if (!entry) return process.cwd();
  return resolve(dirname(entry), "../..");
}

export async function dispatchCliRoute(input: {
  argv: string[];
  handlers: Record<string, OwnerCliHandler>;
  routes: OwnerCliRoutes;
}): Promise<number> {
  const [resource, action, ...rest] = input.argv;
  if (!resource || !action) return 2;
  const route = input.routes[resource]?.[action] ?? input.routes[resource]?.["*"];
  if (!route) return 2;
  const handler = input.handlers[route.handler];
  if (!handler) throw new Error(`${route.handler}: owner CLI handler is not registered`);
  const args = [...(route.args ?? []), ...(route.forwardAction ? [action, ...rest] : rest)];
  const publicArgv = [resolve(process.argv[1] ?? ""), ...input.argv];
  const result = await ownerCliInvocation.run(publicArgv, () => handler(args));
  return typeof result === "number" ? result : typeof process.exitCode === "number" ? process.exitCode : 0;
}

export async function runOwnerCli(
  argv: string[],
  handlers: Record<string, OwnerCliHandler>,
): Promise<void> {
  const [resource, action] = argv;
  if (!resource || !action) {
    process.stderr.write("Usage: harness <resource> <action> [arguments]\n");
    process.exitCode = 2;
    return;
  }
  const root = pluginRoot();
  let routes: OwnerCliRoutes;
  try {
    routes = JSON.parse(readFileSync(resolve(root, "routes", "cli.json"), "utf8")) as OwnerCliRoutes;
  } catch (error) {
    process.stderr.write(`[harness] unable to load CLI routes: ${String(error)}\n`);
    process.exitCode = 1;
    return;
  }
  if (!routes[resource]?.[action] && !routes[resource]?.["*"]) {
    process.stderr.write(`[harness] unsupported command: ${resource} ${action}\n`);
    process.exitCode = 2;
    return;
  }
  process.exitCode = await dispatchCliRoute({ argv, handlers, routes });
}
