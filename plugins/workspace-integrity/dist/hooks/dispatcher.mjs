// harness-source-hash: sha256:f8a8603bbe06f97be9676cd7f7dc57b724b35ebc555310133543f99e88c62a52
import {
  collectOwnerHookOutput,
  eventCwd,
  eventSessionId,
  eventToolInput,
  eventToolName,
  extractFileTargets,
  extractShellCommand,
  isFileMutationTool,
  isRecord,
  isShellTool,
  ownerHookHandler,
  readStdinJson
} from "../chunks/chunk-G6JEU3KE.mjs";
import "../chunks/chunk-VVD6TLCA.mjs";

// core/src/aio-dispatcher.ts
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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

// core/src/domain-engineering-hook.ts
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, mkdirSync, readFileSync as readFileSync2, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname as dirname2, isAbsolute, join, relative, resolve as resolve2 } from "node:path";
import { pathToFileURL } from "node:url";

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
function writeJson(value) {
  if (value !== null && value !== void 0) {
    if (collectOwnerHookOutput(value)) return;
    process.stdout.write(`${JSON.stringify(value)}
`);
  }
}

// core/src/shell-parse.ts
function decodeAnsiCQuoteEscape(command, slashIndex) {
  const marker = command[slashIndex + 1] ?? "";
  const simple = /* @__PURE__ */ new Map([
    ["a", "\x07"],
    ["b", "\b"],
    ["e", "\x1B"],
    ["E", "\x1B"],
    ["f", "\f"],
    ["n", "\n"],
    ["r", "\r"],
    ["t", "	"],
    ["v", "\v"],
    ["\\", "\\"],
    ["'", "'"],
    ['"', '"']
  ]);
  if (simple.has(marker)) {
    return { value: simple.get(marker) ?? "", endIndex: slashIndex + 1 };
  }
  const numeric = marker === "x" ? command.slice(slashIndex + 2).match(/^[0-9a-f]{1,2}/iu) : marker === "u" ? command.slice(slashIndex + 2).match(/^[0-9a-f]{1,4}/iu) : marker === "U" ? command.slice(slashIndex + 2).match(/^[0-9a-f]{1,8}/iu) : command.slice(slashIndex + 1).match(/^[0-7]{1,3}/u);
  if (numeric?.[0]) {
    const radix = marker === "x" || marker === "u" || marker === "U" ? 16 : 8;
    const codePoint = Number.parseInt(numeric[0], radix);
    if (codePoint <= 1114111) {
      const offset = marker === "x" || marker === "u" || marker === "U" ? 2 : 1;
      return {
        value: String.fromCodePoint(codePoint),
        endIndex: slashIndex + offset + numeric[0].length - 1
      };
    }
  }
  if (marker === "\n") return { value: "", endIndex: slashIndex + 1 };
  return { value: `\\${marker}`, endIndex: slashIndex + 1 };
}
var EMPTY_OPTIONS = /* @__PURE__ */ new Set();
var SIMPLE_COMMAND_WRAPPERS = /* @__PURE__ */ new Set(["command", "exec", "nohup", "busybox", "time"]);
var SUDO_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-C",
  "-D",
  "-g",
  "-h",
  "-p",
  "-R",
  "-T",
  "-u",
  "--chdir",
  "--close-from",
  "--group",
  "--host",
  "--prompt",
  "--role",
  "--type",
  "--user"
]);
var ENV_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-C",
  "-S",
  "-u",
  "--chdir",
  "--split-string",
  "--unset"
]);
var XARGS_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-a",
  "-d",
  "-E",
  "-I",
  "-L",
  "-n",
  "-P",
  "-s",
  "--arg-file",
  "--delimiter",
  "--eof",
  "--max-args",
  "--max-chars",
  "--max-lines",
  "--max-procs",
  "--replace"
]);
var TIMEOUT_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-s",
  "--signal",
  "-k",
  "--kill-after"
]);
var NICE_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set(["-n", "--adjustment"]);
var STDBUF_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-i",
  "--input",
  "-o",
  "--output",
  "-e",
  "--error"
]);
var IONICE_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-c",
  "--class",
  "-n",
  "--classdata",
  "-p",
  "--pid"
]);
var COMMAND_SEPARATORS = /* @__PURE__ */ new Set(["&&", "||", ";", "|", "&"]);
function skipWrapperOptions(tokens, start, optionsWithValue) {
  let index = start;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token?.startsWith("-")) break;
    if (token === "--") return index + 1;
    index += optionsWithValue.has(token) ? 2 : 1;
  }
  return index;
}
function tokenBasename(token) {
  return token.split("/").at(-1) ?? "";
}
function commandInvocation(tokens) {
  let index = 0;
  let stdinDriven = false;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token) break;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(token)) {
      index += 1;
      continue;
    }
    const name = tokenBasename(token);
    if (SIMPLE_COMMAND_WRAPPERS.has(name)) {
      index = skipWrapperOptions(tokens, index + 1, EMPTY_OPTIONS);
      continue;
    }
    if (name === "sudo") {
      index = skipWrapperOptions(tokens, index + 1, SUDO_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "env") {
      index = skipWrapperOptions(tokens, index + 1, ENV_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "xargs") {
      stdinDriven = true;
      index = skipWrapperOptions(tokens, index + 1, XARGS_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "timeout") {
      index = skipWrapperOptions(tokens, index + 1, TIMEOUT_OPTIONS_WITH_VALUE);
      if (index < tokens.length && tokens[index] && !COMMAND_SEPARATORS.has(tokens[index] ?? "")) {
        index += 1;
      }
      continue;
    }
    if (name === "nice") {
      index = skipWrapperOptions(tokens, index + 1, NICE_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "stdbuf") {
      index = skipWrapperOptions(tokens, index + 1, STDBUF_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "ionice") {
      index = skipWrapperOptions(tokens, index + 1, IONICE_OPTIONS_WITH_VALUE);
      continue;
    }
    return {
      executable: name || token,
      args: tokens.slice(index + 1),
      stdinDriven
    };
  }
  return null;
}
function tokenizeShell(command) {
  const tokens = [];
  let current = "";
  let tokenStarted = false;
  let quote = null;
  let ansiCQuote = false;
  let escaped = false;
  const pushCurrent = () => {
    if (tokenStarted) {
      tokens.push(current);
      current = "";
      tokenStarted = false;
    }
  };
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index] ?? "";
    const next = command[index + 1];
    if (escaped) {
      current += char;
      tokenStarted = true;
      escaped = false;
      continue;
    }
    if (quote) {
      if (ansiCQuote && char === "\\") {
        const decoded = decodeAnsiCQuoteEscape(command, index);
        current += decoded.value;
        tokenStarted = true;
        index = decoded.endIndex;
        continue;
      }
      if (quote === '"' && char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = null;
        ansiCQuote = false;
        continue;
      }
      current += char;
      tokenStarted = true;
      continue;
    }
    if (char === "$" && (next === '"' || next === "'")) {
      quote = next;
      ansiCQuote = next === "'";
      tokenStarted = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      tokenStarted = true;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      tokenStarted = true;
      continue;
    }
    if (/\s/u.test(char)) {
      pushCurrent();
      continue;
    }
    if (char === "#" && !tokenStarted) break;
    if (char === "&" && next === "&") {
      pushCurrent();
      tokens.push("&&");
      index += 1;
      continue;
    }
    if (char === "&") {
      pushCurrent();
      tokens.push("&");
      continue;
    }
    if (char === "|" && next === "|") {
      pushCurrent();
      tokens.push("||");
      index += 1;
      continue;
    }
    if (char === ";" || char === "|") {
      pushCurrent();
      tokens.push(char);
      continue;
    }
    current += char;
    tokenStarted = true;
  }
  pushCurrent();
  return tokens;
}
function splitShellLogicalLines(command) {
  const lines = [];
  let current = "";
  let quote = null;
  let escaped = false;
  for (const char of command) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === "\n") {
      if (current.trim()) lines.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) lines.push(current);
  return lines;
}
function shellCommandInvocations(command) {
  const invocations = [];
  for (const logicalLine of splitShellLogicalLines(command)) {
    const tokens = tokenizeShell(logicalLine);
    let segment = [];
    for (let index = 0; index <= tokens.length; index += 1) {
      const token = tokens[index];
      if (token !== void 0 && !COMMAND_SEPARATORS.has(token)) {
        segment.push(token);
        continue;
      }
      const invocation = commandInvocation(segment);
      if (invocation) invocations.push(invocation);
      segment = [];
    }
  }
  return invocations;
}

