// harness-source-hash: sha256:0e8cfd1e4de2dd9be7039f8fe3828f019ba1d701b83145e6a802d8e110e4fcf6

// core/src/aio-dispatcher.ts
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

// core/src/hook-event.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// core/src/aio-dispatcher.ts
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
function parseEvent(raw) {
  try {
    const parsed = raw.trim() ? JSON.parse(raw) : {};
    return isRecord(parsed) ? parsed : {};
  } catch {
    return { __parseError: true };
  }
}
function combinedOutput(eventName2, outputs) {
  for (const output of outputs) {
    if (output.decision === "block" || output.hookSpecificOutput?.permissionDecision === "deny") return output;
  }
  const contexts = outputs.map((output) => output.hookSpecificOutput?.additionalContext).filter((context) => Boolean(context));
  if (contexts.length === 0) return null;
  return { hookSpecificOutput: { hookEventName: eventName2, additionalContext: contexts.join("\n\n") } };
}
async function withTimeout(operation, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function dispatchHookRoutes(input) {
  const event = parseEvent(input.raw);
  const name = String(event.tool_name ?? event.toolName ?? "");
  const outputs = [];
  const failures = [];
  for (const route of input.routes[input.eventName] ?? []) {
    if (event.__parseError !== true && !matches(route.matcher, name)) continue;
    const handler = input.handlers[route.handler];
    if (!handler) {
      failures.push(`${route.handler}: owner handler is not registered`);
      continue;
    }
    const trigger = route.trigger ?? `${input.host}:${input.eventName}`;
    try {
      const value = await withTimeout(
        Promise.resolve(handler({
          args: route.args ?? [],
          event,
          eventName: input.eventName,
          host: input.host,
          raw: input.raw,
          trigger
        })),
        route.timeoutMs ?? 6e4,
        route.handler
      );
      if (Array.isArray(value)) outputs.push(...value);
      else if (value) outputs.push(value);
      const output = combinedOutput(input.eventName, outputs);
      if (output?.decision === "block" || output?.hookSpecificOutput?.permissionDecision === "deny") return { output, failures };
    } catch (error) {
      failures.push(`${route.handler}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { output: combinedOutput(input.eventName, outputs), failures };
}
function runAioDispatcher(host2, eventName2, handlers) {
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
  if (handlers) {
    return dispatchHookRoutes({ eventName: eventName2, handlers, host: host2, raw, routes }).then(({ output, failures }) => {
      for (const failure of failures) process.stderr.write(`[aio-dispatcher] ${failure}
`);
      if (output) process.stdout.write(`${JSON.stringify(output)}
`);
      else if (failures.length > 0) process.exitCode = 1;
    });
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
