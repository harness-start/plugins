import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

type CliRoute = {
  module: string;
  script: string;
  args?: string[];
  forwardAction?: boolean;
};

type CliRoutes = Record<string, Record<string, CliRoute>>;

export type OwnerCliRoute = {
  handler: string;
  args?: string[];
  forwardAction?: boolean;
};

type OwnerCliRoutes = Record<string, Record<string, OwnerCliRoute>>;
export type OwnerCliHandler = (args: string[]) => number | void | Promise<number | void>;

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
  const result = await handler(args);
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

export function runAioCli(argv?: string[]): void;
export function runAioCli(argv: string[], handlers: Record<string, OwnerCliHandler>): Promise<void>;
export function runAioCli(
  argv = process.argv.slice(2),
  handlers?: Record<string, OwnerCliHandler>,
): void | Promise<void> {
  const [resource, action, ...rest] = argv;
  if (!resource || !action) {
    process.stderr.write("Usage: harness <resource> <action> [arguments]\n");
    process.exitCode = 2;
    return;
  }

  const root = pluginRoot();
  let routes: CliRoutes | OwnerCliRoutes;
  try {
    routes = JSON.parse(readFileSync(resolve(root, "routes", "cli.json"), "utf8")) as CliRoutes | OwnerCliRoutes;
  } catch (error) {
    process.stderr.write(`[harness] unable to load CLI routes: ${String(error)}\n`);
    process.exitCode = 1;
    return;
  }
  const route = routes[resource]?.[action] ?? routes[resource]?.["*"];
  if (!route) {
    process.stderr.write(`[harness] unsupported command: ${resource} ${action}\n`);
    process.exitCode = 2;
    return;
  }

  if (handlers) {
    return dispatchCliRoute({ argv, handlers, routes: routes as OwnerCliRoutes })
      .then((status) => { process.exitCode = status; });
  }

  const legacyRoute = route as CliRoute;
  const moduleRoot = resolve(root, "modules", legacyRoute.module);
  const args = [...(legacyRoute.args ?? []), ...(legacyRoute.forwardAction ? [action, ...rest] : rest)];
  const result = spawnSync(process.execPath, [resolve(moduleRoot, legacyRoute.script), ...args], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      PLUGIN_ROOT: moduleRoot,
      CLAUDE_PLUGIN_ROOT: moduleRoot,
      AI_EXPERTS_TRIGGER_FROM: process.env.AI_EXPERTS_TRIGGER_FROM ?? `harness:${resource}:${action}`,
    },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