// core/src/domain-engineering-hook.ts
var COMMAND_SEPARATORS2 = /* @__PURE__ */ new Set(["&&", "||", ";", "|", "&"]);
var SIMPLE_WRAPPERS = /* @__PURE__ */ new Set(["busybox", "command", "exec", "nohup", "time"]);
var SKIP_PATH = /(?:^|\/)(?:\.git|\.cache|\.next|\.nuxt|__generated__|build|coverage|dist|generated|node_modules|target|vendor)(?:\/|$)/iu;
var MAX_FILE_BYTES = 2 * 1024 * 1024;
function warn(plugin, message) {
  process.stderr.write(`[${plugin}] ${message}
`);
}
function regexMatches(pattern, value) {
  try {
    return new RegExp(pattern.source, pattern.flags).test(value);
  } catch {
    return false;
  }
}
function tokenBasename2(token) {
  return String(token ?? "").replaceAll("\\", "/").split("/").at(-1) ?? "";
}
function splitSimpleCommands(tokens) {
  const commands = [];
  let current = [];
  for (const token of tokens) {
    if (COMMAND_SEPARATORS2.has(token)) {
      if (current.length) commands.push(current);
      current = [];
    } else current.push(token);
  }
  if (current.length) commands.push(current);
  return commands;
}
function unwrapCommand(tokens) {
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === void 0) break;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(token)) {
      index += 1;
      continue;
    }
    const name = tokenBasename2(token);
    if (SIMPLE_WRAPPERS.has(name) || name === "nice" || name === "stdbuf") {
      index += 1;
      while (tokens[index]?.startsWith("-") && tokens[index] !== "--") index += 1;
      if (tokens[index] === "--") index += 1;
      continue;
    }
    if (name === "sudo" || name === "env") {
      index += 1;
      while (tokens[index]?.startsWith("-")) {
        const option = tokens[index];
        index += 1;
        if (name === "sudo" && option && ["-C", "-g", "-u", "--group", "--user"].includes(option)) index += 1;
      }
      continue;
    }
    if (name === "timeout") {
      index += 1;
      while (tokens[index]?.startsWith("-")) index += 1;
      if (tokens[index] && !tokens[index]?.startsWith("-")) index += 1;
      continue;
    }
    break;
  }
  return tokens.slice(index);
}
function nonFlagOperands(args) {
  const values = [];
  let skip = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (skip) {
      skip = false;
      continue;
    }
    if (arg === "--") return [...values, ...args.slice(index + 1)];
    if (arg.startsWith("-")) {
      if (["-t", "--target-directory"].includes(arg)) skip = true;
      continue;
    }
    values.push(arg);
  }
  return values;
}
function targetDirectory(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "-t" || arg === "--target-directory") return args[index + 1] ?? "";
    if (arg?.startsWith("--target-directory=")) return arg.slice("--target-directory=".length);
  }
  return "";
}
function sedWriteTargets(args) {
  if (!args.some((arg) => arg === "--in-place" || arg.startsWith("--in-place=") || /^-[A-Za-z]*i/u.test(arg))) return [];
  const values = nonFlagOperands(args);
  return values.length > 1 ? values.slice(1) : values;
}
function commandWriteTargets(tokens) {
  const command = unwrapCommand(tokens);
  const name = tokenBasename2(command[0]);
  const args = command.slice(1);
  const operands = nonFlagOperands(args);
  const target2 = targetDirectory(args);
  if (name === "sed") return sedWriteTargets(args);
  if (name === "cp" || name === "install") return target2 ? [target2] : operands.slice(-1);
  if (name === "mv") return target2 ? [target2, ...operands] : operands;
  if (name === "rm" || name === "touch") return operands;
  if (name === "dd") return args.filter((arg) => arg.startsWith("of=")).map((arg) => arg.slice(3));
  return [];
}
function extractDomainShellWriteTargets(command) {
  const text = String(command ?? "");
  const values = [];
  const push = (raw) => {
    const value = String(raw ?? "").trim().replace(/^['"]|['"]$/gu, "");
    if (value && !value.startsWith("-")) values.push(value);
  };
  for (const match of text.matchAll(/(?:^|[^0-9>])>{1,2}\s*("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  for (const match of text.matchAll(/\btee\b(?:\s+-[A-Za-z]+)*\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  for (const match of text.matchAll(/\b(?:writeFile(?:Sync)?|open)\s*\(\s*["']([^"']+)["']/gu)) push(match[1]);
  for (const tokens of splitSimpleCommands(tokenizeShell(text))) {
    for (const path of commandWriteTargets(tokens)) push(path);
  }
  return [...new Set(values)];
}
function extractDomainTargets(event) {
  const cwd = resolve2(eventCwd(event));
  let targets = [];
  if (isShellTool(eventToolName(event))) targets = extractDomainShellWriteTargets(extractShellCommand(event));
  else if (isFileMutationTool(eventToolName(event))) targets = extractFileTargets(event);
  return [...new Set(targets.map((path) => isAbsolute(path) ? resolve2(path) : resolve2(cwd, path.replace(/^\.\//u, ""))))];
}
function domainTargetsNeedPhase(policy12, targets, phase) {
  const paths = targets.map((path) => path.replaceAll("\\", "/"));
  if (phase === "pre") return paths.some((path) => policy12.protections.some((rule) => regexMatches(rule.match, path)));
  return paths.some(
    (path) => policy12.validators.some((validator) => regexMatches(validator.match, path)) || (policy12.sourceScans ?? []).some((scan) => regexMatches(scan.match, path))
  );
}
function configFileExists(cwd, plugin) {
  let cursor = resolve2(cwd);
  while (true) {
    if (existsSync(join(cursor, `.${plugin}.mjs`))) return true;
    if (existsSync(join(cursor, ".git"))) return false;
    const parent = dirname2(cursor);
    if (parent === cursor) return false;
    cursor = parent;
  }
}
function repoRoot(cwd) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", timeout: 5e3 });
  return result.status === 0 ? result.stdout.trim() : null;
}
function relativePath(filePath, base) {
  const candidate = relative(base, filePath).replaceAll("\\", "/");
  return candidate && candidate !== ".." && !candidate.startsWith("../") ? candidate : filePath.replaceAll("\\", "/");
}
function nearestProjectFile(root, targetPath, names) {
  let cursor = existsSync(targetPath) && statSync(targetPath).isDirectory() ? targetPath : dirname2(targetPath);
  const boundary = resolve2(root);
  while (cursor === boundary || cursor.startsWith(`${boundary}/`)) {
    for (const name of names) {
      const candidate = join(cursor, name);
      if (existsSync(candidate)) return candidate;
    }
    if (cursor === boundary) break;
    const parent = dirname2(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return null;
}
function packageDeclaresDependency(context, dependency) {
  const packagePath = nearestProjectFile(context.root, context.targetPath, ["package.json"]);
  if (!packagePath) return false;
  try {
    const value = JSON.parse(readFileSync2(packagePath, "utf8"));
    if (!isRecord(value)) return false;
    return ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].some((key) => isRecord(value[key]) && dependency in value[key]);
  } catch {
    return false;
  }
}
function repoContainsPath(root, pattern) {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
    timeout: 5e3,
    maxBuffer: 2 * 1024 * 1024
  });
  if (result.status !== 0) return false;
  return result.stdout.split("\n").some((path) => regexMatches(pattern, path));
}
function physicalTarget(filePath) {
  let cursor = filePath;
  const suffix = [];
  while (!existsSync(cursor)) {
    const parent = dirname2(cursor);
    if (parent === cursor) return null;
    suffix.unshift(basename(cursor));
    cursor = parent;
  }
  try {
    return resolve2(realpathSync(cursor), ...suffix);
  } catch {
    return null;
  }
}
function matchPaths(filePath, base) {
  const paths = [relativePath(filePath, base)];
  const physical = physicalTarget(filePath);
  if (physical) paths.push(relativePath(physical, base));
  return [...new Set(paths)];
}
function validMode(value) {
  return value === "block" || value === "report" || value === "off";
}
async function loadConfig(policy12, root) {
  const defaults = { checks: {}, rules: [], maxFiles: 12, timeoutMs: 1e4, missingTools: "report-once" };
  if (!root) return defaults;
  const path = join(root, `.${policy12.plugin}.mjs`);
  if (!existsSync(path)) return defaults;
  try {
    const loaded = await import(pathToFileURL(path).href);
    const raw = isRecord(loaded) ? loaded.default ?? loaded : loaded;
    if (!isRecord(raw)) return defaults;
    const checks2 = isRecord(raw.checks) ? Object.fromEntries(Object.entries(raw.checks).filter((entry) => validMode(entry[1]))) : {};
    const rules = Array.isArray(raw.rules) ? raw.rules.flatMap((rule, index) => {
      if (!isRecord(rule) || !(rule.match instanceof RegExp) || rule.mode !== "allow" && rule.mode !== "block") {
        warn(policy12.plugin, `rules[${index}] is invalid and was skipped`);
        return [];
      }
      const mode = rule.mode;
      return [{
        id: typeof rule.id === "string" ? rule.id : `user-rule-${index + 1}`,
        match: rule.match,
        mode,
        ...typeof rule.reason === "string" ? { reason: rule.reason } : {},
        ...typeof rule.recovery === "string" ? { recovery: rule.recovery } : {}
      }];
    }) : [];
    const limits = isRecord(raw.limits) ? raw.limits : {};
    return {
      checks: checks2,
      rules,
      maxFiles: typeof limits.maxFiles === "number" && Number.isInteger(limits.maxFiles) && limits.maxFiles >= 1 && limits.maxFiles <= 100 ? limits.maxFiles : 12,
      timeoutMs: typeof limits.timeoutMs === "number" && Number.isInteger(limits.timeoutMs) && limits.timeoutMs >= 1e3 && limits.timeoutMs <= 6e4 ? limits.timeoutMs : 1e4,
      missingTools: raw.missingTools === "silent" ? "silent" : "report-once"
    };
  } catch (error) {
    warn(policy12.plugin, `failed to load .${policy12.plugin}.mjs: ${error instanceof Error ? error.message : String(error)}`);
    return defaults;
  }
}
function protectionFor(paths, policy12, config) {
  for (const rule of config.rules) {
    if (!paths.some((path) => regexMatches(rule.match, path))) continue;
    if (rule.mode === "allow") return null;
    return {
      id: rule.id,
      match: rule.match,
      reason: rule.reason ?? "The target is covered by a project protection rule.",
      recovery: rule.recovery ?? "Change the authoritative source or add a narrower allow rule."
    };
  }
  return policy12.protections.find((rule) => paths.some((path) => regexMatches(rule.match, path))) ?? null;
}
function formatDeny(policy12, findings) {
  return [
    `[Protected File Guard] ${policy12.displayName}: Protected file modification blocked`,
    "",
    ...findings.slice(0, 10).flatMap(({ path, rule }) => [`- ${path}`, `  rule: ${rule.id}`, `  reason: ${rule.reason}`]),
    "",
    "blockingContract:",
    "  observedFacts: One or more direct write targets matched a domain-owned generated dependency path.",
    "  harm: Direct edits can diverge generated dependency state from its authoritative declarations.",
    "  unblockWhen: Use the ecosystem package manager or add a narrow project-owned allow rule.",
    "  recovery:",
    ...[...new Set(findings.map(({ rule }) => rule.recovery))].map((value) => `    - ${value}`)
  ].join("\n");
}
function executable(name, root, local = []) {
  const candidates = [...local.map((item) => join(root, item)), ...String(process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":").map((part) => join(part, name))];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      if (process.platform !== "win32") accessSync(path, constants.X_OK);
      return path;
    } catch {
      continue;
    }
  }
  return null;
}
function commandFor(kind, filePath) {
  if (kind === "javascript") return { command: process.execPath, args: ["--check", filePath] };
  if (kind === "typescript") return { command: "esbuild", args: [filePath, "--log-level=error", "--format=esm"], local: ["node_modules/.bin/esbuild"] };
  if (kind === "python") return { command: "python3", args: ["-c", "import pathlib,sys; p=sys.argv[1]; compile(pathlib.Path(p).read_bytes(), p, 'exec')", filePath], local: [".venv/bin/python3", "venv/bin/python3"] };
  if (kind === "ruff") return { command: "ruff", args: ["check", "--no-fix", "--output-format", "concise", filePath], local: [".venv/bin/ruff", "venv/bin/ruff"] };
  if (kind === "php") return { command: "php", args: ["-l", filePath] };
  if (kind === "composer") return { command: "composer", args: ["validate", "--no-check-publish", "--no-check-lock", filePath], local: ["vendor/bin/composer"] };
  if (kind === "eslint") return { command: "eslint", args: [filePath, "--format", "compact"], local: ["node_modules/.bin/eslint"] };
  if (kind === "swift") return { command: "swiftc", args: ["-parse", filePath] };
  if (kind === "plist") return { command: "plutil", args: ["-lint", filePath] };
  if (kind === "gofmt") return { command: "gofmt", args: ["-d", filePath] };
  if (kind === "rustfmt") return { command: "rustfmt", args: ["--check", filePath] };
  if (kind === "nix") return { command: "nix-instantiate", args: ["--parse", filePath] };
  if (kind === "kubectl") return { command: "kubectl", args: ["apply", "--dry-run=client", "--validate=false", "-f", filePath] };
  if (kind === "helm") return { command: "helm", args: ["lint", dirname2(filePath)] };
  return null;
}
async function xmlValidation(filePath) {
  const errors = [];
  try {
    const { DOMParser } = await import("../chunks/lib-TZZXOJCM.mjs");
    new DOMParser({ onError: (level, message) => {
      if (level === "fatalError" || level === "error") errors.push(message);
    } }).parseFromString(readFileSync2(filePath, "utf8"), "application/xml");
    return errors.length ? errors.join("\n") : null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
async function internalValidation(kind, filePath) {
  if (kind === "json") {
    try {
      JSON.parse(readFileSync2(filePath, "utf8"));
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
  if (kind === "xml") return xmlValidation(filePath);
  return void 0;
}
function sourceScanFindings(scan, relativePath3, source, mode, filePath = relativePath3) {
  if (mode === "off" || !regexMatches(scan.match, relativePath3)) return [];
  return scan.inspect(filePath, source).map((hit) => ({
    check: scan.id,
    mode,
    path: `${relativePath3}:${hit.line}`,
    message: `${hit.code}: ${hit.message}`
  }));
}
async function validateFile(validator, filePath, root, timeoutMs) {
  if (validator.contentMatch) {
    try {
      if (!regexMatches(validator.contentMatch, readFileSync2(filePath, "utf8"))) return null;
    } catch {
      return null;
    }
  }
  const internal = await internalValidation(validator.kind, filePath);
  if (internal !== void 0) return internal ? { check: validator.id, mode: validator.mode === "off" ? "report" : validator.mode, path: relativePath(filePath, root), message: internal } : null;
  const spec = commandFor(validator.kind, filePath);
  if (!spec?.command) return { check: validator.id, mode: "report", path: relativePath(filePath, root), message: "No validator implementation is available." };
  const command = spec.command === process.execPath ? process.execPath : executable(spec.command, root, spec.local);
  if (!command) return { check: validator.id, mode: "report", path: relativePath(filePath, root), message: `${spec.command} was not found; the check was skipped.`, missingTool: spec.command };
  const result = spawnSync(command, spec.args, { cwd: root, encoding: "utf8", timeout: timeoutMs, maxBuffer: 1024 * 1024 });
  if (result.error) return { check: validator.id, mode: "report", path: relativePath(filePath, root), message: result.error.message };
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (validator.kind === "gofmt" && result.status === 0 && output) return { check: validator.id, mode: "report", path: relativePath(filePath, root), message: output };
  if ((result.status ?? 0) !== 0) return { check: validator.id, mode: validator.mode === "off" ? "report" : validator.mode, path: relativePath(filePath, root), message: output || `checker exit code ${result.status}` };
  return null;
}
function shouldReportMissingTool(policy12, root, session, finding, mode) {
  if (!finding.missingTool) return true;
  if (mode === "silent") return false;
  const identity = createHash("sha256").update(`${policy12.plugin}\0${session}\0${root}\0${finding.check}\0${finding.missingTool}`).digest("hex");
  const markerRoot = join(tmpdir(), ".ai-experts-domain-engineering-missing");
  const marker = join(markerRoot, identity);
  if (existsSync(marker)) return false;
  try {
    mkdirSync(markerRoot, { recursive: true });
    writeFileSync(marker, "", { flag: "wx" });
  } catch {
    if (existsSync(marker)) return false;
  }
  return true;
}
async function runPre(policy12, event) {
  const targets = extractDomainTargets(event);
  if (!targets.length) return;
  const cwd = resolve2(eventCwd(event));
  if (!domainTargetsNeedPhase(policy12, targets, "pre") && !configFileExists(cwd, policy12.plugin)) return;
  const root = repoRoot(cwd) ?? cwd;
  const config = await loadConfig(policy12, repoRoot(cwd));
  const findings = targets.flatMap((filePath) => {
    const path = relativePath(filePath, root);
    if (policy12.active && !policy12.active({ root, targetPath: filePath, relativePath: path })) return [];
    const rule = protectionFor(matchPaths(filePath, root), policy12, config);
    return rule ? [{ path, rule }] : [];
  });
  if (findings.length) writeJson(preToolDeny(formatDeny(policy12, findings)));
}
async function runPost(policy12, event) {
  const cwd = resolve2(eventCwd(event));
  const rawTargets = extractDomainTargets(event);
  if (!rawTargets.length) return;
  if (!domainTargetsNeedPhase(policy12, rawTargets, "post") && !configFileExists(cwd, policy12.plugin)) return;
  const discoveredRoot = repoRoot(cwd);
  const root = discoveredRoot ?? cwd;
  const config = await loadConfig(policy12, discoveredRoot);
  const session = eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "hook";
  const targets = rawTargets.filter((filePath) => {
    if (!existsSync(filePath)) return false;
    try {
      const path = relativePath(filePath, root);
      return statSync(filePath).isFile() && statSync(filePath).size <= MAX_FILE_BYTES && !SKIP_PATH.test(path) && (!policy12.active || policy12.active({ root, targetPath: filePath, relativePath: path }));
    } catch {
      return false;
    }
  }).slice(0, config.maxFiles);
  const findings = [];
  for (const filePath of targets) {
    const path = relativePath(filePath, root);
    for (const validator of policy12.validators) {
      const mode = config.checks[validator.id] ?? validator.mode;
      if (mode === "off" || !regexMatches(validator.match, path)) continue;
      const finding = await validateFile({ ...validator, mode }, filePath, root, config.timeoutMs);
      if (finding && shouldReportMissingTool(policy12, root, session, finding, config.missingTools)) findings.push(finding);
    }
    const scans = policy12.sourceScans ?? [];
    if (!scans.length) continue;
    let source = "";
    try {
      source = readFileSync2(filePath, "utf8");
    } catch {
      continue;
    }
    for (const scan of scans) {
      const mode = config.checks[scan.id] ?? scan.mode;
      findings.push(...sourceScanFindings(scan, path, source, mode, filePath));
    }
  }
  if (!findings.length) return;
  const text = [
    `[${policy12.displayName}] Domain check results`,
    "",
    ...findings.flatMap((finding) => [`- [${finding.mode}] ${finding.check}: ${finding.path}`, `  ${finding.message}`])
  ].join("\n");
  if (findings.some((finding) => finding.mode === "block")) {
    process.stderr.write(`${text}
`);
    process.exitCode = 2;
  } else writeJson(additionalContext("PostToolUse", text));
}
async function runDomainEngineeringHook(policy12, phase) {
  const event = await readStdinJson();
  if (event.__parseError) return;
  if (phase === "pre") await runPre(policy12, event);
  else if (phase === "post") await runPost(policy12, event);
  else warn(policy12.plugin, `unknown hook phase ${String(phase)}`);
}

// plugins/workspace-integrity/src/domains/android/lib/compose-detect.ts
var COLLECT_AS_STATE = /\bcollectAsState\s*\(/u;
var PAGING_NEAR = /\b(?:PagingData|LazyPagingItems|collectAsLazyPagingItems)\b/u;
var BOXED_PRIMITIVE_TYPE = /\bmutableStateOf\s*<\s*(?:Int|Long|Float|Double)\s*>/u;
var BOXED_PRIMITIVE_LITERAL = /\bmutableStateOf\s*\(\s*-?(?:0x[0-9A-Fa-f]+|\d+(?:\.\d+)?[fFlL]?)\s*\)/u;
var FOREGROUND_NAMED = /(?:color|tint)\s*=\s*Color\.(?:Black|White)\b/u;
var FOREGROUND_ARGB = /(?:color|tint)\s*=\s*Color\s*\(\s*0x[0-9A-Fa-f]+/u;
var COLOR_SCHEME = /\b(?:MaterialTheme\.)?colorScheme\b/u;
function maskRange(text) {
  return text.replace(/[^\n]/gu, " ");
}
function maskKotlin(source) {
  let out = "";
  let index = 0;
  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];
    if (current === "/" && next === "/") {
      const end = source.indexOf("\n", index);
      const stop = end === -1 ? source.length : end;
      out += maskRange(source.slice(index, stop));
      index = stop;
      continue;
    }
    if (current === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += maskRange(source.slice(index, stop));
      index = stop;
      continue;
    }
    if (source.startsWith('"""', index)) {
      const end = source.indexOf('"""', index + 3);
      const stop = end === -1 ? source.length : end + 3;
      out += maskRange(source.slice(index, stop));
      index = stop;
      continue;
    }
    if (current === '"' || current === "'") {
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === "\\") {
          cursor += 2;
          continue;
        }
        if (source[cursor] === current) {
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      out += maskRange(source.slice(index, cursor));
      index = cursor;
      continue;
    }
    out += current ?? "";
    index += 1;
  }
  return out;
}
function nearbyPaging(lines, index) {
  const from = Math.max(0, index - 2);
  const to = Math.min(lines.length, index + 3);
  return lines.slice(from, to).some((line) => PAGING_NEAR.test(line));
}
function pushUnique(findings, finding) {
  if (findings.some((item) => item.code === finding.code && item.line === finding.line)) return;
  findings.push(finding);
}
function detectComposeSource(source) {
  if (typeof source !== "string" || source.length === 0) return [];
  const visible = maskKotlin(source);
  const lines = visible.split(/\n/u);
  const findings = [];
  const hasColorScheme = COLOR_SCHEME.test(visible);
  for (const [index, line] of lines.entries()) {
    if (COLLECT_AS_STATE.test(line)) {
      const paging = nearbyPaging(lines, index);
      pushUnique(findings, paging ? {
        code: "PAGING_COLLECT_AS_STATE",
        line: index + 1,
        message: "PagingData must be collected with collectAsLazyPagingItems(), not collectAsState()."
      } : {
        code: "COLLECT_AS_STATE",
        line: index + 1,
        message: "UI Flow collection should use collectAsStateWithLifecycle(); if this is PagingData, use collectAsLazyPagingItems() instead."
      });
    }
    if (BOXED_PRIMITIVE_TYPE.test(line) || BOXED_PRIMITIVE_LITERAL.test(line)) {
      pushUnique(findings, {
        code: "PRIMITIVE_MUTABLE_STATE",
        line: index + 1,
        message: "Use mutableIntStateOf, mutableLongStateOf, mutableFloatStateOf, or mutableDoubleStateOf instead of boxed mutableStateOf."
      });
    }
    if (hasColorScheme && (FOREGROUND_NAMED.test(line) || FOREGROUND_ARGB.test(line))) {
      pushUnique(findings, {
        code: "HARDCODED_ON_THEME",
        line: index + 1,
        message: "Foreground Color.Black, Color.White, or Color(0x\u2026) over colorScheme is a dark-mode regression; use the matching on* role."
      });
    }
  }
  return findings;
}

// plugins/workspace-integrity/src/domains/android/policy.ts
var KOTLIN_SOURCE = /\.(?:kt|kts)$/iu;
function composeHits(codes) {
  return (_filePath, source) => detectComposeSource(source).filter((hit) => codes.has(hit.code)).map((hit) => ({ line: hit.line, code: hit.code, message: hit.message }));
}
var policy = {
  plugin: "android-engineering",
  displayName: "Android Engineering",
  active: (context) => /(?:AndroidManifest\.xml|res\/.+\.xml)$/iu.test(context.relativePath) || repoContainsPath(context.root, /(?:^|\/)AndroidManifest\.xml$/iu),
  protections: [
    { id: "android-gradle-locks", match: /(?:^|\/)gradle\.lockfile$|(?:^|\/)gradle\/dependency-locks\/[^/]+\.lockfile$/iu, reason: "Android dependency locks are generated by Gradle.", recovery: "Change Gradle dependency declarations and regenerate locks through the project wrapper." },
    { id: "android-gradle-cache", match: /(?:^|\/)\.gradle(?:\/|$)/iu, reason: "The Android Gradle cache is tool-owned.", recovery: "Change sources or declarations and let Gradle recreate the cache." }
  ],
  validators: [
    { id: "androidXml", kind: "xml", match: /(?:AndroidManifest\.xml|res\/.+\.xml)$/iu, mode: "block" },
    { id: "androidJson", kind: "json", match: /(?:^|\/)google-services\.json$/iu, mode: "block" }
  ],
  sourceScans: [
    { id: "composeCollectAsState", match: KOTLIN_SOURCE, mode: "report", inspect: composeHits(/* @__PURE__ */ new Set(["COLLECT_AS_STATE", "PAGING_COLLECT_AS_STATE"])) },
    { id: "composePrimitiveState", match: KOTLIN_SOURCE, mode: "report", inspect: composeHits(/* @__PURE__ */ new Set(["PRIMITIVE_MUTABLE_STATE"])) },
    { id: "composeLiteralColor", match: KOTLIN_SOURCE, mode: "report", inspect: composeHits(/* @__PURE__ */ new Set(["HARDCODED_ON_THEME"])) }
  ]
};

// plugins/workspace-integrity/src/domains/commands/entries/hooks/cmd-safety-hook-post-tool.ts
import { existsSync as existsSync3 } from "node:fs";
import { isAbsolute as isAbsolute2, resolve as resolve3 } from "node:path";

// plugins/workspace-integrity/src/domains/commands/lib/hook-io.ts
function extractShellCommand2(toolName, toolInput) {
  return extractShellCommand({ tool_name: toolName, tool_input: toolInput });
}
function extractWriteTargets(toolNameOrEvent, toolInput) {
  const event = toolInput === void 0 ? toolNameOrEvent : { tool_name: toolNameOrEvent, tool_input: toolInput, cwd: process.cwd() };
  return extractFileTargets(event, { tools: "any", includeShellWrites: true });
}
function additionalContextOutput(hookEventName, text) {
  return additionalContext(hookEventName, text, {
    echoStderr: Boolean(process.env.PLUGIN_ROOT)
  });
}

// plugins/workspace-integrity/src/domains/commands/engines/file-safety.ts
import { readFileSync as readFileSync3 } from "node:fs";
import { basename as basename2, extname } from "node:path";
var TLS = [/\bInsecureSkipVerify\s*:\s*true\b/u, /\brejectUnauthorized\s*:\s*false\b/u, /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/u, /\bverify\s*=\s*False\b/u, /\bssl\.CERT_NONE\b/u, /\b_create_unverified_context\s*\(/u, /CURLOPT_SSL_VERIFY(?:PEER|HOST)\s*(?:=>|,)\s*(?:false|0|0L)\b/iu, /\bdanger_accept_invalid_certs\s*\(\s*true\s*\)/u, /\bOpenSSL::SSL::VERIFY_NONE\b/u];
var LOG = /(?:logger|log|logging|slog|zap|zerolog|logrus|fmt)\s*\.\s*\w+\s*\(|console\s*\.\s*(?:log|info|warn|error|debug)\s*\(|fmt\.(?:Print|Println|Printf|Fprintf|Sprintf)\s*\(|print(?:f|ln)?\s*\(/iu;
var PII = /(?<!['"` ])\b(?:email|phone|mobile|tel(?:ephone)?|password|passwd|secret|token|api[_-]?key|ssn|national[_-]?id|credit[_-]?card|cvv|birth(?:day|date)|身份证|手机号|邮箱|密码|证件号)\b(?!['"`])/iu;
var SOURCE = /* @__PURE__ */ new Set([".js", ".cjs", ".mjs", ".jsx", ".ts", ".tsx", ".py", ".java", ".kt", ".scala", ".go", ".rs", ".php", ".rb", ".c", ".cc", ".cpp", ".cxx", ".h", ".hpp", ".cs"]);
function read(path) {
  try {
    const bytes = readFileSync3(path);
    return bytes.length <= 2 * 1024 * 1024 ? { text: bytes.toString("utf8") } : null;
  } catch {
    return null;
  }
}
function count(text, predicate) {
  return text.split("\n").filter(predicate).length;
}
function testPath(path) {
  const normalized = path.replaceAll("\\", "/");
  return /\/(?:tests?|spec|__tests__|__mocks__|fixtures?|testdata|e2e)\//u.test(normalized) || /\.(?:test|spec|e2e)\.[^.]+$/u.test(basename2(path));
}
function fileSafetyReports(path, input = {}) {
  const content = read(path);
  if (!content) return [];
  const extension = extname(path).toLowerCase(), reports = [];
  if (!SOURCE.has(extension) || testPath(path)) return reports;
  const newText = typeof input.new_string === "string" ? input.new_string : content.text, oldText = typeof input.old_string === "string" ? input.old_string : "";
  const tlsLine = (line) => !/^\s*(?:\/\/|#|\/\*|\*)/u.test(line) && !/(?:原因).*?(?:expires|ticket|issue|#\d|过期|到期)/iu.test(line) && TLS.some((pattern) => pattern.test(line));
  const tls = count(newText, tlsLine) - count(oldText, tlsLine);
  if (tls > 0) reports.push(`[Insecure TLS Notice] ${path}: ${tls} net-new TLS verification bypass(es); use a trusted CA or a ticketed, expiring exception`);
  const normalized = path.toLowerCase().replaceAll("\\", "/");
  if (!/\/(?:sanitiz|redact|mask|anonymiz|obfuscat)/u.test(normalized)) {
    const piiLine = (line) => LOG.test(line) && PII.test(line);
    const pii = count(newText, piiLine) - count(oldText, piiLine);
    if (pii > 0) reports.push(`[Log PII Notice] ${path}: ${pii} net-new log call(s) contain direct PII variables; redact or log a non-sensitive identifier`);
  }
  return reports;
}

// plugins/workspace-integrity/src/domains/commands/lib/rule-engine.ts
import { execFileSync } from "node:child_process";
import { existsSync as existsSync2 } from "node:fs";
import { join as join2 } from "node:path";
import { pathToFileURL as pathToFileURL2 } from "node:url";

// plugins/workspace-integrity/src/domains/commands/lib/builtin-rules.ts
import { createHash as createHash2 } from "node:crypto";
function fileAwareEditRecovery(host2) {
  if (host2 === "codex") {
    return "Use apply_patch for new or existing files so path guards and verification hooks can observe the change.";
  }
  if (host2 === "claude") {
    return "Use Write for new files or Edit for existing files so path guards and verification hooks can observe the change.";
  }
  return "Use the host's file-aware editing tool so path guards and verification hooks can observe the change.";
}
var SQL_CLIENTS = /* @__PURE__ */ new Set([
  "mysql",
  "mariadb",
  "mysqlsh",
  "mycli",
  "psql",
  "pgcli",
  "cockroach",
  "sqlite3",
  "litecli",
  "duckdb",
  "clickhouse",
  "clickhouse-client",
  "sqlcmd",
  "usql",
  "snowsql",
  "trino",
  "presto",
  "mongosh",
  "mongo"
]);
function programInvocations(command, programs) {
  return shellCommandInvocations(command).filter(
    (invocation) => programs.has(invocation.executable.toLowerCase())
  );
}
function digest(command) {
  return createHash2("sha256").update(command).digest("hex").slice(0, 16);
}
function cleanedSql(command) {
  return tokenizeShell(command).join(" ").replace(/--(?=\s|$)[^\n]*/gu, "").replace(/\/\*[\s\S]*?\*\//gu, "");
}
function isTempPathOperand(token) {
  const value = String(token ?? "");
  return /^(?:\/tmp\/|\/private\/tmp\/|\$\{?TMPDIR\}?\/)/u.test(value);
}
function sedFileOperands(args) {
  const files = [];
  let sawExpression = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? "";
    if (argument === "--") {
      files.push(...args.slice(index + 1));
      break;
    }
    if (argument === "-e" || argument === "--expression" || argument === "-f" || argument === "--file") {
      sawExpression = true;
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) continue;
    if (!sawExpression) {
      sawExpression = true;
      continue;
    }
    files.push(argument);
  }
  return files;
}
function sedHasUnbackedInplace(args) {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? "";
    if (argument === "--in-place") return true;
    if (argument.startsWith("--in-place=")) continue;
    const short = argument.match(/^-[A-Za-z]*i(.*)$/u);
    if (!short) continue;
    if (short[1]) continue;
    if (args[index + 1] === "") continue;
    return true;
  }
  return false;
}
function sedInplaceReason(command) {
  const invocations = programInvocations(command, /* @__PURE__ */ new Set(["sed"]));
  for (const { args } of invocations) {
    if (!sedHasUnbackedInplace(args)) continue;
    const files = sedFileOperands(args);
    if (files.length > 0 && files.every((file) => isTempPathOperand(file))) {
      continue;
    }
    return "sed -i modifies files in place without a backup and cannot be rolled back";
  }
  return null;
}
var CAT_HEREDOC_WRITE_RE = /\bcat\s*(?:>|>>)\s*\S+[^|]*<<|cat\s*<<-?\s*['"]?\w+['"]?\s*(?:>|>>)\s*\S+/;
function isCatHeredocWrite(command) {
  return CAT_HEREDOC_WRITE_RE.test(command);
}
function isCatPipeInput(command) {
  return /<<-?\s*['"]?\w+['"]?\s*\|/.test(command);
}
function isCatTmpRedirect(command) {
  return /(?:>|>>)\s*(?:\/tmp\/\S+|\/private\/tmp\/\S+|\$TMPDIR\/\S+)/.test(
    command
  );
}
function redisOperation(command) {
  const invocations = programInvocations(command, /* @__PURE__ */ new Set(["redis-cli"]));
  for (const { args } of invocations) {
    const match = args.join(" ").match(
      /\b(?:KEYS|MONITOR|FLUSHALL|FLUSHDB|DEL|RANDOMKEY|SETBIT|BGSAVE|BGREWRITEAOF)\b/iu
    );
    const operation = match?.[0];
    if (operation) return operation.toUpperCase();
  }
  return null;
}
function sqlDestructiveReason(command) {
  const blocks = [
    [/\bDROP\s+(?:DATABASE|TABLE|SCHEMA|INDEX|VIEW)\b/iu, "DROP permanently deletes a database object"],
    [/\bTRUNCATE\s+(?:TABLE\s+)?\w/iu, "TRUNCATE removes all table data"],
    [/\bALTER\s+TABLE\b[^;]*\bDROP\s+COLUMN\b/iu, "DROP COLUMN permanently deletes column data"],
    [/\bDELETE\s+FROM\b(?![^;]*\bWHERE\b)/iu, "DELETE is missing WHERE"],
    [/\bUPDATE\s+[^;]+\s+SET\b(?![^;]*\bWHERE\b)/iu, "UPDATE is missing WHERE"]
  ];
  for (const { args } of programInvocations(command, SQL_CLIENTS)) {
    const cleaned = cleanedSql(args.join(" "));
    for (const [pattern, reason] of blocks) {
      if (pattern.test(cleaned)) return reason;
    }
  }
  return null;
}
function sqlPrivilegeHit(command) {
  return programInvocations(command, SQL_CLIENTS).some(
    ({ args }) => /\b(?:GRANT|REVOKE)\b/iu.test(cleanedSql(args.join(" ")))
  );
}
function activeTestReason(command) {
  for (const { executable: executable2, args } of shellCommandInvocations(command)) {
    const program = executable2.toLowerCase();
    const subject = args.join(" ");
    if (["masscan", "zmap"].includes(program)) {
      return "the high-speed internet-wide scanner has no auditable boundary";
    }
    if (["hping", "hping3"].includes(program) && /--flood\b/u.test(subject)) {
      return "flood mode is prohibited";
    }
    if (program === "nmap") {
      const cidr = subject.match(/\S+\/(\d{1,2})\b/u);
      const cidrBits = cidr?.[1];
      if (cidrBits !== void 0 && Number(cidrBits) <= 20) {
        return `target range /${cidrBits} exceeds the /21 limit`;
      }
      if (/(?:^|\s)-p-(?:\s|$)/u.test(subject) && !/--max-rate(?:=|\s+)\d+/u.test(subject)) {
        return "the all-port scan is missing --max-rate";
      }
    }
    if (["ffuf", "gobuster", "feroxbuster"].includes(program) && !/(?:^|\s)(?:-rate|--rate|-t|--threads)(?:=|\s+)\d+/u.test(subject)) {
      return "content enumeration is missing a rate or thread limit";
    }
  }
  return null;
}
function secretLeakHit(command) {
  return shellCommandInvocations(command).some(secretLeakInvocationHit);
}
function secretLeakInvocationHit({ executable: executable2, args }) {
  const program = executable2.toLowerCase();
  const subject = args.join(" ");
  if (["cat", "head", "tail", "less", "more", "bat"].includes(program)) {
    return /(?:\.pem|\.key|\.p12|\.pfx|id_rsa|id_ed25519|\.jks|\.keystore|\.env\b|credentials\.json|\.aws\/credentials|\.netrc|\.git-credentials)/iu.test(
      subject
    );
  }
  if (["curl", "wget", "http"].includes(program)) {
    return /(?:--data(?:-raw|-binary)?|--form|-d|-F)\s[^;|&]*(?:\$(?:\{)?(?:PRIVATE_KEY|SECRET_KEY|API_SECRET|AWS_SECRET_ACCESS_KEY|DATABASE_PASSWORD|DB_PASSWORD)|\$\(\s*cat\s+[^)]*(?:\.pem|\.key|id_rsa|id_ed25519))/iu.test(
      subject
    );
  }
  if (program === "apksigner") {
    return /(?:--ks-pass|--key-pass)(?:=|\s+)pass:/iu.test(subject);
  }
  if (program === "base64") {
    return /(?:\.pem|\.key|id_rsa|id_ed25519|PRIVATE)/iu.test(subject);
  }
  if (program === "echo") {
    return /\$(?:\{)?(?:PRIVATE_KEY|SECRET_KEY|TOKEN|API_KEY)/iu.test(subject);
  }
  return false;
}
var BUILTIN_RULES = [
  {
    id: "sed-inplace",
    title: "sed -i Guard",
    mode: "deny",
    match: { test: (command) => Boolean(sedInplaceReason(command)) },
    resolveReason: (command) => sedInplaceReason(command) ?? "sed in-place editing has no recoverable backup",
    recovery: "Use Edit/apply_patch for replacements; if sed is required, create an explicit recoverable backup first. Unbacked sed -i under /tmp, /private/tmp, or $TMPDIR/ is allowed.",
    observedFacts: "The Bash input contains sed --in-place or bare sed -i without a backup suffix on a non-temporary path.",
    harm: "In-place rewrites are difficult to review or recover and bypass file-aware editing hooks.",
    unblockWhen: "Target only temporary paths (/tmp/\u2026, $TMPDIR/\u2026), use a backup suffix, or use a file-aware editing tool."
  },
  {
    id: "cat-heredoc-repo-write",
    title: "Cat Write Guard",
    mode: "deny",
    match: {
      test: (command) => isCatHeredocWrite(command) && !isCatPipeInput(command) && !isCatTmpRedirect(command)
    },
    reason: "Writing a file through a Bash cat heredoc bypasses all PostToolUse hooks",
    recovery: "Use the host's file-aware editing tool.",
    observedFacts: "The Bash input contains a cat heredoc redirected to a non-temporary file.",
    harm: "The write bypasses file-aware target checks, change hooks, and post-write verification.",
    unblockWhen: "The heredoc is used only as pipeline input, writes only to an allowed temporary directory, or is replaced with a file-aware editing tool.",
    formatMessage: (command, host2) => [
      "[Cat Write Guard] cat heredoc file write blocked",
      "",
      "Writing a file through a Bash cat heredoc bypasses all PostToolUse hooks:",
      "  \u2022 syntax checkers do not run",
      "  \u2022 line-budget checks are outside this command-safety responsibility",
      "  \u2022 encoding guards do not check encoding",
      "  \u2022 path guards do not check the write target",
      "",
      `Command: ${command}`,
      "",
      `Alternative: ${fileAwareEditRecovery(host2)}`,
      "",
      "blockingContract:",
      "  observedFacts: The Bash input contains a cat heredoc redirected to a non-temporary file.",
      "  harm: The write bypasses file-aware target checks, change hooks, and post-write verification.",
      "  unblockWhen: The heredoc is used only as pipeline input, writes only to an allowed temporary directory, or is replaced with a file-aware editing tool.",
      `  recovery: ${fileAwareEditRecovery(host2)}`
    ].join("\n")
  },
  {
    id: "cat-heredoc-tmp-write",
    title: "Cat Write Guard",
    mode: "report",
    match: {
      test: (command) => isCatHeredocWrite(command) && !isCatPipeInput(command) && isCatTmpRedirect(command)
    },
    reason: "Writing a temporary file with a Bash cat heredoc does not trigger file-aware PostToolUse checks",
    recovery: "Temporary scripts may proceed, but prefer the host's file-aware editing tool.",
    formatMessage: (command, host2) => [
      "[Cat Write Guard] cat heredoc temporary-file write detected",
      "",
      "Writing a file with a Bash cat heredoc does not trigger file-aware PostToolUse checks.",
      `Temporary scripts may proceed. ${fileAwareEditRecovery(host2)}`,
      `Command: ${command}`
    ].join("\n")
  },
  {
    id: "redis-cli-risk",
    title: "Redis CLI Risk",
    mode: "deny",
    match: {
      test: (command) => {
        const op = redisOperation(command);
        return Boolean(
          op && ["KEYS", "MONITOR", "FLUSHALL", "FLUSHDB"].includes(op)
        );
      }
    },
    resolveReason: (command) => {
      const op = redisOperation(command);
      return `${op} scans, blocks, or clears Redis data`;
    },
    recovery: "Confirm the target instance, data scope, and recoverable alternative first",
    observedFacts: "The command matches a high-risk Redis CLI operation.",
    harm: "It may cause data loss or block the instance.",
    unblockWhen: "Use an auditable narrow-scope operation or declare a precise allow rule in configuration."
  },
  {
    id: "redis-cli-pressure",
    title: "Redis CLI Risk",
    mode: "report",
    match: {
      test: (command) => {
        const op = redisOperation(command);
        return Boolean(
          op && ["DEL", "RANDOMKEY", "SETBIT", "BGSAVE", "BGREWRITEAOF"].includes(
            op
          )
        );
      }
    },
    resolveReason: (command) => {
      const op = redisOperation(command);
      return `${op} may block the main thread or increase instance resource pressure`;
    },
    recovery: "Confirm the target instance, data scope, and recoverable alternative first"
  },
  {
    id: "sql-destructive",
    title: "Dangerous SQL",
    mode: "deny",
    match: { test: (command) => Boolean(sqlDestructiveReason(command)) },
    resolveReason: (command) => sqlDestructiveReason(command) ?? "dangerous SQL",
    recovery: "Add an explicit WHERE clause or complete backup, authorization, and recovery verification first",
    observedFacts: "The SQL client command matches a destructive change or a mutation without WHERE.",
    harm: "It may permanently delete database objects or remove data in bulk.",
    unblockWhen: "Add WHERE, backup, and authorization before executing."
  },
  {
    id: "sql-privilege",
    title: "SQL Notice",
    mode: "report",
    match: { test: (command) => sqlPrivilegeHit(command) },
    reason: "database privileges will change",
    recovery: "Confirm the target user, least-privilege scope, and rollback statement"
  },
  {
    id: "active-test-unbounded",
    title: "Security Active Test Scope Guard",
    mode: "deny",
    match: { test: (command) => Boolean(activeTestReason(command)) },
    resolveReason: (command) => activeTestReason(command) ?? "active security testing lacks an auditable boundary",
    recovery: "Use an explicit target and bounded rate",
    observedFacts: "The active security testing command lacks an auditable boundary.",
    harm: "It may scan outside the authorized scope or overload resources.",
    unblockWhen: "Declare the target scope and rate or thread limit."
  },
  {
    id: "secret-leak",
    title: "Secret Leak Notice",
    mode: "report",
    match: { test: (command) => secretLeakHit(command) },
    resolveReason: (command) => `The command may read, print, or transmit sensitive credentials (digest ${digest(command)})`,
    recovery: "Read only required fields, never echo or exfiltrate them, and use environment references and secure credential channels",
    sensitive: true
  },
  {
    id: "lark-yes",
    title: "Lark CLI Confirmation Audit",
    mode: "report",
    match: {
      test: (command) => programInvocations(command, /* @__PURE__ */ new Set(["lark-cli"])).some(
        ({ args }) => args.includes("--yes")
      )
    },
    reason: "non-interactive --yes confirmation detected",
    recovery: "Confirm the target resource, write/delete scope, recoverable copy, and read-back verification",
    sensitive: true
  }
];

// plugins/workspace-integrity/src/domains/commands/lib/sanitize-command.ts
function sanitizeCommand(command) {
  if (typeof command !== "string" || !command) return "";
  let stripped = command.replace(
    /\$\(cat\s+<<'?(\w+)'?\n[\s\S]*?\n\1\s*\)/g,
    " __HEREDOC__ "
  );
  stripped = stripped.replace(
    /\bgit\s+commit\b[^;|&]*/g,
    (commitCommand) => commitCommand.replace(/-m\s+"(?:[^"\\]|\\.)*"/g, '-m "__MSG__"').replace(/-m\s+'[^']*'/g, "-m '__MSG__'")
  );
  return stripped;
}

// plugins/workspace-integrity/src/domains/commands/lib/rule-engine.ts
var CONFIG_FILE_NAMES = [
  ".command-safety.mjs",
  ".command-safety.cjs",
  ".command-safety.js"
];
var DEFAULT_SETTINGS = {
  engines: {
    dangerousRm: true,
    verificationIntegrity: true,
    mysqlReplicationPreflight: true,
    secretRead: true,
    fileSafety: true,
    denyEscalation: true
  },
  escalation: {
    windowMinutes: 10,
    threshold: 3
  }
};
function isMatcher(value) {
  return value instanceof RegExp || isRecord(value) && typeof value.test === "function";
}
function testMatcher(matcher, subject) {
  if (matcher instanceof RegExp) {
    return new RegExp(matcher.source, matcher.flags).test(subject);
  }
  return matcher.test(subject);
}
function isRuleMode(value) {
  return value === "deny" || value === "report" || value === "allow";
}
function optionalString(value) {
  return typeof value === "string" ? value : void 0;
}
function resolveEngineSettings(raw) {
  const engines = { ...DEFAULT_SETTINGS.engines };
  if (!isRecord(raw)) return engines;
  if (typeof raw.verificationIntegrity === "boolean") {
    engines.verificationIntegrity = raw.verificationIntegrity;
  }
  if (typeof raw.mysqlReplicationPreflight === "boolean") {
    engines.mysqlReplicationPreflight = raw.mysqlReplicationPreflight;
  }
  if (typeof raw.secretRead === "boolean") engines.secretRead = raw.secretRead;
  if (typeof raw.fileSafety === "boolean") engines.fileSafety = raw.fileSafety;
  return engines;
}
function resolveEscalationSettings(_raw) {
  return { ...DEFAULT_SETTINGS.escalation };
}
function validateRule(rule, i) {
  if (!rule || typeof rule !== "object") {
    process.stderr.write(
      `[command-safety] rule[${i}]: must be an object, skipping
`
    );
    return false;
  }
  if (!("match" in rule) || !(rule.match instanceof RegExp)) {
    process.stderr.write(
      `[command-safety] rule[${i}]: "match" must be a RegExp, skipping
`
    );
    return false;
  }
  const mode = "mode" in rule ? rule.mode ?? "deny" : "deny";
  if (!isRuleMode(mode)) {
    process.stderr.write(
      `[command-safety] rule[${i}]: "mode" must be deny|report|allow, skipping
`
    );
    return false;
  }
  return true;
}
function resolveRules(userConfig) {
  const config = isRecord(userConfig) ? userConfig : {};
  const rawUser = Array.isArray(config.rules) ? config.rules : [];
  if (config.rules !== void 0 && !Array.isArray(config.rules)) {
    process.stderr.write(
      `[command-safety] config "rules" must be an array, using built-ins
`
    );
  }
  const userRules = rawUser.map((rule, i) => ({ rule, i })).filter((item) => validateRule(item.rule, item.i)).map(({ rule, i }) => {
    const mode = isRuleMode(rule.mode) ? rule.mode : "deny";
    return {
      id: typeof rule.id === "string" && rule.id ? rule.id : `user-rule[${i}]`,
      match: rule.match,
      mode,
      title: optionalString(rule.title),
      reason: optionalString(rule.reason),
      recovery: optionalString(rule.recovery),
      observedFacts: optionalString(rule.observedFacts),
      harm: optionalString(rule.harm),
      unblockWhen: optionalString(rule.unblockWhen),
      sensitive: Boolean(rule.sensitive)
    };
  });
  const settingsSource = isRecord(config.settings) ? config.settings : null;
  return {
    rules: [...userRules, ...BUILTIN_RULES],
    settings: {
      engines: resolveEngineSettings(settingsSource?.engines),
      escalation: resolveEscalationSettings(settingsSource?.escalation)
    }
  };
}
function matchRule(command, rules, options = {}) {
  const { sanitize = true } = options;
  if (typeof command !== "string" || !command) return null;
  const subject = sanitize ? sanitizeCommand(command) : command;
  for (const rule of rules) {
    if (!isMatcher(rule.match)) continue;
    try {
      if (testMatcher(rule.match, subject)) return rule;
    } catch {
      continue;
    }
  }
  return null;
}
function resolveReason(rule, command) {
  if (typeof rule.resolveReason === "function") {
    return rule.resolveReason(command);
  }
  return rule.reason || `matched rule ${rule.id}`;
}
function formatFinding(rule, command, options = {}) {
  if (typeof rule.formatMessage === "function") {
    return rule.formatMessage(command, options.host);
  }
  const title = rule.title || rule.id || "Command Safety";
  const reason = resolveReason(rule, command);
  const recovery = rule.recovery || "Adjust the command and retry, or declare an allow rule in the project configuration.";
  if (rule.mode === "report") {
    return [
      `[${title}] Risk notice`,
      "",
      `Reason: ${reason}`,
      `Recovery/alternative: ${recovery}`,
      `Command: ${command}`
    ].join("\n");
  }
  return [
    `[${title}] Blocked`,
    "",
    `Reason: ${reason}`,
    `Recovery/alternative: ${recovery}`,
    `Command: ${command}`,
    "",
    "blockingContract:",
    `  observedFacts: ${rule.observedFacts || "The command matched a declarative command-safety rule."}`,
    `  harm: ${rule.harm || "It may cause data loss, out-of-scope testing, credential exposure, or unrecoverable changes."}`,
    `  unblockWhen: ${rule.unblockWhen || "Provide authorization, scope, backup, or a safe alternative, or add a precise allow rule."}`,
    `  recovery: ${recovery}`
  ].join("\n");
}
function resolveRepoRoot(cwd = process.cwd()) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5e3,
      cwd
    }).trim();
  } catch {
    return null;
  }
}
async function loadUserConfig(repoRoot2) {
  if (!repoRoot2) return null;
  for (const name of CONFIG_FILE_NAMES) {
    const path = join2(repoRoot2, name);
    if (!existsSync2(path)) continue;
    try {
      const loaded = await import(pathToFileURL2(path).href);
      if (!isRecord(loaded)) return loaded;
      return loaded.default ?? loaded;
    } catch (error) {
      const message = isRecord(error) && error.message != null ? String(error.message) : String(error);
      process.stderr.write(
        `[command-safety] Failed to load ${name}: ${message}
`
      );
      return null;
    }
  }
  return null;
}

// plugins/workspace-integrity/src/domains/commands/entries/hooks/cmd-safety-hook-post-tool.ts
async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const cwd = eventCwd(event);
  const repoRoot2 = resolveRepoRoot(cwd);
  const userConfig = await loadUserConfig(repoRoot2);
  const { settings } = resolveRules(userConfig);
  if (settings.engines.fileSafety === false) return;
  const input = eventToolInput(event);
  const reports = extractWriteTargets(event).map((path) => isAbsolute2(path) ? path : resolve3(cwd, path)).filter(existsSync3).flatMap((path) => fileSafetyReports(path, input));
  if (reports.length) {
    writeJson(additionalContextOutput("PostToolUse", reports.join("\n\n")));
  }
}

// plugins/workspace-integrity/src/domains/commands/lib/matchers.ts
var SHELL_TOOLS = /^(Bash|Shell|bash|shell|shell_command|exec_command|exec|local_shell)$/i;
function normalizeToolName(toolName) {
  if (typeof toolName !== "string" || !toolName) return "";
  const lower = toolName.trim().toLowerCase();
  const map = {
    apply_patch: "ApplyPatch",
    applypatch: "ApplyPatch",
    write: "Write",
    edit: "Edit",
    multiedit: "MultiEdit",
    notebookedit: "NotebookEdit",
    create_file: "Write",
    search_replace: "Edit",
    bash: "Bash",
    shell: "Shell",
    shell_command: "Shell",
    exec_command: "Shell",
    exec: "Shell",
    local_shell: "Shell"
  };
  const mapped = map[lower];
  if (mapped) return mapped;
  if (/^(Edit|Write|MultiEdit|ApplyPatch|NotebookEdit|Bash|Shell)$/.test(toolName)) {
    return toolName;
  }
  return toolName;
}
function isShellTool2(toolName) {
  return typeof toolName === "string" && SHELL_TOOLS.test(toolName);
}

// plugins/workspace-integrity/src/domains/commands/engines/mysql-preflight.ts
function successfulPreflightEvidence(event) {
  const record = isRecord(event) ? event : null;
  const candidates = [
    event,
    record?.mysql_replication_preflight,
    record?.mysqlReplicationPreflight,
    record?.preflight
  ];
  return candidates.some((candidate) => {
    if (!isRecord(candidate)) return false;
    const tool = typeof candidate.tool === "string" && candidate.tool || candidate.tool_name || candidate.toolName;
    const exitCode = candidate.exit_code ?? candidate.exitCode;
    const timedOut = candidate.timed_out ?? candidate.timedOut;
    return tool === "mysql-replication-preflight" && exitCode !== void 0 && exitCode !== null && Number(exitCode) === 0 && timedOut !== true;
  });
}
function replicationMutation(command) {
  for (const { executable: executable2, args } of shellCommandInvocations(command)) {
    if (!["mysql", "mysqlsh"].includes(executable2.toLowerCase())) continue;
    const mutation = args.join(" ").match(
      /\b(?:RESET\s+REPLICA\s+ALL|CHANGE\s+REPLICATION\s+SOURCE\s+TO|STOP\s+REPLICA|SET\s+(?:@@GLOBAL\.|GLOBAL\s+)(?:super_)?read_only\s*=\s*(?:0|OFF))\b/iu
    )?.[0];
    if (mutation) return mutation;
  }
  return null;
}
function mysqlReplicationPreflightFinding(command, event = {}) {
  const mutation = replicationMutation(command);
  if (!mutation) return null;
  if (successfulPreflightEvidence(event)) return null;
  return {
    action: "deny",
    id: "MySQL Replication Failover Guard",
    reason: `missing successful replication preflight evidence: ${mutation}`,
    recovery: "run mysql-replication-preflight first and verify replication threads, lag, and GTID coverage"
  };
}
function mysqlPreflightDenyMessage(finding, command = "") {
  return [
    `[${finding.id}] Blocked`,
    "",
    `Reason: ${finding.reason}`,
    `Recovery/alternative: ${finding.recovery}`,
    `Command: ${command}`,
    "",
    "blockingContract:",
    "  observedFacts: The command matches a high-risk replication state change without successful preflight evidence.",
    "  harm: It could cause an unverifiable primary/replica switchover or data inconsistency.",
    "  unblockWhen: Provide successful mysql-replication-preflight evidence.",
    `  recovery: ${finding.recovery}`
  ].join("\n");
}

// plugins/workspace-integrity/src/domains/commands/engines/secret-read.ts
import { basename as basename3 } from "node:path";
var WHITELIST = [/(?:^|\/)(?:tests?|__tests__|fixtures|testdata|examples?|samples?|templates?|docs?)\//iu, /\.(?:md|rst|adoc)$/iu, /\.env\.(?:example|template|sample|dist)$/iu];
var SENSITIVE = [/(?:^|\/)\.env(?:\.[^.]+)?$/iu, /\.(?:pem|key|p12|pfx|jks|keystore)$/iu, /\bid_(?:rsa|ed25519|ecdsa|dsa)$/iu, /(?:^|\/)\.ssh\//iu, /(?:credentials\.json|service[-_]?account[-_]?key|\.aws\/credentials|\.docker\/config\.json|\.npmrc|\.pypirc|\.netrc|\.git-credentials|htpasswd)$/iu];
function secretReadReport(targets) {
  for (const raw of targets) {
    const path = String(raw).replaceAll("\\", "/");
    if (WHITELIST.some((pattern) => pattern.test(path))) continue;
    if (SENSITIVE.some((pattern) => pattern.test(path)) || /(?:secret|credential|(?:^|[_.-])token[_.-]|passwd|password|api[-_]?key)/iu.test(basename3(path))) return `[Secret Read Notice] Sensitive file read detected

File: ${raw}
Read content may enter the agent context; read only fields required by the task and never echo credentials in output.`;
  }
  return null;
}

// plugins/workspace-integrity/src/domains/commands/lib/deny-state.ts
import { createHash as createHash3 } from "node:crypto";
import { appendFileSync, mkdirSync as mkdirSync3, readFileSync as readFileSync5 } from "node:fs";
import { join as join4, resolve as resolve4 } from "node:path";

// core/src/plugin-workdir.ts
import { mkdirSync as mkdirSync2, readFileSync as readFileSync4, writeFileSync as writeFileSync2 } from "node:fs";
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
    current = readFileSync4(ignore, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (current !== null && normalizeGitignore(current) === "*") return;
  if (current !== null && !isStalePluginWorkdirGitignore(current)) return;
  writeFileSync2(ignore, PLUGIN_WORKDIR_GITIGNORE, { encoding: "utf8", mode: 384 });
}

// plugins/workspace-integrity/src/domains/commands/lib/deny-state.ts
var DEFAULT_WINDOW_MS = 10 * 60 * 1e3;
var DEFAULT_THRESHOLD = 3;
var STATE_DIR_RELATIVE = ".command-safety/.state";
function eventCwd2(event) {
  return typeof event.cwd === "string" && event.cwd ? event.cwd : process.cwd();
}
function stateFile(cwd) {
  return join4(resolve4(cwd), STATE_DIR_RELATIVE, "denies.jsonl");
}
function ensureStateFile(event) {
  const cwd = eventCwd2(event);
  const path = stateFile(cwd);
  try {
    const directory = join4(resolve4(cwd), STATE_DIR_RELATIVE);
    mkdirSync3(directory, { recursive: true, mode: 448 });
    ensurePluginWorkdirGitignore(join4(resolve4(cwd), ".command-safety"));
    return path;
  } catch {
    return null;
  }
}
function hash(value) {
  return createHash3("sha256").update(value).digest("hex");
}
function target(event, command) {
  const cwd = eventCwd2(event);
  const tool = isRecord(event.tool) ? event.tool : null;
  const input = tool && isRecord(tool.input) ? tool.input : null;
  const fileTargets = tool && Array.isArray(tool.fileTargets) ? tool.fileTargets : null;
  const direct = input?.file_path ?? input?.filePath ?? input?.path ?? fileTargets?.[0];
  if (direct) return hash(resolve4(cwd, String(direct)));
  const tokens = tokenizeShell(command).filter(
    (token) => ![";", "&&", "||", "|", "&"].includes(token)
  );
  const operation = tokens.find(
    (token) => /^(?:rm|sed|cat|mysql|mysqlsh|redis-cli|nmap|masscan|zmap|ffuf|gobuster|feroxbuster)$/u.test(
      token.split("/").at(-1) ?? ""
    )
  )?.split("/").at(-1) ?? tokens[0] ?? "command";
  const path = [...tokens].reverse().find(
    (token) => !token.startsWith("-") && (/^(?:\/|\.|~|\$)/u.test(token) || token.includes("/"))
  );
  return hash(`${operation}:${path ?? tokens[1] ?? ""}`);
}
function isDenyEntry(value) {
  return isRecord(value) && typeof value.ts === "number";
}
function entries(event) {
  const path = stateFile(eventCwd2(event));
  if (!path) return [];
  try {
    return readFileSync5(path, "utf8").split("\n").filter(Boolean).map((line) => {
      const parsed = JSON.parse(line);
      return parsed;
    }).filter(isDenyEntry);
  } catch {
    return [];
  }
}
function escalationMessage(event, command, options = {}) {
  if (/(?:^|\s)#\s*escalation-ok\b/iu.test(command)) return null;
  const windowMs = typeof options.windowMinutes === "number" && options.windowMinutes > 0 ? options.windowMinutes * 60 * 1e3 : DEFAULT_WINDOW_MS;
  const threshold = typeof options.threshold === "number" && options.threshold > 0 ? options.threshold : DEFAULT_THRESHOLD;
  const key = target(event, command);
  const cutoff = Date.now() - windowMs;
  const currentTurn = event.turn_id ?? event.turnId ?? "";
  const recent = entries(event).filter(
    (entry) => entry.ts >= cutoff && entry.target === key && (!currentTurn || entry.turn !== currentTurn)
  );
  const turns = new Set(recent.map((entry) => entry.turn).filter(Boolean));
  const count2 = Math.max(
    turns.size,
    recent.filter((entry) => !entry.turn).length
  );
  return count2 >= threshold ? `[Deny Escalation Guard] command-safety has denied the same target ${count2} times.

Stop retrying with alternate spellings, reread the denial reason, and satisfy its prerequisites. If this is a false positive, explain the evidence to the user. The count expires after ${options.windowMinutes ?? 10} minutes.` : null;
}
function recordDeny(event, command, hook) {
  const path = ensureStateFile(event);
  if (!path) return;
  try {
    appendFileSync(
      path,
      `${JSON.stringify({
        ts: Date.now(),
        turn: event.turn_id ?? event.turnId ?? "",
        target: target(event, command),
        hook
      })}
`,
      { mode: 384 }
    );
  } catch {
  }
}

// plugins/workspace-integrity/src/domains/commands/engines/dangerous-rm.ts
import { homedir } from "node:os";
import { dirname as dirname3, resolve as resolve5 } from "node:path";
var COMMAND_SEPARATORS3 = /* @__PURE__ */ new Set(["&&", "||", ";", "|", "&", "{", "}"]);
var SHELL_COMMANDS = /* @__PURE__ */ new Set(["bash", "dash", "sh", "zsh"]);
function recursiveRmTarget(args, cwd, stdinDriven) {
  const recursive = args.some(
    (argument) => argument === "--recursive" || /^-[^-]*[rR]/u.test(argument) && argument !== "--"
  );
  if (!recursive) return null;
  if (stdinDriven) {
    return "xargs dynamically supplies paths to rm -r, so the deletion scope cannot be proven safe";
  }
  let optionsEnded = false;
  for (const argument of args) {
    if (argument === "--") {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && argument.startsWith("-")) continue;
    const homeReference = /^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/u.test(argument);
    const expanded = argument.replace(/^\$\{HOME\}(?=\/|$)/u, homedir()).replace(/^\$HOME(?=\/|$)/u, homedir()).replace(/^~(?=\/|$)/u, homedir()).replace(/^\$\{PWD\}(?=\/|$)/u, cwd).replace(/^\$PWD(?=\/|$)/u, cwd).replace(/^\$\(pwd\)(?=\/|$)/u, cwd);
    if (/[$`]/u.test(expanded)) {
      return "recursive deletion target contains unresolved shell expansion, so the deletion scope cannot be proven safe";
    }
    const absolute = resolve5(cwd, expanded);
    if (/^\/+$/u.test(expanded)) return "rm -r / would delete the entire filesystem";
    if (absolute === resolve5(cwd) || /^(?:\.\/)?\*+(?:\/\*+)*$/u.test(expanded)) {
      return "rm -r . would delete everything in the current directory";
    }
    if (homeReference || absolute === homedir()) {
      return "rm -r ~ targets the home directory and is extremely dangerous";
    }
    if (dirname3(absolute) === "/" || /^\/\*+$/u.test(expanded)) {
      return "rm -r targeting a top-level directory such as /tmp or /home is extremely dangerous";
    }
  }
  return null;
}
function expandPathToken(argument, cwd) {
  return argument.replace(/^\$\{HOME\}(?=\/|$)/u, homedir()).replace(/^\$HOME(?=\/|$)/u, homedir()).replace(/^~(?=\/|$)/u, homedir()).replace(/^\$\{PWD\}(?=\/|$)/u, cwd).replace(/^\$PWD(?=\/|$)/u, cwd).replace(/^\$\(pwd\)(?=\/|$)/u, cwd);
}
function broadDeleteReason(argument, cwd, verb) {
  const homeReference = /^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/u.test(argument);
  const expanded = expandPathToken(argument, cwd);
  const absolute = resolve5(cwd, expanded);
  if (/^\/+$/u.test(expanded)) return `${verb} / would delete the entire filesystem`;
  if (absolute === resolve5(cwd) || expanded.startsWith("./*") || expanded === ".") {
    return `${verb} . would delete everything in the current directory`;
  }
  if (homeReference || absolute === homedir()) {
    return `${verb} ~ targets the home directory and is extremely dangerous`;
  }
  if (dirname3(absolute) === "/" || /^\/\*+$/u.test(expanded)) {
    return `${verb} targeting a top-level directory such as /tmp or /home is extremely dangerous`;
  }
  return null;
}
function findDeleteReason(args, cwd) {
  if (!args.some((argument) => argument === "-delete")) return null;
  const paths = [];
  let optionsEnded = false;
  for (const argument of args) {
    if (argument === "--") {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && argument.startsWith("-")) continue;
    if (!argument.startsWith("-")) paths.push(argument);
  }
  if (paths.length === 0) {
    return "find -delete without an explicit path defaults to the current directory";
  }
  for (const argument of paths) {
    const reason = broadDeleteReason(argument, cwd, "find -delete");
    if (reason) return reason;
  }
  return null;
}
function dangerousCommandReason(command, cwd, depth = 0) {
  if (depth < 4) {
    for (const nestedCommand of nestedCommandSubstitutions(command)) {
      const reason = dangerousCommandReason(nestedCommand, cwd, depth + 1);
      if (reason) return reason;
    }
  } else if (hasCommandSubstitution(command)) {
    return "nested command substitutions are too deep to prove the deletion scope safe";
  }
  for (const logicalLine of splitShellLogicalLines(command)) {
    const tokens = tokenizeShell(logicalLine);
    let segment = [];
    for (let index = 0; index <= tokens.length; index += 1) {
      const token = tokens[index];
      if (token !== void 0 && !COMMAND_SEPARATORS3.has(token)) {
        segment.push(token);
        continue;
      }
      const invocation = commandInvocation(segment);
      if (invocation?.executable === "rm") {
        const reason = recursiveRmTarget(
          invocation.args,
          cwd,
          invocation.stdinDriven
        );
        if (reason) return reason;
      }
      if (invocation?.executable === "find") {
        const reason = findDeleteReason(invocation.args, cwd);
        if (reason) return reason;
      }
      if (invocation?.executable === "eval") {
        const nestedCommand = invocation.args.join(" ");
        if (nestedCommand) {
          if (depth >= 4) {
            return "nested eval commands are too deep to prove the deletion scope safe";
          }
          const reason = dangerousCommandReason(nestedCommand, cwd, depth + 1);
          if (reason) return reason;
        }
      }
      if (invocation && SHELL_COMMANDS.has(invocation.executable)) {
        const commandIndex = invocation.args.findIndex(
          (argument) => /^-[^-]*c/u.test(argument)
        );
        const nestedCommand = commandIndex >= 0 ? invocation.args[commandIndex + 1] : void 0;
        if (commandIndex >= 0 && nestedCommand) {
          if (depth >= 4) {
            return "nested shell -c commands are too deep to prove the deletion scope safe";
          }
          const reason = dangerousCommandReason(nestedCommand, cwd, depth + 1);
          if (reason) return reason;
        }
      }
      segment = [];
    }
  }
  return null;
}
function hasCommandSubstitution(command) {
  return /\$\(|`/u.test(command);
}
function nestedCommandSubstitutions(command) {
  const nested = [];
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (quote === "'") {
      if (char === "'") quote = null;
      continue;
    }
    if (char === "'") {
      quote = char;
      continue;
    }
    if (char === '"') {
      quote = quote === '"' ? null : '"';
      continue;
    }
    if (char === "`") {
      let end2 = index + 1;
      let body2 = "";
      for (; end2 < command.length; end2 += 1) {
        const escaped = command[end2];
        const escapedNext = command[end2 + 1];
        if (escaped === "\\" && escapedNext !== void 0) {
          body2 += escapedNext;
          end2 += 1;
        } else if (escaped === "`") break;
        else if (escaped !== void 0) body2 += escaped;
      }
      if (end2 < command.length) {
        nested.push(body2);
        index = end2;
      }
      continue;
    }
    if (char !== "$" || command[index + 1] !== "(") continue;
    let depth = 1;
    let body = "";
    let nestedQuote = null;
    let end = index + 2;
    for (; end < command.length && depth > 0; end += 1) {
      const current = command[end];
      if (current === void 0) continue;
      if (current === "\\") {
        const nextChar = command[end + 1];
        if (nextChar !== void 0) body += `${current}${nextChar}`;
        end += 1;
        continue;
      }
      if (nestedQuote) {
        if (current === nestedQuote) nestedQuote = null;
        body += current;
        continue;
      }
      if (current === "'" || current === '"') {
        nestedQuote = current;
        body += current;
        continue;
      }
      if (current === "(") depth += 1;
      if (current === ")") depth -= 1;
      if (depth > 0) body += current;
    }
    if (depth === 0) {
      nested.push(body);
      index = end - 1;
    }
  }
  return nested;
}
function dangerousCommandHits(command, cwd = process.cwd()) {
  if (typeof command !== "string" || !command) return [];
  const reason = dangerousCommandReason(command, cwd);
  return reason ? [reason] : [];
}
function dangerousCommandDenyMessage(hits, command = "") {
  const reasons = Array.isArray(hits) ? hits : [];
  return [
    "[Dangerous Command] High-risk command blocked",
    "",
    `Reason: ${reasons.join("; ") || "the command's deletion scope cannot be proven safe"}`,
    `Command: ${command}`,
    "",
    "blockingContract:",
    "  observedFacts: The parsed shell command recursively deletes the filesystem root, home directory, workspace root, or an equivalently broad target.",
    "  harm: Running this command could irreversibly delete user data or the entire working environment.",
    "  unblockWhen: The deletion target resolves to a specific, narrow, verified path, or the destructive command is removed.",
    "  recovery: Resolve the target files first, prefer a recoverable move or trash operation, then retry with an explicit narrow path."
  ].join("\n");
}

// plugins/workspace-integrity/src/domains/commands/engines/verification-integrity.ts
var SEPARATORS = /* @__PURE__ */ new Set(["&&", "||", ";", "|", "&"]);
var DIRECT_VERIFIERS = /* @__PURE__ */ new Set([
  "ava",
  "bats",
  "behat",
  "cypress",
  "go-test",
  "jest",
  "karma",
  "mocha",
  "nose",
  "nosetests",
  "nox",
  "phpunit",
  "playwright",
  "pytest",
  "py.test",
  "rspec",
  "tox",
  "vitest"
]);
function shellSegments(command) {
  const normalized = sanitizeCommand(command).replace(/\b\d*>\s*&\s*\d+\b/gu, " __FD_REDIRECT__ ").replace(/(?:^|\s)&>\s*\S+/gu, " __FD_REDIRECT__ ");
  const tokens = tokenizeShell(normalized);
  const segments = [];
  let current = [];
  for (const token of tokens) {
    if (!SEPARATORS.has(token)) {
      current.push(token);
      continue;
    }
    segments.push({ tokens: current, next: token });
    current = [];
  }
  segments.push({ tokens: current, next: null });
  return segments;
}
function isVerificationInvocation(executable2, args) {
  const program = executable2.toLowerCase();
  if (DIRECT_VERIFIERS.has(program)) return true;
  if (program === "python" || /^python\d+(?:\.\d+)?$/u.test(program)) {
    if (args.some((arg) => /(?:^|\/)runtests\.py$/iu.test(arg))) return true;
    const moduleIndex = args.findIndex((arg) => arg === "-m");
    return moduleIndex >= 0 && /^(?:pytest|unittest|nose|tox)$/iu.test(args[moduleIndex + 1] ?? "");
  }
  if (program === "node") return args.includes("--test");
  if (["npm", "pnpm", "yarn", "bun"].includes(program)) {
    const positional = args.filter((arg) => !arg.startsWith("-"));
    return positional[0] === "test" || positional[0] === "run" && /^test(?::|$)/u.test(positional[1] ?? "");
  }
  if (program === "go") return args[0] === "test";
  if (program === "cargo" || program === "dotnet" || program === "swift" || program === "mix") {
    return args[0] === "test";
  }
  if (["gradle", "gradlew", "mvn", "mvnw", "make"].includes(program)) {
    return args.some((arg) => /^(?:check|test)(?::|$)/iu.test(arg));
  }
  return false;
}
function nestedShellFinding(tokens) {
  const invocation = commandInvocation(tokens);
  if (!invocation || !["bash", "sh", "zsh", "dash", "ksh"].includes(invocation.executable.toLowerCase())) return null;
  const commandIndex = invocation.args.findIndex((arg) => arg === "-c" || arg === "-lc");
  if (commandIndex < 0 || !invocation.args[commandIndex + 1]) return null;
  const pipefail = invocation.args.some((arg, index) => arg === "pipefail" && invocation.args[index - 1] === "-o");
  const errexit = invocation.args.includes("-e") || invocation.args.some((arg, index) => arg === "errexit" && invocation.args[index - 1] === "-o");
  return analyze(invocation.args[commandIndex + 1] ?? "", { pipefail, errexit });
}
function analyze(command, inherited = {}) {
  const segments = shellSegments(command);
  let pipefail = Boolean(inherited.pipefail);
  let errexit = Boolean(inherited.errexit);
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) continue;
    const joined = segment.tokens.join(" ");
    if (/^set\s+(?:-[^\s]*e[^\s]*|-o\s+errexit)\b/u.test(joined)) errexit = true;
    if (/^set\s+-o\s+pipefail\b/u.test(joined)) pipefail = true;
    const nested = nestedShellFinding(segment.tokens);
    if (nested) return nested;
    const invocation = commandInvocation(segment.tokens);
    if (!invocation || !isVerificationInvocation(invocation.executable, invocation.args)) continue;
    const verifier = invocation.executable;
    let end = index;
    while (segments[end]?.next === "|") end += 1;
    const piped = end > index;
    if (piped && !pipefail) return { operator: "pipeline", verifier };
    const outgoing = segments[end]?.next;
    if (outgoing === "||") return { operator: "fallback", verifier };
    if (outgoing === "&") return { operator: "background", verifier };
    if (outgoing === ";" && !errexit) return { operator: "sequence", verifier };
    if (outgoing === "&&") {
      let cursor = end;
      while (segments[cursor]?.next === "&&") cursor += 1;
      if (segments[cursor]?.next === "||") return { operator: "fallback", verifier };
    }
  }
  return null;
}
function verificationIntegrityFinding(command) {
  if (typeof command !== "string" || !command.trim()) return null;
  return analyze(command);
}
function verificationIntegrityDenyMessage(finding, command) {
  return [
    "[Verification Integrity Guard] Blocked",
    "",
    `Reason: the ${finding.verifier} verification is followed by a shell ${finding.operator} that can replace or hide its exit status.`,
    "Recovery/alternative: run the verification command directly. If output must be piped, enable pipefail in the same shell (for example `set -o pipefail; <test> | tee /tmp/test.log`). Chain later inspection with `&&`, or preserve and re-exit the original status explicitly.",
    `Command: ${command}`,
    "",
    "blockingContract:",
    "  observedFacts: a test or verification command is composed so the shell can report a later command's status instead of the verifier's status.",
    "  harm: a failing test can be recorded as successful evidence and support a false completion claim.",
    "  unblockWhen: the verifier's native nonzero status is the status observed by the host, including through any output pipeline.",
    "  recovery: rerun directly, use `set -o pipefail` for a pipeline, use `&&` for success-only follow-up, or explicitly exit with the captured verifier status."
  ].join("\n");
}

// plugins/workspace-integrity/src/domains/commands/entries/hooks/cmd-safety-hook-pre-tool.ts
async function main2() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const toolName = normalizeToolName(eventToolName(event));
  const toolInput = eventToolInput(event);
  const cwd = eventCwd(event);
  const repoRoot2 = resolveRepoRoot(cwd);
  const userConfig = await loadUserConfig(repoRoot2);
  const { rules, settings } = resolveRules(userConfig);
  if (/^Read$/iu.test(toolName)) {
    if (settings.engines.secretRead !== false) {
      const tool = isRecord(event.tool) ? event.tool : null;
      const extraTargets = Array.isArray(tool?.fileTargets) ? tool.fileTargets : [];
      const report = secretReadReport(
        [
          toolInput.file_path,
          toolInput.filePath,
          toolInput.path,
          ...extraTargets
        ].filter(Boolean)
      );
      if (report) writeJson(additionalContextOutput("PreToolUse", report));
    }
    return;
  }
  if (!isShellTool2(toolName)) return;
  const command = extractShellCommand2(toolName, toolInput) ?? "";
  if (!command) return;
  if (settings.engines.denyEscalation !== false) {
    const escalation = escalationMessage(event, command, settings.escalation);
    if (escalation) {
      writeJson(preToolDeny(escalation));
      return;
    }
  }
  if (settings.engines.dangerousRm !== false) {
    const dangerousHits = dangerousCommandHits(command, cwd);
    if (dangerousHits.length > 0) {
      recordDeny(event, command, "dangerous-rm");
      writeJson(
        preToolDeny(dangerousCommandDenyMessage(dangerousHits, command))
      );
      return;
    }
  }
  const hit = matchRule(command, rules);
  if (hit) {
    if (hit.mode === "allow") return;
    if (hit.mode === "deny") {
      recordDeny(event, command, hit.id || "command-rule");
      writeJson(preToolDeny(formatFinding(hit, command, { host: process.env.HARNESS_HOST })));
      return;
    }
    if (hit.mode === "report") {
      writeJson(
        additionalContextOutput("PreToolUse", formatFinding(hit, command, { host: process.env.HARNESS_HOST }))
      );
      return;
    }
  }
  if (settings.engines.verificationIntegrity !== false) {
    const verification = verificationIntegrityFinding(command);
    if (verification) {
      recordDeny(event, command, "verification-integrity");
      writeJson(preToolDeny(verificationIntegrityDenyMessage(verification, command)));
      return;
    }
  }
  if (settings.engines.mysqlReplicationPreflight !== false) {
    const mysql = mysqlReplicationPreflightFinding(command, event);
    if (mysql) {
      recordDeny(event, command, mysql.id);
      writeJson(preToolDeny(mysqlPreflightDenyMessage(mysql, command)));
      return;
    }
  }
}

// plugins/workspace-integrity/src/domains/go/policy.ts
var policy2 = {
  plugin: "go-engineering",
  displayName: "Go Engineering",
  protections: [
    { id: "go-module-checksums", match: /(?:^|\/)go\.sum$/iu, reason: "go.sum is generated by the Go module toolchain.", recovery: "Change go.mod or imports and regenerate checksums with Go module commands." }
  ],
  validators: [
    { id: "gofmt", kind: "gofmt", match: /\.go$/iu, mode: "report" }
  ]
};

// plugins/workspace-integrity/src/domains/ios/policy.ts
var policy3 = {
  plugin: "ios-engineering",
  displayName: "iOS Engineering",
  protections: [
    { id: "ios-lockfiles", match: /(?:^|\/)(?:Package\.resolved|Podfile\.lock)$/iu, reason: "Apple dependency lockfiles are generated by SwiftPM or CocoaPods.", recovery: "Change Package.swift or Podfile and regenerate with the dependency manager." },
    { id: "ios-dependency-directories", match: /(?:^|\/)(?:Pods|Carthage\/Build|\.build\/checkouts)(?:\/|$)/iu, reason: "The target is inside an iOS dependency directory.", recovery: "Change declarations or sources, then reinstall dependencies." }
  ],
  validators: [
    { id: "swiftParse", kind: "swift", match: /\.swift$/iu, mode: "block" },
    { id: "plistLint", kind: "plist", match: /\.plist$/iu, mode: "block" }
  ]
};

// plugins/workspace-integrity/src/domains/java/policy.ts
var policy4 = {
  plugin: "java-engineering",
  displayName: "Java Engineering",
  active: (context) => /(?:^|\/)pom\.xml$/iu.test(context.relativePath) || !repoContainsPath(context.root, /(?:^|\/)AndroidManifest\.xml$/iu),
  protections: [
    { id: "java-gradle-locks", match: /(?:^|\/)gradle\.lockfile$|(?:^|\/)gradle\/dependency-locks\/[^/]+\.lockfile$/iu, reason: "JVM dependency locks are generated by Gradle.", recovery: "Change Gradle declarations and regenerate locks through the wrapper." },
    { id: "java-gradle-cache", match: /(?:^|\/)\.gradle(?:\/|$)/iu, reason: "The Gradle cache is tool-owned.", recovery: "Change sources or declarations and let Gradle rebuild the cache." }
  ],
  validators: [
    { id: "mavenXml", kind: "xml", match: /(?:^|\/)pom\.xml$/iu, mode: "block" }
  ]
};

// plugins/workspace-integrity/src/domains/kubernetes/policy.ts
var policy5 = {
  plugin: "kubernetes-operations",
  displayName: "Kubernetes Operations",
  protections: [
    { id: "helm-lock", match: /(?:^|\/)Chart\.lock$/iu, reason: "Chart.lock is generated by Helm dependency management.", recovery: "Change Chart.yaml and regenerate dependencies with Helm." },
    { id: "helm-vendored-charts", match: /(?:^|\/)charts(?:\/|$)/iu, reason: "Vendored Helm charts are dependency-manager-owned.", recovery: "Change Chart.yaml and use Helm dependency commands." }
  ],
  validators: [
    { id: "kubernetesDryRun", kind: "kubectl", match: /\.ya?ml$/iu, contentMatch: /^\s*apiVersion\s*:[\s\S]*^\s*kind\s*:/imu, mode: "report" },
    { id: "helmLint", kind: "helm", match: /(?:^|\/)Chart\.yaml$/iu, mode: "report" },
    { id: "kubernetesJson", kind: "json", match: /\.json$/iu, mode: "block" }
  ]
};

// plugins/workspace-integrity/src/domains/nix/policy.ts
var policy6 = {
  plugin: "nix-engineering",
  displayName: "Nix Engineering",
  protections: [
    { id: "nix-flake-lock", match: /(?:^|\/)flake\.lock$/iu, reason: "flake.lock is generated by Nix flake commands.", recovery: "Change flake inputs and regenerate the lock with Nix." }
  ],
  validators: [
    { id: "nixParse", kind: "nix", match: /\.nix$/iu, mode: "block" },
    { id: "flakeJson", kind: "json", match: /(?:^|\/)flake\.lock$/iu, mode: "block" }
  ]
};

// plugins/workspace-integrity/src/domains/php/policy.ts
var policy7 = {
  plugin: "php-engineering",
  displayName: "PHP Engineering",
  protections: [
    { id: "composer-lock", match: /(?:^|\/)composer\.lock$/iu, reason: "composer.lock is generated by Composer.", recovery: "Change composer.json and regenerate the lock with Composer." },
    { id: "composer-vendor", match: /(?:^|\/)vendor(?:\/|$)/iu, reason: "vendor is owned by Composer.", recovery: "Change project sources or declarations and reinstall dependencies." }
  ],
  validators: [
    { id: "phpSyntax", kind: "php", match: /\.php$/iu, mode: "block" },
    { id: "composerValidate", kind: "composer", match: /(?:^|\/)composer\.json$/iu, mode: "block" }
  ]
};

// plugins/workspace-integrity/src/domains/python/policy.ts
var policy8 = {
  plugin: "python-engineering",
  displayName: "Python Engineering",
  protections: [
    { id: "python-lockfiles", match: /(?:^|\/)(?:pdm\.lock|Pipfile\.lock|poetry\.lock|uv\.lock)$/iu, reason: "Python lockfiles are generated by package managers.", recovery: "Change pyproject.toml or the relevant declaration and regenerate the lock." },
    { id: "python-environments", match: /(?:^|\/)(?:\.venv|venv|__pypackages__)(?:\/|$)/iu, reason: "Python environments are package-manager-owned.", recovery: "Change sources or declarations and recreate the environment." }
  ],
  validators: [
    { id: "pythonSyntax", kind: "python", match: /\.py$/iu, mode: "block" },
    { id: "ruff", kind: "ruff", match: /\.py$/iu, mode: "report" },
    { id: "pythonJson", kind: "json", match: /\.json$/iu, mode: "block" }
  ]
};

// plugins/workspace-integrity/src/domains/quality/entries/hooks/engineering-quality-post.ts
import { spawnSync as spawnSync2 } from "node:child_process";
import { fileURLToPath } from "node:url";
var checks = ["line-budget-check.mjs", "markdown-check.mjs"];
function runChecks(input) {
  let exitCode = 0;
  for (const check of checks) {
    const entry = fileURLToPath(new URL(`./${check}`, import.meta.url));
    const result = spawnSync2(process.execPath, [entry], {
      env: process.env,
      input,
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) process.stderr.write(`[engineering-quality] ${check}: ${result.error.message}
`);
    if ((result.status ?? 0) !== 0) exitCode = 2;
  }
  return exitCode;
}

// plugins/workspace-integrity/src/domains/react-native/policy.ts
var policy9 = {
  plugin: "react-native-engineering",
  displayName: "React Native Engineering",
  active: (context) => packageDeclaresDependency(context, "react-native") || /(?:^|\/)(?:NativeComponent\.g\.(?:h|mm)|android\/.+\/build\/generated\/source\/codegen|ios\/build\/generated\/ios)(?:\/|$)/iu.test(context.relativePath),
  protections: [
    { id: "react-native-lockfiles", match: /(?:^|\/)(?:bun\.lockb?|npm-shrinkwrap\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/iu, reason: "React Native JavaScript lockfiles are generated by package managers.", recovery: "Change package.json and regenerate the lock with the project's package manager." },
    { id: "react-native-dependencies", match: /(?:^|\/)node_modules(?:\/|$)/iu, reason: "node_modules is package-manager-owned.", recovery: "Change sources or declarations and reinstall dependencies." },
    { id: "react-native-codegen", match: /(?:^|\/)(?:NativeComponent\.g\.(?:h|mm)|android\/.+\/build\/generated\/source\/codegen|ios\/build\/generated\/ios)(?:\/|$)/iu, reason: "React Native Codegen output is generated from schemas.", recovery: "Change the schema or native component source and rerun Codegen." }
  ],
  validators: [
    { id: "reactNativeConfig", kind: "javascript", match: /(?:^|\/)(?:metro|babel|react-native)\.config\.(?:c?js|mjs)$/iu, mode: "block" },
    { id: "reactNativeTypescript", kind: "typescript", match: /\.(?:ts|tsx)$/iu, mode: "block" },
    { id: "reactNativeJson", kind: "json", match: /(?:^|\/)(?:package|app)\.json$/iu, mode: "block" }
  ]
};

// plugins/workspace-integrity/src/domains/rust/policy.ts
var policy10 = {
  plugin: "rust-engineering",
  displayName: "Rust Engineering",
  protections: [
    { id: "cargo-lock", match: /(?:^|\/)Cargo\.lock$/iu, reason: "Cargo.lock is generated by Cargo.", recovery: "Change Cargo.toml and regenerate the lock with Cargo." }
  ],
  validators: [
    { id: "rustfmt", kind: "rustfmt", match: /\.rs$/iu, mode: "report" }
  ]
};

// plugins/workspace-integrity/src/domains/source/entries/hooks/source-integrity.ts
import { execFileSync as execFileSync3 } from "node:child_process";
import { existsSync as existsSync5 } from "node:fs";
import { isAbsolute as isAbsolute4, join as join6, relative as relative3, resolve as resolve7 } from "node:path";
import { pathToFileURL as pathToFileURL4 } from "node:url";

// plugins/workspace-integrity/src/domains/source/lib/source-sanity-policy.ts
var CHECK_NAMES = [
  "backupArtifact",
  "garbledText"
];
var DEFAULT_CHECKS = Object.freeze({
  backupArtifact: "block",
  garbledText: "block"
});
function isCheckMode(value) {
  return value === "block" || value === "report" || value === "off";
}
var SKIP_PATH2 = /(?:^|\/)(?:\.git|\.cache|\.next|\.nuxt|__generated__|build|coverage|dist|generated|node_modules|target|vendor)(?:\/|$)/iu;
var SOURCE_PATH = /(?:^|\/)(?:app|client|cmd|components|include|internal|lib|packages|pkg|server|src|tests?)(?:\/|$)/iu;
var BACKUP_SUFFIX = /(?:\.bak|\.backup|\.old|\.orig|\.rej|\.swp|\.temp|\.tmp|~)$/iu;
var TEXT_PATH = /\.(?:bash|c|cc|cfg|cjs|cpp|css|cts|cxx|go|graphql|h|hh|hpp|html|ini|java|js|json|jsx|kt|kts|less|md|mjs|mts|php|py|rb|rs|sass|scss|sh|sql|svelte|swift|toml|ts|tsx|txt|vue|xml|yaml|yml|zsh)$/iu;
function warnDefault(message) {
  process.stderr.write(`[source-integrity] ${message}
`);
}
function normalizeMode(value, fallback, label, warn3) {
  if (value === void 0) return fallback;
  if (isCheckMode(value)) return value;
  warn3(`${label} must be "block", "report", or "off"; using ${fallback}`);
  return fallback;
}
function resolveConfig(userConfig, warn3 = warnDefault) {
  const record = isRecord(userConfig) ? userConfig : void 0;
  const checks2 = { ...DEFAULT_CHECKS };
  if (record?.checks !== void 0 && (!record.checks || typeof record.checks !== "object" || Array.isArray(record.checks))) {
    warn3('config "checks" must be an object; using defaults');
  } else {
    const checksSource = isRecord(record?.checks) ? record.checks : void 0;
    for (const name of CHECK_NAMES) {
      checks2[name] = normalizeMode(
        checksSource?.[name],
        checks2[name],
        `checks.${name}`,
        warn3
      );
    }
  }
  const overrides = [];
  if (record?.overrides !== void 0 && !Array.isArray(record.overrides)) {
    warn3('config "overrides" must be an array; ignoring overrides');
  } else {
    const rawOverrides = Array.isArray(record?.overrides) ? record.overrides : [];
    for (const [index, override] of rawOverrides.entries()) {
      if (!isRecord(override) || !(override.match instanceof RegExp)) {
        warn3(`override[${index}].match must be a RegExp; skipping`);
        continue;
      }
      if (!override.checks || typeof override.checks !== "object" || Array.isArray(override.checks)) {
        warn3(`override[${index}].checks must be an object; skipping`);
        continue;
      }
      const overrideChecks = isRecord(override.checks) ? override.checks : {};
      const normalizedChecks = {};
      for (const name of CHECK_NAMES) {
        if (overrideChecks[name] === void 0) continue;
        const mode = normalizeMode(
          overrideChecks[name],
          null,
          `override[${index}].checks.${name}`,
          warn3
        );
        if (mode) normalizedChecks[name] = mode;
      }
      if (Object.keys(normalizedChecks).length === 0) {
        warn3(`override[${index}] has no valid checks; skipping`);
        continue;
      }
      overrides.push({ match: override.match, checks: normalizedChecks });
    }
  }
  return { checks: checks2, overrides };
}
function regexMatches2(pattern, value) {
  try {
    return new RegExp(pattern.source, pattern.flags).test(value);
  } catch {
    return false;
  }
}
function modeFor(checkName, relativePath3, config) {
  for (const override of config.overrides) {
    const mode = override.checks[checkName];
    if (mode !== void 0 && regexMatches2(override.match, relativePath3)) {
      return mode;
    }
  }
  return config.checks[checkName] ?? "off";
}
function isBuiltInSkippedPath(relativePath3) {
  return SKIP_PATH2.test(relativePath3);
}
function isBackupArtifactPath(relativePath3) {
  return SOURCE_PATH.test(relativePath3) && BACKUP_SUFFIX.test(relativePath3);
}
function isTextPath(relativePath3) {
  return TEXT_PATH.test(relativePath3);
}
function analyzeGarbledText(text) {
  if (typeof text !== "string" || !text.includes("\uFFFD")) return null;
  const total = [...text].filter((character) => character === "\uFFFD").length;
  if (/\uFFFD{2,}/u.test(text) || total >= 3) {
    return { replacementCharacters: total };
  }
  return null;
}

// plugins/workspace-integrity/src/domains/source/lib/encoding-runner.ts
import { execFileSync as execFileSync2 } from "node:child_process";
import { existsSync as existsSync4, readFileSync as readFileSync6, statSync as statSync2 } from "node:fs";
import { dirname as dirname4, isAbsolute as isAbsolute3, join as join5, relative as relative2, resolve as resolve6 } from "node:path";
import { pathToFileURL as pathToFileURL3 } from "node:url";

// plugins/workspace-integrity/src/domains/source/lib/encoding-policy.ts
import { isUtf8 } from "node:buffer";
var BOM_SIGNATURES = [
  { name: "UTF-32 LE BOM", bytes: [255, 254, 0, 0] },
  { name: "UTF-32 BE BOM", bytes: [0, 0, 254, 255] },
  { name: "UTF-8 BOM", bytes: [239, 187, 191] },
  { name: "UTF-16 LE BOM", bytes: [255, 254] },
  { name: "UTF-16 BE BOM", bytes: [254, 255] }
];
function startsWithBytes(buffer, signature) {
  return buffer.length >= signature.length && signature.every((value, index) => buffer[index] === value);
}
function analyzeEncoding(buffer) {
  if (!buffer || buffer.length === 0) return null;
  for (const signature of BOM_SIGNATURES) {
    if (startsWithBytes(buffer, signature.bytes)) {
      return {
        kind: "bom",
        name: signature.name,
        bytes: signature.bytes.map((value) => value.toString(16).toUpperCase().padStart(2, "0")).join(" ")
      };
    }
  }
  if (!isUtf8(buffer)) {
    return { kind: "invalid-utf8" };
  }
  return null;
}

// plugins/workspace-integrity/src/domains/source/lib/encoding-runner.ts
var MAX_FILE_BYTES2 = 2 * 1024 * 1024;
var CONFIG_FILE_NAME = ".source-integrity.mjs";
var BUILTIN_RULES2 = [
  {
    match: /(^|\/)(?:node_modules|vendor|dist|build|coverage|target|\.next|\.nuxt|generated|__generated__)\//u,
    mode: "skip"
  },
  {
    match: /\.(?:c|cc|cpp|cxx|h|hh|hpp|hxx|inl|ipp|tpp|ixx|cppm|cs|go|java|kt|kts|php|twig|py|r|rb|rs|swift|ts|tsx|js|jsx|mjs|cjs)$/iu,
    mode: "block"
  },
  {
    match: /\.(?:graphql|gql|vue|svelte|html|htm|css|scss|less|sass|svg|ejs|hbs|wxml|wxss|wxs)$/iu,
    mode: "block"
  },
  {
    match: /\.(?:json|yaml|yml|toml|ini|cfg|sh|bash|zsh|fish|lua|pl|pm|md|txt|rst|adoc|xml|xsl|xsd|sql)$/iu,
    mode: "block"
  },
  {
    match: /(^|\/)(?:\.dockerignore|\.editorconfig|\.env|\.gitignore)$/iu,
    mode: "block"
  },
  { match: /(^|\/)\.env\.[^/]+$/iu, mode: "block" }
];
function warnConfig(message) {
  process.stderr.write(`[source-integrity] ${message}
`);
}
function normalizeUserRule(rule, index, warn3 = warnConfig) {
  if (!isRecord(rule) || !(rule.match instanceof RegExp)) {
    warn3(`rule[${index}]: "match" must be a RegExp, skipping`);
    return null;
  }
  const mode = rule.mode ?? "block";
  if (mode !== "block" && mode !== "skip") {
    warn3(`rule[${index}]: "mode" must be "block" or "skip", skipping`);
    return null;
  }
  return { match: rule.match, mode };
}
function resolveRules2(userConfig, warn3 = warnConfig) {
  const record = isRecord(userConfig) ? userConfig : void 0;
  if (record?.rules !== void 0 && !Array.isArray(record.rules)) {
    warn3('config "rules" must be an array; using built-in rules');
    return [...BUILTIN_RULES2];
  }
  const userRules = (Array.isArray(record?.rules) ? record.rules : []).map((rule, index) => normalizeUserRule(rule, index, warn3)).filter((rule) => rule !== null);
  return [...userRules, ...BUILTIN_RULES2];
}
function matchRule2(relativePath3, rules) {
  for (const rule of rules) {
    try {
      if (new RegExp(rule.match.source, rule.match.flags).test(relativePath3)) {
        return rule;
      }
    } catch {
      continue;
    }
  }
  return null;
}
async function loadUserConfig2(repoRoot2) {
  const configPath = join5(repoRoot2, CONFIG_FILE_NAME);
  if (!existsSync4(configPath)) return null;
  try {
    const loaded = await import(pathToFileURL3(configPath).href);
    return loaded.default ?? loaded;
  } catch (error) {
    warnConfig(`failed to load ${CONFIG_FILE_NAME}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
function extractFilePaths(event) {
  const cwd = eventCwd(event);
  const paths = extractFileTargets(event, {
    tools: eventToolName(event) ? "mutation" : "any",
    includeShellWrites: true
  });
  const command = extractShellCommand({ ...event, tool_name: eventToolName(event) || "Bash", tool_input: eventToolInput(event) }) ?? "";
  for (const match of command.matchAll(/\b(?:writeFile(?:Sync)?|open)\s*\(\s*["']([^"']+)["']/gu)) {
    const raw = match[1];
    if (raw) paths.push(isAbsolute3(raw) ? resolve6(raw) : resolve6(cwd, raw.replace(/^\.\//u, "")));
  }
  return [...new Set(paths)];
}
function resolveRepoRoot2(filePath) {
  try {
    return execFileSync2("git", ["rev-parse", "--show-toplevel"], {
      cwd: dirname4(filePath),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5e3
    }).trim();
  } catch {
    return null;
  }
}
function relativeMatchPath(filePath, repoRoot2, cwd) {
  if (repoRoot2) return relative2(repoRoot2, filePath).replaceAll("\\", "/");
  const fromCwd = relative2(cwd, filePath).replaceAll("\\", "/");
  return fromCwd.startsWith("../") ? filePath.replaceAll("\\", "/") : fromCwd;
}
function readFileCapped(filePath) {
  try {
    if (statSync2(filePath).size > MAX_FILE_BYTES2) return null;
    return readFileSync6(filePath);
  } catch {
    return null;
  }
}
function formatIssue(issue) {
  if (issue.kind === "bom") {
    return `Detected ${issue.name} (${issue.bytes})`;
  }
  return "Detected an invalid UTF-8 byte sequence";
}
function block(findings) {
  const details = findings.flatMap(({ path, issue }) => [
    `- ${path}`,
    `  ${formatIssue(issue)}`
  ]);
  process.stderr.write(
    [
      "[Encoding Guard] Prohibited file encoding detected",
      ...details,
      "",
      "blockingContract:",
      "  observedFacts: A target text file contains a BOM or is not strict UTF-8.",
      "  harm: Incorrect encodings can cause cross-platform parsing differences, garbled text, or build failures.",
      "  unblockWhen: Every listed file is saved as UTF-8 without a BOM.",
      "  recovery: For a UTF-8 BOM, remove only the leading signature; for other encodings, confirm the source encoding and convert losslessly instead of guessing with replacement characters.",
      ""
    ].join("\n")
  );
  process.exitCode = 2;
}
async function runEncodingPost(event) {
  const cwd = eventCwd(event);
  const candidates = extractFilePaths(event).filter(existsSync4);
  if (candidates.length === 0) return;
  const firstCandidate = candidates[0];
  if (!firstCandidate) return;
  const repoRoot2 = resolveRepoRoot2(firstCandidate);
  const userConfig = repoRoot2 ? await loadUserConfig2(repoRoot2) : null;
  const rules = resolveRules2(userConfig);
  const findings = [];
  for (const filePath of candidates) {
    const matchPath = relativeMatchPath(filePath, repoRoot2, cwd);
    const rule = matchRule2(matchPath, rules);
    if (!rule || rule.mode === "skip") continue;
    const buffer = readFileCapped(filePath);
    if (buffer === null) continue;
    const issue = analyzeEncoding(buffer);
    if (issue) findings.push({ path: matchPath, issue });
    if (findings.length >= 10) break;
  }
  if (findings.length > 0) block(findings);
}

// plugins/workspace-integrity/src/domains/source/entries/hooks/source-integrity.ts
var CONFIG_FILE_NAME2 = ".source-integrity.mjs";
var COMMAND_SEPARATORS4 = /* @__PURE__ */ new Set(["&&", "||", ";", "|", "&"]);
var SIMPLE_WRAPPERS2 = /* @__PURE__ */ new Set(["busybox", "command", "exec", "nohup", "time"]);
function splitSimpleCommands2(tokens) {
  const commands = [];
  let current = [];
  for (const token of tokens) {
    if (COMMAND_SEPARATORS4.has(token)) {
      if (current.length) commands.push(current);
      current = [];
      continue;
    }
    current.push(token);
  }
  if (current.length) commands.push(current);
  return commands;
}
function tokenBasename3(token) {
  return String(token ?? "").replaceAll("\\", "/").split("/").at(-1) ?? "";
}
function unwrapCommand2(tokens) {
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === void 0) break;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(token)) {
      index += 1;
      continue;
    }
    const name = tokenBasename3(token);
    if (SIMPLE_WRAPPERS2.has(name)) {
      index += 1;
      while (index < tokens.length) {
        const option = tokens[index];
        if (option === void 0 || !option.startsWith("-") || option === "--") break;
        index += 1;
      }
      if (tokens[index] === "--") index += 1;
      continue;
    }
    if (name === "sudo") {
      index += 1;
      while (index < tokens.length) {
        const option = tokens[index];
        if (option === void 0 || !option.startsWith("-")) break;
        index += 1;
        if (["-C", "-g", "-u", "--group", "--user"].includes(option)) index += 1;
      }
      continue;
    }
    if (name === "env") {
      index += 1;
      while (index < tokens.length) {
        const option = tokens[index];
        if (option === void 0 || !option.startsWith("-")) break;
        index += 1;
      }
      continue;
    }
    if (name === "timeout") {
      index += 1;
      while (index < tokens.length) {
        const option = tokens[index];
        if (option === void 0 || !option.startsWith("-")) break;
        index += 1;
        if (["-k", "-s", "--kill-after", "--signal"].includes(option)) index += 1;
      }
      const duration = tokens[index];
      if (duration !== void 0 && !duration.startsWith("-")) index += 1;
      continue;
    }
    if (name === "nice" || name === "stdbuf") {
      index += 1;
      while (index < tokens.length) {
        const option = tokens[index];
        if (option === void 0 || !option.startsWith("-")) break;
        index += 1;
      }
      continue;
    }
    break;
  }
  return tokens.slice(index);
}
function nonFlagOperands2(args) {
  const operands = [];
  let skipNext = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === void 0) continue;
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (arg === "--") {
      operands.push(...args.slice(index + 1));
      break;
    }
    if (arg.startsWith("-")) {
      if (arg === "-t" || arg === "--target-directory") skipNext = true;
      continue;
    }
    operands.push(arg);
  }
  return operands;
}
function targetDirectory2(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === void 0) continue;
    if (arg === "-t" || arg === "--target-directory") {
      return args[index + 1] ?? "";
    }
    if (arg.startsWith("--target-directory=")) {
      return arg.slice("--target-directory=".length);
    }
  }
  return "";
}
function copyDestTargets(args) {
  const dest = targetDirectory2(args);
  if (dest) return [dest];
  const operands = nonFlagOperands2(args);
  const last = operands.at(-1);
  return last === void 0 ? [] : [last];
}
function moveWriteTargets(args) {
  const dest = targetDirectory2(args);
  const operands = nonFlagOperands2(args);
  return dest ? [dest, ...operands] : operands;
}
function looksLikeSedScript(token) {
  return /(?:^|[0-9,${}]*[!]*s)[/#@|]./u.test(token);
}
function sedWriteTargets2(args) {
  const inplace = args.some(
    (arg) => arg === "--in-place" || arg.startsWith("--in-place=") || /^-[A-Za-z]*i/u.test(arg)
  );
  if (!inplace) return [];
  const files = [];
  let skipNext = false;
  let skippedScript = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === void 0) continue;
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (arg === "--") {
      files.push(...args.slice(index + 1));
      break;
    }
    if (arg === "-e" || arg === "-f" || arg === "--expression" || arg === "--file") {
      skipNext = true;
      skippedScript = true;
      continue;
    }
    if (arg.startsWith("-") || arg === "") continue;
    if (!skippedScript && looksLikeSedScript(arg)) {
      skippedScript = true;
      continue;
    }
    files.push(arg);
  }
  return files;
}
function commandWriteTargets2(tokens) {
  const invocation = unwrapCommand2(tokens);
  if (!invocation.length) return [];
  const name = tokenBasename3(invocation[0]);
  const args = invocation.slice(1);
  if (name === "sed") return sedWriteTargets2(args);
  if (name === "cp") return copyDestTargets(args);
  if (name === "mv") return moveWriteTargets(args);
  if (name === "rm") return nonFlagOperands2(args);
  return [];
}
function extractShellWriteTargets(command) {
  const text = String(command ?? "");
  const paths = [];
  const push = (raw) => {
    const value = String(raw ?? "").trim().replace(/^['"]|['"]$/gu, "");
    if (value && !value.startsWith("-")) paths.push(value);
  };
  for (const match of text.matchAll(/(?:^|[^0-9>])>{1,2}\s*("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    push(match[1]);
  }
  for (const match of text.matchAll(/\btee\b(?:\s+-[A-Za-z]+)*\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    push(match[1]);
  }
  for (const match of text.matchAll(/\btouch\b(?:\s+--)?\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    push(match[1]);
  }
  for (const match of text.matchAll(/\b(?:writeFile(?:Sync)?|open)\s*\(\s*["']([^"']+)["']/gu)) {
    push(match[1]);
  }
  for (const tokens of splitSimpleCommands2(tokenizeShell(text))) {
    for (const path of commandWriteTargets2(tokens)) push(path);
  }
  return [...new Set(paths)];
}
function warn2(message) {
  process.stderr.write(`[source-integrity] ${message}
`);
}
function extractFileTargets2(event) {
  if (isShellTool(eventToolName(event))) {
    const cwd = eventCwd(event);
    return [...new Set(
      extractShellWriteTargets(extractShellCommand(event) ?? "").filter(Boolean).map((path) => isAbsolute4(path) ? resolve7(path) : resolve7(cwd, path.replace(/^\.\//u, "")))
    )];
  }
  if (!isFileMutationTool(eventToolName(event))) return [];
  return extractFileTargets(event);
}
function extractInsertedText(event) {
  const tool = isRecord(event.tool) ? event.tool : void 0;
  const input = event.tool_input ?? event.toolInput ?? tool?.input ?? event.input ?? {};
  const texts = [];
  if (isShellTool(eventToolName(event))) {
    const command = extractShellCommand(event);
    if (command) texts.push(command);
  }
  const visit = (value) => {
    if (!isRecord(value)) return;
    for (const key of ["content", "new_string", "newString", "text", "cell_source", "patch", "input"]) {
      const field = value[key];
      if (typeof field === "string") texts.push(field);
    }
    if (Array.isArray(value.edits)) value.edits.forEach(visit);
  };
  if (typeof input === "string") texts.push(input);
  else visit(input);
  return texts.join("\n");
}
function resolveRepoRoot3(cwd) {
  try {
    return execFileSync3("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5e3
    }).trim();
  } catch {
    return null;
  }
}
function relativePath2(filePath, repoRoot2, cwd) {
  const base = repoRoot2 ?? cwd;
  const candidate = relative3(base, filePath).replaceAll("\\", "/");
  return candidate.startsWith("../") ? filePath.replaceAll("\\", "/") : candidate;
}
async function loadUserConfig3(repoRoot2) {
  if (!repoRoot2) return null;
  const configPath = join6(repoRoot2, CONFIG_FILE_NAME2);
  if (!existsSync5(configPath)) return null;
  try {
    const loaded = await import(pathToFileURL4(configPath).href);
    return loaded.default ?? loaded;
  } catch (error) {
    warn2(`failed to load ${CONFIG_FILE_NAME2}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
function preToolDeny2(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason
    }
  };
}
function reportOutput(eventName2, text) {
  return {
    hookSpecificOutput: {
      hookEventName: eventName2,
      additionalContext: text
    }
  };
}
function writeOutput(value) {
  if (value) process.stdout.write(`${JSON.stringify(value)}
`);
}
function formatPreFindings(findings) {
  return [
    "[Source Sanity Guard] Unsafe source write detected",
    "",
    ...findings.map((finding) => `- ${finding.path}: ${finding.message}`),
    "",
    "blockingContract:",
    "  observedFacts: A file target or pending content matched a source hygiene check.",
    "  harm: Backup artifacts and clearly garbled text contaminate source, reviews, and later builds.",
    "  unblockWhen: Use the canonical source path and remove clearly corrupted replacement characters.",
    "  recovery: Restore the original text from an authoritative source; do not commit temporary copies or replace corruption with guessed content."
  ].join("\n");
}
async function runPre2(event, config, repoRoot2, cwd) {
  const targets = extractFileTargets2(event);
  if (targets.length === 0) return;
  const insertedText = extractInsertedText(event);
  const garbled = analyzeGarbledText(insertedText);
  const findings = [];
  let hasBlock = false;
  for (const target2 of targets) {
    const path = relativePath2(target2, repoRoot2, cwd);
    if (isBuiltInSkippedPath(path)) continue;
    const backupMode = modeFor("backupArtifact", path, config);
    if (backupMode !== "off" && isBackupArtifactPath(path)) {
      findings.push({ path, mode: backupMode, message: "backup or temporary filename inside a source directory" });
      if (backupMode === "block") hasBlock = true;
    }
    const garbledMode = modeFor("garbledText", path, config);
    if (garbled && garbledMode !== "off" && isTextPath(path)) {
      findings.push({
        path,
        mode: garbledMode,
        message: `pending text contains ${garbled.replacementCharacters} U+FFFD replacement character(s)`
      });
      if (garbledMode === "block") hasBlock = true;
    }
  }
  if (findings.length === 0) return;
  const message = formatPreFindings(findings);
  writeOutput(hasBlock ? preToolDeny2(message) : reportOutput("PreToolUse", message));
}
async function main3() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const mode = process.argv[2] ?? "pre";
  if (mode === "post") {
    await runEncodingPost(event);
    return;
  }
  const cwd = resolve7(eventCwd(event));
  const repoRoot2 = resolveRepoRoot3(cwd);
  const config = resolveConfig(await loadUserConfig3(repoRoot2));
  await runPre2(event, config, repoRoot2, cwd);
}

// plugins/workspace-integrity/src/domains/web/policy.ts
var policy11 = {
  plugin: "web-frontend-engineering",
  displayName: "Web Frontend Engineering",
  active: (context) => !packageDeclaresDependency(context, "react-native"),
  protections: [
    { id: "javascript-lockfiles", match: /(?:^|\/)(?:bun\.lockb?|deno\.lock|npm-shrinkwrap\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/iu, reason: "JavaScript lockfiles are generated by package managers.", recovery: "Change package.json and regenerate with npm, pnpm, yarn, bun, or deno." },
    { id: "javascript-dependencies", match: /(?:^|\/)node_modules(?:\/|$)/iu, reason: "node_modules is package-manager-owned.", recovery: "Change sources or declarations and reinstall dependencies." }
  ],
  validators: [
    { id: "javascriptSyntax", kind: "javascript", match: /\.(?:cjs|js|mjs)$/iu, mode: "block" },
    { id: "typescriptSyntax", kind: "typescript", match: /\.(?:cts|mts|ts|tsx)$/iu, mode: "block" },
    { id: "eslint", kind: "eslint", match: /\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/iu, mode: "report" },
    { id: "packageJson", kind: "json", match: /(?:^|\/)package\.json$/iu, mode: "block" }
  ]
};

// plugins/workspace-integrity/src/entries/hooks/dispatcher.ts
function domainHandler(policy12) {
  return ownerHookHandler(async () => await runDomainEngineeringHook(policy12, process.argv[2]));
}
var domainPolicies = [policy, policy2, policy3, policy4, policy5, policy6, policy7, policy8, policy9, policy10, policy11];
var domainsPostHandler = ownerHookHandler(async () => {
  for (const policy12 of domainPolicies) await runDomainEngineeringHook(policy12, "post");
});
var qualityHandler = ({ raw }) => {
  const exitCode = runChecks(Buffer.from(raw));
  if (exitCode !== 0) throw new Error(`engineering quality checks exited with status ${exitCode}`);
};
var [host, eventName] = process.argv.slice(2);
if (!host || !eventName) throw new Error("dispatcher requires <host> <event>");
await runOwnerDispatcher(host, eventName, {
  "android:domain-hook": domainHandler(policy),
  "commands:cmd-safety-hook-post-tool": ownerHookHandler(main),
  "commands:cmd-safety-hook-pre-tool": ownerHookHandler(main2),
  "domains:post-tool": domainsPostHandler,
  "go:domain-hook": domainHandler(policy2),
  "ios:domain-hook": domainHandler(policy3),
  "java:domain-hook": domainHandler(policy4),
  "kubernetes:domain-hook": domainHandler(policy5),
  "nix:domain-hook": domainHandler(policy6),
  "php:domain-hook": domainHandler(policy7),
  "python:domain-hook": domainHandler(policy8),
  "quality:engineering-quality-post": qualityHandler,
  "react-native:domain-hook": domainHandler(policy9),
  "rust:domain-hook": domainHandler(policy10),
  "source:source-integrity": ownerHookHandler(main3),
  "web:domain-hook": domainHandler(policy11)
});
