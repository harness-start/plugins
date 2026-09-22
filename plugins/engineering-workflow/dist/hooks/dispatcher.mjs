// harness-source-hash: sha256:08429dad4fe56ad05510b982e9c941f18d8b9ddaf27d7c77ff7e99ec5684d58d
import {
  DEFAULT_CONFIG,
  canonicalizeLedgerPath,
  commandFlag,
  describeLedger,
  ensurePluginWorkdirGitignore,
  eventAssistantMessage,
  eventCwd,
  eventSessionId,
  eventToolInput,
  eventToolName,
  eventToolResponse,
  eventToolUseId,
  findLedgerDir,
  formatFindings,
  inspectChange,
  isLedgerManagedPath,
  isOfficialWriterCommand,
  isRecord,
  isWorkOrderPath,
  loadLedger,
  loadProjectConfig,
  parseWriterStdout,
  scanLedgers,
  writerActionFromCommand
} from "../chunks/chunk-H2UYBUNC.mjs";

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
  const contexts = outputs.map((output) => output.hookSpecificOutput?.additionalContext).filter((context2) => Boolean(context2));
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

// plugins/engineering-workflow/src/domains/debugging/hook.ts
import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync, existsSync, readFileSync as readFileSync3, realpathSync as realpathSync2 } from "node:fs";
import { execFileSync as execFileSync2 } from "node:child_process";
import { relative as relative2, resolve as resolve6 } from "node:path";

