// harness-source-hash: sha256:0b41ef02c6138f52d0f783c0e51b8a221cb6a3482f34fc15c15729e21fe2d005

// core/src/aio-dispatcher.ts
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// core/src/owner-hook-runtime.ts
import { AsyncLocalStorage } from "node:async_hooks";
var invocationStorage = new AsyncLocalStorage();
var OwnerHookExitError = class extends Error {
  status;
  constructor(status) {
    super(`owner hook exited with status ${status}`);
    this.name = "OwnerHookExitError";
    this.status = status;
  }
};
function currentOwnerHookEvent() {
  return invocationStorage.getStore()?.event;
}
function collectOwnerHookOutput(value) {
  const invocation = invocationStorage.getStore();
  if (!invocation) return false;
  if (value !== null && value !== void 0) invocation.outputs.push(value);
  return true;
}
async function invokeOwnerHook(event, args, operation) {
  const outputs = [];
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;
  process.argv = [originalArgv[0] ?? process.execPath, originalArgv[1] ?? "owner-hook", ...args];
  process.exitCode = void 0;
  try {
    await invocationStorage.run({ args, event, outputs }, operation);
    if (typeof process.exitCode === "number" && process.exitCode !== 0) {
      throw new OwnerHookExitError(process.exitCode);
    }
    return outputs;
  } finally {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
  }
}
function ownerHookHandler(operation) {
  return async ({ args, event }) => {
    try {
      return await invokeOwnerHook(event, args, operation);
    } catch (error) {
      if (error instanceof OwnerHookExitError) {
        process.exitCode = error.status;
        return [];
      }
      throw error;
    }
  };
}

// core/src/hook-event.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}
function nestedRecord(event, key) {
  const value = event[key];
  return isRecord(value) ? value : null;
}
async function readStdinJson(input = process.stdin) {
  if (input === process.stdin) {
    const current = currentOwnerHookEvent();
    if (current) return current;
  }
  let raw = "";
  for await (const chunk of input) raw += chunk.toString();
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : { __parseError: true };
  } catch {
    return { __parseError: true };
  }
}
function eventSessionId(event) {
  const context = nestedRecord(event, "context");
  return firstString(
    event.session_id,
    event.sessionId,
    event.sessionID,
    event.conversation_id,
    event.conversationId,
    context?.session_id
  );
}
function eventCwd(event) {
  return firstString(event.cwd, event.working_directory, event.workingDirectory) || process.cwd();
}
function eventToolName(event) {
  const tool = nestedRecord(event, "tool");
  return firstString(event.tool_name, event.toolName, tool?.name);
}
function eventToolInput(event) {
  const tool = nestedRecord(event, "tool");
  const value = event.tool_input ?? event.toolInput ?? tool?.input ?? event.input;
  return isRecord(value) ? value : {};
}
function eventToolResponse(event) {
  const tool = nestedRecord(event, "tool");
  return event.tool_response ?? event.toolResponse ?? event.tool_result ?? event.toolResult ?? event.response ?? tool?.response ?? null;
}
function eventPrompt(event) {
  return firstString(event.prompt, event.user_prompt, event.userPrompt, event.message);
}
function eventAssistantMessage(event) {
  return firstString(
    event.last_assistant_message,
    event.lastAssistantMessage,
    event.assistant_message,
    event.assistant_text,
    event.assistantText
  );
}
function isStopHookActive(event) {
  return event.stop_hook_active === true || event.stopHookActive === true;
}

// core/src/aio-dispatcher.ts
function pluginRoot() {
  const configured = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT;
  if (configured) return resolve(configured);
  const entry = process.argv[1];
  if (!entry) return process.cwd();
  return resolve(dirname(entry), "../..");
}
function matches(matcher, name) {
  if (!matcher) return true;
  try {
    return new RegExp(`^(?:${matcher})$`, "u").test(name);
  } catch {
    return false;
  }
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
  const codexFeedback = outputs.filter((output) => output.continue === false && Boolean(output.reason));
  if (codexFeedback.length > 0) {
    return {
      continue: false,
      stopReason: codexFeedback.map((output) => output.stopReason).filter(Boolean).join("\n") || "Plugin review feedback replaced the ordinary tool success output.",
      reason: codexFeedback.map((output) => output.reason).filter(Boolean).join("\n\n")
    };
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
  const name = input.eventName === "SessionStart" ? String(event.source ?? "startup") : String(event.tool_name ?? event.toolName ?? "");
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
async function runOwnerDispatcher(host2, eventName2, handlers) {
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
  const { output, failures } = await dispatchHookRoutes({ eventName: eventName2, handlers, host: host2, raw, routes });
  for (const failure of failures) process.stderr.write(`[aio-dispatcher] ${failure}
`);
  if (output) process.stdout.write(`${JSON.stringify(output)}
`);
  else if (failures.length > 0) process.exitCode = 1;
}

// plugins/session-governance/src/domains/discipline/entries/hooks/execution-discipline.ts
import { relative as relative2, resolve as resolve5 } from "node:path";

// plugins/session-governance/src/domains/discipline/lib/config.ts
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
var CONFIG_NAMES = [
  ".execution-discipline.mjs",
  ".execution-discipline.cjs",
  ".execution-discipline.js"
];
var VALID_MODES = /* @__PURE__ */ new Set(["block", "report", "off"]);
var DEFAULT_CONFIG = Object.freeze({
  checks: Object.freeze({
    editLoop: "block",
    failedCommandRetry: "block",
    successfulCommandRepeat: "block",
    remotePolling: "report"
  }),
  editLoop: Object.freeze({
    reportAt: 5,
    blockAt: 20,
    windowMinutes: 30,
    exemptPaths: Object.freeze([/\.mdx?$/iu])
  }),
  commandRepeat: Object.freeze({
    failureReportAt: 2,
    failureBlockAt: 3,
    successReportAt: 6,
    successBlockAt: 12,
    windowMinutes: 10,
    retryBypass: /(?:^|\s)#\s*retry-ok\b/iu
  }),
  polling: Object.freeze({
    sleepBudgetSeconds: 600,
    queryBudgetCount: 20,
    windowMinutes: 30,
    cooldownMinutes: 5,
    maxSleepPerCommandSeconds: 3600,
    whileLoopAssumedIterations: 10,
    pollBypass: /(?:^|\s)#\s*poll-ok\b/iu
  })
});
function defaultWarn(message) {
  process.stderr.write(`[execution-discipline] ${message}
`);
}
function cloneRegex(pattern) {
  return new RegExp(pattern.source, pattern.flags);
}
function isCheckMode(value) {
  return value === "block" || value === "report" || value === "off";
}
function mode(value, fallback, label, warn6) {
  if (value === void 0) return fallback;
  if (isCheckMode(value) && VALID_MODES.has(value)) return value;
  warn6(`${label} must be "block", "report", or "off"; using ${fallback}`);
  return fallback;
}
function positiveInteger(value, fallback, label, warn6, { allowZero = false } = {}) {
  const minimum = allowZero ? 0 : 1;
  if (value === void 0) return fallback;
  if (typeof value === "number" && Number.isInteger(value) && value >= minimum) return value;
  warn6(`${label} must be an integer >= ${minimum}; using ${fallback}`);
  return fallback;
}
function thresholdPair(source, reportKey, blockKey, defaults, label, warn6) {
  const reportAt = positiveInteger(source[reportKey], defaults[reportKey], `${label}.${reportKey}`, warn6);
  const blockAt = positiveInteger(source[blockKey], defaults[blockKey], `${label}.${blockKey}`, warn6);
  if (reportAt < blockAt) {
    return { [reportKey]: reportAt, [blockKey]: blockAt };
  }
  warn6(`${label}.${reportKey} must be lower than ${label}.${blockKey}; using defaults`);
  return { [reportKey]: defaults[reportKey], [blockKey]: defaults[blockKey] };
}
function regex(value, fallback, label, warn6) {
  if (value === void 0) return cloneRegex(fallback);
  if (value instanceof RegExp) return cloneRegex(value);
  warn6(`${label} must be a RegExp; using the default`);
  return cloneRegex(fallback);
}
function exemptPaths(value, warn6) {
  const builtIns = DEFAULT_CONFIG.editLoop.exemptPaths.map(cloneRegex);
  if (value === void 0) return builtIns;
  if (!Array.isArray(value)) {
    warn6("editLoop.exemptPaths must be an array of RegExp values; using built-ins");
    return builtIns;
  }
  const custom = [];
  for (const [index, pattern] of value.entries()) {
    if (pattern instanceof RegExp) custom.push(cloneRegex(pattern));
    else warn6(`editLoop.exemptPaths[${index}] must be a RegExp; skipping`);
  }
  return [...builtIns, ...custom];
}
function resolveConfig(userConfig, warn6 = defaultWarn) {
  const user = userConfig && isRecord(userConfig) ? userConfig : {};
  if (userConfig != null && user !== userConfig) warn6("config default export must be an object; using defaults");
  const checksSource = user.checks && isRecord(user.checks) ? user.checks : {};
  if (user.checks !== void 0 && checksSource !== user.checks) {
    warn6("checks must be an object; using defaults");
  }
  const checks = {
    editLoop: mode(checksSource.editLoop, DEFAULT_CONFIG.checks.editLoop, "checks.editLoop", warn6),
    failedCommandRetry: mode(checksSource.failedCommandRetry, DEFAULT_CONFIG.checks.failedCommandRetry, "checks.failedCommandRetry", warn6),
    successfulCommandRepeat: mode(checksSource.successfulCommandRepeat, DEFAULT_CONFIG.checks.successfulCommandRepeat, "checks.successfulCommandRepeat", warn6),
    remotePolling: mode(checksSource.remotePolling, DEFAULT_CONFIG.checks.remotePolling, "checks.remotePolling", warn6)
  };
  const editSource = user.editLoop && isRecord(user.editLoop) ? user.editLoop : {};
  const editThresholds = thresholdPair(
    editSource,
    "reportAt",
    "blockAt",
    DEFAULT_CONFIG.editLoop,
    "editLoop",
    warn6
  );
  const editLoop = {
    ...editThresholds,
    windowMinutes: positiveInteger(
      editSource.windowMinutes,
      DEFAULT_CONFIG.editLoop.windowMinutes,
      "editLoop.windowMinutes",
      warn6
    ),
    exemptPaths: exemptPaths(editSource.exemptPaths, warn6)
  };
  const repeatSource = user.commandRepeat && isRecord(user.commandRepeat) ? user.commandRepeat : {};
  const commandRepeat = {
    ...thresholdPair(
      repeatSource,
      "failureReportAt",
      "failureBlockAt",
      DEFAULT_CONFIG.commandRepeat,
      "commandRepeat",
      warn6
    ),
    ...thresholdPair(
      repeatSource,
      "successReportAt",
      "successBlockAt",
      DEFAULT_CONFIG.commandRepeat,
      "commandRepeat",
      warn6
    ),
    windowMinutes: positiveInteger(
      repeatSource.windowMinutes,
      DEFAULT_CONFIG.commandRepeat.windowMinutes,
      "commandRepeat.windowMinutes",
      warn6
    ),
    retryBypass: regex(
      repeatSource.retryBypass,
      DEFAULT_CONFIG.commandRepeat.retryBypass,
      "commandRepeat.retryBypass",
      warn6
    )
  };
  const pollingSource = user.polling && isRecord(user.polling) ? user.polling : {};
  const polling = {
    sleepBudgetSeconds: positiveInteger(
      pollingSource.sleepBudgetSeconds,
      DEFAULT_CONFIG.polling.sleepBudgetSeconds,
      "polling.sleepBudgetSeconds",
      warn6
    ),
    queryBudgetCount: positiveInteger(
      pollingSource.queryBudgetCount,
      DEFAULT_CONFIG.polling.queryBudgetCount,
      "polling.queryBudgetCount",
      warn6
    ),
    windowMinutes: positiveInteger(
      pollingSource.windowMinutes,
      DEFAULT_CONFIG.polling.windowMinutes,
      "polling.windowMinutes",
      warn6
    ),
    cooldownMinutes: positiveInteger(
      pollingSource.cooldownMinutes,
      DEFAULT_CONFIG.polling.cooldownMinutes,
      "polling.cooldownMinutes",
      warn6,
      { allowZero: true }
    ),
    maxSleepPerCommandSeconds: positiveInteger(
      pollingSource.maxSleepPerCommandSeconds,
      DEFAULT_CONFIG.polling.maxSleepPerCommandSeconds,
      "polling.maxSleepPerCommandSeconds",
      warn6
    ),
    whileLoopAssumedIterations: positiveInteger(
      pollingSource.whileLoopAssumedIterations,
      DEFAULT_CONFIG.polling.whileLoopAssumedIterations,
      "polling.whileLoopAssumedIterations",
      warn6
    ),
    pollBypass: regex(
      pollingSource.pollBypass,
      DEFAULT_CONFIG.polling.pollBypass,
      "polling.pollBypass",
      warn6
    )
  };
  return { checks, editLoop, commandRepeat, polling };
}
function resolveRepoRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5e3
    }).trim();
  } catch {
    return null;
  }
}
async function loadProjectConfig(cwd, warn6 = defaultWarn) {
  const repoRoot2 = resolveRepoRoot(cwd);
  if (!repoRoot2) return { config: resolveConfig(null, warn6), repoRoot: null };
  for (const name of CONFIG_NAMES) {
    const path = join(repoRoot2, name);
    if (!existsSync(path)) continue;
    try {
      const loaded = await import(pathToFileURL(path).href);
      const exported = isRecord(loaded) ? loaded.default ?? loaded : loaded;
      return { config: resolveConfig(exported, warn6), repoRoot: repoRoot2 };
    } catch (error) {
      warn6(`failed to load ${name}: ${error instanceof Error ? error.message : String(error)}; using defaults`);
      return { config: resolveConfig(null, warn6), repoRoot: repoRoot2 };
    }
  }
  return { config: resolveConfig(null, warn6), repoRoot: repoRoot2 };
}

