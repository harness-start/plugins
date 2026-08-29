import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { isRecord, type HookEvent } from "./hook-event.js";

type HookRoute = {
  module: string;
  script: string;
  args?: string[];
  matcher?: string;
  timeoutMs?: number;
  trigger?: string;
};

type HookRoutes = Record<string, HookRoute[]>;

export type OwnerHookRoute = {
  handler: string;
  args?: string[];
  matcher?: string;
  timeoutMs?: number;
  trigger?: string;
};

type OwnerHookRoutes = Record<string, OwnerHookRoute[]>;

export type HookOutput = {
  decision?: string;
  reason?: string;
  hookSpecificOutput?: {
    hookEventName?: string;
    permissionDecision?: string;
    permissionDecisionReason?: string;
    additionalContext?: string;
  };
};

export type OwnerHookHandlerContext = {
  args: string[];
  event: HookEvent;
  eventName: string;
  host: string;
  raw: string;
  trigger: string;
};

export type OwnerHookHandler = (
  context: OwnerHookHandlerContext,
) => HookOutput | HookOutput[] | null | void | Promise<HookOutput | HookOutput[] | null | void>;

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

function parseEvent(raw: string): HookEvent {
  try {
    const parsed: unknown = raw.trim() ? JSON.parse(raw) : {};
    return isRecord(parsed) ? parsed : {};
  } catch {
    return { __parseError: true };
  }
}

function combinedOutput(eventName: string, outputs: HookOutput[]): HookOutput | null {
  for (const output of outputs) {
    if (output.decision === "block" || output.hookSpecificOutput?.permissionDecision === "deny") return output;
  }
  const contexts = outputs
    .map((output) => output.hookSpecificOutput?.additionalContext)
    .filter((context): context is string => Boolean(context));
  if (contexts.length === 0) return null;
  return { hookSpecificOutput: { hookEventName: eventName, additionalContext: contexts.join("\n\n") } };
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function dispatchHookRoutes(input: {
  eventName: string;
  handlers: Record<string, OwnerHookHandler>;
  host: string;
  raw: string;
  routes: OwnerHookRoutes;
}): Promise<{ output: HookOutput | null; failures: string[] }> {
  const event = parseEvent(input.raw);
  const name = String(event.tool_name ?? event.toolName ?? "");
  const outputs: HookOutput[] = [];
  const failures: string[] = [];
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
          trigger,
        })),
        route.timeoutMs ?? 60_000,
        route.handler,
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

export async function runOwnerDispatcher(
  host: string,
  eventName: string,
  handlers: Record<string, OwnerHookHandler>,
): Promise<void> {
  const root = pluginRoot();
  const raw = readFileSync(0, "utf8");
  let routes: OwnerHookRoutes;
  try {
    routes = JSON.parse(readFileSync(resolve(root, "routes", `${host}.json`), "utf8")) as OwnerHookRoutes;
  } catch (error) {
    process.stderr.write(`[aio-dispatcher] unable to load ${host} routes: ${String(error)}\n`);
    return;
  }
  const { output, failures } = await dispatchHookRoutes({ eventName, handlers, host, raw, routes });
  for (const failure of failures) process.stderr.write(`[aio-dispatcher] ${failure}\n`);
  if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
  else if (failures.length > 0) process.exitCode = 1;
}

export function runAioDispatcher(host: string, eventName: string): void;
export function runAioDispatcher(host: string, eventName: string, handlers: Record<string, OwnerHookHandler>): Promise<void>;
export function runAioDispatcher(
  host: string,
  eventName: string,
  handlers?: Record<string, OwnerHookHandler>,
): void | Promise<void> {
  const root = pluginRoot();
  const raw = readFileSync(0, "utf8");
  let routes: HookRoutes | OwnerHookRoutes;
  try {
    routes = JSON.parse(readFileSync(resolve(root, "routes", `${host}.json`), "utf8")) as HookRoutes | OwnerHookRoutes;
  } catch (error) {
    process.stderr.write(`[aio-dispatcher] unable to load ${host} routes: ${String(error)}\n`);
    return;
  }

  if (handlers) {
    return dispatchHookRoutes({ eventName, handlers, host, raw, routes: routes as OwnerHookRoutes })
      .then(({ output, failures }) => {
        for (const failure of failures) process.stderr.write(`[aio-dispatcher] ${failure}\n`);
        if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
        else if (failures.length > 0) process.exitCode = 1;
      });
  }

  const name = toolName(raw);
  const contexts: string[] = [];
  let firstFailure = 0;
  for (const route of (routes as HookRoutes)[eventName] ?? []) {
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