// core/src/path-protect.ts
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
function commandMentionsRoot(command, rootRel, rootAbs) {
  const text = String(command ?? "");
  if (!text.trim()) return false;
  const normalized = String(rootRel ?? "").replace(/^\.\//u, "").replace(/\/+$/u, "");
  const markers = [rootRel, normalized, rootAbs, normalized ? `${normalized}/` : null, normalized ? `./${normalized}` : null, normalized ? `./${normalized}/` : null].filter(Boolean);
  return markers.some((marker) => new RegExp(
    `(?:^|[\\s;|&\`"'(){}\\[\\]])${escapeRegExp(marker)}(?:$|[\\s;|&\`"'(){}\\[\\]//])`,
    "u"
  ).test(text));
}
function isGenericMutationCommand(command) {
  const text = String(command ?? "");
  if (!text.trim()) return false;
  if (/(?:^|[^0-9])>{1,2}\s*(?:"[^"]*"|'[^']*'|\S+)/u.test(text)) return true;
  if (/<<\s*['"]?\w+/u.test(text)) return true;
  if (/(?:^|[\s;|&`(])(?:\/(?:usr\/)?bin\/)?(?:rm|mv|cp|tee|truncate|shred|unlink|chmod|chown|rsync|dd|install)\b/iu.test(text)) return true;
  if (/(?:^|[\s;|&`(])find\b[\s\S]*\s-delete\b/iu.test(text)) return true;
  if (/(?:^|[\s;|&`(])git\s+clean\b/iu.test(text)) return true;
  if (/(?:^|[\s;|&`(])sed\s+(?:-i\b|\S*i\S*\b)/iu.test(text)) return true;
  if (/(?:^|[\s;|&`(])(?:perl|ruby|python3?)\s+[^\n]*\s-i\b/iu.test(text)) return true;
  if (/(?:^|[\s;|&`(])(?:node(?:js)?|deno|bun|perl|ruby|php|lua|python3?)\b/iu.test(text)) return true;
  return false;
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

// plugins/engineering-workflow/src/domains/debugging/lib/hook-io.ts
import { isAbsolute as isAbsolute2, resolve as resolve3 } from "node:path";

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
function additionalContext(hookEventName, context2, options = {}) {
  const codexToolReport = Boolean(process.env.PLUGIN_ROOT) && TOOL_LIFECYCLE_EVENTS.has(hookEventName);
  const echoStderr = options.echoStderr ?? codexToolReport;
  const suppressJson = codexToolReport || Boolean(options.suppressJson);
  if (echoStderr) process.stderr.write(`${context2}
`);
  if (suppressJson) return null;
  return {
    hookSpecificOutput: {
      hookEventName,
      additionalContext: context2
    }
  };
}
function stopBlock(reason) {
  return { decision: "block", reason };
}

// core/src/hook-targets.ts
import { isAbsolute, resolve as resolve2 } from "node:path";

// core/src/state-file.ts
var WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));

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

// plugins/engineering-workflow/src/domains/debugging/lib/hook-io.ts
function extractSessionId(event) {
  return eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || null;
}
function extractToolResponse(event) {
  return eventToolResponse(event) ?? event.error ?? null;
}
function stripMatchingQuotes2(value) {
  const text = String(value ?? "").trim();
  if (text.length >= 2 && (text.startsWith('"') && text.endsWith('"') || text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}
function objectPaths2(input) {
  if (!isRecord(input)) return [];
  const paths = [];
  for (const key of ["file_path", "filePath", "path", "target_file", "targetFile", "output_file", "outputFile", "notebook_path", "notebookPath"]) {
    const value = input[key];
    if (typeof value === "string" && value) paths.push(value);
  }
  if (Array.isArray(input.paths)) {
    paths.push(...input.paths.filter((path) => typeof path === "string"));
  }
  if (Array.isArray(input.edits)) for (const edit of input.edits) paths.push(...objectPaths2(edit));
  return paths;
}
function responsePaths(response) {
  const paths = [];
  if (isRecord(response)) {
    if (response.changes && typeof response.changes === "object" && !Array.isArray(response.changes)) {
      paths.push(...Object.keys(response.changes));
    }
    paths.push(...objectPaths2(response));
    for (const key of ["output", "stdout", "text"]) {
      if (typeof response[key] === "string") paths.push(...responsePaths(response[key]));
    }
    return paths;
  }
  if (typeof response !== "string") return paths;
  for (const line of response.split("\n")) {
    const status = line.match(/^(?:A|M|D|R[0-9]*)\s+(.+)$/u);
    const changed = line.match(/^(?:added|updated|deleted):\s+(.+)$/iu);
    if (status?.[1]) paths.push(stripMatchingQuotes2(status[1]));
    if (changed?.[1]) paths.push(stripMatchingQuotes2(changed[1]));
  }
  return paths;
}
function extractFileTargets2(event) {
  const cwd = resolve3(eventCwd(event));
  const core = extractFileTargets(event);
  const extras = responsePaths(extractToolResponse(event)).map((value) => isAbsolute2(value) ? resolve3(value) : resolve3(cwd, stripMatchingQuotes2(value).replace(/^\.\//u, "")));
  return [.../* @__PURE__ */ new Set([...core, ...extras])];
}
function isMutationTool(event) {
  return isFileMutationTool(eventToolName(event));
}
function responseText(response) {
  if (typeof response === "string") return response;
  if (isRecord(response)) {
    const fields = ["stdout", "stderr", "output", "content", "message"].map((key) => response[key]).filter((value) => typeof value === "string");
    if (fields.length > 0) return fields.join("\n");
  }
  try {
    return JSON.stringify(response ?? "");
  } catch {
    return String(response ?? "");
  }
}
function continuationToken(value) {
  if (!isRecord(value)) return null;
  const token = value.session_id ?? value.sessionId ?? value.cell_id ?? value.cellId;
  if (typeof token !== "string" && typeof token !== "number") return null;
  const normalized = String(token).trim();
  return normalized ? normalized.slice(0, 200) : null;
}
function isCommandPoll(event) {
  const name = eventToolName(event).split(".").at(-1)?.replaceAll("_", "").toLowerCase();
  return name === "writestdin";
}
function extractPollToken(event) {
  return continuationToken(eventToolInput(event));
}
function extractRunningToken(event) {
  const response = extractToolResponse(event);
  if (isRecord(response)) {
    const code = response.exit_code ?? response.exitCode ?? response.code;
    if (Number.isFinite(Number(code)) || response.success === true || response.success === false || response.interrupted === true) return null;
    const structured = continuationToken(response);
    if (structured) return structured;
  }
  const match = responseText(response).match(/(?:Process running with session ID|Script running with cell ID)\s+([A-Za-z0-9._:-]+)/iu);
  return match?.[1] ?? null;
}
function inferOutcome(event, forceFailure = false) {
  if (forceFailure) return "failure";
  const response = extractToolResponse(event);
  if (isRecord(response)) {
    if (response.is_error === true || response.isError === true || response.error || response.interrupted === true) return "failure";
    const code = response.exit_code ?? response.exitCode ?? response.code;
    if (Number.isFinite(Number(code))) return Number(code) === 0 ? "success" : "failure";
    if (response.success === false) return "failure";
    if (response.success === true) return "success";
  }
  const text = responseText(response);
  const codes = [...text.matchAll(/(?:Process exited with code|Exit code:?|exited with code)\s+(-?[0-9]+)/giu)];
  const lastCode = codes.at(-1)?.[1];
  if (lastCode !== void 0) return Number(lastCode) === 0 ? "success" : "failure";
  const failed = text.match(/(?:^|\n)#\s*fail\s+([0-9]+)/iu);
  if (failed?.[1] && Number(failed[1]) > 0) return "failure";
  const passed = text.match(/(?:^|\n)#\s*pass\s+([0-9]+)/iu);
  if (passed?.[1] && Number(passed[1]) > 0 && (!failed?.[1] || Number(failed[1]) === 0)) return "success";
  if (/(?:^|\n)not ok\s+[0-9]+\b|command failed|is_error["']?\s*:\s*true/iu.test(text)) return "failure";
  if (!process.env.PLUGIN_ROOT && isRecord(response)) return "success";
  return "unknown";
}
function contextOutput(eventName2, text) {
  return additionalContext(eventName2, text);
}
function stopDeny(reason) {
  return stopBlock(reason);
}

// plugins/engineering-workflow/src/domains/debugging/lib/state-store.ts
import { createHash, randomBytes } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync as readFileSync2, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname as dirname2, join, resolve as resolve4 } from "node:path";
var VERSION = 1;
var TTL_MS = 24 * 60 * 60 * 1e3;
var STATE_DIR_RELATIVE = ".debug-workflow/.state";
function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
function debugWorkdir(from) {
  let cursor = resolve4(from);
  while (basename(cursor) !== ".debug-workflow") {
    const parent = dirname2(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
  return cursor;
}
function ensureStateDir(directory) {
  mkdirSync(directory, { recursive: true, mode: 448 });
  const workdir = debugWorkdir(directory);
  if (workdir) ensurePluginWorkdirGitignore(workdir);
}
function emptyState() {
  return { version: VERSION, bound: false, workOrderPath: null, workOrderId: null, epoch: 0, activeBugId: null, revision: 0, eventSeq: 0, mutationSeq: 0, receipts: [], pendingCommands: [], attempts: {}, invalid: false, updatedAt: 0 };
}
function asReceipts(value) {
  if (!Array.isArray(value)) return [];
  const receipts = [];
  for (const item of value.slice(-1e3)) {
    if (isRecord(item)) receipts.push({ ...item, id: typeof item.id === "string" ? item.id : String(item.id ?? "") });
    else receipts.push({ id: "", value: item });
  }
  return receipts;
}
function asAttempts(value) {
  if (!isRecord(value)) return {};
  const attempts = {};
  for (const [key, count] of Object.entries(value)) attempts[key] = Number(count);
  return attempts;
}
function asPendingCommands(value) {
  if (!Array.isArray(value)) return [];
  const now = Date.now();
  const pending = [];
  for (const item of value.slice(-1e3)) {
    if (!isRecord(item)) continue;
    const token = typeof item.token === "string" ? item.token : "";
    const bugId = typeof item.bugId === "string" ? item.bugId : "";
    const kind = typeof item.kind === "string" ? item.kind : "";
    const commandHash = typeof item.commandHash === "string" ? item.commandHash : "";
    const at = Number(item.at) || 0;
    if (!token || !bugId || !kind || !commandHash || now - at > TTL_MS) continue;
    pending.push({
      token: token.slice(0, 200),
      toolUseId: nullableString(item.toolUseId)?.slice(0, 200) ?? null,
      bugId,
      kind,
      mutates: Boolean(item.mutates),
      commandHash,
      mutationSeq: Number(item.mutationSeq) || 0,
      revision: Number(item.revision) || 0,
      at
    });
  }
  return pending;
}
function nullableString(value) {
  if (value === null || value === void 0) return null;
  return typeof value === "string" ? value : String(value);
}
function sanitize(value) {
  if (!isRecord(value) || value.version !== VERSION || Date.now() - Number(value.updatedAt || 0) > TTL_MS) return emptyState();
  return {
    ...emptyState(),
    bound: Boolean(value.bound),
    workOrderPath: nullableString(value.workOrderPath),
    workOrderId: nullableString(value.workOrderId),
    epoch: Number(value.epoch) || 0,
    activeBugId: nullableString(value.activeBugId),
    revision: Number(value.revision) || 0,
    eventSeq: Number(value.eventSeq) || 0,
    mutationSeq: Number(value.mutationSeq) || 0,
    receipts: asReceipts(value.receipts),
    pendingCommands: asPendingCommands(value.pendingCommands),
    attempts: asAttempts(value.attempts),
    invalid: Boolean(value.invalid),
    updatedAt: Number(value.updatedAt) || 0
  };
}
function statePath(sessionId, cwd) {
  const session = sessionId || "default";
  return join(resolve4(cwd), STATE_DIR_RELATIVE, "sessions", `${digest(session)}.json`);
}
function atomicWrite(path, value) {
  if (!path) return false;
  const directory = dirname2(path);
  const temp = join(directory, `.${digest(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    ensureStateDir(directory);
    writeFileSync(temp, `${JSON.stringify(value)}
`, { encoding: "utf8", mode: 384, flag: "wx" });
    renameSync(temp, path);
    return true;
  } catch {
    try {
      rmSync(temp, { force: true });
    } catch {
    }
    return false;
  }
}
function read(path, fallback = null) {
  try {
    const parsed = JSON.parse(readFileSync2(path, "utf8"));
    return parsed;
  } catch {
    return fallback;
  }
}
function readState(sessionId, cwd) {
  return sanitize(read(statePath(sessionId, cwd), null));
}
function writeState(sessionId, cwd, state) {
  state.updatedAt = Date.now();
  return atomicWrite(statePath(sessionId, cwd), state);
}
function registryPath(repoRoot2, workOrderId) {
  return join(resolve4(repoRoot2), STATE_DIR_RELATIVE, "leases", `${digest(workOrderId)}.json`);
}
function acquireLease({ repoRoot: repoRoot2, workOrderId, epoch, sessionId, leaseMinutes, now = Date.now() }) {
  const path = registryPath(repoRoot2, workOrderId);
  if (!path) return { ok: true, persisted: false };
  const lock = `${path}.lock`;
  const createLock = () => {
    mkdirSync(dirname2(path), { recursive: true, mode: 448 });
    mkdirSync(lock, { mode: 448 });
  };
  try {
    createLock();
  } catch {
    try {
      if (now - statSync(lock).mtimeMs <= 3e4) return { ok: false, reason: "work-order lease update is already in progress" };
      rmdirSync(lock);
      createLock();
    } catch {
      return { ok: false, reason: "work-order lease update is already in progress" };
    }
  }
  try {
    const current = read(path, null);
    const currentRecord = isRecord(current) ? current : null;
    const live = Boolean(currentRecord && Number(currentRecord.expiresAt) > now);
    if (live && currentRecord && currentRecord.sessionId !== sessionId) return { ok: false, reason: `work order is leased by another session until ${new Date(Number(currentRecord.expiresAt)).toISOString()}` };
    if (currentRecord && currentRecord.sessionId !== sessionId && Number(epoch) <= Number(currentRecord.maxEpoch || 0)) return { ok: false, reason: `run.epoch must exceed ${String(currentRecord.maxEpoch)} when another session resumes this work order` };
    const next = { workOrderId, maxEpoch: Math.max(Number(epoch), Number(currentRecord?.maxEpoch || 0)), sessionId, expiresAt: now + leaseMinutes * 6e4, updatedAt: now };
    return { ok: atomicWrite(path, next), persisted: true, reason: "failed to persist work-order lease" };
  } finally {
    try {
      rmdirSync(lock);
    } catch {
    }
  }
}
function releaseLease({ repoRoot: repoRoot2, workOrderId, sessionId }) {
  const path = registryPath(repoRoot2, workOrderId);
  if (!path) return false;
  const current = read(path, null);
  if (!isRecord(current) || current.sessionId !== sessionId) return false;
  current.expiresAt = 0;
  return atomicWrite(path, current);
}

// plugins/engineering-workflow/src/domains/debugging/lib/workflow.ts
import { createHash as createHash2 } from "node:crypto";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { relative, resolve as resolve5 } from "node:path";
function gitRoot(cwd) {
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", timeout: 5e3, stdio: ["ignore", "pipe", "ignore"] }).trim();
    return resolve5(cwd, relative(realpathSync(cwd), realpathSync(top)));
  } catch {
    return resolve5(cwd);
  }
}
function hash(value) {
  return createHash2("sha256").update(String(value)).digest("hex");
}
function normalizeCommand(command) {
  return String(command ?? "").trim().replace(/\s+/gu, " ");
}
function safeRegex(pattern) {
  try {
    return new RegExp(pattern, "u");
  } catch {
    return null;
  }
}
function matchesAny(value, patterns) {
  return patterns.some((pattern) => Boolean(safeRegex(pattern)?.test(value)));
}
function configuredOutcome(command, observed, config) {
  const normalized = normalizeCommand(command);
  if (matchesAny(normalized, config.commands.expectedFailurePatterns)) return "failure";
  if (matchesAny(normalized, config.commands.expectedSuccessPatterns)) return "success";
  return observed;
}
function classifyCommand(command, bug, config) {
  const normalized = normalizeCommand(command);
  const reproduction = isRecord(bug?.symptom) ? bug.symptom.reproduction : void 0;
  if (normalizeCommand(reproduction) === normalized || matchesAny(normalized, config.commands.reproductionPatterns)) return "reproduction";
  if (matchesAny(normalized, config.commands.verificationPatterns) || /(?:^|\s)(?:test|tests|pytest|phpunit|rspec|cargo test|go test|npm test|pnpm test|yarn test|mvn test|gradle test)(?:\s|$)/iu.test(normalized)) return "verification";
  return "command";
}
function classifyPath(path, repoRoot2, config) {
  const rel = relative(repoRoot2, resolve5(path)).replaceAll("\\", "/");
  const groups = config.paths;
  if (matchesAny(rel, groups.nonCodePatterns)) return "non-code";
  if (matchesAny(rel, groups.diagnosticPatterns) || /(?:^|\/)(?:tmp|temp|debug|diagnostics?)(?:\/|$)/iu.test(rel)) return "diagnostic";
  if (matchesAny(rel, groups.testPatterns) || /(?:^|\/)(?:test|tests|spec|specs|__tests__)(?:\/|$)|(?:\.test|\.spec)\.[^.]+$/iu.test(rel)) return "test";
  if (matchesAny(rel, groups.codePatterns)) return "code";
  if (/\.(?:md|txt|rst|adoc|png|jpe?g|gif|svg|pdf)$/iu.test(rel)) return "non-code";
  return "code";
}
function sameLedgerPath(left, right) {
  if (!left || !right) return false;
  return canonicalizeLedgerPath(left) === canonicalizeLedgerPath(right);
}
function bindWorkOrderAfterMutation({ cwd, sessionId, touchedPaths, config = DEFAULT_CONFIG, now = Date.now() }) {
  const repoRoot2 = gitRoot(cwd);
  const candidates = [...new Set((Array.isArray(touchedPaths) ? touchedPaths : []).map((path) => canonicalizeLedgerPath(String(path))))].filter((path) => isWorkOrderPath(path, repoRoot2, config));
  if (candidates.length === 0) return { kind: "idle" };
  if (candidates.length > 1) return { kind: "invalid", findings: ["one hook event cannot bind multiple work orders"] };
  const candidate = candidates[0];
  if (candidate === void 0) return { kind: "idle" };
  let existing = readState(sessionId, repoRoot2);
  if (existing.bound && existing.workOrderPath && !sameLedgerPath(existing.workOrderPath, candidate)) {
    const previous = loadLedger(existing.workOrderPath, config);
    const previousComplete = previous.valid && previous.workOrder.status === "closed" && completionFindings({ kind: "inactive", repoRoot: repoRoot2, state: existing, workOrder: previous.workOrder }).length === 0;
    if (previous.valid && (["aborted", "paused"].includes(String(previous.workOrder.status)) || previousComplete)) {
      releaseLease({ repoRoot: repoRoot2, workOrderId: String(previous.workOrder.id ?? ""), sessionId });
      existing = emptyState();
    } else {
      return { kind: "conflict", path: candidate, findings: [`this session is already bound to ${relative(repoRoot2, existing.workOrderPath)}`] };
    }
  }
  const checked = loadLedger(candidate, config);
  if (!checked.valid) {
    const state2 = {
      ...existing.bound ? existing : emptyState(),
      bound: true,
      workOrderPath: candidate,
      invalid: true,
      eventSeq: existing.bound ? existing.eventSeq + 1 : 1,
      updatedAt: now
    };
    writeState(sessionId, repoRoot2, state2);
    return { kind: "invalid", repoRoot: repoRoot2, state: state2, path: candidate, findings: checked.findings };
  }
  const workOrder = checked.workOrder;
  if (existing.bound && existing.workOrderId && existing.workOrderId !== workOrder.id) {
    existing.invalid = true;
    existing.eventSeq += 1;
    writeState(sessionId, repoRoot2, existing);
    return { kind: "invalid", repoRoot: repoRoot2, state: existing, path: candidate, findings: ["a corrected bound work order must preserve its id and run.epoch"] };
  }
  if (existing.bound && existing.workOrderId && Number(workOrder.run?.epoch) < Number(existing.epoch)) {
    existing.invalid = true;
    existing.eventSeq += 1;
    writeState(sessionId, repoRoot2, existing);
    return { kind: "invalid", repoRoot: repoRoot2, state: existing, path: candidate, findings: ["a corrected bound work order must preserve its id and run.epoch"] };
  }
  const active = workOrder.status === "open" && workOrder.run?.state === "active";
  if (active) {
    const lease = acquireLease({ repoRoot: repoRoot2, workOrderId: String(workOrder.id ?? ""), epoch: workOrder.run?.epoch, sessionId, leaseMinutes: config.limits.leaseMinutes, now });
    if (!lease.ok) return { kind: "conflict", path: candidate, findings: [lease.reason ?? "work-order lease update is already in progress"] };
  }
  const state = {
    ...existing.bound ? existing : emptyState(),
    bound: true,
    workOrderPath: checked.path ?? candidate,
    workOrderId: workOrder.id == null ? null : String(workOrder.id),
    epoch: Number(workOrder.run?.epoch) || 0,
    activeBugId: workOrder.activeBugId == null ? null : String(workOrder.activeBugId),
    revision: existing.bound ? existing.revision + 1 : 1,
    eventSeq: existing.bound ? existing.eventSeq + 1 : 1,
    invalid: false,
    updatedAt: now
  };
  writeState(sessionId, repoRoot2, state);
  return { kind: "bound", repoRoot: repoRoot2, workOrder, state, active };
}
function refreshBoundWorkOrder({ cwd, sessionId, config = DEFAULT_CONFIG }) {
  const repoRoot2 = gitRoot(cwd);
  const state = readState(sessionId, repoRoot2);
  if (!state.bound || !state.workOrderPath) return { kind: "idle", repoRoot: repoRoot2, state };
  const checked = loadLedger(state.workOrderPath, config);
  if (!checked.valid) {
    state.invalid = true;
    writeState(sessionId, repoRoot2, state);
    return { kind: "invalid", repoRoot: repoRoot2, state, findings: checked.findings };
  }
  if (checked.workOrder.id !== state.workOrderId) return { kind: "invalid", repoRoot: repoRoot2, state, findings: ["bound work-order id or run.epoch changed unexpectedly"] };
  if (Number(checked.workOrder.run?.epoch) < Number(state.epoch)) return { kind: "invalid", repoRoot: repoRoot2, state, findings: ["bound work-order id or run.epoch changed unexpectedly"] };
  if (Number(checked.workOrder.run?.epoch) > Number(state.epoch)) {
    state.epoch = Number(checked.workOrder.run?.epoch);
    writeState(sessionId, repoRoot2, state);
  }
  state.invalid = false;
  state.activeBugId = checked.workOrder.activeBugId == null ? null : String(checked.workOrder.activeBugId);
  if (checked.workOrder.status !== "open" || checked.workOrder.run?.state !== "active") {
    return { kind: "inactive", repoRoot: repoRoot2, state, workOrder: checked.workOrder };
  }
  return { kind: "active", repoRoot: repoRoot2, state, workOrder: checked.workOrder };
}
function recordReceipt({ cwd, sessionId, config = DEFAULT_CONFIG, kind, command = null, paths = [], outcome = null, summary = "", now = Date.now() }) {
  const live = refreshBoundWorkOrder({ cwd, sessionId, config });
  if (live.kind !== "active") return live;
  const bug = live.workOrder.bugs.find((item) => item.id === live.workOrder.activeBugId);
  live.state.eventSeq += 1;
  if (kind === "mutation") live.state.mutationSeq = live.state.eventSeq;
  const receipt = {
    id: `R-${live.state.eventSeq}`,
    bugId: bug.id,
    kind: command ? classifyCommand(command, bug, config) : kind,
    commandHash: command ? hash(normalizeCommand(command)) : null,
    paths: paths.map((path) => relative(live.repoRoot, resolve5(path)).replaceAll("\\", "/")).slice(0, 20),
    outcome,
    summary: String(summary).replace(/\s+/gu, " ").slice(0, 240),
    mutationSeq: live.state.mutationSeq,
    revision: live.state.revision,
    at: now
  };
  live.state.receipts.push(receipt);
  if (receipt.kind === "reproduction" && outcome === "failure" && Number(receipt.mutationSeq) > 0) {
    const attemptKey = String(bug.id ?? "");
    live.state.attempts[attemptKey] = Number(live.state.attempts[attemptKey] || 0) + 1;
  }
  live.state.receipts = live.state.receipts.slice(-config.limits.maxReceipts);
  writeState(sessionId, live.repoRoot, live.state);
  return { ...live, kind: "recorded", receipt };
}
function registerPendingCommand({ cwd, sessionId, config = DEFAULT_CONFIG, token, toolUseId = null, kind, command, now = Date.now() }) {
  const live = refreshBoundWorkOrder({ cwd, sessionId, config });
  if (live.kind !== "active") return live;
  const bug = live.workOrder.bugs.find((item) => item.id === live.workOrder.activeBugId);
  const commandHash = hash(normalizeCommand(command));
  live.state.pendingCommands = live.state.pendingCommands.filter((pending) => pending.token !== token && (!toolUseId || pending.toolUseId !== toolUseId));
  live.state.pendingCommands.push({
    token,
    toolUseId,
    bugId: String(bug.id),
    kind: classifyCommand(command, bug, config),
    mutates: kind === "mutation",
    commandHash,
    mutationSeq: live.state.mutationSeq,
    revision: live.state.revision,
    at: now
  });
  live.state.pendingCommands = live.state.pendingCommands.slice(-config.limits.maxReceipts);
  writeState(sessionId, live.repoRoot, live.state);
  return { ...live, kind: "pending" };
}
function completePendingCommand({ cwd, sessionId, config = DEFAULT_CONFIG, token = null, toolUseId = null, commandHash = null, outcome, summary = "", now = Date.now() }) {
  const live = refreshBoundWorkOrder({ cwd, sessionId, config });
  if (live.kind !== "active") return live;
  let index = -1;
  if (token) index = live.state.pendingCommands.findIndex((pending2) => pending2.token === token);
  else {
    if (toolUseId) index = live.state.pendingCommands.findIndex((pending2) => pending2.toolUseId === toolUseId);
    if (index < 0 && commandHash) {
      const matches2 = live.state.pendingCommands.map((pending2, pendingIndex) => ({ pending: pending2, pendingIndex })).filter(({ pending: pending2 }) => pending2.commandHash === commandHash);
      if (matches2.length === 1) index = matches2[0].pendingIndex;
    }
  }
  if (index < 0) return { ...live, kind: "unmatched" };
  const [pending] = live.state.pendingCommands.splice(index, 1);
  if (!pending || !live.workOrder.bugs.some((bug) => bug.id === pending.bugId)) {
    writeState(sessionId, live.repoRoot, live.state);
    return { ...live, kind: "unmatched" };
  }
  live.state.eventSeq += 1;
  if (pending.mutates) live.state.mutationSeq = live.state.eventSeq;
  const receipt = {
    id: `R-${live.state.eventSeq}`,
    bugId: pending.bugId,
    kind: pending.kind,
    commandHash: pending.commandHash,
    paths: [],
    outcome,
    summary: String(summary).replace(/\s+/gu, " ").slice(0, 240),
    mutationSeq: live.state.mutationSeq,
    revision: pending.revision,
    at: now
  };
  live.state.receipts.push(receipt);
  if (receipt.kind === "reproduction" && outcome === "failure" && Number(receipt.mutationSeq) > 0) {
    live.state.attempts[pending.bugId] = Number(live.state.attempts[pending.bugId] || 0) + 1;
  }
  live.state.receipts = live.state.receipts.slice(-config.limits.maxReceipts);
  writeState(sessionId, live.repoRoot, live.state);
  return { ...live, kind: "recorded", receipt };
}
function preMutationDecision({ cwd, sessionId, paths, config = DEFAULT_CONFIG }) {
  const live = refreshBoundWorkOrder({ cwd, sessionId, config });
  if (["idle", "inactive"].includes(live.kind)) return { action: "allow", reason: "no active bound work order" };
  const boundPath = live.kind === "invalid" ? live.state?.workOrderPath : void 0;
  if (live.kind === "invalid" && boundPath && paths.length > 0 && paths.every((path) => resolve5(path) === resolve5(boundPath))) {
    return { action: "allow", reason: "allowing correction of the invalid bound work order" };
  }
  if (live.kind !== "active") return { action: config.mode === "block" ? "block" : "report", reason: `bound work order is invalid: ${(live.findings ?? []).join("; ")}` };
  const bug = live.workOrder.bugs.find((item) => item.id === live.workOrder.activeBugId);
  const codePaths = paths.filter((path) => classifyPath(path, live.repoRoot, config) === "code" && !isWorkOrderPath(path, live.repoRoot, config));
  if (codePaths.length === 0) return { action: "allow" };
  const attempts = Number(live.state.attempts[String(bug.id ?? "")] || 0);
  if (attempts >= config.limits.maxFailedFixAttempts) return { action: config.mode === "block" ? "block" : "report", reason: `${String(bug.id)} reached ${attempts} failed fix attempts; move it to architecture-review and record a new decision before further code changes` };
  const firstMutation = Math.min(...live.state.receipts.filter((receipt) => receipt.bugId === bug.id && receipt.kind === "mutation").map(receiptSequence));
  const baseline = live.state.receipts.find((receipt) => receipt.bugId === bug.id && receipt.kind === "reproduction" && receipt.outcome === "failure" && receiptSequence(receipt) < firstMutation);
  if (!baseline) return { action: config.mode === "block" ? "block" : "report", reason: `${String(bug.id)} has no pre-mutation failing baseline; run the exact reproduction command verbatim, without pipes, redirections, or an echo suffix, and observe its failure` };
  const affected = isRecord(bug.fix) && Array.isArray(bug.fix.affectedBugIds) ? bug.fix.affectedBugIds : [];
  const affectedIds = affected.length > 0 ? affected : [bug.id];
  for (const affectedId of affectedIds) {
    if (affectedId === bug.id) continue;
    const affectedBaseline = live.state.receipts.find((receipt) => receipt.bugId === affectedId && receipt.kind === "reproduction" && receipt.outcome === "failure" && receiptSequence(receipt) < firstMutation);
    if (!affectedBaseline) return { action: config.mode === "block" ? "block" : "report", reason: `${String(bug.id)} shared fix affected bug ${String(affectedId)} has no attributed failing baseline before the production mutation; switch activeBugId to ${String(affectedId)}, run its exact reproduction verbatim, then switch back` };
  }
  return { action: "allow" };
}
function preCommandDecision({ cwd, sessionId, command, config = DEFAULT_CONFIG }) {
  const live = refreshBoundWorkOrder({ cwd, sessionId, config });
  if (live.kind !== "active") return { action: "allow" };
  const commandHash = hash(normalizeCommand(command));
  const receipts = [...live.state.receipts].reverse();
  const last = receipts[0];
  if (!last || last.commandHash !== commandHash) return { action: "allow" };
  let repeated = 0;
  for (const receipt of receipts) {
    if (receipt.commandHash !== commandHash || receipt.outcome !== last.outcome) break;
    repeated += 1;
  }
  if (repeated < config.limits.maxRepeatedCommandReceipts) return { action: "allow" };
  return {
    action: config.mode === "block" ? "block" : "report",
    reason: `${repeated} consecutive receipts repeated the same command and outcome; change the experiment, hypothesis, or evidence source before retrying`
  };
}
function receiptSequence(receipt) {
  const matched = /^R-([0-9]+)$/u.exec(String(receipt?.id ?? ""));
  const raw = matched?.[1];
  return raw !== void 0 ? Number(raw) : Number.NaN;
}
function completionFindings(live) {
  if (!["active", "inactive"].includes(live.kind)) return live.kind === "idle" ? [] : live.findings ?? ["work order is unavailable"];
  if (live.kind !== "active" && live.kind !== "inactive") return live.findings ?? ["work order is unavailable"];
  const { workOrder, state } = live;
  if (workOrder.status !== "closed") return [];
  const findings = [];
  const mutations = (state.receipts ?? []).filter((receipt) => receipt.kind === "mutation" && receipt.outcome === "success");
  if (mutations.length === 0) return findings;
  const ownersByBug = /* @__PURE__ */ new Map();
  for (const bug of workOrder.bugs) {
    const fix = isRecord(bug.fix) ? bug.fix : void 0;
    const affected = Array.isArray(fix?.affectedBugIds) && fix.affectedBugIds.length > 0 ? fix.affectedBugIds : [bug.id];
    if (!mutations.some((receipt) => receipt.bugId === bug.id)) continue;
    for (const affectedId of affected) {
      const owners = ownersByBug.get(affectedId) ?? [];
      owners.push(bug.id);
      ownersByBug.set(affectedId, owners);
    }
  }
  const bugIds = /* @__PURE__ */ new Set([...ownersByBug.keys(), ...mutations.map((receipt) => receipt.bugId)]);
  for (const bugId of bugIds) {
    const owners = new Set(ownersByBug.get(bugId) ?? [bugId]);
    const relevantMutations = mutations.filter((receipt) => owners.has(receipt.bugId) || receipt.bugId === bugId);
    if (relevantMutations.length === 0) continue;
    const firstMutation = Math.min(...relevantMutations.map(receiptSequence));
    const lastMutation = Math.max(...relevantMutations.map(receiptSequence));
    const baseline = state.receipts.find((receipt) => receipt.bugId === bugId && receipt.kind === "reproduction" && receipt.outcome === "failure" && receiptSequence(receipt) < firstMutation);
    if (!baseline) findings.push(`${String(bugId)}: no failing original reproduction was observed before production mutation`);
    const after = state.receipts.filter((receipt) => receipt.bugId === bugId && receiptSequence(receipt) > lastMutation);
    const repro = after.find((receipt) => receipt.kind === "reproduction" && receipt.outcome === "success");
    if (!repro) findings.push(`${String(bugId)}: original reproduction lacks a successful current-session receipt`);
    const bug = workOrder.bugs.find((item) => item.id === bugId);
    const acceptanceCommand = isRecord(bug?.symptom) ? String(bug.symptom.acceptance ?? "").trim() : "";
    const acceptanceHash = acceptanceCommand ? hash(normalizeCommand(acceptanceCommand)) : null;
    const acceptance = acceptanceHash ? after.find((receipt) => receipt.commandHash === acceptanceHash && receipt.outcome === "success") : void 0;
    if (acceptanceHash && !acceptance) findings.push(`${String(bugId)}: user-visible acceptance command lacks a successful post-mutation receipt`);
    const regression = after.find((receipt) => receipt.id !== repro?.id && receipt.id !== acceptance?.id && receipt.outcome === "success");
    if (!regression) findings.push(`${String(bugId)}: regression verification is missing`);
    const cleanup = after.find((receipt) => receipt.id !== repro?.id && receipt.id !== acceptance?.id && receipt.id !== regression?.id && receipt.outcome !== "failure");
    if (!cleanup) findings.push(`${String(bugId)}: debug-marker cleanup receipt is missing, cross-bug, or failed`);
    if (repro && receiptSequence(repro) <= lastMutation) findings.push(`${String(bugId)}: original reproduction predates the last relevant mutation`);
  }
  return [...new Set(findings)];
}
function bindAfterWriter({ cwd, sessionId, command = "", stdout = "", config = DEFAULT_CONFIG, now = Date.now() }) {
  const printed = parseWriterStdout(stdout);
  const looksLikeWriter = isOfficialWriterCommand(command) || Boolean(printed?.ok && (printed.id || printed.path));
  if (!looksLikeWriter) return { kind: "idle" };
  const action = writerActionFromCommand(command);
  if (action === "status") return refreshBoundWorkOrder({ cwd, sessionId, config });
  const repoRoot2 = gitRoot(cwd);
  const touched = [];
  if (typeof printed?.path === "string") touched.push(printed.path);
  else if (printed?.path) touched.push(String(printed.path));
  const slug = commandFlag(command, "slug");
  if (slug) touched.push(resolve5(repoRoot2, config.ledger.root, slug));
  if (printed?.id) {
    const dir = findLedgerDir(repoRoot2, config, printed.id);
    if (dir) touched.push(dir);
  }
  if (touched.length === 0) {
    const open = scanLedgers(repoRoot2, config).filter((item) => item.store === "events");
    if (open.length === 1) {
      const only = open[0];
      if (only) touched.push(only.path);
    }
  }
  if (touched.length === 0) return { kind: "idle" };
  return bindWorkOrderAfterMutation({ cwd, sessionId, touchedPaths: touched, config, now });
}
function closeBinding({ cwd, sessionId, config = DEFAULT_CONFIG }) {
  const live = refreshBoundWorkOrder({ cwd, sessionId, config });
  if (!["active", "inactive"].includes(live.kind)) return live;
  if (live.kind !== "active" && live.kind !== "inactive") return live;
  if (["closed", "aborted", "paused"].includes(String(live.workOrder.status))) releaseLease({ repoRoot: live.repoRoot, workOrderId: String(live.workOrder.id ?? ""), sessionId });
  return live;
}

// plugins/engineering-workflow/src/domains/debugging/hook.ts
var outputStore = new AsyncLocalStorage();
function writeJson2(output) {
  if (!output) return;
  const outputs = outputStore.getStore();
  if (!outputs) throw new Error("debugging output was emitted outside the owner dispatcher");
  outputs.push(output);
}
function warn(message) {
  process.stderr.write(`[software-debugging] ${String(message)}
`);
}
function repoRoot(cwd) {
  try {
    const top = execFileSync2("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", timeout: 5e3, stdio: ["ignore", "pipe", "ignore"] }).trim();
    return resolve6(cwd, relative2(realpathSync2(cwd), realpathSync2(top)));
  } catch {
    return resolve6(cwd);
  }
}
function shellCommandMutates(command) {
  const mutating = shellCommandInvocations(command).some(({ executable, args }) => {
    const program = executable.toLowerCase();
    const action = args[0]?.toLowerCase();
    if (["tee", "cp", "mv", "touch", "mkdir", "truncate"].includes(program)) return true;
    if (["sed", "perl"].includes(program)) return args.some((arg) => /^-[^-]*i/u.test(arg) || arg === "--in-place" || arg.startsWith("--in-place="));
    if (program === "git") return ["apply", "am", "merge", "rebase", "cherry-pick"].includes(action ?? "");
    if (program === "npm") return ["install", "uninstall"].includes(action ?? "");
    if (program === "pnpm" || program === "yarn") return ["add", "remove"].includes(action ?? "");
    return false;
  });
  if (mutating) return true;
  const tokens = tokenizeShell(command);
  return tokens.some((token, index) => {
    const redirect = token.match(/^(?:\d*)?(?:>>?|&>)(.*)$/u);
    if (!redirect) return false;
    const target = redirect[1] || tokens[index + 1] || "";
    return target !== "/dev/null";
  });
}
function conciseResponse(event) {
  const value = event?.tool_response ?? event?.toolResponse ?? event?.tool_result ?? event?.toolResult ?? event?.response ?? event?.error ?? "";
  return (typeof value === "string" ? value : JSON.stringify(value)).replace(/\s+/gu, " ").slice(0, 240);
}
function ensureLocalExclude(root, config) {
  if (config.ledger.persistence !== "local") return;
  try {
    const path = execFileSync2("git", ["rev-parse", "--git-path", "info/exclude"], { cwd: root, encoding: "utf8", timeout: 5e3 }).trim();
    const absolute = resolve6(root, path);
    const entry = `/${config.ledger.root}/`;
    const existing = existsSync(absolute) ? readFileSync3(absolute, "utf8") : "";
    if (!existing.split(/\r?\n/u).includes(entry)) appendFileSync(absolute, `${existing && !existing.endsWith("\n") ? "\n" : ""}${entry}
`, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : error;
    warn(`cannot update .git/info/exclude: ${message ?? error}`);
  }
}
async function context(event) {
  const cwd = eventCwd(event);
  const root = repoRoot(cwd);
  const config = await loadProjectConfig(root, warn);
  return { cwd, root, config, sessionId: extractSessionId(event) };
}
async function runSession(event) {
  const { root, config } = await context(event);
  if (config.mode === "off") return;
  const orders = scanLedgers(root, config);
  if (orders.length === 0) return;
  const lines = ["[Debugging Workflow Guard] Found resumable Debug Work Orders; none was activated."];
  for (const order of orders) lines.push(describeLedger(order, root));
  lines.push("Use the debug-workflow CLI to resume (`resume --id ...`). Hooks activate only after a writer command; do not Edit or Write the ledger.");
  writeJson2(contextOutput("SessionStart", lines.join("\n")));
}
async function runPre(event) {
  const { cwd, root, config, sessionId } = await context(event);
  if (config.mode === "off") return;
  const command = extractShellCommand(event);
  let paths = extractFileTargets2(event);
  if (command && isOfficialWriterCommand(command)) {
    return;
  }
  if (command) {
    const commandDecision = preCommandDecision({ cwd, sessionId, command, config });
    if (commandDecision.action === "block") {
      writeJson2(preToolDeny(`[Debugging Workflow Guard] ${commandDecision.reason}`));
      return;
    }
    if (commandDecision.action === "report") {
      writeJson2(contextOutput("PreToolUse", `[Debugging Workflow Guard] ${commandDecision.reason}`));
    }
  }
  if (command && (shellCommandMutates(command) || isGenericMutationCommand(command)) && commandMentionsRoot(command, config.ledger.root, resolve6(root, config.ledger.root))) {
    writeJson2(preToolDeny("[Debugging Workflow Guard] Direct ledger mutation is denied; use the debug-workflow CLI writer."));
    return;
  }
  const ledgerWrites = paths.filter((path) => isLedgerManagedPath(path, root, config));
  if (ledgerWrites.length > 0 && isMutationTool(event)) {
    writeJson2(preToolDeny("[Debugging Workflow Guard] Direct file-tool writes to a live ledger are denied; use the debug-workflow CLI writer."));
    return;
  }
  if (command && shellCommandMutates(command)) paths = [resolve6(root, "__unknown_shell_mutation__")];
  if (paths.length === 0) return;
  const decision = preMutationDecision({ cwd, sessionId, paths, config });
  if (decision.action === "block") writeJson2(preToolDeny(`[Debugging Workflow Guard] ${decision.reason}`));
  else if (decision.action === "report") writeJson2(contextOutput("PreToolUse", `[Debugging Workflow Guard] ${decision.reason}`));
}
function responseStdout(event) {
  const response = extractToolResponse(event);
  if (typeof response === "string") return response;
  if (isRecord(response) && typeof response.stdout === "string") return response.stdout;
  return conciseResponse(event);
}
function execStatus(error) {
  return isRecord(error) ? error.status : void 0;
}
function reportReceipt(recorded, postEvent, config) {
  if (recorded.kind !== "recorded") return;
  writeJson2(contextOutput(postEvent, `[Debugging Workflow Guard] Receipt ${recorded.receipt.id}: ${String(recorded.receipt.kind)} ${String(recorded.receipt.outcome)} for ${String(recorded.receipt.bugId)}. Cite this id only when it supports the stated claim.`));
  if (recorded.receipt.kind !== "reproduction" || recorded.receipt.outcome !== "failure") return;
  const count = recorded.state.attempts[String(recorded.receipt.bugId)] ?? 0;
  if (count >= config.limits.maxFailedFixAttempts) writeJson2(contextOutput(postEvent, `[Debugging Workflow Guard] ${String(recorded.receipt.bugId)} reached ${count} failed post-mutation reproductions. Move only this bug to architecture-review before another production edit.`));
}
async function runPost(event, forceFailure = false) {
  const { cwd, root, config, sessionId } = await context(event);
  if (config.mode === "off") return;
  const postEvent = forceFailure ? "PostToolUseFailure" : "PostToolUse";
  const paths = extractFileTargets2(event);
  const command = extractShellCommand(event);
  if (command) {
    const bound = bindAfterWriter({ cwd, sessionId, command, stdout: responseStdout(event), config });
    if (bound.kind !== "idle") {
      if (bound.kind === "bound") {
        ensureLocalExclude(root, config);
        const boundPath = bound.state.workOrderPath ?? "";
        writeJson2(contextOutput(postEvent, `[Debugging Workflow Guard] Bound ${String(bound.workOrder.id)} at ${relative2(root, boundPath)}; state ${String(bound.workOrder.status)}/${String(bound.workOrder.run?.state)}; active bug ${bound.workOrder.activeBugId ?? "none"}.${bound.active ? " Evidence and mutations are now attributed to that bug." : " No active mutation guard remains."}`));
        closeBinding({ cwd, sessionId, config });
      } else if (bound.kind === "invalid" || bound.kind === "conflict") {
        writeJson2(contextOutput(postEvent, `[Debugging Workflow Guard] Work Order activation rejected: ${(bound.findings ?? []).join("; ")}`));
      } else if (bound.kind === "active" || bound.kind === "inactive") {
        writeJson2(contextOutput(postEvent, `[Debugging Workflow Guard] Work Order ${String(bound.workOrder.id)} refreshed; state ${String(bound.workOrder.status)}/${String(bound.workOrder.run?.state)}; active bug ${bound.workOrder.activeBugId ?? "none"}.`));
        closeBinding({ cwd, sessionId, config });
      }
      return;
    }
  }
  const ledgerTouches = paths.filter((path) => isLedgerManagedPath(path, root, config));
  if (ledgerTouches.length > 0) {
    const before = readState(sessionId, root);
    if (forceFailure && !before.bound && ledgerTouches.every((path) => !existsSync(path))) {
      writeJson2(contextOutput(postEvent, "[Debugging Workflow Guard] Work Order write failed before a file existed; workflow was not activated. Use the debug-workflow CLI writer."));
      return;
    }
    writeJson2(contextOutput(postEvent, "[Debugging Workflow Guard] Direct ledger writes do not activate the workflow; use the debug-workflow CLI writer."));
    return;
  }
  if (command) {
    const runningToken = extractRunningToken(event);
    if (runningToken) {
      registerPendingCommand({
        cwd,
        sessionId,
        config,
        token: runningToken,
        toolUseId: eventToolUseId(event) || null,
        kind: shellCommandMutates(command) ? "mutation" : "command",
        command
      });
      return;
    }
  }
  if (isCommandPoll(event)) {
    const token = extractPollToken(event);
    const outcome = inferOutcome(event, forceFailure);
    if (!token || outcome === "unknown" && extractRunningToken(event)) return;
    const recorded = completePendingCommand({
      cwd,
      sessionId,
      config,
      token,
      outcome,
      summary: conciseResponse(event)
    });
    reportReceipt(recorded, postEvent, config);
    return;
  }
  if (command) {
    const outcome = configuredOutcome(command, inferOutcome(event, forceFailure), config);
    const completed = completePendingCommand({
      cwd,
      sessionId,
      config,
      toolUseId: eventToolUseId(event) || null,
      commandHash: hash(normalizeCommand(command)),
      outcome,
      summary: conciseResponse(event)
    });
    if (completed.kind === "recorded") {
      reportReceipt(completed, postEvent, config);
      return;
    }
    const recorded = recordReceipt({ cwd, sessionId, config, kind: shellCommandMutates(command) ? "mutation" : "command", command, outcome, summary: conciseResponse(event) });
    reportReceipt(recorded, postEvent, config);
    return;
  }
  if (isMutationTool(event) && paths.length > 0) {
    const live = refreshBoundWorkOrder({ cwd, sessionId, config });
    if (live.kind !== "active") return;
    const codePaths = paths.filter((path) => classifyPath(path, root, config) === "code");
    if (codePaths.length > 0) {
      const recorded = recordReceipt({ cwd, sessionId, config, kind: "mutation", paths: codePaths, outcome: "success", summary: `${codePaths.length} production path(s) changed` });
      if (recorded.kind === "recorded") writeJson2(contextOutput(postEvent, `[Debugging Workflow Guard] Receipt ${recorded.receipt.id}: production mutation attributed to ${String(recorded.receipt.bugId)}.`));
    }
  }
}
async function runStop(event) {
  const { cwd, root, config, sessionId } = await context(event);
  if (config.mode === "off") return;
  const live = refreshBoundWorkOrder({ cwd, sessionId, config });
  if (live.kind === "idle") return;
  if (live.kind !== "active" && live.kind !== "inactive") {
    const reason2 = `[Debugging Workflow Guard] Bound Work Order is invalid: ${(live.findings ?? []).join("; ")}`;
    if (config.mode === "block") writeJson2(stopDeny(reason2));
    else writeJson2(contextOutput("Stop", reason2));
    return;
  }
  const message = eventAssistantMessage(event);
  const rel = relative2(root, live.state.workOrderPath ?? "").replaceAll("\\", "/");
  const findings = live.workOrder.status === "closed" ? completionFindings(live) : [];
  if (live.workOrder.status === "closed") {
    const marker = `DBG_${String(live.workOrder.id).replace(/[^A-Za-z0-9]+/gu, "_")}`;
    try {
      const matches2 = execFileSync2("git", ["grep", "--untracked", "-n", "-I", "-e", marker, "--", ".", `:!${config.ledger.root}`], { cwd: root, encoding: "utf8", timeout: 5e3, stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (matches2) findings.push(`debug instrumentation remains under marker prefix ${marker}`);
    } catch (error) {
      if (execStatus(error) !== 1 && execStatus(error) !== "1") findings.push("debug-marker cleanup scan could not complete");
    }
  }
  if (["closed", "paused", "aborted"].includes(String(live.workOrder.status)) && !message.includes(rel) && !message.includes(String(live.workOrder.id))) {
    findings.push(`response must reference ${rel} or ${String(live.workOrder.id)}`);
  }
  if (findings.length === 0) {
    closeBinding({ cwd, sessionId, config });
    return;
  }
  const reason = `[Debugging Workflow Guard] Debug workflow cannot stop:
- ${findings.join("\n- ")}
Use the debug-workflow CLI to update the ledger; do not invent receipt ids.`;
  if (config.mode === "block") writeJson2(stopDeny(reason));
  else writeJson2(contextOutput("Stop", reason));
}
async function handleSoftwareDebugging({ args, event }) {
  const mode = args[0];
  const outputs = [];
  return outputStore.run(outputs, async () => {
    if (mode === "session") await runSession(event);
    else if (mode === "pre") await runPre(event);
    else if (mode === "post") await runPost(event, false);
    else if (mode === "failure") await runPost(event, true);
    else if (mode === "stop") await runStop(event);
    else throw new Error(`unknown debugging mode: ${mode ?? "(missing)"}`);
    return outputs;
  });
}

// plugins/engineering-workflow/src/domains/specification/hook.ts
import { existsSync as existsSync2, realpathSync as realpathSync3 } from "node:fs";
import { basename as basename2, dirname as dirname3, isAbsolute as isAbsolute3, resolve as resolve7 } from "node:path";
var ARTIFACTS = /* @__PURE__ */ new Set(["spec.md", "plan.md", "tasks.md"]);
var TARGET_PATH_CODES = /* @__PURE__ */ new Set(["invalid-change-name", "invalid-spec-root", "symlink-artifact", "artifact-read-error"]);
function isArtifactName(value) {
  return value !== void 0 && ARTIFACTS.has(value);
}
function isErrno(error) {
  return isRecord(error) && typeof error.code === "string";
}
function targets(event) {
  const core = extractFileTargets(event, { includeShellWrites: true });
  if (!isShellTool(eventToolName(event))) return core;
  const cwd = resolve7(eventCwd(event));
  const extras = [];
  const command = extractShellCommand(event) ?? "";
  for (const match of command.matchAll(/\b(?:cp|mv|install)\b(?:\s+-[^\s]+)*\s+[^\s;&|]+\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    const raw = String(match[1] ?? "").trim().replace(/^['"]|['"]$/gu, "");
    if (raw && !raw.startsWith("-")) extras.push(isAbsolute3(raw) ? resolve7(raw) : resolve7(cwd, raw.replace(/^\.\//u, "")));
  }
  return [.../* @__PURE__ */ new Set([...core, ...extras])];
}
function directArtifactTarget(path, workspaceRoot) {
  const absolute = resolve7(path);
  const changeDir = dirname3(absolute);
  if (dirname3(changeDir) !== resolve7(workspaceRoot, ".specs")) return null;
  const artifact = absolute.split("/").at(-1);
  if (!isArtifactName(artifact)) return null;
  return { artifact, changeDir };
}
function canonicalPath(path) {
  let cursor = resolve7(path);
  const suffix = [];
  while (true) {
    try {
      return resolve7(realpathSync3(cursor), ...suffix);
    } catch (error) {
      if (!isErrno(error) || error.code !== "ENOENT" && error.code !== "ENOTDIR") return resolve7(path);
    }
    const parent = dirname3(cursor);
    if (parent === cursor) return resolve7(path);
    suffix.unshift(basename2(cursor));
    cursor = parent;
  }
}
function repositoryRoot(start) {
  let cursor = resolve7(start);
  while (true) {
    if (existsSync2(resolve7(cursor, ".git"))) return cursor;
    const parent = dirname3(cursor);
    if (parent === cursor) return resolve7(start);
    cursor = parent;
  }
}
function artifactTarget(path, workspaceRoot) {
  return directArtifactTarget(path, workspaceRoot) ?? directArtifactTarget(canonicalPath(path), canonicalPath(workspaceRoot));
}
function deny(reason) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `[SDD Workflow] ${reason}` } };
}
function diagnostic(text) {
  return { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: `[SDD Workflow] ${text}` } };
}
function upstreamFindings(target, inspection) {
  const findings = [];
  if (target.artifact === "plan.md") {
    if (!inspection.spec) findings.push({ code: "missing-spec", message: "Create spec.md first.", artifact: null });
    else findings.push(...inspection.spec.findings);
  }
  if (target.artifact === "tasks.md") {
    if (!inspection.spec) findings.push({ code: "missing-spec", message: "Create spec.md first.", artifact: null });
    else findings.push(...inspection.spec.findings);
    if (!inspection.plan) findings.push({ code: "missing-plan", message: "Create plan.md after spec.md.", artifact: null });
    else findings.push(...inspection.plan.findings);
  }
  return findings;
}
function targetPathFindings(target, inspection) {
  return inspection.findings.filter((item) => TARGET_PATH_CODES.has(item.code) && (item.artifact === target.artifact || item.artifact === target.changeDir.split("/").at(-1)));
}
function evaluateHook(mode, event) {
  const rawCwd = event?.cwd;
  const workspaceRoot = repositoryRoot(typeof rawCwd === "string" ? rawCwd : rawCwd == null ? process.cwd() : String(rawCwd));
  const resolvedTargets = targets(event ?? {});
  const artifacts = resolvedTargets.map((path) => artifactTarget(path, workspaceRoot)).filter((target) => target !== null);
  if (artifacts.length === 0) return null;
  if (mode === "pre") {
    const command = isShellTool(eventToolName(event ?? {})) ? String(extractShellCommand(event ?? {}) ?? "") : "";
    if (command && /(?:&&|\|\||;|\n)/u.test(command)) return deny("Compound shell writes that target .specs artifacts are not safe; write one artifact per tool call.");
    for (const target of artifacts) {
      const sameChange = artifacts.filter((candidate) => candidate.changeDir === target.changeDir).map(({ artifact }) => artifact);
      if (target.artifact === "plan.md" && sameChange.includes("spec.md") || target.artifact === "tasks.md" && (sameChange.includes("spec.md") || sameChange.includes("plan.md"))) {
        return deny("A single tool call cannot change an upstream artifact and its downstream artifact together.");
      }
      const inspection = inspectChange(target.changeDir);
      const findings = [...targetPathFindings(target, inspection), ...upstreamFindings(target, inspection)];
      if (findings.length > 0) return deny(`${target.artifact} is blocked: ${formatFindings(findings)}`);
    }
    return null;
  }
  if (mode === "post") {
    const messages = [];
    for (const target of artifacts) {
      const inspection = inspectChange(target.changeDir);
      const result = target.artifact === "spec.md" ? inspection.spec : target.artifact === "plan.md" ? inspection.plan : inspection.tasks;
      if (!result) messages.push(`${target.artifact} is missing after the write.`);
      else if (result.findings.length > 0) messages.push(`${target.artifact} is invalid: ${formatFindings(result.findings)}`);
    }
    return messages.length > 0 ? diagnostic(messages.join(" ")) : null;
  }
  return null;
}
function handleSpecification({ args, event }) {
  return evaluateHook(args[0] ?? "pre", event);
}

// plugins/engineering-workflow/src/domains/testing/hook.ts
function warn2(message) {
  process.stderr.write(`[test-driven-development] ${message}
`);
}
function sessionStartOutput() {
  const output = additionalContext("SessionStart", [
    "[TDD Method] Test-driven development is advisory.",
    "This Hook does not enforce file order or infer relationships between tests and implementation.",
    "For behavior changes, prefer a focused RED -> GREEN loop and run the same focused test after the last implementation change.",
    "Optional method: load `tdd-red-green`. Skill load is not a Hook prerequisite."
  ].join("\n"));
  return output ? [output] : [];
}
async function handleTesting({ args, event }) {
  if (args[0] !== "session-start") return [];
  if (event.__parseError) {
    warn2("hook input was not valid JSON; advisory context was skipped");
    return [];
  }
  try {
    return sessionStartOutput();
  } catch (error) {
    warn2(`advisory context failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

// plugins/engineering-workflow/src/entries/hooks/dispatcher.ts
var [host, eventName] = process.argv.slice(2);
if (!host || !eventName) throw new Error("dispatcher requires <host> <event>");
await runOwnerDispatcher(host, eventName, {
  debugging: handleSoftwareDebugging,
  specification: handleSpecification,
  testing: handleTesting
});