// core/src/hook-output.ts
var TOOL_LIFECYCLE_EVENTS = /* @__PURE__ */ new Set([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure"
]);
function preToolDeny(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason
    }
  };
}
function additionalContext(hookEventName, context, options = {}) {
  const codexToolReport = Boolean(process.env.PLUGIN_ROOT) && TOOL_LIFECYCLE_EVENTS.has(hookEventName);
  const echoStderr = options.echoStderr ?? codexToolReport;
  const suppressJson = codexToolReport || Boolean(options.suppressJson);
  if (echoStderr) process.stderr.write(`${context}
`);
  if (suppressJson) return null;
  return {
    hookSpecificOutput: {
      hookEventName,
      additionalContext: context
    }
  };
}
function stopBlock(reason) {
  return { decision: "block", reason };
}
function writeJson(value) {
  if (value !== null && value !== void 0) {
    if (collectOwnerHookOutput(value)) return;
    process.stdout.write(`${JSON.stringify(value)}
`);
  }
}

// core/src/hook-targets.ts
import { isAbsolute, resolve as resolve2 } from "node:path";

// core/src/state-file.ts
import { createHash, randomBytes } from "node:crypto";
import { existsSync as existsSync2, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname as dirname2, join as join2 } from "node:path";
var DIRECTORY_MODE = 448;
var FILE_MODE = 384;
var STALE_LOCK_MS = 3e4;
var WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));
function digestKey(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
function atomicWriteJson(path, value) {
  const directory = dirname2(path);
  const temporary = join2(directory, `.${digestKey(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    mkdirSync(directory, { recursive: true, mode: DIRECTORY_MODE });
    writeFileSync(temporary, `${JSON.stringify(value)}
`, { encoding: "utf8", mode: FILE_MODE, flag: "wx" });
    renameSync(temporary, path);
    return true;
  } catch {
    try {
      rmSync(temporary, { force: true });
    } catch {
    }
    return false;
  }
}
function withPathLock(path, operation) {
  const lockPath = `${path}.lock`;
  mkdirSync(dirname2(path), { recursive: true, mode: DIRECTORY_MODE });
  const deadline = Date.now() + 5e3;
  while (true) {
    try {
      mkdirSync(lockPath, { mode: DIRECTORY_MODE });
      try {
        return operation();
      } finally {
        rmSync(lockPath, { recursive: true, force: true });
      }
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > STALE_LOCK_MS) {
          rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch {
        if (!existsSync2(lockPath)) continue;
      }
      if (Date.now() >= deadline) throw new Error(`Timed out acquiring lock: ${lockPath}`);
      Atomics.wait(WAIT_BUFFER, 0, 0, 10);
    }
  }
}

// core/src/hook-targets.ts
var FILE_MUTATION_TOOLS = /* @__PURE__ */ new Set([
  "applypatch",
  "createfile",
  "edit",
  "multiedit",
  "notebookedit",
  "searchreplace",
  "write"
]);
var READ_TOOLS = /* @__PURE__ */ new Set(["read"]);
var SHELL_TOOLS = /* @__PURE__ */ new Set([
  "bash",
  "exec",
  "execcommand",
  "localshell",
  "shell",
  "shellcommand"
]);
var PATH_KEYS = [
  "file_path",
  "filePath",
  "path",
  "target_file",
  "output_file",
  "outputFile",
  "notebook_path",
  "notebookPath"
];
function canonicalToolName(name) {
  return String(name ?? "").replaceAll("_", "").toLowerCase();
}
function isFileMutationTool(name) {
  return FILE_MUTATION_TOOLS.has(canonicalToolName(name));
}
function isReadTool(name) {
  return READ_TOOLS.has(canonicalToolName(name));
}
function isShellTool(name) {
  return SHELL_TOOLS.has(canonicalToolName(name));
}
function extractShellCommand(event) {
  if (!isShellTool(eventToolName(event))) return null;
  const input = eventToolInput(event);
  const command = input.command ?? input.cmd ?? input.script;
  return typeof command === "string" ? command : null;
}
function stripMatchingQuotes(value) {
  const text = String(value ?? "").trim();
  if (text.length >= 2 && (text.startsWith('"') && text.endsWith('"') || text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}
function objectPaths(input) {
  if (!input || typeof input !== "object") return [];
  const record = input;
  const paths = [];
  for (const key of PATH_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value) paths.push(value);
  }
  if (Array.isArray(record.edits)) {
    for (const edit of record.edits) paths.push(...objectPaths(edit));
  }
  return paths;
}
function patchPaths(payload) {
  const paths = [];
  for (const line of payload.split("\n")) {
    const file = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u);
    const move = line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (file?.[1]) paths.push(stripMatchingQuotes(file[1]));
    if (move?.[1]) paths.push(stripMatchingQuotes(move[1]));
  }
  return paths;
}
function patchPayload(input) {
  if (typeof input === "string") return input;
  return [input.patch, input.input, input.command].filter((value) => typeof value === "string").join("\n");
}
function resolveTargets(raw, cwd) {
  return [...new Set(
    raw.map(stripMatchingQuotes).filter(Boolean).map((path) => isAbsolute(path) ? resolve2(path) : resolve2(cwd, path.replace(/^\.\//u, "")))
  )];
}
function shellWritePaths(command) {
  const paths = [];
  const push = (raw) => {
    const value = stripMatchingQuotes(String(raw ?? ""));
    if (value && !value.startsWith("-")) paths.push(value);
  };
  for (const match of command.matchAll(/(?:^|[^0-9>])>{1,2}\s*("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    push(match[1]);
  }
  for (const match of command.matchAll(/\btee\b(?:\s+-[A-Za-z]+)*\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    push(match[1]);
  }
  for (const match of command.matchAll(/\btouch\b(?:\s+--)?\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    push(match[1]);
  }
  return paths;
}
function acceptsTool(name, tools) {
  if (tools === "any") return true;
  if (isFileMutationTool(name)) return true;
  if (tools === "read-or-mutation" && isReadTool(name)) return true;
  return false;
}
function extractFileTargets(event, options = {}) {
  const tools = options.tools ?? "mutation";
  const name = eventToolName(event);
  const cwd = resolve2(eventCwd(event));
  const input = eventToolInput(event);
  const raw = [];
  if (acceptsTool(name, tools)) {
    raw.push(...objectPaths(input));
    raw.push(...patchPaths(patchPayload(typeof event.tool_input === "string" ? event.tool_input : input)));
    if (typeof event.tool_input === "string") raw.push(...objectPaths(input));
  }
  if (options.includeShellWrites) {
    const command = extractShellCommand(event) ?? (typeof input.command === "string" ? input.command : null) ?? (typeof input.cmd === "string" ? input.cmd : null) ?? (typeof input.script === "string" ? input.script : null);
    if (command) raw.push(...shellWritePaths(command));
  }
  return resolveTargets(raw, cwd);
}

// plugins/session-governance/src/domains/discipline/lib/hook-io.ts
function extractSessionId(event) {
  return eventSessionId(event) || null;
}
function extractToolWait(event) {
  const fullName = String(eventToolName(event));
  const name = fullName.split(".").at(-1)?.toLowerCase();
  const input = eventToolInput(event);
  if (name === "list_agents") return { label: fullName, sleepSeconds: 0, queryCount: 1 };
  if (name === "wait_agent") {
    const milliseconds = Number(input.timeout_ms ?? input.timeoutMs ?? 0);
    return milliseconds > 0 ? { label: fullName, sleepSeconds: milliseconds / 1e3, queryCount: 0 } : null;
  }
  if (name === "wait" || name === "write_stdin") {
    const milliseconds = Number(input.yield_time_ms ?? input.yieldTimeMs ?? 0);
    return milliseconds > 0 ? { label: fullName, sleepSeconds: milliseconds / 1e3, queryCount: 0 } : null;
  }
  return null;
}
function extractFileTargets2(event) {
  return extractFileTargets(event);
}
function contextOutput(eventName2, text) {
  return additionalContext(eventName2, text, {
    echoStderr: Boolean(process.env.PLUGIN_ROOT) && eventName2 === "PostToolUse",
    suppressJson: Boolean(process.env.PLUGIN_ROOT) && eventName2 === "PostToolUse"
  });
}

// plugins/session-governance/src/domains/discipline/lib/execution-loop-policy.ts
import { createHash as createHash2 } from "node:crypto";
import { existsSync as existsSync3, lstatSync, readFileSync as readFileSync2, realpathSync } from "node:fs";
import { relative, resolve as resolve3 } from "node:path";
var READ_ONLY_COMMAND_RE = /^\s*(?:ls|cat|head|tail|echo|git\s+(?:status|diff|log|show|ls-files)|pwd|which|wc|find|grep|rg)\b/iu;
var TRAILING_OBSERVER_PIPE_RE = /\s*\|\s*(?:tail|head|less|more|tee|cat)\b[^|]*$/iu;
var REMOTE_POLL_RE = new RegExp([
  String.raw`\b(?:glab\s+(?:ci\s+(?:list|status|get|view|trace)`,
  String.raw`|api\s+\S*(?:pipeline|job|release|deploy)s?)`,
  String.raw`|gh\s+(?:run\s+(?:list|view|watch)`,
  String.raw`|pr\s+checks|workflow\s+view))\b`
].join(""), "iu");
var VERIFY_PATTERNS = [
  /\b(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:test|lint|typecheck|check|build)\b/iu,
  /\bbun\s+(?:test|run\s+(?:test|lint|typecheck|check|build))\b/iu,
  /\bnode\s+--test\b/iu,
  /\b(?:pytest|vitest|jest|phpunit|rspec|phpstan|eslint|shellcheck|actionlint|kubeconform)\b/iu,
  /\bpython(?:3)?\s+-m\s+(?:pytest|compileall)\b/iu,
  /\bgo\s+test\b/iu,
  /\bcargo\s+(?:test|check|clippy)\b/iu,
  /\b(?:mvn|gradlew?|gradle)\b[^\n]*\b(?:test|check|verify|build)\b/iu,
  /\bcomposer\s+validate\b/iu,
  /\bruff\s+check\b/iu,
  /\btsc\b/iu,
  /\b(?:terraform|tofu)\s+(?:validate|fmt\s+-check)\b/iu
];
function regexMatches(pattern, value) {
  try {
    return new RegExp(pattern.source, pattern.flags).test(value);
  } catch {
    return false;
  }
}
function normalizeCommand(command) {
  let normalized = String(command ?? "").replace(/\s+#\s*retry-ok\b.*$/iu, "").trim();
  normalized = normalized.replace(/\s+2>&1/gu, " ");
  normalized = normalized.replace(/\s+(?:1>>|2>>|1>|2>|>>|>)\s*(?:"[^"]+"|'[^']+'|\S+)\s*$/gu, "");
  while (TRAILING_OBSERVER_PIPE_RE.test(normalized)) {
    normalized = normalized.replace(TRAILING_OBSERVER_PIPE_RE, "").trim();
  }
  return normalized.replace(/\s+/gu, " ").replace(/;+$/u, "").trim();
}
function stripLeadingAssignments(command) {
  let rest = command.trim();
  while (true) {
    const next = rest.match(/^[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+([\s\S]+)$/u);
    if (!next) return rest;
    rest = (next[1] ?? "").trim();
  }
}
function isReadOnlyCommand(command) {
  const trimmed = String(command ?? "").trim();
  if (!trimmed) return true;
  const stripped = stripLeadingAssignments(trimmed);
  if (READ_ONLY_COMMAND_RE.test(stripped)) return true;
  const assignmentSubshell = trimmed.match(/^[A-Za-z_][A-Za-z0-9_]*=\$\(([\s\S]*)\)$/u);
  return assignmentSubshell ? READ_ONLY_COMMAND_RE.test(stripLeadingAssignments(normalizeCommand(assignmentSubshell[1] ?? ""))) : false;
}
function commandHash(command) {
  return createHash2("sha256").update(normalizeCommand(command)).digest("hex");
}
function directCommandWords(command) {
  const words = [];
  let word = "";
  let quote = null;
  let escaped = false;
  const source = String(command ?? "").trim();
  if (!source || /[\r\n]/u.test(source)) return null;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? "";
    if (escaped) {
      word += character;
      escaped = false;
    } else if (character === "\\") escaped = true;
    else if (quote) {
      if (character === quote) quote = null;
      else word += character;
    } else if (character === "'" || character === '"') quote = character;
    else if (/\s/u.test(character)) {
      if (word) words.push(word);
      word = "";
    } else if (";&|<>`".includes(character) || character === "$" && source[index + 1] === "(") return null;
    else word += character;
  }
  if (quote || escaped) return null;
  if (word) words.push(word);
  return words;
}
function commandInputFingerprint(command, cwd, repoRoot2) {
  const words = directCommandWords(command);
  if (!words?.length) return null;
  const root = resolve3(repoRoot2);
  const inputs = [];
  for (const word of words) {
    const candidate = resolve3(cwd, word.replace(/^\.\//u, ""));
    try {
      const real = realpathSync(candidate);
      const rel = relative(root, real).replaceAll("\\", "/");
      if (!rel || rel === ".." || rel.startsWith("../") || !existsSync3(real) || !lstatSync(real).isFile()) continue;
      inputs.push(`${rel}\0${createHash2("sha256").update(readFileSync2(real)).digest("hex")}`);
    } catch {
    }
  }
  if (inputs.length === 0) return null;
  return createHash2("sha256").update([...new Set(inputs)].sort().join("\0")).digest("hex");
}
function failureSignature(command, response) {
  let serialized = "";
  try {
    serialized = JSON.stringify(response ?? null);
  } catch {
    serialized = String(response ?? "");
  }
  const normalizedResponse = serialized.replace(/\u001b\[[0-9;]*m/gu, "").replace(/\s+/gu, " ").trim().slice(-8192);
  return createHash2("sha256").update(`${normalizeCommand(command)}\0${normalizedResponse}`).digest("hex");
}
function inferCommandOutcome(event, forceFailure = false) {
  if (forceFailure) return "failure";
  const response = eventToolResponse(event);
  if (typeof response === "string") {
    const matches2 = [...response.matchAll(/(?:^|\r?\n)(?:Process exited with code|Exit code:?)\s+(-?\d+)(?=\r?\n|$)/giu)];
    const code = matches2.at(-1)?.[1];
    if (code !== void 0) return Number.parseInt(code, 10) === 0 ? "success" : "failure";
  }
  if (isRecord(response)) {
    const code = response.exit_code ?? response.exitCode ?? response.code ?? response.status;
    if (typeof code === "number") return code === 0 ? "success" : "failure";
    if (response.success === false || response.is_error === true || response.isError === true) return "failure";
    if (response.success === true) return "success";
  }
  return "unknown";
}
function isVerificationCommand(command) {
  const normalized = normalizeCommand(command);
  return VERIFY_PATTERNS.some((pattern) => pattern.test(normalized));
}
function estimateSleepSeconds(command, settings) {
  let total = 0;
  for (const match of String(command).matchAll(/\bsleep\s+(\d+(?:\.\d+)?)\b/giu)) total += Number(match[1]);
  if (total <= 0) return 0;
  const range = String(command).match(/\bfor\s+\w+\s+in\s+\{(\d+)\.\.(\d+)\}/iu);
  if (range) {
    const iterations = Number(range[2]) - Number(range[1]) + 1;
    if (iterations > 1) total *= iterations;
  } else if (/\bwhile\s+/iu.test(String(command))) {
    total *= settings.whileLoopAssumedIterations;
  }
  return Math.min(total, settings.maxSleepPerCommandSeconds);
}
function countRemotePolls(command) {
  return REMOTE_POLL_RE.test(String(command)) ? 1 : 0;
}

// plugins/session-governance/src/domains/discipline/lib/state-store.ts
import { mkdirSync as mkdirSync3, readFileSync as readFileSync4 } from "node:fs";
import { dirname as dirname3, join as join4, resolve as resolve4 } from "node:path";

// core/src/plugin-workdir.ts
import { mkdirSync as mkdirSync2, readFileSync as readFileSync3, writeFileSync as writeFileSync2 } from "node:fs";
import { join as join3 } from "node:path";
var PLUGIN_WORKDIR_GITIGNORE = "*\n";
function normalizeGitignore(text) {
  return String(text ?? "").replace(/\r\n/gu, "\n").trim();
}
function isStalePluginWorkdirGitignore(text) {
  const value = normalizeGitignore(text);
  return value === "" || value === "state/" || value === "sessions/";
}
function ensurePluginWorkdirGitignore(pluginRoot2) {
  mkdirSync2(pluginRoot2, { recursive: true, mode: 448 });
  const ignore = join3(pluginRoot2, ".gitignore");
  let current = null;
  try {
    current = readFileSync3(ignore, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (current !== null && normalizeGitignore(current) === "*") return;
  if (current !== null && !isStalePluginWorkdirGitignore(current)) return;
  writeFileSync2(ignore, PLUGIN_WORKDIR_GITIGNORE, { encoding: "utf8", mode: 384 });
}

// plugins/session-governance/src/domains/discipline/lib/state-store.ts
var VERSION = 1;
var STATE_DIR_RELATIVE = ".execution-discipline/state";
function digest(value) {
  return digestKey(value);
}
function ensureStateDir(directory) {
  mkdirSync3(directory, { recursive: true, mode: 448 });
  ensurePluginWorkdirGitignore(dirname3(directory));
}
function statePath(event) {
  const cwd = resolve4(eventCwd(event));
  const session = extractSessionId(event) ?? "default";
  return join4(cwd, STATE_DIR_RELATIVE, `${digest(session)}.json`);
}
function emptyState() {
  return { version: VERSION, updatedAt: 0, edits: {}, command: null, polling: null };
}
function readState(path) {
  if (!path) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync4(path, "utf8"));
    if (!parsed || !isRecord(parsed) || parsed.version !== VERSION) return emptyState();
    return {
      version: VERSION,
      updatedAt: Number(parsed.updatedAt) || 0,
      edits: isRecord(parsed.edits) ? parsed.edits : {},
      command: isRecord(parsed.command) ? parsed.command : null,
      polling: isRecord(parsed.polling) ? parsed.polling : null
    };
  } catch {
    return emptyState();
  }
}
function writeState(path, state) {
  if (!path) return false;
  ensureStateDir(dirname3(path));
  return withPathLock(path, () => atomicWriteJson(path, state));
}
function updateState(event, updater) {
  const path = statePath(event);
  if (!path) return null;
  try {
    const state = readState(path);
    const result = updater(state);
    state.updatedAt = Date.now();
    if (!writeState(path, state)) return null;
    return result;
  } catch {
    return null;
  }
}

// plugins/session-governance/src/domains/discipline/entries/hooks/execution-discipline.ts
function warn(message) {
  process.stderr.write(`[execution-discipline] ${message}
`);
}
function relativePath(path, repoRoot2, cwd) {
  const base = repoRoot2 ?? cwd;
  const candidate = relative2(base, path).replaceAll("\\", "/");
  return candidate.startsWith("../") ? path.replaceAll("\\", "/") : candidate;
}
function actionFor(mode2, streak, reportAt, blockAt) {
  if (mode2 === "off" || streak < reportAt) return "allow";
  if (mode2 === "block" && streak >= blockAt) return "block";
  return "report";
}
function retryMessage({ action, command, outcome, streak, blockAt, windowMinutes }) {
  const kind = outcome === "failure" ? "failed command" : "successful command";
  const lines = [
    `[Execution Loop Guard] ${kind} repeated ${streak} times`,
    `Command: ${normalizeCommand(command).slice(0, 160)}`,
    ""
  ];
  if (action === "block") {
    lines.push(
      "blockingContract:",
      `  observedFacts: The same ${kind} reached the blocking threshold within a ${windowMinutes}-minute window.`,
      "  harm: Repeating a command without analyzing its result cannot make progress and consumes session and external resources.",
      "  unblockWhen: Read the latest output, form a new root-cause hypothesis, or change the implementation, parameters, or environment before verifying again.",
      "  recovery: Fix the root cause and rerun; append `# retry-ok` when the repetition is intentional.",
      "",
      "This block cleared the command's repetition cycle; start a new cycle after fixing the cause."
    );
  } else {
    lines.push(
      `${Math.max(0, blockAt - streak)} more repetition(s) will trigger a block.`,
      "Inspect the previous output first and confirm that another run can produce new evidence."
    );
  }
  return lines.join("\n");
}
function pollingMessage(action, command, sleepSum, querySum, settings, requested = false) {
  const lines = [
    `[Execution Loop Guard] ${requested ? "Requested wait budget exceeded: requested approximately" : "Remote polling budget exceeded: approximately"} ${Math.round(sleepSum)}s of wait and ${querySum} status queries in the last ${settings.windowMinutes} minutes`,
    `Current command: ${String(command).trim().slice(0, 160)}`,
    ""
  ];
  if (action === "block") {
    lines.push(
      "blockingContract:",
      "  observedFacts: Remote status queries or explicit sleeps reached the current window budget.",
      "  harm: Polling without a termination condition continually consumes session, runner, and remote API resources.",
      "  unblockWhen: Use a supervised flow with a total budget, backoff, and termination condition, or take one status snapshot.",
      "  recovery: Append `# poll-ok` when the wait is intentional; that command will not count toward the budget."
    );
  } else {
    lines.push(
      "Use a supervised flow with a total budget, backoff, and termination condition; run one status query when only a snapshot is needed.",
      "Append `# poll-ok` when the wait is intentional; that command will not count toward the budget."
    );
  }
  return lines.join("\n");
}
function runPre(event, config, repoRoot2, cwd) {
  const command = extractShellCommand(event);
  const toolWait = extractToolWait(event);
  if (!command?.trim() && !toolWait) return;
  const now = Date.now();
  const decision = updateState(event, (state) => {
    const reports = [];
    let block = null;
    const repeat = config.commandRepeat;
    const retryBypass = command?.trim() ? regexMatches(repeat.retryBypass, command) : false;
    if (command?.trim() && retryBypass) {
      state.command = null;
    } else if (command?.trim() && !isReadOnlyCommand(command)) {
      const normalizedHash = commandHash(command);
      const inputFingerprint = commandInputFingerprint(command, cwd, repoRoot2);
      const previous = state.command && now - Number(state.command.lastSeen) <= repeat.windowMinutes * 6e4 ? state.command : null;
      if (previous?.commandHash === normalizedHash && (previous.inputFingerprint ?? null) === inputFingerprint && (previous.lastOutcome === "failure" || previous.lastOutcome === "success")) {
        const failed = previous.lastOutcome === "failure";
        const streak = (failed ? Number(previous.failStreak) : Number(previous.successStreak)) + 1;
        const mode2 = failed ? config.checks.failedCommandRetry : config.checks.successfulCommandRepeat;
        const reportAt = failed ? repeat.failureReportAt : repeat.successReportAt;
        const blockAt = failed ? repeat.failureBlockAt : repeat.successBlockAt;
        const action = actionFor(mode2, streak, reportAt, blockAt);
        if (action !== "allow") {
          const message = retryMessage({
            action,
            command,
            outcome: failed ? "failure" : "success",
            streak,
            blockAt,
            windowMinutes: repeat.windowMinutes
          });
          if (action === "block") {
            state.command = null;
            block = message;
          } else reports.push(message);
        }
      }
    }
    const bypassPolling = Boolean(command?.trim() && regexMatches(config.polling.pollBypass, command));
    if (!block && config.checks.remotePolling !== "off" && !bypassPolling) {
      const sleepSeconds = toolWait ? Math.min(toolWait.sleepSeconds, config.polling.maxSleepPerCommandSeconds) : estimateSleepSeconds(command, config.polling);
      const queryCount = toolWait?.queryCount ?? countRemotePolls(command);
      if (sleepSeconds > 0 || queryCount > 0) {
        const windowMs = config.polling.windowMinutes * 6e4;
        const previous = state.polling && now - Number(state.polling.lastSeen) <= windowMs ? state.polling : null;
        const entries = Array.isArray(previous?.entries) ? previous.entries.filter((entry) => now - Number(entry.at) <= windowMs) : [];
        entries.push({ at: now, sleepSeconds, queryCount });
        const sleepSum = entries.reduce((sum, entry) => sum + Number(entry.sleepSeconds || 0), 0);
        const querySum = entries.reduce((sum, entry) => sum + Number(entry.queryCount || 0), 0);
        const overBudget = sleepSum >= config.polling.sleepBudgetSeconds || querySum >= config.polling.queryBudgetCount;
        const lastReportAt = Number(previous?.lastReportAt) || 0;
        const cooledDown = now - lastReportAt >= config.polling.cooldownMinutes * 6e4;
        if (overBudget && cooledDown) {
          const action = config.checks.remotePolling === "block" ? "block" : "report";
          const message = pollingMessage(action, toolWait?.label ?? command, sleepSum, querySum, config.polling, Boolean(toolWait));
          if (config.checks.remotePolling === "block") block = message;
          else reports.push(message);
        }
        state.polling = {
          entries,
          lastReportAt: overBudget && cooledDown ? now : lastReportAt,
          lastSeen: now
        };
      }
    }
    return { block, reports };
  });
  if (!decision) return;
  if (decision.block) writeJson(preToolDeny(decision.block));
  else if (decision.reports.length > 0) writeJson(contextOutput("PreToolUse", decision.reports.join("\n\n")));
}
function recordCommandOutcome(event, config, forceFailure, repoRoot2, cwd) {
  const command = extractShellCommand(event);
  if (!command?.trim()) return;
  const now = Date.now();
  updateState(event, (state) => {
    if (regexMatches(config.commandRepeat.retryBypass, command)) {
      state.command = null;
      return;
    }
    if (isReadOnlyCommand(command)) return;
    const outcome = inferCommandOutcome(event, forceFailure);
    const normalizedHash = commandHash(command);
    const inputFingerprint = commandInputFingerprint(command, cwd, repoRoot2);
    const previous = state.command && now - Number(state.command.lastSeen) <= config.commandRepeat.windowMinutes * 6e4 && state.command.commandHash === normalizedHash && (state.command.inputFingerprint ?? null) === inputFingerprint ? state.command : null;
    const signature = outcome === "failure" ? failureSignature(command, eventToolResponse(event)) : null;
    const sameFailure = outcome === "failure" && previous?.lastOutcome === "failure" && previous.failureSignature === signature;
    state.command = {
      commandHash: normalizedHash,
      inputFingerprint,
      failStreak: outcome === "failure" ? sameFailure && previous ? Number(previous.failStreak) + 1 : 1 : 0,
      successStreak: outcome === "success" && previous?.lastOutcome === "success" ? Number(previous.successStreak) + 1 : outcome === "success" ? 1 : 0,
      lastOutcome: outcome,
      failureSignature: signature,
      lastSeen: now
    };
    if (outcome === "success" && isVerificationCommand(command)) state.edits = {};
  });
}
function editMessage(action, findings, settings) {
  const lines = [
    `[Execution Loop Guard] ${action === "block" ? "Edit loop blocked" : "High-frequency edits detected"}`,
    "",
    ...findings.map((finding) => `- ${finding.path}: ${finding.count} edit(s) in the last ${settings.windowMinutes} minutes`),
    ""
  ];
  if (action === "block") {
    lines.push(
      "blockingContract:",
      "  observedFacts: The same file reached the edit blocking threshold within the rolling window.",
      "  harm: Repeated small edits usually indicate an unstable root cause, incomplete file understanding, or missing verification feedback.",
      "  unblockWhen: Reread the complete file, diff, and verification output, then form a falsifiable hypothesis and minimal change.",
      "  recovery: Run relevant verification or revise the plan first; successful verification clears this session's edit counts.",
      "",
      "The blocked files' count cycles were cleared; the next edit starts a new cycle."
    );
  } else {
    lines.push(`The guard blocks at ${settings.blockAt} edits; a successful test, lint, typecheck, or other verification command clears this session's edit counts.`);
  }
  return lines.join("\n");
}
function recordEdits(event, config, repoRoot2, cwd) {
  const targets = extractFileTargets2(event);
  if (targets.length === 0 || config.checks.editLoop === "off") return;
  const now = Date.now();
  const result = updateState(event, (state) => {
    const findings = [];
    const windowMs = config.editLoop.windowMinutes * 6e4;
    for (const target of targets) {
      const path = relativePath(target, repoRoot2, cwd);
      if (config.editLoop.exemptPaths.some((pattern) => regexMatches(pattern, path))) continue;
      const key = digest(resolve5(target));
      const previous = state.edits[key];
      const timestamps = Array.isArray(previous?.timestamps) ? previous.timestamps.filter((timestamp) => now - Number(timestamp) <= windowMs) : [];
      timestamps.push(now);
      const count = timestamps.length;
      const action2 = actionFor(
        config.checks.editLoop,
        count,
        config.editLoop.reportAt,
        config.editLoop.blockAt
      );
      if (action2 === "block") delete state.edits[key];
      else state.edits[key] = { timestamps };
      if (action2 !== "allow") findings.push({ path, count, action: action2 });
    }
    return findings;
  });
  if (!result?.length) return;
  const action = result.some((finding) => finding.action === "block") ? "block" : "report";
  const message = editMessage(action, result, config.editLoop);
  if (action === "block") {
    process.stderr.write(`${message}
`);
    process.exitCode = 2;
  } else {
    writeJson(contextOutput("PostToolUse", message));
  }
}
function isHookMode(value) {
  return value === "pre" || value === "post" || value === "failure";
}
async function main(mode2 = process.argv[2]) {
  const event = await readStdinJson();
  if (event.__parseError || !isHookMode(mode2)) return;
  const cwd = resolve5(eventCwd(event));
  const { config, repoRoot: repoRoot2 } = await loadProjectConfig(cwd, warn);
  if (mode2 === "pre") {
    runPre(event, config, repoRoot2, cwd);
    return;
  }
  recordCommandOutcome(event, config, mode2 === "failure", repoRoot2, cwd);
  if (mode2 === "post") recordEdits(event, config, repoRoot2, cwd);
}

// plugins/session-governance/src/domains/intent/lib/hook-io.ts
var readStdinJson2 = readStdinJson;
function extractSessionId2(event, env = process.env) {
  const value = eventSessionId(event) || env.AI_EXPERTS_SESSION_ID;
  if (typeof value !== "string" || !value.trim() || value === "hook") return null;
  return value.trim();
}
function platformDataRoot(env = process.env) {
  if (env.CLAUDE_PLUGIN_ROOT && env.CLAUDE_PLUGIN_DATA) {
    return { platform: "claude", root: env.CLAUDE_PLUGIN_DATA };
  }
  if (env.PLUGIN_ROOT && env.PLUGIN_DATA) {
    return { platform: "codex", root: env.PLUGIN_DATA };
  }
  return null;
}
function additionalContextOutput(hookEventName, text) {
  return additionalContext(hookEventName, text);
}

// plugins/session-governance/src/domains/intent/lib/first-prompt-state.ts
import { createHash as createHash3 } from "node:crypto";
import { mkdirSync as mkdirSync4, writeFileSync as writeFileSync3 } from "node:fs";
import { join as join5 } from "node:path";
var VERSION2 = 1;
function digest2(value) {
  return createHash3("sha256").update(String(value)).digest("hex");
}
function claimFirstPrompt(event, env = process.env, now = /* @__PURE__ */ new Date()) {
  const sessionId = extractSessionId2(event, env);
  const data = platformDataRoot(env);
  if (!sessionId || !data) {
    return {
      claimed: true,
      persisted: false,
      path: null,
      reason: "session identity or platform data root is unavailable; injecting without sticky state"
    };
  }
  const directory = join5(data.root, "intent-discovery", "first-prompts");
  const path = join5(directory, `${digest2(`${data.platform}:${sessionId}`)}.json`);
  try {
    mkdirSync4(directory, { recursive: true, mode: 448 });
    writeFileSync3(path, `${JSON.stringify({ version: VERSION2, injectedAt: now.toISOString() })}
`, {
      encoding: "utf8",
      mode: 384,
      flag: "wx"
    });
    return { claimed: true, persisted: true, path, reason: null };
  } catch (error) {
    if (isRecord(error) && error.code === "EEXIST") {
      return { claimed: false, persisted: true, path, reason: null };
    }
    return {
      claimed: true,
      persisted: false,
      path,
      reason: `first-prompt state was not persisted: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// plugins/session-governance/src/domains/intent/entries/hooks/intent-discovery.ts
function warn2(message) {
  process.stderr.write(`[intent-discovery] ${message}
`);
}
function firstTurnContext() {
  return [
    "[intent-discovery:first-turn]",
    "First classify whether discovery can change the work. If the request already states a concrete target, outcome, constraints, and acceptance, treat it as light: do not load the Skill or spawn discovery workers; inspect the named seam and continue directly.",
    "For concrete repository work, bound local discovery to the named seam, callers, tests, documentation, and history. Time-box it: when repeated evidence appears, stop searching and reproduce the behavior.",
    "Do not search for hidden evaluator artifacts, solution patches, or answer caches. Treat unavailable evidence as unavailable and proceed from the repository contract.",
    "Load and follow the bundled `intent-discovery` Skill only when unresolved interpretations would materially change the deliverable or implementation.",
    "Front-load repository and source facts, use bounded parallel subagents only when their independent evidence can change the approach, and reconcile their result cards in the parent agent.",
    "Do not stop to ask the user for clarification or approval as part of this discovery pass. Choose a bounded, reversible assumption when needed, state material assumptions briefly, and continue with the request."
  ].join("\n");
}
function runPrompt(event, env = process.env) {
  const claim = claimFirstPrompt(event, env);
  if (!claim.claimed) return;
  if (!claim.persisted && claim.reason) warn2(claim.reason);
  writeJson(additionalContextOutput("UserPromptSubmit", firstTurnContext()));
}
async function main2() {
  const mode2 = process.argv[2] ?? "prompt";
  if (!(/* @__PURE__ */ new Set(["prompt", "user-prompt", "UserPromptSubmit"])).has(mode2)) return;
  const event = await readStdinJson2();
  if (event.__parseError) return;
  runPrompt(event);
}

// plugins/session-governance/src/domains/language/lib/config.ts
import { execFileSync as execFileSync2 } from "node:child_process";
import { existsSync as existsSync4, readFileSync as readFileSync5 } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute as isAbsolute2, join as join6, resolve as resolve6 } from "node:path";
import { pathToFileURL as pathToFileURL2 } from "node:url";

// plugins/session-governance/src/domains/language/lib/profiles.ts
var PROFILE_IDS = Object.freeze([
  "zh-CN",
  "zh-TW",
  "en-US",
  "ja-JP",
  "ko-KR",
  "th-TH"
]);
var PROFILE_DEFINITIONS = {
  "zh-CN": {
    label: "Simplified Chinese",
    allowedScripts: ["han"],
    aliases: /简体中文|簡體中文|简体|簡體|简中|汉语|\bSimplified Chinese\b/iu,
    sessionInstruction: "Use Simplified Chinese for natural-language explanations. Do not use Traditional Chinese characters.",
    rewriteInstruction: "Rewrite the complete previous response in Simplified Chinese."
  },
  "zh-TW": {
    label: "Traditional Chinese",
    allowedScripts: ["han"],
    aliases: /繁體中文|繁体中文|繁體|繁体|正體中文|正体中文|漢語|\bTraditional Chinese\b/iu,
    sessionInstruction: "Use Traditional Chinese for natural-language explanations. Do not use Simplified Chinese characters.",
    rewriteInstruction: "Rewrite the complete previous response in Traditional Chinese."
  },
  "en-US": {
    label: "English",
    allowedScripts: [],
    aliases: /英文|英语|\bEnglish\b/iu,
    sessionInstruction: "Use English for natural-language explanations.",
    rewriteInstruction: "Rewrite the complete previous response in English."
  },
  "ja-JP": {
    label: "Japanese",
    allowedScripts: ["han", "kana"],
    aliases: /日文|日语|日本語|\bJapanese\b/iu,
    sessionInstruction: "Use Japanese for natural-language explanations. Do not write Chinese-only Han without kana.",
    rewriteInstruction: "Rewrite the complete previous response in Japanese."
  },
  "ko-KR": {
    label: "Korean",
    allowedScripts: ["hangul"],
    aliases: /韩文|韩语|朝鲜语|한국어|\bKorean\b/iu,
    sessionInstruction: "Use Korean for natural-language explanations.",
    rewriteInstruction: "Rewrite the complete previous response in Korean."
  },
  "th-TH": {
    label: "Thai",
    allowedScripts: ["thai"],
    aliases: /泰文|泰语|ภาษาไทย|\bThai\b/iu,
    sessionInstruction: "Use Thai for natural-language explanations.",
    rewriteInstruction: "Rewrite the complete previous response in Thai."
  }
};
function freezeProfile(id, profile) {
  return Object.freeze({
    id,
    ...profile,
    allowedScripts: Object.freeze(profile.allowedScripts)
  });
}
var PROFILES = Object.freeze({
  "zh-CN": freezeProfile("zh-CN", PROFILE_DEFINITIONS["zh-CN"]),
  "zh-TW": freezeProfile("zh-TW", PROFILE_DEFINITIONS["zh-TW"]),
  "en-US": freezeProfile("en-US", PROFILE_DEFINITIONS["en-US"]),
  "ja-JP": freezeProfile("ja-JP", PROFILE_DEFINITIONS["ja-JP"]),
  "ko-KR": freezeProfile("ko-KR", PROFILE_DEFINITIONS["ko-KR"]),
  "th-TH": freezeProfile("th-TH", PROFILE_DEFINITIONS["th-TH"])
});
function isProfileId(value) {
  return typeof value === "string" && PROFILE_IDS.includes(value);
}
function profileFor(value) {
  return PROFILES[isProfileId(value) ? value : "zh-CN"];
}

// plugins/session-governance/src/domains/language/lib/config.ts
var CONFIG_NAME = ".language-output.mjs";
var USER_CONFIG_RELATIVE_PATH = "harness-start/language-output.json";
var TOP_LEVEL_KEYS = /* @__PURE__ */ new Set(["defaultProfile", "artifactProfile", "toolFeedback", "stop", "detection"]);
var DETECTION_KEYS = /* @__PURE__ */ new Set(["minScriptCharacters", "minLetterRatio"]);
var DEFAULT_CONFIG2 = Object.freeze({
  defaultProfile: "zh-CN",
  artifactProfile: null,
  toolFeedback: "report",
  stop: "block",
  detection: Object.freeze({
    minScriptCharacters: 12,
    minLetterRatio: 0.25
  })
});
function strictDefault() {
  return { ...DEFAULT_CONFIG2, detection: { ...DEFAULT_CONFIG2.detection } };
}
function isToolFeedbackMode(value) {
  return value === "report" || value === "off";
}
function isStopMode(value) {
  return value === "block" || value === "off";
}
function resolveConfig2(source) {
  if (!isRecord(source)) {
    throw new Error("default export must be an object");
  }
  if (Object.keys(source).some((key) => !TOP_LEVEL_KEYS.has(key))) {
    throw new Error("unsupported top-level field");
  }
  if (source.defaultProfile !== void 0 && !isProfileId(source.defaultProfile)) {
    throw new Error("defaultProfile must be zh-CN, zh-TW, en-US, ja-JP, ko-KR, or th-TH");
  }
  if (source.artifactProfile !== void 0 && source.artifactProfile !== null && !isProfileId(source.artifactProfile)) {
    throw new Error("artifactProfile must be null, zh-CN, zh-TW, en-US, ja-JP, ko-KR, or th-TH");
  }
  if (source.toolFeedback !== void 0 && !isToolFeedbackMode(source.toolFeedback)) {
    throw new Error("toolFeedback must be report or off");
  }
  if (source.stop !== void 0 && !isStopMode(source.stop)) {
    throw new Error("stop must be block or off");
  }
  const detection = source.detection ?? {};
  if (!isRecord(detection)) {
    throw new Error("detection must be an object");
  }
  if (Object.keys(detection).some((key) => !DETECTION_KEYS.has(key))) {
    throw new Error("unsupported detection field");
  }
  const minScriptCharacters = detection.minScriptCharacters ?? DEFAULT_CONFIG2.detection.minScriptCharacters;
  const minLetterRatio = detection.minLetterRatio ?? DEFAULT_CONFIG2.detection.minLetterRatio;
  if (typeof minScriptCharacters !== "number" || !Number.isInteger(minScriptCharacters) || minScriptCharacters < 1 || minScriptCharacters > 100) {
    throw new Error("minScriptCharacters must be an integer from 1 to 100");
  }
  if (typeof minLetterRatio !== "number" || minLetterRatio < 0.01 || minLetterRatio > 1) {
    throw new Error("minLetterRatio must be a number from 0.01 to 1");
  }
  return {
    defaultProfile: isProfileId(source.defaultProfile) ? source.defaultProfile : DEFAULT_CONFIG2.defaultProfile,
    artifactProfile: isProfileId(source.artifactProfile) ? source.artifactProfile : null,
    toolFeedback: isToolFeedbackMode(source.toolFeedback) ? source.toolFeedback : DEFAULT_CONFIG2.toolFeedback,
    stop: isStopMode(source.stop) ? source.stop : DEFAULT_CONFIG2.stop,
    detection: { minScriptCharacters, minLetterRatio }
  };
}
function repoRoot(cwd) {
  try {
    return execFileSync2("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5e3
    }).trim();
  } catch {
    return resolve6(cwd);
  }
}
function userConfigPath(env = process.env) {
  if (env.HARNESS_HOST === "claude") {
    return join6(env.CLAUDE_CONFIG_DIR || join6(homedir(), ".claude"), USER_CONFIG_RELATIVE_PATH);
  }
  if (env.HARNESS_HOST === "codex") {
    return join6(env.CODEX_HOME || join6(homedir(), ".codex"), USER_CONFIG_RELATIVE_PATH);
  }
  return null;
}
function loadUserConfig(path) {
  if (!path || !existsSync4(path)) return null;
  return JSON.parse(readFileSync5(path, "utf8"));
}
async function loadConfig(cwd, warn6 = () => {
}) {
  const root = repoRoot(isAbsolute2(cwd) ? cwd : resolve6(cwd));
  const path = join6(root, CONFIG_NAME);
  const globalPath = userConfigPath();
  if (!existsSync4(path)) {
    if (!globalPath || !existsSync4(globalPath)) {
      return { config: strictDefault(), path: null };
    }
    try {
      return { config: resolveConfig2(loadUserConfig(globalPath)), path: globalPath };
    } catch (error) {
      warn6(`invalid ${globalPath}; using strict defaults: ${error instanceof Error ? error.message : String(error)}`);
      return { config: strictDefault(), path: globalPath };
    }
  }
  try {
    const imported = await import(`${pathToFileURL2(path).href}?language-output=${Date.now()}`);
    return { config: resolveConfig2(imported.default ?? imported), path };
  } catch (error) {
    warn6(`invalid ${path}; using strict defaults: ${error instanceof Error ? error.message : String(error)}`);
    return { config: strictDefault(), path };
  }
}

// plugins/session-governance/src/domains/language/lib/hook-io.ts
function extractSessionId3(event) {
  const value = eventSessionId(event);
  return value || null;
}
function extractSource(event) {
  return typeof event.source === "string" ? event.source : "startup";
}
function patchAddedText(command) {
  return String(command ?? "").split(/\r?\n/u).filter((line) => line.startsWith("+") && !line.startsWith("+++")).map((line) => line.slice(1)).join("\n");
}
function quotedShellText(command) {
  const values = [];
  const pattern = /'([^']*)'|"((?:\\.|[^"\\])*)"/gu;
  for (const match of String(command ?? "").matchAll(pattern)) {
    const value = match[1] ?? match[2] ?? "";
    if (value) values.push(value);
  }
  return values.join("\n");
}
function generatedToolText(event) {
  const input = eventToolInput(event);
  const tool = canonicalToolName(eventToolName(event));
  if (tool === "bash" || tool === "execcommand" || tool === "shellcommand") {
    const command = typeof input.command === "string" ? input.command : typeof input.cmd === "string" ? input.cmd : "";
    const quoted = quotedShellText(command);
    return quoted ? `${command}
${quoted}` : command;
  }
  if (tool === "write") return typeof input.content === "string" ? input.content : "";
  if (tool === "edit") {
    const next = input.new_string ?? input.newString;
    return typeof next === "string" ? next : "";
  }
  if (tool === "multiedit") {
    return Array.isArray(input.edits) ? input.edits.map((edit) => {
      if (!isRecord(edit)) return "";
      const next = edit.new_string ?? edit.newString;
      return typeof next === "string" ? next : "";
    }).filter(Boolean).join("\n") : "";
  }
  if (tool === "applypatch") {
    return [input.command, input.input, input.patch].filter((value) => typeof value === "string").map(patchAddedText).filter(Boolean).join("\n");
  }
  return "";
}
function extractFileTargets3(event) {
  return extractFileTargets(event, { tools: "any" });
}
function additionalContextOutput2(hookEventName, text) {
  return additionalContext(hookEventName, text);
}
function supportsPostToolFeedback() {
  return true;
}
function postToolFeedbackOutput(text) {
  return additionalContextOutput2("PostToolUse", text);
}
function warn3(message) {
  process.stderr.write(`[language-output] ${message}
`);
}

// plugins/session-governance/src/domains/language/lib/han-variants.ts
var HAN_VARIANT_PAIRS = Object.freeze([
  [19994, 26989],
  [19996, 26481],
  [20010, 20491],
  [20026, 28858],
  [20040, 40636],
  [20064, 32722],
  [20080, 36023],
  [20135, 29986],
  [20146, 35242],
  [20165, 20677],
  [20174, 24478],
  [20202, 20736],
  [20204, 20497],
  [20248, 20778],
  [20250, 26371],
  [20255, 20553],
  [20256, 20659],
  [20260, 20663],
  [20262, 20523],
  [20266, 20605],
  [20307, 39636],
  [20390, 20597],
  [20391, 20596],
  [20461, 20745],
  [20457, 20486],
  [20538, 20661],
  [20542, 20670],
  [20826, 40680],
  [20851, 38364],
  [20889, 23531],
  [20891, 36557],
  [20987, 25802],
  [21017, 21063],
  [21150, 36774],
  [21160, 21205],
  [21306, 21312],
  [21327, 21332],
  [21333, 21934],
  [21334, 36067],
  [21381, 24307],
  [21439, 32291],
  [21452, 38617],
  [21464, 35722],
  [21495, 34399],
  [21527, 21966],
  [21548, 32893],
  [21592, 21729],
  [22269, 22283],
  [22788, 34389],
  [22791, 20633],
  [22815, 22816],
  [22836, 38957],
  [23398, 23416],
  [23454, 23526],
  [23545, 23565],
  [23548, 23566],
  [24110, 24171],
  [24191, 24291],
  [24198, 24950],
  [24211, 24235],
  [24212, 25033],
  [24320, 38283],
  [24352, 24373],
  [24403, 30070],
  [24405, 37636],
  [25112, 25136],
  [25143, 25142],
  [25454, 25818],
  [25253, 22577],
  [25968, 25976],
  [26080, 28961],
  [26102, 26178],
  [26426, 27231],
  [26465, 26781],
  [26469, 20358],
  [26500, 27083],
  [26679, 27171],
  [26816, 27298],
  [27721, 28450],
  [27809, 27794],
  [27979, 28204],
  [28857, 40670],
  [29616, 29694],
  [31181, 31278],
  [31616, 31777],
  [32423, 32026],
  [32452, 32068],
  [32463, 32147],
  [32467, 32080],
  [32473, 32102],
  [32493, 32396],
  [32447, 32218],
  [32593, 32178],
  [30721, 30908],
  [32852, 32879],
  [35745, 35336],
  [35748, 35469],
  [35753, 35731],
  [35758, 35696],
  [35760, 35352],
  [35768, 35377],
  [35770, 35542],
  [35774, 35373],
  [35782, 35672],
  [35785, 35380],
  [35805, 35441],
  [35813, 35442],
  [35821, 35486],
  [35823, 35492],
  [35828, 35498],
  [35831, 35531],
  [35835, 35712],
  [36131, 36012],
  [36133, 25943],
  [36135, 36008],
  [36136, 36074],
  [36153, 36027],
  [36164, 36039],
  [36187, 36093],
  [36190, 36106],
  [36710, 36554],
  [36724, 36600],
  [36731, 36629],
  [36733, 36617],
  [36739, 36611],
  [36741, 36628],
  [36744, 36649],
  [36753, 36655],
  [36755, 36664],
  [36798, 36948],
  [36793, 37002],
  [36807, 36942],
  [36824, 36996],
  [36825, 36889],
  [36827, 36914],
  [36830, 36899],
  [36873, 36984],
  [38065, 37666],
  [38169, 37679],
  [38271, 38263],
  [38376, 38272],
  [38381, 38281],
  [38382, 21839],
  [38388, 38291],
  [38431, 38538],
  [39029, 38913],
  [39033, 38917],
  [39034, 38918],
  [39039, 38931],
  [39044, 38928],
  [39046, 38936],
  [39057, 38971],
  [39064, 38988],
  [39068, 38991],
  [39069, 38989],
  [39118, 39080],
  [39134, 39131],
  [39277, 39151],
  [39302, 39208],
  [39532, 39340],
  [39564, 39511],
  [40060, 39770],
  [40479, 40165],
  [40481, 38622],
  [40483, 40180],
  [40857, 40845],
  [19982, 33287],
  [20110, 26044],
  [20869, 20839],
  [30005, 38651],
  [35265, 35211]
]);
var SIMPLIFIED = new Set(HAN_VARIANT_PAIRS.map(([simplified]) => String.fromCodePoint(simplified)));
var TRADITIONAL = new Set(HAN_VARIANT_PAIRS.map(([, traditional]) => String.fromCodePoint(traditional)));
function countHanVariants(text) {
  let simplified = 0;
  let traditional = 0;
  for (const character of String(text ?? "")) {
    if (SIMPLIFIED.has(character)) simplified += 1;
    else if (TRADITIONAL.has(character)) traditional += 1;
  }
  return { simplified, traditional };
}

// plugins/session-governance/src/domains/language/lib/language-drift.ts
var LETTER_RE = new RegExp("\\p{L}", "gu");
var SCRIPT_PATTERNS = {
  han: new RegExp("\\p{Script=Han}", "gu"),
  hangul: new RegExp("\\p{Script=Hangul}", "gu"),
  kana: /[\p{Script=Hiragana}\p{Script=Katakana}]/gu,
  thai: new RegExp("\\p{Script=Thai}", "gu")
};
var SCRIPT_KEYS = ["han", "hangul", "kana", "thai"];
var MIN_VARIANT_CHARACTERS = 3;
var MIN_JAPANESE_KANA = 2;
var SCRIPT_LABELS = Object.freeze({
  han: "Han",
  hangul: "Hangul",
  kana: "Kana",
  thai: "Thai",
  "han-traditional": "Traditional Chinese",
  "han-simplified": "Simplified Chinese",
  "han-chinese": "Chinese Han"
});
function matchCount(text, pattern) {
  return text.match(pattern)?.length ?? 0;
}
function findingForSegment(segment, script, detection) {
  const scriptCharacters = matchCount(segment, SCRIPT_PATTERNS[script]);
  if (scriptCharacters < detection.minScriptCharacters) return null;
  const letters = matchCount(segment, LETTER_RE);
  const letterRatio = letters === 0 ? 0 : scriptCharacters / letters;
  if (letterRatio < detection.minLetterRatio) return null;
  return { script, scriptCharacters, letterRatio };
}
function stripNonProseMarkdown(text) {
  return text.replace(/```[\s\S]*?(?:```|$)/gu, "").replace(/~~~[\s\S]*?(?:~~~|$)/gu, "").replace(/`[^`\n]*`/gu, "").replace(/^\s*>.*$/gmu, "").replace(/\]\([^\n)]*\)/gu, "]").replace(/https?:\/\/\S+/gu, "");
}
function allowedScripts(preferredProfile, authorizedProfiles = []) {
  const ids = [preferredProfile, ...authorizedProfiles];
  return new Set(ids.flatMap((id) => profileFor(id).allowedScripts));
}
function allowedHanOrthography(preferredProfile, authorizedProfiles = []) {
  const ids = new Set([preferredProfile, ...authorizedProfiles].filter(Boolean));
  return {
    simplified: ids.has("zh-CN"),
    traditional: ids.has("zh-TW"),
    japanese: ids.has("ja-JP")
  };
}
function strongestFinding(segments, detect) {
  let strongest = null;
  for (const segment of segments) {
    const finding = detect(segment);
    if (finding && (!strongest || finding.scriptCharacters > strongest.scriptCharacters)) {
      strongest = finding;
    }
  }
  return strongest;
}
function variantFinding(segment, script, count, detection) {
  if (count < MIN_VARIANT_CHARACTERS) return null;
  const letters = matchCount(segment, LETTER_RE);
  const letterRatio = letters === 0 ? 0 : count / letters;
  if (letterRatio < detection.minLetterRatio) return null;
  return { script, scriptCharacters: count, letterRatio };
}
function detectHanOrthography(candidate, preferredProfile, authorizedProfiles, detection) {
  const allow = allowedHanOrthography(preferredProfile, authorizedProfiles);
  const segments = [...candidate.split(/\r?\n/u), candidate];
  const findings = [];
  if (allow.japanese && !allow.simplified && !allow.traditional) {
    const finding2 = strongestFinding(segments, (segment) => {
      if (matchCount(segment, SCRIPT_PATTERNS.kana) >= MIN_JAPANESE_KANA) return null;
      const base = findingForSegment(segment, "han", detection);
      return base ? { ...base, script: "han-chinese" } : null;
    });
    if (finding2) findings.push(finding2);
    return findings;
  }
  if (allow.simplified === allow.traditional) return findings;
  const script = allow.simplified ? "han-traditional" : "han-simplified";
  const finding = strongestFinding(segments, (segment) => {
    const counts = countHanVariants(segment);
    const count = allow.simplified ? counts.traditional > counts.simplified ? counts.traditional : 0 : counts.simplified > counts.traditional ? counts.simplified : 0;
    return variantFinding(segment, script, count, detection);
  });
  if (finding) findings.push(finding);
  return findings;
}
function detectLanguageDrift(text, {
  preferredProfile = "zh-CN",
  authorizedProfiles = [],
  detection = { minScriptCharacters: 12, minLetterRatio: 0.25 },
  stripMarkdown = true
} = {}) {
  if (typeof text !== "string" || !text) return [];
  const allowed = allowedScripts(preferredProfile, authorizedProfiles);
  const candidate = stripMarkdown ? stripNonProseMarkdown(text) : text;
  const segments = [...candidate.split(/\r?\n/u), candidate];
  const findings = [];
  for (const script of SCRIPT_KEYS) {
    if (allowed.has(script)) continue;
    let strongest = null;
    for (const segment of segments) {
      const finding = findingForSegment(segment, script, detection);
      if (finding && (!strongest || finding.scriptCharacters > strongest.scriptCharacters)) {
        strongest = finding;
      }
    }
    if (strongest) findings.push(strongest);
  }
  findings.push(...detectHanOrthography(candidate, preferredProfile, authorizedProfiles, detection));
  return findings;
}

// plugins/session-governance/src/domains/language/lib/policy.ts
var RESPONSE_CONTENT = "All agent-authored natural-language values in responses, including values inside JSON, YAML, TOML, XML, Markdown machine blocks, and tables, must use the response language profile.";
var ARTIFACT_CONTENT = "Generated natural-language values in files must use the artifact language profile.";
var TECHNICAL_EXCEPTION = "Schema names, keys, enum literals, IDs, identifiers, variables, code, commands, paths, flags, APIs, and types remain unchanged. Verbatim quotations and explicitly requested translation content may retain their source or target language. A natural-language value is not exempt merely because it appears inside structured data or a code fence.";
function sessionContext(profileId, artifactProfileId) {
  const profile = profileFor(profileId);
  const artifactProfile = artifactProfileId ? profileFor(artifactProfileId) : profile;
  return [
    `[language-output] profile=${profile.id} artifact-profile=${artifactProfile.id}`,
    profile.sessionInstruction,
    RESPONSE_CONTENT,
    `For generated files, an explicit user or project-owned artifact language requirement takes precedence; otherwise use the artifact language profile ${artifactProfile.id}.`,
    TECHNICAL_EXCEPTION,
    "An explicit user request for another response language updates the session profile; a translation request authorizes only its target language."
  ].join("\n");
}
function toolFeedback(profileId, finding, targets = []) {
  const profile = profileFor(profileId);
  const repair = targets.length > 0 ? `Review and correct the generated natural-language text in: ${targets.join(", ")}.` : "Do not roll back the completed command; correct subsequent generated natural-language text.";
  return [
    "[Language Output Feedback] unauthorized language drift detected",
    `Detected ${SCRIPT_LABELS[finding.script] ?? finding.script} text outside the artifact language profile ${profile.id}.`,
    repair,
    `Correct the generated file text in ${profile.label}.`,
    ARTIFACT_CONTENT,
    TECHNICAL_EXCEPTION
  ].join("\n");
}
function driftBlockReason(profileId, finding) {
  const profile = profileFor(profileId);
  return [
    "[Language Output Gate] unauthorized language drift detected",
    `Detected ${SCRIPT_LABELS[finding.script] ?? finding.script} prose outside the response language profile ${profile.id}.`,
    profile.rewriteInstruction,
    "Preserve every fact, verification receipt, conclusion, and recovery instruction from the previous response.",
    RESPONSE_CONTENT,
    TECHNICAL_EXCEPTION
  ].join("\n");
}

// plugins/session-governance/src/domains/language/lib/state-store.ts
import { createHash as createHash4, randomBytes as randomBytes2 } from "node:crypto";
import {
  mkdirSync as mkdirSync5,
  readFileSync as readFileSync6,
  renameSync as renameSync2,
  rmSync as rmSync2,
  statSync as statSync2,
  writeFileSync as writeFileSync4
} from "node:fs";
import { dirname as dirname4, join as join7, resolve as resolve7 } from "node:path";
var VERSION3 = 1;
var TTL_MS = 24 * 60 * 60 * 1e3;
var LOCK_STALE_MS = 3e4;
var LOCK_ATTEMPTS = 100;
var LOCK_WAIT_MS = 10;
var WAIT_BUFFER2 = new Int32Array(new SharedArrayBuffer(4));
var STATE_DIR_RELATIVE2 = ".language-output/state";
function digest3(value) {
  return createHash4("sha256").update(String(value)).digest("hex");
}
function errorCode(error) {
  return isRecord(error) ? error.code : void 0;
}
function ensureStateDir2(directory) {
  mkdirSync5(directory, { recursive: true, mode: 448 });
  ensurePluginWorkdirGitignore(dirname4(directory));
}
function statePath2(event) {
  const session = extractSessionId3(event);
  if (!session || session === "hook" || session === "unknown") return null;
  const platform = process.env.HARNESS_HOST === "claude" || Boolean(process.env.CLAUDE_PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_DATA) ? "claude" : process.env.HARNESS_HOST === "codex" || Boolean(process.env.PLUGIN_ROOT || process.env.PLUGIN_DATA) ? "codex" : "standalone";
  return join7(resolve7(eventCwd(event)), STATE_DIR_RELATIVE2, `${platform}-${digest3(session)}.json`);
}
function emptyState2(defaultProfile = "zh-CN") {
  return {
    version: VERSION3,
    preferredProfile: isProfileId(defaultProfile) ? defaultProfile : "zh-CN",
    authorizedProfiles: [],
    toolFeedbackDelivered: false,
    updatedAt: 0
  };
}
function sanitize(value, defaultProfile) {
  if (!isRecord(value) || value.version !== VERSION3) {
    return emptyState2(defaultProfile);
  }
  if (Date.now() - Number(value.updatedAt || 0) > TTL_MS) {
    return emptyState2(defaultProfile);
  }
  return {
    version: VERSION3,
    preferredProfile: isProfileId(value.preferredProfile) ? value.preferredProfile : isProfileId(defaultProfile) ? defaultProfile : "zh-CN",
    authorizedProfiles: Array.isArray(value.authorizedProfiles) ? [...new Set(value.authorizedProfiles.filter(isProfileId))] : [],
    toolFeedbackDelivered: value.toolFeedbackDelivered === true,
    updatedAt: Number(value.updatedAt) || 0
  };
}
function read(path, defaultProfile) {
  if (!path) return emptyState2(defaultProfile);
  try {
    return sanitize(JSON.parse(readFileSync6(path, "utf8")), defaultProfile);
  } catch {
    return emptyState2(defaultProfile);
  }
}
function write(path, state) {
  if (!path) return false;
  const directory = dirname4(path);
  const temporary = join7(directory, `.${digest3(path)}.${process.pid}.${randomBytes2(4).toString("hex")}.tmp`);
  try {
    ensureStateDir2(directory);
    writeFileSync4(temporary, `${JSON.stringify(state)}
`, {
      encoding: "utf8",
      mode: 384,
      flag: "wx"
    });
    renameSync2(temporary, path);
    return true;
  } catch {
    rmSync2(temporary, { force: true });
    return false;
  }
}
function withLock(path, operation) {
  if (!path) return operation();
  const lock = `${path}.lock`;
  ensureStateDir2(dirname4(path));
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    try {
      mkdirSync5(lock, { mode: 448 });
      try {
        return operation();
      } finally {
        rmSync2(lock, { recursive: true, force: true });
      }
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync2(lock).mtimeMs > LOCK_STALE_MS) {
          rmSync2(lock, { recursive: true, force: true });
          continue;
        }
      } catch (cause) {
        if (errorCode(cause) !== "ENOENT") throw cause;
        continue;
      }
      Atomics.wait(WAIT_BUFFER2, 0, 0, LOCK_WAIT_MS);
    }
  }
  throw new Error("timed out waiting for language-output state lock");
}
function readState2(event, defaultProfile = "zh-CN") {
  return read(statePath2(event), defaultProfile);
}
function updateState2(event, defaultProfile, updater) {
  const path = statePath2(event);
  if (!path) return { state: emptyState2(defaultProfile), result: null, persisted: false };
  return withLock(path, () => {
    const state = read(path, defaultProfile);
    const result = updater(state);
    state.updatedAt = Date.now();
    return { state, result, persisted: write(path, state) };
  });
}
function initializeState(event, defaultProfile, reset = false) {
  return updateState2(event, defaultProfile, (state) => {
    if (!reset) return false;
    Object.assign(state, emptyState2(defaultProfile));
    return true;
  }).state;
}
function recordLanguageIntent(event, defaultProfile, intent) {
  return updateState2(event, defaultProfile, (state) => {
    if (isProfileId(intent.preferredProfile)) {
      state.preferredProfile = intent.preferredProfile;
    }
    state.authorizedProfiles = [
      .../* @__PURE__ */ new Set([
        ...state.authorizedProfiles,
        ...intent.authorizedProfiles.filter(isProfileId)
      ])
    ];
    return true;
  }).state;
}
function claimToolFeedback(event, defaultProfile) {
  return updateState2(event, defaultProfile, (state) => {
    if (state.toolFeedbackDelivered) return false;
    state.toolFeedbackDelivered = true;
    return true;
  }).result === true;
}

// plugins/session-governance/src/domains/language/entries/hooks/language-output-hook-post-tool.ts
async function main3() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const { config } = await loadConfig(eventCwd(event), warn3);
  if (config.toolFeedback === "off") return;
  if (!supportsPostToolFeedback()) return;
  const text = generatedToolText(event);
  if (!text) return;
  const state = readState2(event, config.defaultProfile);
  const artifactProfile = config.artifactProfile ?? state.preferredProfile;
  const [finding] = detectLanguageDrift(text, {
    preferredProfile: artifactProfile,
    authorizedProfiles: state.authorizedProfiles,
    detection: config.detection
  });
  if (!finding || !claimToolFeedback(event, config.defaultProfile)) return;
  writeJson(postToolFeedbackOutput(
    toolFeedback(artifactProfile, finding, extractFileTargets3(event))
  ));
}

// plugins/session-governance/src/domains/language/entries/hooks/language-output-hook-session-start.ts
async function main4() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const { config } = await loadConfig(eventCwd(event), warn3);
  const source = extractSource(event);
  const reset = source === "startup" || source === "clear";
  const state = initializeState(event, config.defaultProfile, reset);
  writeJson(additionalContextOutput2("SessionStart", sessionContext(state.preferredProfile, config.artifactProfile)));
}

// plugins/session-governance/src/domains/language/entries/hooks/language-output-hook-stop.ts
async function main5() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  if (isStopHookActive(event)) return;
  const message = eventAssistantMessage(event);
  if (!message) return;
  const { config } = await loadConfig(eventCwd(event), warn3);
  if (config.stop === "off") return;
  const state = readState2(event, config.defaultProfile);
  const [finding] = detectLanguageDrift(message, {
    preferredProfile: state.preferredProfile,
    authorizedProfiles: state.authorizedProfiles,
    detection: config.detection
  });
  if (!finding) return;
  writeJson(stopBlock(driftBlockReason(state.preferredProfile, finding)));
}

