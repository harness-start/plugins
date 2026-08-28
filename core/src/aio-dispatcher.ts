import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

type HookRoute = {
  module: string;
  script: string;
  args?: string[];
  matcher?: string;
  timeoutMs?: number;
  trigger?: string;
};

type HookRoutes = Record<string, HookRoute[]>;

type HookOutput = {
  decision?: string;
  reason?: string;
  hookSpecificOutput?: {
    hookEventName?: string;
    permissionDecision?: string;
    permissionDecisionReason?: string;
    additionalContext?: string;
  };
};

function pluginRoot(): string {
  const configured = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT;
  if (configured) return resolve(configured);
  const entry = process.argv[1];
  if (!entry) return process.cwd();
  return resolve(dirname(entry), "../..");
}

function toolName(raw: string): string {
  try {
    const event = JSON.parse(raw) as Record<string, unknown>;
    return String(event.tool_name ?? event.toolName ?? "");
  } catch {
    return "";
  }
}

function matches(matcher: string | undefined, name: string): boolean {
  if (!matcher) return true;
  try {
    return new RegExp(`^(?:${matcher})$`, "u").test(name);
  } catch {
    return false;
  }
}

function parsedOutputs(stdout: string): HookOutput[] {
  const outputs: HookOutput[] = [];
  for (const line of stdout.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (value && typeof value === "object") outputs.push(value as HookOutput);
    } catch {
      process.stderr.write(`${line}\n`);
    }
  }
  return outputs;
}

export function runAioDispatcher(host: string, eventName: string): void {
  const root = pluginRoot();
  const raw = readFileSync(0, "utf8");
  let routes: HookRoutes;
  try {
    routes = JSON.parse(readFileSync(resolve(root, "routes", `${host}.json`), "utf8")) as HookRoutes;
  } catch (error) {
    process.stderr.write(`[aio-dispatcher] unable to load ${host} routes: ${String(error)}\n`);
    return;
  }

  const name = toolName(raw);
  const contexts: string[] = [];
  let firstFailure = 0;
  for (const route of routes[eventName] ?? []) {
    if (!matches(route.matcher, name)) continue;
    const moduleRoot = resolve(root, "modules", route.module);
    const result = spawnSync(process.execPath, [resolve(moduleRoot, route.script), ...(route.args ?? [])], {
      cwd: process.cwd(),
      encoding: "utf8",
      input: raw,
      timeout: route.timeoutMs ?? 60_000,
      env: {
        ...process.env,
        PLUGIN_ROOT: moduleRoot,
        CLAUDE_PLUGIN_ROOT: moduleRoot,
        AI_EXPERTS_TRIGGER_FROM: route.trigger ?? `${root}:${eventName}`,
      },
    });
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) {
      process.stderr.write(`[aio-dispatcher] ${route.module}: ${result.error.message}\n`);
      firstFailure ||= 1;
      continue;
    }
    firstFailure ||= result.status ?? 0;
    for (const output of parsedOutputs(result.stdout ?? "")) {
      if (output.decision === "block" || output.hookSpecificOutput?.permissionDecision === "deny") {
        process.stdout.write(`${JSON.stringify(output)}\n`);
        return;
      }
      const context = output.hookSpecificOutput?.additionalContext;
      if (context) contexts.push(context);
    }
  }

  if (contexts.length > 0) {
    process.stdout.write(`${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: eventName,
        additionalContext: contexts.join("\n\n"),
      },
    })}\n`);
  } else if (firstFailure !== 0) {
    process.exitCode = firstFailure;
  }
}
