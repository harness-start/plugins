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

function pluginRoot(): string {
  const configured = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT;
  if (configured) return resolve(configured);
  const entry = process.argv[1];
  if (!entry) return process.cwd();
  return resolve(dirname(entry), "../..");
}

export function runAioCli(argv = process.argv.slice(2)): void {
  const [resource, action, ...rest] = argv;
  if (!resource || !action) {
    process.stderr.write("Usage: harness <resource> <action> [arguments]\n");
    process.exitCode = 2;
    return;
  }

  const root = pluginRoot();
  let routes: CliRoutes;
  try {
    routes = JSON.parse(readFileSync(resolve(root, "routes", "cli.json"), "utf8")) as CliRoutes;
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

  const moduleRoot = resolve(root, "modules", route.module);
  const args = [...(route.args ?? []), ...(route.forwardAction ? [action, ...rest] : rest)];
  const result = spawnSync(process.execPath, [resolve(moduleRoot, route.script), ...args], {
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