// plugins/session-governance/src/domains/language/lib/intent.ts
var TRANSLATION_CUE = /翻译|翻譯|译成|譯成|译为|譯為|翻成|translate|translation/iu;
var RESPONSE_CUE = /后续|後續|以后|以後|接下来|接下來|从现在开始|從現在開始|一直|保持|改用|切换|切換|请用|請用|请使用|請使用|回复|回覆|回答|说明|說明|输出|輸出|沟通|溝通|交流|respond|reply|answer|use|continue/iu;
var GENERIC_CHINESE = /中文|\bChinese\b/iu;
function mentionedProfiles(prompt) {
  const mentioned = new Set(PROFILE_IDS.filter((id) => PROFILES[id].aliases.test(prompt)));
  if (!mentioned.has("zh-CN") && !mentioned.has("zh-TW") && GENERIC_CHINESE.test(prompt)) {
    mentioned.add("zh-CN");
  }
  return PROFILE_IDS.filter((id) => mentioned.has(id));
}
function classifyLanguageIntent(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) {
    return { preferredProfile: null, authorizedProfiles: [] };
  }
  const mentioned = mentionedProfiles(prompt);
  if (mentioned.length === 0) {
    return { preferredProfile: null, authorizedProfiles: [] };
  }
  if (TRANSLATION_CUE.test(prompt)) {
    return { preferredProfile: null, authorizedProfiles: mentioned };
  }
  if (!RESPONSE_CUE.test(prompt)) {
    return { preferredProfile: null, authorizedProfiles: [] };
  }
  if (mentioned.length !== 1) {
    return { preferredProfile: null, authorizedProfiles: mentioned };
  }
  const preferredProfile = mentioned[0];
  if (preferredProfile === void 0) {
    return { preferredProfile: null, authorizedProfiles: [] };
  }
  return { preferredProfile, authorizedProfiles: [preferredProfile] };
}

