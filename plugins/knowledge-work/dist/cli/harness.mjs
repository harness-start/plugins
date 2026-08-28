// harness-source-hash: sha256:85a414e2f988062bd7bb2bf07e77b3535267e5d91642b8b1087c9e434f758cd1

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
function runAioCli(argv = process.argv.slice(2)) {
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
  const moduleRoot = resolve(root, "modules", route.module);
  const args = [...route.args ?? [], ...route.forwardAction ? [action, ...rest] : rest];
  const result = spawnSync(process.execPath, [resolve(moduleRoot, route.script), ...args], {
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

// plugins/knowledge-work/src/entries/cli/harness.ts
runAioCli();
