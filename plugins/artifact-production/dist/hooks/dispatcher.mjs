// harness-source-hash: sha256:222874963d7d049d6864c41a0692e0f3330aa452ebe8e0217980091af09171d4

// core/src/aio-dispatcher.ts
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
function toolName(raw) {
  try {
    const event = JSON.parse(raw);
    return String(event.tool_name ?? event.toolName ?? "");
  } catch {
    return "";
  }
}
function matches(matcher, name) {
  if (!matcher) return true;
  try {
    return new RegExp(`^(?:${matcher})$`, "u").test(name);
  } catch {
    return false;
  }
}
function parsedOutputs(stdout) {
  const outputs = [];
  for (const line of stdout.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line);
      if (value && typeof value === "object") outputs.push(value);
    } catch {
      process.stderr.write(`${line}
`);
    }
  }
  return outputs;
}
function runAioDispatcher(host2, eventName2) {
  const root = pluginRoot();
  const raw = readFileSync(0, "utf8");
  let routes;
  try {
    routes = JSON.parse(readFileSync(resolve(root, "routes", `${host2}.json`), "utf8"));
  } catch (error) {
    process.stderr.write(`[aio-dispatcher] unable to load ${host2} routes: ${String(error)}
`);
    return;
  }
  const name = toolName(raw);
  const contexts = [];
  let firstFailure = 0;
  for (const route of routes[eventName2] ?? []) {
    if (!matches(route.matcher, name)) continue;
    const moduleRoot = resolve(root, "modules", route.module);
    const result = spawnSync(process.execPath, [resolve(moduleRoot, route.script), ...route.args ?? []], {
      cwd: process.cwd(),
      encoding: "utf8",
      input: raw,
      timeout: route.timeoutMs ?? 6e4,
      env: {
        ...process.env,
        PLUGIN_ROOT: moduleRoot,
        CLAUDE_PLUGIN_ROOT: moduleRoot,
        AI_EXPERTS_TRIGGER_FROM: route.trigger ?? `${root}:${eventName2}`
      }
    });
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) {
      process.stderr.write(`[aio-dispatcher] ${route.module}: ${result.error.message}
`);
      firstFailure ||= 1;
      continue;
    }
    firstFailure ||= result.status ?? 0;
    for (const output of parsedOutputs(result.stdout ?? "")) {
      if (output.decision === "block" || output.hookSpecificOutput?.permissionDecision === "deny") {
        process.stdout.write(`${JSON.stringify(output)}
`);
        return;
      }
      const context = output.hookSpecificOutput?.additionalContext;
      if (context) contexts.push(context);
    }
  }
  if (contexts.length > 0) {
    process.stdout.write(`${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: eventName2,
        additionalContext: contexts.join("\n\n")
      }
    })}
`);
  } else if (firstFailure !== 0) {
    process.exitCode = firstFailure;
  }
}

// plugins/artifact-production/src/entries/hooks/dispatcher.ts
var [host, eventName] = process.argv.slice(2);
if (!host || !eventName) throw new Error("dispatcher requires <host> <event>");
runAioDispatcher(host, eventName);