// plugins/session-governance/src/domains/language/entries/hooks/language-output-hook-user-prompt.ts
async function main6() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const intent = classifyLanguageIntent(eventPrompt(event));
  if (!intent.preferredProfile && intent.authorizedProfiles.length === 0) return;
  const { config } = await loadConfig(eventCwd(event), warn3);
  recordLanguageIntent(event, config.defaultProfile, intent);
}

// plugins/session-governance/src/domains/practice/entries/hooks/engineering-practice.ts
function warn4(message) {
  process.stderr.write(`[engineering-practice] ${message}
`);
}
function engineeringPracticeContext() {
  return [
    "[Engineering Practice] Optional engineering method guidance",
    "Skills are optional method guides, not Hook prerequisites or completion evidence.",
    "For non-trivial implementation or refactoring, use the bundled `engineering-judgment` method when it helps control scope and trade-offs.",
    "For read-only review, the bundled `engineering-review` method requires P0-P3 severity, exact file:line, concrete evidence, and a verifiable fix or recovery path.",
    "For a high-risk implementation checkpoint, the bundled `engineering-review-checkpoint` method coordinates one bounded read-only reviewer and requires the parent to verify every returned finding.",
    "Completion, fixed, or passing claims need fresh command evidence; the bundled `engineering-verification` method can help select checks.",
    "Use local public seams, callers, tests, documentation, and project conventions as evidence. Hook injection or Skill loading does not prove an outcome."
  ].join("\n");
}
var ENGINEERING_OBJECT = /代码|实现|diff|变更|插件|仓库|模块|配置|接口|API|数据库|schema|测试|构建|认证|授权/iu;
var REVIEW_PROMPT = /\b(?:audit|code review|review|assess|inspect)\b/iu;
var CHINESE_REVIEW_PROMPT = /审计|审查|代码检查|评审|检查/iu;
var VERIFICATION_PROMPT = /\b(?:verify|verification|validate|test|typecheck|lint|build|before (?:claiming|completion)|ready to (?:finish|ship))\b/iu;
var CHINESE_VERIFICATION_PROMPT = /验证|运行(?:单元|集成|完整|全部)?测试|执行(?:单元|集成|完整|全部)?测试|构建后.*(?:确认|完成)|测试后.*(?:确认|完成)/iu;
var IMPLEMENTATION_PROMPT = /\b(?:add|change|fix|implement|migrate|modify|refactor|repair|update)\b/iu;
var CHINESE_IMPLEMENTATION_PROMPT = /增加|新增|修改|修复|实现|迁移|重构|更新|调整/iu;
var CHECKPOINT_PROMPT = /\b(?:engineering review checkpoint|review checkpoint|checkpoint review)\b|请神/iu;
var HIGH_RISK_PROMPT = /\b(?:auth(?:entication|orization)?|security|public api|schema|migrat\w*|database|persistence|concurren\w*|race condition|data integrity|deploy\w*|release|runtime state|recovery|rollback|observability|cross-module|multi-module)\b|认证|授权|安全|公共\s*api|跨模块|数据库|持久化|迁移|并发|数据完整性|部署|发布|运行态|恢复|回滚|可观测/iu;
function promptMethodContext(event) {
  const prompt = eventPrompt(event);
  if (!prompt) return "";
  const implementation = IMPLEMENTATION_PROMPT.test(prompt) || CHINESE_IMPLEMENTATION_PROMPT.test(prompt) && ENGINEERING_OBJECT.test(prompt);
  const review = REVIEW_PROMPT.test(prompt) || CHINESE_REVIEW_PROMPT.test(prompt) && ENGINEERING_OBJECT.test(prompt);
  const verification = VERIFICATION_PROMPT.test(prompt) || CHINESE_VERIFICATION_PROMPT.test(prompt) && ENGINEERING_OBJECT.test(prompt);
  if (implementation && HIGH_RISK_PROMPT.test(prompt)) {
    return "[Engineering Practice] This appears to be a high-risk implementation. Use the bundled `engineering-judgment` method, then use `engineering-review-checkpoint` after the first coherent implementation slice and focused checks to dispatch one read-only reviewer before final verification.";
  }
  if (CHECKPOINT_PROMPT.test(prompt)) {
    return "[Engineering Practice] This is an explicit review checkpoint request. Use the bundled `engineering-review-checkpoint` method to dispatch one bounded read-only reviewer, then reopen and verify every returned finding before acting.";
  }
  if (review) {
    return "[Engineering Practice] This appears to be a read-only review. Use the bundled `engineering-review` method if useful; keep the review read-only and anchor every verified finding to severity, a single file:line (not a line range), evidence, and recovery.";
  }
  if (verification) {
    return "[Engineering Practice] This task asks for verification. Use the bundled `engineering-verification` method if useful; run directly relevant checks after the last mutation and report missing or stale evidence as unverified.";
  }
  if (implementation) {
    return "[Engineering Practice] This appears to be implementation or refactoring. Use the bundled `engineering-judgment` method if useful; preserve the requested public contract, keep the change scoped, and verify observable behavior.";
  }
  return "";
}
async function runSessionStart() {
  const event = await readStdinJson();
  if (event.__parseError) return warn4("invalid hook input; advisory context was skipped");
  writeJson(additionalContext("SessionStart", engineeringPracticeContext()));
}
async function runUserPromptSubmit() {
  const event = await readStdinJson();
  if (event.__parseError) return warn4("invalid hook input; prompt guidance was skipped");
  const context = promptMethodContext(event);
  if (context) writeJson(additionalContext("UserPromptSubmit", context));
}

// plugins/session-governance/src/domains/reasoning/session-context.ts
function reasoningMethodsContext() {
  return [
    "[Reasoning Methods] Selective first-principles and verification routing",
    "For exact, causal, decision, or factual work whose answer can be wrong, load this plugin's `reasoning-methods` or `first-principles` Skill before answering.",
    "Use the cheapest structure that can falsify the conclusion. Extra model turns are not evidence.",
    "Keep easy lookups, translations, and already-determined implementation tasks direct."
  ].join("\n");
}

// plugins/session-governance/src/domains/reasoning/entries/hooks/reasoning-methods.ts
function warn5(message) {
  process.stderr.write(`[reasoning-methods] ${message}
`);
}
async function runSessionStart2() {
  const event = await readStdinJson();
  if (event.__parseError) return warn5("invalid hook input; advisory context was skipped");
  writeJson(additionalContext("SessionStart", reasoningMethodsContext()));
}

// plugins/session-governance/src/entries/hooks/dispatcher.ts
async function runPractice() {
  if (process.argv[2] === "user-prompt") await runUserPromptSubmit();
  else await runSessionStart();
}
var [host, eventName] = process.argv.slice(2);
if (!host || !eventName) throw new Error("dispatcher requires <host> <event>");
await runOwnerDispatcher(host, eventName, {
  "discipline:execution-discipline": ownerHookHandler(main),
  "intent:intent-discovery": ownerHookHandler(main2),
  "language:language-output-hook-post-tool": ownerHookHandler(main3),
  "language:language-output-hook-session-start": ownerHookHandler(main4),
  "language:language-output-hook-stop": ownerHookHandler(main5),
  "language:language-output-hook-user-prompt": ownerHookHandler(main6),
  "practice:engineering-practice": ownerHookHandler(runPractice),
  "reasoning:reasoning-methods": ownerHookHandler(runSessionStart2)
});
