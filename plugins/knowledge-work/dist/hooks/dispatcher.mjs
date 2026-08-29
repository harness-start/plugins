// harness-source-hash: sha256:94704f8db952a375e0a6e7819d3587dac9c74d76e988a0b79fc5afa01f5a2ff6
import {
  analyzeAiStyle
} from "../chunks/chunk-3OL33ZYS.mjs";
import {
  canonicalJson,
  sealPayload,
  sha256 as sha2562
} from "../chunks/chunk-ME7WQGIA.mjs";
import {
  SEALED_OR_LATER,
  classifyResearchPath,
  extractResearchRelativePaths,
  findActiveWorkflow,
  isActivePhase,
  pathLooksLikeResearchWrite,
  readWorkflowFile,
  terminalizeWorkflow,
  workflowPath
} from "../chunks/chunk-4YVMWSRX.mjs";
import {
  createAcknowledgement,
  isProtectedReportPath,
  parseAcknowledgement,
  parseReportArgs,
  readReportCandidate,
  reportPath,
  sha256,
  validateAcknowledgement,
  verifyReport
} from "../chunks/chunk-WQUUSJLB.mjs";
import "../chunks/chunk-YRRB7KQT.mjs";
import {
  collectOwnerHookOutput,
  eventAssistantMessage,
  eventCwd,
  eventPrompt,
  eventSessionId,
  eventToolInput,
  eventToolName,
  eventToolResponse,
  isRecord,
  ownerHookHandler,
  readStdinJson
} from "../chunks/chunk-5J4MOKBS.mjs";

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

// plugins/knowledge-work/src/domains/reporting/entries/hooks/work-reporting-hook.ts
import { readFile as readFile3 } from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import { resolve as resolve5 } from "node:path";

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

// plugins/knowledge-work/src/domains/reporting/lib/hook-io.ts
function extractSessionId(event) {
  return eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "hook";
}
function toolReportedFailure(event) {
  if (event.error) return true;
  const response = eventToolResponse(event);
  if (response == null) return false;
  if (typeof response === "string") {
    return /\b(?:exit(?:ed)?\s+(?:code|status)|exit_code)\s*[:=]?\s*[1-9]\d*\b|\b(?:command|tool)\s+failed\b/iu.test(response);
  }
  if (!isRecord(response)) return false;
  if (response.isError === true || response.success === false) return true;
  const exitCode = response.exit_code ?? response.exitCode;
  if (Number.isInteger(exitCode) && exitCode !== 0) return true;
  return /^(?:error|failed|failure)$/iu.test(String(response.status ?? response.outcome ?? ""));
}
function isFileMutationTool2(event) {
  return isFileMutationTool(eventToolName(event));
}
function isShellTool2(event) {
  return isShellTool(eventToolName(event));
}
function extractFileTargets2(event) {
  return extractFileTargets(event, { tools: "any" });
}
function contextOutput(eventName2, text) {
  return additionalContext(eventName2, text);
}
function stopDeny(reason) {
  return stopBlock(reason);
}

// plugins/knowledge-work/src/domains/reporting/lib/hook-policy.ts
import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname as dirname2, isAbsolute as isAbsolute2, join, relative, resolve as resolve3, sep } from "node:path";
import { fileURLToPath } from "node:url";

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

// plugins/knowledge-work/src/domains/reporting/lib/hook-policy.ts
var OFFICIAL = /* @__PURE__ */ new Map([
  ["daily-collect", ["daily", "collect"]],
  ["daily-transcript-scan", ["daily", "scan"]],
  ["daily-prepare", ["daily", "prepare"]],
  ["daily-save", ["daily", "save"]],
  ["weekly-collect", ["weekly", "collect"]],
  ["weekly-transcript-scan", ["weekly", "scan"]],
  ["weekly-prepare", ["weekly", "prepare"]],
  ["weekly-save", ["weekly", "save"]],
  ["summary-collect", ["summary", "collect"]],
  ["summary-transcript-scan", ["summary", "scan"]],
  ["summary-prepare", ["summary", "prepare"]],
  ["summary-save", ["summary", "save"]],
  ["addition-prepare", ["report", "addition-prepare"]],
  ["append", ["report", "append"]],
  ["verify", ["report", "verify"]]
]);
var DEFAULT_PLUGIN_ROOT = fileURLToPath(new URL("../..", import.meta.url));
function tokenize(command) {
  if (/[;&|<>`\n]|\$\(/u.test(command)) return null;
  return (command.match(/"(?:\\.|[^"])*"|'[^']*'|[^\s]+/gu) ?? []).map((token) => {
    if (token.startsWith('"') && token.endsWith('"') || token.startsWith("'") && token.endsWith("'")) return token.slice(1, -1);
    return token;
  });
}
function errorMessage(error) {
  return isRecord(error) && error.message != null ? String(error.message) : String(error);
}
function hasOfficialError(official) {
  return "error" in official;
}
function parseOfficialCommand(command) {
  const tokens = tokenize(String(command ?? ""));
  if (!tokens) return null;
  let index = 0;
  const assignments = [];
  while (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(tokens[index] ?? "")) {
    const assignment = tokens[index];
    if (assignment === void 0) break;
    assignments.push(assignment);
    index += 1;
  }
  if (basename(tokens[index] ?? "") !== "node") return null;
  const script = tokens[index + 1];
  if (basename(script ?? "") !== "harness.mjs" || tokens[index + 2] !== "report") return null;
  const contract = OFFICIAL.get(tokens[index + 3] ?? "");
  if (!contract || script === void 0) return null;
  const [kind, action] = contract;
  if (assignments.some((item) => /^(?:PLUGIN_ROOT|CLAUDE_PLUGIN_ROOT)=/u.test(item))) {
    return { kind, action, script, error: "host-owned plugin root must not be overridden" };
  }
  try {
    return { kind, action, script, args: parseReportArgs(kind, action, tokens.slice(index + 4)) };
  } catch (error) {
    return { kind, action, script, error: errorMessage(error) };
  }
}
async function officialScriptTrusted(official, options = {}) {
  if (!official?.script || basename(official.script) !== "harness.mjs") return false;
  if (/^\$\{(?:PLUGIN_ROOT|CLAUDE_PLUGIN_ROOT)\}\/dist\/cli\/harness\.mjs$/u.test(official.script)) return true;
  const pluginRoot2 = resolve3(options.pluginRoot ?? DEFAULT_PLUGIN_ROOT);
  const cwd = resolve3(options.cwd ?? process.cwd());
  const actual = resolve3(cwd, official.script);
  const expected = join(pluginRoot2, "dist", "cli", basename(official.script));
  return await physicalPath(actual) === await physicalPath(expected);
}
function reportsRoot(home2) {
  return resolve3(home2, ".ai-experts");
}
function inside(candidate, parent) {
  const rel = relative(parent, candidate);
  return rel === "" || rel !== ".." && !rel.startsWith(`..${sep}`);
}
async function physicalPath(path) {
  try {
    return await realpath(path);
  } catch {
    try {
      return join(await realpath(dirname2(path)), basename(path));
    } catch {
      return resolve3(path);
    }
  }
}
async function protectedCandidate(path, home2) {
  const lexical = resolve3(path);
  if (isProtectedReportPath(lexical, home2)) return true;
  const physical = await physicalPath(lexical);
  return isProtectedReportPath(physical, home2);
}
var DIRECT_MUTATORS = /* @__PURE__ */ new Set([
  "chmod",
  "chown",
  "cp",
  "dd",
  "install",
  "mkdir",
  "mv",
  "rm",
  "rsync",
  "shred",
  "tee",
  "touch",
  "truncate",
  "unlink"
]);
var SCRIPT_RUNTIMES = /* @__PURE__ */ new Set(["node", "nodejs", "perl", "python", "python2", "python3", "ruby"]);
var SHELL_RUNTIMES = /* @__PURE__ */ new Set(["bash", "dash", "sh", "zsh"]);
function sedMutates(args) {
  return args.some((argument) => argument === "--in-place" || argument.startsWith("--in-place=") || /^-[A-Za-z]*i[A-Za-z]*$/u.test(argument));
}
function nestedFindCommands(args) {
  const nested = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "-exec" && args[index] !== "-execdir") continue;
    const end = args.findIndex((argument, candidate) => candidate > index && (argument === ";" || argument === "+"));
    const words = args.slice(index + 1, end < 0 ? void 0 : end);
    const invocation = commandInvocation(words);
    if (invocation) nested.push(invocation);
    if (end >= 0) index = end;
  }
  return nested;
}
function invocationMutates(invocation, depth) {
  const executable = invocation.executable.toLowerCase();
  if (DIRECT_MUTATORS.has(executable)) return true;
  if (executable === "sed") return sedMutates(invocation.args);
  if (executable === "find") {
    return invocation.args.includes("-delete") || nestedFindCommands(invocation.args).some((nested) => invocationMutates(nested, depth));
  }
  if (SCRIPT_RUNTIMES.has(executable)) {
    return /(?:writeFile|unlink|rename|truncate|open\s*\([^)]*["']w)/iu.test(invocation.args.join(" "));
  }
  if (depth >= 4) return false;
  if (executable === "eval") return shellMutates(invocation.args.join(" "), depth + 1);
  if (SHELL_RUNTIMES.has(executable)) {
    const commandIndex = invocation.args.findIndex((argument) => /^-[^-]*c/u.test(argument));
    const nested = commandIndex >= 0 ? invocation.args[commandIndex + 1] : void 0;
    return nested !== void 0 && shellMutates(nested, depth + 1);
  }
  return false;
}
function hasOutputRedirection(command) {
  let quote = null;
  let escaped = false;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === ">" && command[index + 1] !== "&") {
      let targetIndex = index + 1;
      if (command[targetIndex] === ">") targetIndex += 1;
      while (/\s/u.test(command[targetIndex] ?? "")) targetIndex += 1;
      const suffix = command.slice(targetIndex);
      const nullTarget = suffix.match(/^(?:"\/dev\/null"|'\/dev\/null'|\/dev\/null)(?=$|[\s;|&])/u);
      if (nullTarget) {
        index = targetIndex + nullTarget[0].length - 1;
        continue;
      }
      return true;
    }
  }
  return false;
}
function shellMutates(command, depth = 0) {
  const text = String(command ?? "");
  return hasOutputRedirection(text) || shellCommandInvocations(text).some((invocation) => invocationMutates(invocation, depth));
}
function recursiveFlag(args) {
  return args.some((argument) => argument === "--recursive" || /^-[^-]*[rR]/u.test(argument) && argument !== "--");
}
function invocationMutatesTree(invocation, depth) {
  const executable = invocation.executable.toLowerCase();
  if (executable === "find") return invocationMutates(invocation, depth);
  if (executable === "mv") return true;
  if (["chmod", "chown", "cp", "rm", "rsync"].includes(executable)) return recursiveFlag(invocation.args);
  if (depth >= 4) return false;
  if (executable === "eval") return shellMutatesTree(invocation.args.join(" "), depth + 1);
  if (SHELL_RUNTIMES.has(executable)) {
    const commandIndex = invocation.args.findIndex((argument) => /^-[^-]*c/u.test(argument));
    const nested = commandIndex >= 0 ? invocation.args[commandIndex + 1] : void 0;
    return nested !== void 0 && shellMutatesTree(nested, depth + 1);
  }
  return false;
}
function shellMutatesTree(command, depth = 0) {
  return shellCommandInvocations(String(command ?? "")).some((invocation) => invocationMutatesTree(invocation, depth));
}
function shellTokens(command, home2) {
  const raw = String(command ?? "").match(/"(?:\\.|[^"])*"|'[^']*'|[^\s;|&<>`]+/gu) ?? [];
  return raw.map((token) => token.replace(/^['"]|['"]$/gu, "")).map((token) => token.replace(/^\$\{HOME\}|^\$HOME|^~/u, home2)).filter((token) => token && !token.startsWith("-") && (isAbsolute2(token) || token.startsWith(".")));
}
async function shellTargetsReports(command, cwd, home2) {
  const root = reportsRoot(home2);
  if (String(command).includes(".ai-experts")) return true;
  const mutatesTree = shellMutatesTree(command);
  for (const token of shellTokens(command, home2)) {
    const candidate = resolve3(cwd, token);
    const physical = await physicalPath(candidate);
    if (isProtectedReportPath(candidate, home2) || isProtectedReportPath(physical, home2)) return true;
    if (mutatesTree && (inside(root, candidate) || inside(candidate, root) || inside(root, physical) || inside(physical, root))) return true;
  }
  return false;
}
function denyReason(detail) {
  return `[Work Report Insights] Protected report

${detail}
Confirmed report bytes are immutable. Use the plugin prepare/confirm/save or addition-prepare/confirm/append workflow.`;
}
function requiredArg(value, flag) {
  if (value === void 0) throw new Error(`${flag} is required`);
  return value;
}
async function protectionDecision(event, options = {}) {
  const home2 = resolve3(options.home ?? process.env.HOME ?? homedir());
  const state = options.state ?? { phase: "idle" };
  if (isFileMutationTool2(event)) {
    for (const target of extractFileTargets2(event)) {
      if (await protectedCandidate(target, home2)) return { deny: true, reason: denyReason(`Blocked direct file mutation: ${target}`) };
    }
    return { deny: false };
  }
  if (!isShellTool2(event)) return { deny: false };
  const command = extractShellCommand(event) ?? "";
  const official = parseOfficialCommand(command);
  if (official && hasOfficialError(official)) return { deny: true, reason: denyReason(`Invalid official command: ${official.error}`) };
  if (official) {
    if (!await officialScriptTrusted(official, { pluginRoot: options.pluginRoot, cwd: eventCwd(event) })) {
      return { deny: true, reason: denyReason("A reserved official command name was invoked from an untrusted script path.") };
    }
    if (official.action !== "save" && official.action !== "append") return { deny: false, official };
    const requiredPhase = official.args.contract ? "acknowledged" : "prepared";
    if (state.phase !== requiredPhase || state.operation !== official.action) return { deny: true, reason: denyReason(official.args.contract ? "The V2 candidate has not received a valid employee acknowledgement." : "The candidate has not been prepared.") };
    const candidate = await readReportCandidate(official.args, eventCwd(event));
    if (state.candidatePath !== candidate.candidatePath || state.candidateSha256 !== sha256(candidate.body)) return { deny: true, reason: denyReason("The candidate bytes changed after confirmation.") };
    if (candidate.evidencePath !== state.evidencePath) return { deny: true, reason: denyReason("The evidence bundle changed after confirmation.") };
    const target = official.action === "save" ? reportPath({ kind: official.kind, ...official.args, home: home2 }) : resolve3(eventCwd(event), requiredArg(official.args.report, "--report"));
    if (state.target !== target) return { deny: true, reason: denyReason("The confirmed target does not match this command.") };
    if (official.action === "append" && state.reportSha256 !== sha256(await readFile(target))) {
      return { deny: true, reason: denyReason("The sealed report changed after the addition was prepared.") };
    }
    return { deny: false, official };
  }
  if (shellMutates(command) && await shellTargetsReports(command, eventCwd(event), home2)) {
    return { deny: true, reason: denyReason("Shell mutation targets the report tree or a resolved report symlink.") };
  }
  return { deny: false };
}

// plugins/knowledge-work/src/domains/reporting/lib/hook-state.ts
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile as readFile2, rename, rm, writeFile } from "node:fs/promises";
import { dirname as dirname3, join as join3, resolve as resolve4 } from "node:path";

// core/src/plugin-workdir.ts
import { mkdirSync, readFileSync as readFileSync2, writeFileSync } from "node:fs";
import { join as join2 } from "node:path";
var PLUGIN_WORKDIR_GITIGNORE = "*\n";
function normalizeGitignore(text) {
  return String(text ?? "").replace(/\r\n/gu, "\n").trim();
}
function isStalePluginWorkdirGitignore(text) {
  const value = normalizeGitignore(text);
  return value === "" || value === "state/" || value === "sessions/";
}
function ensurePluginWorkdirGitignore(pluginRoot2) {
  mkdirSync(pluginRoot2, { recursive: true, mode: 448 });
  const ignore = join2(pluginRoot2, ".gitignore");
  let current = null;
  try {
    current = readFileSync2(ignore, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (current !== null && normalizeGitignore(current) === "*") return;
  if (current !== null && !isStalePluginWorkdirGitignore(current)) return;
  writeFileSync(ignore, PLUGIN_WORKDIR_GITIGNORE, { encoding: "utf8", mode: 384 });
}

// plugins/knowledge-work/src/domains/reporting/lib/hook-state.ts
var VERSION = 2;
var STATE_DIR_RELATIVE = ".work-reporting/.state";
function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
function emptyState() {
  return {
    version: VERSION,
    phase: "idle",
    kind: null,
    candidateSha256: null,
    candidatePath: null,
    reportSha256: null,
    target: null,
    operation: null,
    evidencePath: null,
    contractDigest: null,
    evidenceDigest: null,
    ackToken: null,
    acknowledgementDigest: null,
    lastError: null,
    updatedAt: 0
  };
}
function dataRoot(event, env = process.env) {
  if (env.WORK_REPORT_INSIGHTS_DATA) return resolve4(env.WORK_REPORT_INSIGHTS_DATA);
  return join3(resolve4(eventCwd(event)), STATE_DIR_RELATIVE);
}
function statePath(event, env = process.env) {
  const session = extractSessionId(event) || "default";
  return join3(dataRoot(event, env), `${digest(session)}.json`);
}
async function readState(event, env = process.env) {
  try {
    const parsed = JSON.parse(await readFile2(statePath(event, env), "utf8"));
    if (!isRecord(parsed) || parsed.version !== VERSION) return emptyState();
    return { ...emptyState(), ...parsed, version: VERSION };
  } catch {
    return emptyState();
  }
}
async function writeState(event, state, env = process.env) {
  const path = statePath(event, env);
  await mkdir(dirname3(path), { recursive: true, mode: 448 });
  const storageRoot = env.WORK_REPORT_INSIGHTS_DATA ? resolve4(env.WORK_REPORT_INSIGHTS_DATA) : join3(resolve4(eventCwd(event)), ".work-reporting");
  ensurePluginWorkdirGitignore(storageRoot);
  const temporary = `${path}.${process.pid}.${randomBytes(5).toString("hex")}.tmp`;
  const next = { ...emptyState(), ...state, version: VERSION, updatedAt: Date.now() };
  try {
    await writeFile(temporary, `${JSON.stringify(next)}
`, { encoding: "utf8", mode: 384, flag: "wx" });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {
    });
    throw error;
  }
  return next;
}

// plugins/knowledge-work/src/domains/reporting/entries/hooks/work-reporting-hook.ts
function home(env) {
  return resolve5(env.HOME || homedir2());
}
function errorMessage2(error) {
  return isRecord(error) && error.message != null ? String(error.message) : String(error);
}
function requiredArg2(value, flag) {
  if (value === void 0) throw new Error(`${flag} is required`);
  return value;
}
async function prepareState(event, official, env) {
  const state = await readState(event, env);
  const cwd = eventCwd(event);
  const candidate = await readReportCandidate(official.args, cwd);
  const target = official.action === "prepare" ? reportPath({ kind: official.kind, ...official.args, home: home(env) }) : resolve5(cwd, requiredArg2(official.args.report, "--report"));
  let reportSha256 = null;
  if (official.action === "addition-prepare") {
    const report = await readFile3(target, "utf8");
    const checked = verifyReport(report);
    if (!checked.ok) throw new Error(`report cannot be appended: ${checked.reason}`);
    reportSha256 = sha256(report);
  }
  const acknowledgement = candidate.contract && candidate.evidence ? createAcknowledgement(candidate.contract, candidate.evidence) : null;
  await writeState(event, {
    ...state,
    phase: "prepared",
    kind: official.kind === "report" ? state.kind : official.kind,
    candidateSha256: sha256(candidate.body),
    candidatePath: candidate.candidatePath,
    evidencePath: candidate.evidencePath,
    contractDigest: acknowledgement?.contractDigest ?? null,
    evidenceDigest: acknowledgement?.evidenceDigest ?? null,
    ackToken: acknowledgement?.token ?? null,
    acknowledgementDigest: null,
    lastError: null,
    reportSha256,
    target,
    operation: official.action === "prepare" ? "save" : "append"
  }, env);
  if (!acknowledgement || !candidate.contract) return "Candidate digest recorded. Present the complete content and wait for explicit confirmation.";
  const dispositions = candidate.contract.employeeDispositions.map((item) => `${item.findingId}=${item.status}${item.status === "accepted" ? "" : `:${item.reason ?? "reason"}`}`);
  const commitments = candidate.contract.commitments.map((item) => `commit=${item.id}`);
  return `V2 candidate prepared. Require this exact acknowledgement after showing the full report:
# work-report-ack ${acknowledgement.token} | ${[...dispositions, ...commitments].join(" | ")}`;
}
async function runPre(event, env) {
  const state = await readState(event, env);
  const command = isShellTool2(event) ? extractShellCommand(event) : null;
  const official = parseOfficialCommand(command);
  const trusted = Boolean(official && !hasOfficialError(official) && await officialScriptTrusted(official, { cwd: eventCwd(event) }));
  if (trusted && official && !hasOfficialError(official) && (official.action === "prepare" || official.action === "addition-prepare")) {
    try {
      const message = await prepareState(event, official, env);
      writeJson(contextOutput("PreToolUse", `[Work Report Insights] ${message}`));
    } catch (error) {
      writeJson(preToolDeny(`[Work Report Insights] Prepare denied: ${errorMessage2(error)}`));
    }
    return;
  }
  const decision = await protectionDecision(event, { home: home(env), state });
  if (decision.deny) writeJson(preToolDeny(decision.reason));
}
async function runPost(event, env) {
  if (!isShellTool2(event)) return;
  const official = parseOfficialCommand(extractShellCommand(event));
  if (!official || hasOfficialError(official)) return;
  const state = await readState(event, env);
  if (official.action === "collect" || official.action === "scan") {
    await writeState(event, { ...state, phase: "evidence-collected", kind: official.kind === "report" ? state.kind : official.kind }, env);
    return;
  }
  if (official.action !== "save" && official.action !== "append") return;
  if (toolReportedFailure(event) || state.phase !== "prepared" && state.phase !== "acknowledged" || state.operation !== official.action) return;
  try {
    const target = official.action === "save" ? reportPath({ kind: official.kind, ...official.args, home: home(env) }) : resolve5(eventCwd(event), requiredArg2(official.args.report, "--report"));
    if (target !== state.target) return;
    const content = await readFile3(target, "utf8");
    const checked = verifyReport(content);
    if (!checked.ok) return;
    if (official.action === "save" && checked.digest !== state.candidateSha256) return;
    if (official.action === "append" && sha256(content) === state.reportSha256) return;
    if (official.action === "save" && state.contractDigest) {
      const ledger = JSON.parse(await readFile3(`${target}.ledger.json`, "utf8"));
      if (ledger.schema !== "WorkReportLedgerV2" || ledger.reportDigest !== checked.digest || ledger.contractDigest !== state.contractDigest || ledger.evidenceDigest !== state.evidenceDigest) return;
    }
    await writeState(event, { ...state, phase: "sealed", target, candidateSha256: null, candidatePath: null, operation: null }, env);
    writeJson(contextOutput("PostToolUse", `[Work Report Insights] Sealed report verified: ${target}
SHA-256: ${checked.digest}`));
  } catch {
  }
}
function reportIntent(prompt) {
  return /(?:\u5199|\u751f\u6210|\u6574\u7406|\u590d\u76d8|\u603b\u7ed3|create|write|review|summari[sz]e).{0,16}(?:\u65e5\u62a5|\u5468\u62a5|\u5de5\u4f5c\u603b\u7ed3|\u9636\u6bb5\u603b\u7ed3|\u5de5\u4f5c\u590d\u76d8|work\s+report|weekly\s+report|daily\s+report)|(?:\u65e5\u62a5|\u5468\u62a5|\u5de5\u4f5c\u603b\u7ed3|\u9636\u6bb5\u603b\u7ed3|\u5de5\u4f5c\u590d\u76d8).{0,16}(?:\u5199|\u751f\u6210|\u6574\u7406|\u590d\u76d8|\u603b\u7ed3)/iu.test(prompt);
}
async function runPrompt(event, env) {
  const prompt = eventPrompt(event).trim();
  const state = await readState(event, env);
  if (prompt.startsWith("# work-report-ack")) {
    if (state.phase !== "prepared" || !state.ackToken || !state.candidatePath || !state.evidencePath) {
      writeJson(contextOutput("UserPromptSubmit", "[Work Report Insights] Acknowledgement rejected: no matching prepared V2 report."));
      return;
    }
    try {
      const candidate = await readReportCandidate({ contract: state.candidatePath, evidence: state.evidencePath });
      if (!candidate.contract || !candidate.evidence) throw new Error("prepared V2 inputs are unavailable");
      const current = createAcknowledgement(candidate.contract, candidate.evidence, "digest-check");
      if (current.contractDigest !== state.contractDigest || current.evidenceDigest !== state.evidenceDigest) throw new Error("contract or evidence changed after prepare");
      const parsed = parseAcknowledgement(prompt);
      const checked = validateAcknowledgement(parsed, { token: state.ackToken, contractDigest: state.contractDigest, evidenceDigest: state.evidenceDigest }, candidate.contract);
      if (!checked.ok) throw new Error(checked.errors.join("; "));
      await writeState(event, { ...state, phase: "acknowledged", acknowledgementDigest: sha256(JSON.stringify(parsed)), lastError: null }, env);
      writeJson(contextOutput("UserPromptSubmit", "[Work Report Insights] Employee acknowledgement recorded; the prepared V2 candidate may now be saved."));
    } catch (error) {
      writeJson(contextOutput("UserPromptSubmit", `[Work Report Insights] Acknowledgement rejected: ${errorMessage2(error)}`));
    }
    return;
  }
  if (!reportIntent(prompt)) return;
  await writeState(event, { ...state, phase: state.phase === "idle" ? "routed" : state.phase }, env);
  writeJson(contextOutput("UserPromptSubmit", "[Work Report Insights] Route this request through `$work-report-authoring`. Select the period, collect EvidenceBundleV2, build WorkReportContractV2, obtain exact employee acknowledgement, then save."));
}
async function runSession(event, env) {
  const state = await readState(event, env);
  if (state.phase === "idle" || state.phase === "sealed") return;
  writeJson(contextOutput("SessionStart", `[Work Report Insights] Resume unfinished work-report workflow at phase: ${state.phase}.`));
}
async function runFailure(event, env) {
  if (!isShellTool2(event)) return;
  const official = parseOfficialCommand(extractShellCommand(event));
  if (!official || hasOfficialError(official)) return;
  const state = await readState(event, env);
  await writeState(event, { ...state, lastError: `official ${official.action} failed; inspect the tool error and retry from ${state.phase}` }, env);
  writeJson(contextOutput("PostToolUseFailure", `[Work Report Insights] Official ${official.action} failed. State remains ${state.phase}; fix the reported cause and retry the same stage.`));
}
async function runStop(event, env) {
  if (event.stop_hook_active === true) return;
  const state = await readState(event, env);
  if (state.phase === "idle" || state.phase === "sealed") return;
  const message = eventAssistantMessage(event);
  if (/(?:\u62a5\u544a|\u65e5\u62a5|\u5468\u62a5|\u603b\u7ed3).{0,12}(?:\u5df2\u4fdd\u5b58|\u5df2\u5199\u5165|\u5df2\u751f\u6210|\u5b8c\u6210)|(?:saved|wrote|generated).{0,16}report/iu.test(message)) {
    writeJson(stopDeny("[Work Report Insights] A report completion claim requires a successful save and a verified SHA-256 seal. Continue the interview or complete prepare \u2192 confirmation \u2192 save."));
  }
}
async function main() {
  const mode = process.argv[2] ?? "pre";
  const event = await readStdinJson();
  if (event.__parseError) return;
  const env = process.env;
  try {
    if (mode === "prompt" || mode === "UserPromptSubmit") await runPrompt(event, env);
    else if (mode === "session" || mode === "SessionStart") await runSession(event, env);
    else if (mode === "pre" || mode === "PreToolUse") await runPre(event, env);
    else if (mode === "post" || mode === "PostToolUse") await runPost(event, env);
    else if (mode === "failure" || mode === "PostToolUseFailure") await runFailure(event, env);
    else if (mode === "stop" || mode === "Stop") await runStop(event, env);
  } catch (error) {
    if (mode === "pre" || mode === "PreToolUse") {
      writeJson(preToolDeny(`[Work Report Insights] Protection check failed closed: ${errorMessage2(error)}`));
    } else {
      process.stderr.write(`[work-reporting] ${errorMessage2(error)}
`);
    }
  }
}

// plugins/knowledge-work/src/domains/research/entries/hooks/evidence-based-research.ts
import { join as join6, resolve as resolve8 } from "node:path";

// plugins/knowledge-work/src/domains/research/lib/seal-validator.ts
import { readFile as readFile4 } from "node:fs/promises";
import { join as join4, resolve as resolve6 } from "node:path";
function parseTrailer(message) {
  const match = String(message).match(/(?:^|\n)Research-Evidence: research-evidence\/v1\nResearch-Run: ([a-z0-9-]+)\nResearch-Seal: (sha256:[a-f0-9]{64})(?:\n|$)/u);
  const runId = match?.[1];
  const seal = match?.[2];
  return runId && seal ? { runId, seal } : null;
}
async function validateSealedArtifacts({ workspaceRoot, runId, seal, promptEpoch, mutationRevision }) {
  const findings = [];
  if (typeof runId !== "string" || !/^r-[a-z0-9-]+$/u.test(runId)) return ["invalid research run id"];
  const directory2 = join4(resolve6(workspaceRoot), ".research", "runs", runId);
  let manifest;
  let report;
  try {
    const parsed = JSON.parse(await readFile4(join4(directory2, "research.json"), "utf8"));
    if (!isRecord(parsed)) return ["research manifest is missing or invalid JSON"];
    manifest = parsed;
  } catch {
    return ["research manifest is missing or invalid JSON"];
  }
  try {
    report = await readFile4(join4(directory2, "report.md"), "utf8");
  } catch {
    return ["research report is missing"];
  }
  if (manifest.schema !== "research-manifest/v1" || manifest.run_id !== runId) findings.push("research manifest identity mismatch");
  const { integrity, ...base } = manifest;
  const integrityRecord = isRecord(integrity) ? integrity : null;
  if (!integrityRecord || integrityRecord.seal !== seal) findings.push("research seal does not match manifest");
  const manifestPayloadHash = sha2562(canonicalJson(base));
  const reportHash = sha2562(report);
  if (integrityRecord?.manifest_payload_sha256 !== manifestPayloadHash) findings.push("manifest hash mismatch");
  if (integrityRecord?.report_sha256 !== reportHash) findings.push("report hash mismatch");
  const expectedPayload = sealPayload({ runId, promptEpoch: base.prompt_epoch, mutationRevision: base.mutation_revision, manifestPayloadHash, reportHash });
  const expectedSeal = `sha256:${sha2562(canonicalJson(expectedPayload))}`;
  if (expectedSeal !== seal) findings.push("research seal digest mismatch");
  if (promptEpoch !== void 0 && base.prompt_epoch !== promptEpoch) findings.push("research seal is from a stale prompt epoch");
  if (mutationRevision !== void 0 && base.mutation_revision !== mutationRevision) findings.push("workspace changed after research seal");
  return [...new Set(findings)];
}

// plugins/knowledge-work/src/domains/research/lib/state-store.ts
import { createHash as createHash2, randomBytes as randomBytes2 } from "node:crypto";
import { mkdirSync as mkdirSync2, readFileSync as readFileSync3, readdirSync, unlinkSync, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname as dirname4, join as join5, resolve as resolve7 } from "node:path";

// plugins/knowledge-work/src/domains/research/lib/hook-io.ts
function sessionId(event) {
  return eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || null;
}
function shellCommand(event) {
  return extractShellCommand(event);
}
function fileMutation(event) {
  return isFileMutationTool(eventToolName(event));
}

// plugins/knowledge-work/src/domains/research/lib/state-store.ts
var TTL_MS = 24 * 60 * 60 * 1e3;
function hash(value) {
  return createHash2("sha256").update(String(value)).digest("hex");
}
var STATE_DIR_RELATIVE2 = ".research/state";
function ensureStateDir(directory2) {
  mkdirSync2(directory2, { recursive: true, mode: 448 });
  ensurePluginWorkdirGitignore(dirname4(directory2));
}
function directory(event) {
  const session = sessionId(event) || "default";
  const target = join5(resolve7(eventCwd(event)), STATE_DIR_RELATIVE2, "hook-events", hash(session));
  return target;
}
function payloadFromUnknown(value) {
  if (!isRecord(value)) return {};
  const payload = {};
  if (typeof value.abort === "boolean") payload.abort = value.abort;
  if (typeof value.runId === "string" || value.runId === null) payload.runId = value.runId;
  if (typeof value.tool === "string") payload.tool = value.tool;
  if (typeof value.seal === "string" || value.seal === null) payload.seal = value.seal;
  if (typeof value.promptEpoch === "number") payload.promptEpoch = value.promptEpoch;
  if (typeof value.revision === "number") payload.revision = value.revision;
  if (typeof value.eventId === "string" || value.eventId === null) payload.eventId = value.eventId;
  if (typeof value.observedAt === "number") payload.observedAt = value.observedAt;
  if (typeof value.conservative === "boolean") payload.conservative = value.conservative;
  return payload;
}
function appendStateEvent(event, type, payload = {}) {
  const target = directory(event);
  if (!target) return false;
  try {
    ensureStateDir(join5(resolve7(eventCwd(event)), STATE_DIR_RELATIVE2));
    mkdirSync2(target, { recursive: true, mode: 448 });
    const stamp = `${String(Date.now()).padStart(13, "0")}-${process.hrtime.bigint()}-${process.pid}-${randomBytes2(5).toString("hex")}`;
    writeFileSync2(join5(target, `${stamp}.json`), `${JSON.stringify({ version: 1, type, at: Date.now(), payload })}
`, { encoding: "utf8", mode: 384, flag: "wx" });
    return true;
  } catch {
    return false;
  }
}
function readState2(event) {
  const workspace = resolve7(eventCwd(event));
  const workflow = findActiveWorkflow(workspace);
  const state = {
    promptEpoch: 0,
    revision: 0,
    active: false,
    aborted: false,
    abortedRunId: null,
    completed: false,
    completedRunId: null,
    seal: null,
    runId: workflow?.run_id ?? null,
    receipts: [],
    workflow,
    workflowPhase: workflow?.phase ?? null
  };
  const target = directory(event);
  if (target) {
    let files;
    try {
      files = readdirSync(target).filter((name) => name.endsWith(".json")).sort();
    } catch {
      files = [];
    }
    for (const file of files) {
      let item;
      try {
        const parsed = JSON.parse(readFileSync3(join5(target, file), "utf8"));
        if (!isRecord(parsed)) continue;
        item = parsed;
      } catch {
        continue;
      }
      if (Date.now() - Number(item.at ?? 0) > TTL_MS) {
        try {
          unlinkSync(join5(target, file));
        } catch {
        }
        continue;
      }
      const payload = payloadFromUnknown(item.payload);
      if (item.type === "prompt") {
        state.promptEpoch += 1;
        if (payload.abort === true) {
          state.aborted = true;
          state.abortedRunId = payload.runId ?? state.runId;
          state.runId = payload.runId ?? state.runId;
        }
      } else if (item.type === "mutation") {
        state.revision += 1;
        state.seal = null;
      } else if (item.type === "receipt") {
        state.receipts.push(payload);
        if (payload.tool === "research_begin") {
          state.runId = payload.runId ?? state.runId;
          state.seal = null;
          state.aborted = false;
          state.completed = false;
        }
        if (payload.tool === "research_seal" && (!state.runId || payload.runId === state.runId)) state.seal = payload;
      } else if (item.type === "complete") {
        if (!payload.runId || !state.runId || payload.runId === state.runId) {
          state.completed = true;
          state.completedRunId = payload.runId ?? state.runId;
          state.runId = payload.runId ?? state.runId;
        }
      }
    }
  }
  const runWorkflow = state.runId ? readWorkflowFile(workflowPath(workspace, state.runId)) : null;
  if (state.aborted && runWorkflow && runWorkflow.phase !== "aborted") state.aborted = false;
  if (state.completed && runWorkflow && runWorkflow.phase !== "complete") state.completed = false;
  if (workflow && state.aborted && state.abortedRunId !== workflow.run_id) state.aborted = false;
  if (workflow && state.completed && state.completedRunId !== workflow.run_id) state.completed = false;
  if (state.aborted || state.completed) {
    state.active = false;
    return state;
  }
  if (workflow && isActivePhase(workflow.phase)) {
    state.active = true;
    state.runId = workflow.run_id;
    if (state.seal?.runId !== state.runId) state.seal = null;
  } else if (state.receipts.some((item) => item.tool === "research_begin")) {
    const begun = [...state.receipts].reverse().find((item) => item.tool === "research_begin");
    if (begun && !state.aborted && !state.completed) {
      state.active = true;
      state.runId = begun.runId ?? state.runId;
      if (state.seal?.runId !== state.runId) state.seal = null;
    }
  }
  return state;
}

// plugins/knowledge-work/src/domains/research/entries/hooks/evidence-based-research.ts
var MCP_TOOL = /(?:^|_)research_provenance__(research_begin|source_capture|source_read|source_anchor|research_status|research_seal)$/iu;
var SESSION_CONTEXT = [
  "[Research Provenance Guard] Research entry routing",
  "Invoke research-evidence-workflow and open a project run under .research/runs/ when the final deliverable requires multiple sourced claims, a durable evidence package, or persistent research state.",
  "Use the current host's built-in web search for candidate discovery: Claude Code uses WebSearch/WebFetch; Codex uses its registered web search tool. Do not require provider API keys or standalone search CLIs.",
  "Invoke the bundled handoff method only after the run is sealed and handoffs/outbound files exist.",
  "Hard enforcement (CLI block, Stop seal) starts only after a durable project workflow run is open\u2014not because this SessionStart text appeared.",
  "Keep single-URL fetches, single-fact checks, pure local code Q&A, and user-explicit skips on the direct path unless the requested deliverable needs that durable research contract."
].join("\n");
function objectLike(value) {
  return typeof value === "object" && value !== null;
}
function mcpMethod(event) {
  return String(eventToolName(event)).match(MCP_TOOL)?.[1] ?? null;
}
function responsePayload(event) {
  const response = eventToolResponse(event);
  if (objectLike(response) && objectLike(response.structuredContent)) return response.structuredContent;
  if (objectLike(response) && Array.isArray(response.content)) {
    const textItem = response.content.find((item) => objectLike(item) && item.type === "text");
    const text = objectLike(textItem) && typeof textItem.text === "string" ? textItem.text : void 0;
    try {
      const parsed = JSON.parse(String(text));
      return objectLike(parsed) ? parsed : null;
    } catch {
    }
  }
  if (typeof response === "string") {
    try {
      const parsed = JSON.parse(response);
      return objectLike(parsed) ? parsed : null;
    } catch {
    }
  }
  return null;
}
function writeTargetClasses(event) {
  const command = shellCommand(event) ?? "";
  const serialized = JSON.stringify(eventToolInput(event)) + command;
  if (!pathLooksLikeResearchWrite(serialized)) return [];
  const paths = extractResearchRelativePaths(serialized);
  if (paths.length === 0) return ["orchestration"];
  return [...new Set(paths.map((path) => classifyResearchPath(path)))];
}
function callsFirecrawlCli(command) {
  return String(command ?? "").split(/(?:&&|\|\||[;|\n])/u).some((segment) => /^(?:(?:command|sudo)(?:\s+--?[^\s]+)*\s+)*(?:env(?:\s+[A-Za-z_][A-Za-z0-9_]*=[^\s]+)*\s+)?(?:npx(?:\s+--?[^\s]+)*\s+)?["']?(?:[^\s"']*\/)?firecrawl["']?(?:\s|$)/iu.test(segment.trim()));
}
function shellCommandIsReadOnly(command) {
  const value = String(command ?? "").trim();
  if (!value || /[<>`]|\$\(/u.test(value)) return false;
  const invocations = shellCommandInvocations(value);
  if (invocations.length === 0) return false;
  return invocations.every(({ executable, args }) => {
    if ((/* @__PURE__ */ new Set(["cat", "file", "grep", "head", "jq", "ls", "pwd", "rg", "stat", "tail", "wc"])).has(executable)) {
      return executable !== "rg" || !args.some((arg) => arg === "--pre" || arg.startsWith("--pre="));
    }
    if (executable === "sed") return !args.some((arg) => arg === "--in-place" || arg.startsWith("--in-place=") || /^-[^-]*i/u.test(arg));
    if (executable === "find") return !args.some((arg) => ["-delete", "-exec", "-execdir", "-fprint", "-fprint0", "-fprintf", "-fls", "-ok", "-okdir"].includes(arg));
    if (executable === "git") return ["diff", "log", "rev-parse", "show", "status"].includes(args[0] ?? "") && !args.some((arg) => arg === "--output" || arg.startsWith("--output="));
    return executable === "node" && args[0] === "--check";
  });
}
function trustedWorkflowCommand(command, subcommand) {
  const pluginRoot2 = process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT;
  if (!pluginRoot2) return false;
  const script = join6(resolve8(pluginRoot2), "dist", "cli", "harness.mjs");
  const value = String(command ?? "").trim();
  if (/[\n;&|><`]|\$\(/u.test(value)) return false;
  const exact = [
    `node "${script}" research ${subcommand}`,
    `node '${script}' research ${subcommand}`,
    `node ${script} research ${subcommand}`
  ].some((prefix) => value === prefix || value.startsWith(`${prefix} `));
  return exact;
}
function destructiveResearchCommand(command) {
  const value = String(command ?? "");
  return /(?:^|[\s;&|])(?:rm|mv|truncate)(?:\s|$)|\bfind\b[^\n]*(?:-delete|-exec\s+rm|-execdir\s+rm)\b/iu.test(value);
}
function preDecision(event, state) {
  const method = mcpMethod(event);
  if (method === "research_begin") {
    if (!appendStateEvent(event, "receipt", { tool: "research_begin_preflight", promptEpoch: state.promptEpoch })) {
      return "research plugin data is unavailable; cannot establish a durable evidence session.";
    }
    const input = eventToolInput(event);
    if (Number(input?.prompt_epoch) !== state.promptEpoch) {
      return `research_begin requires current prompt_epoch=${state.promptEpoch}.`;
    }
    return null;
  }
  if (method === "research_seal" && state.active) {
    const input = eventToolInput(event);
    if (Number(input?.prompt_epoch) !== state.promptEpoch || Number(input?.mutation_revision) !== state.revision) {
      return `research_seal is stale; retry with prompt_epoch=${state.promptEpoch} and mutation_revision=${state.revision}.`;
    }
  }
  if (!state.active) return null;
  const command = shellCommand(event);
  if (callsFirecrawlCli(command)) {
    return "Active research runs must use the host's built-in web search for discovery and source_capture for evidence; direct Firecrawl CLI calls are blocked.";
  }
  const classes = writeTargetClasses(event);
  const shellWrite = command && !shellCommandIsReadOnly(command);
  const mutating = fileMutation(event) || shellWrite;
  if (!mutating || classes.length === 0) return null;
  if (classes.includes("seal")) {
    return "Direct writes to research.json/report.md are blocked; only research_seal may generate canonical evidence artifacts.";
  }
  if (classes.includes("workflow")) {
    return "Direct writes to workflow.json are blocked; use the research workflow CLI, MCP service, or the exact user abort prompt.";
  }
  if (destructiveResearchCommand(command)) {
    return "Destructive changes to an active .research run are blocked; use the exact user abort prompt to abandon it.";
  }
  const sealed = state.workflow && (state.workflow.completeness?.sealed === true || SEALED_OR_LATER.has(state.workflow.phase));
  if (classes.includes("outbound")) {
    if (!sealed) return "Outbound handoff files are blocked until the research run is sealed; finish capture, claims, and research_seal first.";
    return "Direct outbound handoff writes are blocked; use the owner harness research handoff-outbound command with non-empty input files.";
  }
  return null;
}
function post(event) {
  const state = readState2(event);
  const method = mcpMethod(event);
  if (method) {
    const payload = responsePayload(event);
    const rawResponse = eventToolResponse(event);
    const responseIsError = objectLike(rawResponse) && rawResponse.isError === true;
    if (!payload || payload.isError === true || responseIsError) return null;
    appendStateEvent(event, "receipt", {
      tool: method,
      eventId: payload.event_id ?? null,
      runId: payload.run_id ?? state.runId,
      seal: payload.seal ?? null,
      promptEpoch: state.promptEpoch,
      revision: state.revision,
      observedAt: Date.now()
    });
    return null;
  }
  if (!state.active) return null;
  if (state.seal?.seal) return null;
  if (trustedWorkflowCommand(shellCommand(event), "handoff-outbound")) return null;
  let mutated = false;
  if (fileMutation(event)) mutated = appendStateEvent(event, "mutation", { tool: eventToolName(event) });
  else if (shellCommand(event) && !shellCommandIsReadOnly(shellCommand(event))) {
    mutated = appendStateEvent(event, "mutation", { tool: eventToolName(event), conservative: true });
  }
  return mutated ? readState2(event) : null;
}
async function evaluateStop(event) {
  const state = readState2(event);
  if (!state.active || state.aborted) return { allow: true, findings: [], state, trailer: null };
  const trailer = parseTrailer(eventAssistantMessage(event));
  const findings = [];
  if (!trailer) findings.push("final response is missing the exact research-evidence/v1 trailer");
  if (!state.seal?.seal) findings.push("no successful research_seal MCP receipt was observed in this session");
  if (state.seal?.runId && state.runId && state.seal.runId !== state.runId) findings.push("research seal belongs to a different research run");
  if (trailer && state.seal?.seal && (trailer.seal !== state.seal.seal || trailer.runId !== state.seal.runId)) {
    findings.push("final trailer does not match the observed MCP seal receipt");
  }
  if (state.seal && (state.seal.promptEpoch !== state.promptEpoch || state.seal.revision !== state.revision)) {
    findings.push("research seal is stale after a new prompt or workspace mutation");
  }
  if (trailer && findings.length === 0) {
    findings.push(...await validateSealedArtifacts({
      workspaceRoot: resolve8(eventCwd(event)),
      runId: trailer.runId,
      seal: trailer.seal,
      promptEpoch: state.promptEpoch,
      mutationRevision: state.revision
    }));
  }
  return { allow: findings.length === 0, findings: [...new Set(findings)], state, trailer };
}
async function main2(mode = process.argv[2]) {
  const event = await readStdinJson();
  if (event.__parseError) return;
  if (mode === "session") {
    writeJson({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: SESSION_CONTEXT } });
  } else if (mode === "prompt") {
    const text = eventPrompt(event).trim();
    const abort = text === "# research-abort";
    const prior = readState2(event);
    if (!abort && !prior.active) return;
    if (!appendStateEvent(event, "prompt", { abort, runId: prior.runId }) && abort) {
      writeJson({ decision: "block", reason: "research plugin data is unavailable; cannot record research abort." });
      return;
    }
    if (abort) {
      if (prior.workflow && !terminalizeWorkflow(resolve8(eventCwd(event)), prior.workflow.run_id, "aborted")) {
        writeJson({ decision: "block", reason: "research workflow could not be terminalized after the abort request." });
        return;
      }
      writeJson({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: "[Research Provenance Guard] Research abort recorded. Hard mode will not require a seal for this session after abort."
        }
      });
      return;
    }
    const state = readState2(event);
    if (state.active) {
      writeJson({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: `[Research Provenance Guard] Active research run ${state.runId ?? "(unknown)"} phase=${state.workflowPhase ?? "unknown"}; prompt_epoch=${state.promptEpoch}; mutation_revision=${state.revision}. Use research_provenance MCP only for evidence; seal after last mutation; outbound handoff only after sealed.`
        }
      });
    }
  } else if (mode === "pre") {
    const prior = readState2(event);
    const reason = preDecision(event, prior);
    if (reason) writeJson({ decision: "block", reason });
  } else if (mode === "post") {
    post(event);
  } else if (mode === "stop") {
    const result = await evaluateStop(event);
    if (!result.allow) {
      writeJson({
        decision: "block",
        reason: `[Research Provenance Guard] Completion blocked.
- ${result.findings.join("\n- ")}
Recovery: open/use research-evidence-workflow, capture and anchor through research_provenance, call research_seal after the last mutation, paste its exact trailer. Outbound handoff only after seal. To abandon, submit exactly # research-abort.`
      });
    } else if (result.trailer) {
      const terminalized = !result.state.workflow || terminalizeWorkflow(resolve8(eventCwd(event)), result.trailer.runId, "complete");
      const recorded = terminalized && appendStateEvent(event, "complete", { runId: result.trailer.runId });
      if (!recorded || !terminalized) {
        writeJson({ decision: "block", reason: "[Research Provenance Guard] Completion could not be recorded durably; retry Stop without changing the workspace." });
      }
    }
  }
}

// plugins/knowledge-work/src/domains/writing/entries/hooks/professional-writing.ts
import { readFileSync as readFileSync4, statSync } from "node:fs";
import { extname, relative as relative2, resolve as resolve9 } from "node:path";
var MAX_MARKDOWN_BYTES = 256 * 1024;
var MAX_MARKDOWN_FILES = 8;
var MAX_REPORTED_FINDINGS = 20;
var MARKDOWN_EXTENSIONS = /* @__PURE__ */ new Set([".md", ".markdown"]);
var IGNORED_PATH = /(?:^|[\\/])(?:\.acceptance-runs|\.git|\.tmp|build|coverage|dist|node_modules|vendor)(?:[\\/]|$)/u;
function warn(message) {
  process.stderr.write(`[professional-writing] ${message}
`);
}
function professionalWritingContext() {
  const loading = process.env.HARNESS_HOST === "codex" ? "Codex: read each selected Skill from this plugin's `skills/<name>/SKILL.md` before editing prose." : "Claude: invoke each selected plugin Skill through the native Skill tool before editing prose.";
  return [
    "[Professional Writing] Selective writing Skill orchestration",
    loading,
    "Whenever the response requires the user to carry out a procedure, troubleshoot, choose among options, recover from an error, or continue unfinished work, you MUST load `actionable-response` before answering. This is the default for action-heavy responses; do not wait for the user to request concise or ADHD-friendly wording. Never diagnose or label the user.",
    "For a knowledge-only answer or fully completed task, give the answer or result directly and do not manufacture a next action.",
    "Load `visual-explanation` when the user asks to see the topic visually, or when relationships, sequence, hierarchy, or state changes become materially clearer in the smallest useful visual. Do not force a visual onto a simple question.",
    "Use `writing-terse-output` only for an explicit terse-output request.",
    "Select language-specific editing Skills only for an explicit prose rewrite, polishing, naturalness, or de-AI request. Ordinary technical, factual, and conversational responses do not load them.",
    "Exclude code, commands, configuration, machine output, quotations, and exact short replies. Preserve facts, numbers, URLs, identifiers, citations, and Markdown structure."
  ].join("\n");
}
var EDITING_REQUEST = /\b(?:de-?ai|edit|humanize|natural(?:ness)?|polish|rewrite|writing style)\b|去\s*AI\s*味|改写|改成|润色|自然(?:一点|些|的)?|写得更/iu;
var DE_AI_REQUEST = /\b(?:de-?ai|humanize)\b|去\s*AI\s*味|去机器味|去模板味|AI\s*味/iu;
var MARKDOWN_REQUEST = /\bmarkdown\b|\.(?:md|markdown)\b/iu;
var CHINESE_TEXT = new RegExp("\\p{Script=Han}", "u");
var ENGLISH_TEXT = /[A-Za-z]{3}/u;
function writingPromptContext(event) {
  const prompt = eventPrompt(event);
  if (!prompt || !EDITING_REQUEST.test(prompt)) return "";
  const methods = [];
  if (CHINESE_TEXT.test(prompt)) methods.push("`writing-chinese-prose`");
  if (CHINESE_TEXT.test(prompt) && DE_AI_REQUEST.test(prompt)) methods.push("`ai-flavor-remover`");
  if (ENGLISH_TEXT.test(prompt)) methods.push("`writing-english-prose`");
  if (MARKDOWN_REQUEST.test(prompt)) methods.push("`writing-markdown-ai-style`");
  if (!methods.length) return "";
  return [
    "[Professional Writing] Explicit prose-editing route",
    `Load each listed bundled method before editing: ${[...new Set(methods)].join(", ")}.`,
    ...MARKDOWN_REQUEST.test(prompt) ? ["Run the public analyzer as `node <plugin>/dist/cli/harness.mjs writing analyze <file>` before and after editing; findings are evidence, not automatic rewrite commands."] : [],
    "Preserve facts, numbers, URLs, identifiers, citations, code, and requested structure."
  ].join("\n");
}
async function runSessionStart() {
  const event = await readStdinJson();
  if (event.__parseError) return warn("invalid hook input; advisory context was skipped");
  writeJson(additionalContext("SessionStart", professionalWritingContext()));
}
async function runUserPromptSubmit() {
  const event = await readStdinJson();
  if (event.__parseError) return warn("invalid hook input; prompt routing was skipped");
  const context = writingPromptContext(event);
  if (context) writeJson(additionalContext("UserPromptSubmit", context));
}
function displayPath(cwd, filePath) {
  const local = relative2(cwd, filePath);
  return local && !local.startsWith("..") ? local : filePath;
}
function shellWord(value) {
  if (value.length >= 2 && (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}
function sedInPlaceTargets(event) {
  const command = extractShellCommand(event);
  if (!command) return [];
  const cwd = eventCwd(event);
  const paths = [];
  for (const segment of command.split(/&&|\|\||[;|]/u)) {
    const words = segment.match(/"[^"]*"|'[^']*'|[^\s]+/gu) ?? [];
    const sed = words.findIndex((word) => /(?:^|[\\/])sed$/u.test(shellWord(word)));
    if (sed < 0) continue;
    let index = sed + 1;
    let inPlace = false;
    let expressionProvided = false;
    while (index < words.length) {
      const word = shellWord(words[index] ?? "");
      if (word === "--in-place" || word.startsWith("--in-place=") || /^-[^-]*i/u.test(word)) {
        inPlace = true;
        index += 1;
        continue;
      }
      if (word === "-e" || word === "-f" || word === "--expression" || word === "--file") {
        expressionProvided = true;
        index += 2;
        continue;
      }
      if (word.startsWith("--expression=") || word.startsWith("--file=")) {
        expressionProvided = true;
        index += 1;
        continue;
      }
      if (word.startsWith("-")) {
        index += 1;
        continue;
      }
      break;
    }
    if (!inPlace) continue;
    if (!expressionProvided) index += 1;
    for (const word of words.slice(index)) {
      const target = shellWord(word);
      if (!target || target.startsWith("-") || /[*?[\]<>]/u.test(target)) continue;
      paths.push(resolve9(cwd, target));
    }
  }
  return paths;
}
function markdownTargets(event) {
  const cwd = eventCwd(event);
  const response = eventToolResponse(event);
  const changes = isRecord(response) && isRecord(response.changes) ? Object.keys(response.changes).map((filePath) => resolve9(cwd, filePath)) : [];
  return [.../* @__PURE__ */ new Set([
    ...extractFileTargets(event, { tools: "mutation", includeShellWrites: true }),
    ...sedInPlaceTargets(event),
    ...changes
  ])].filter((filePath) => MARKDOWN_EXTENSIONS.has(extname(filePath).toLowerCase())).filter((filePath) => !IGNORED_PATH.test(filePath)).slice(0, MAX_MARKDOWN_FILES);
}
function scanMarkdownTarget(cwd, filePath) {
  const path = displayPath(cwd, filePath);
  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) return { findings: [], skipped: [] };
    if (stat.size > MAX_MARKDOWN_BYTES) {
      return {
        findings: [],
        skipped: [{ path, reason: `file exceeds the ${MAX_MARKDOWN_BYTES}-byte automatic scan limit` }]
      };
    }
    return {
      findings: analyzeAiStyle(readFileSync4(filePath, "utf8")).map((finding) => ({ ...finding, path })),
      skipped: []
    };
  } catch {
    return { findings: [], skipped: [] };
  }
}
function markdownPostToolReport(event) {
  const cwd = eventCwd(event);
  const findings = [];
  const skipped = [];
  for (const filePath of markdownTargets(event)) {
    const result = scanMarkdownTarget(cwd, filePath);
    findings.push(...result.findings);
    skipped.push(...result.skipped);
  }
  if (!findings.length && !skipped.length) return "";
  return [
    "[Professional Writing] Markdown AI-style findings after observed write",
    ...findings.slice(0, MAX_REPORTED_FINDINGS).map((finding) => `- [${finding.severity}] ${finding.id} ${finding.path}:${finding.line} ${finding.message} ${finding.suggestion}`),
    ...skipped.map((item) => `- [report] ${item.path}: automatic scan skipped because ${item.reason}; run the bundled analyzer CLI explicitly.`),
    "Treat each finding as review evidence, not an automatic rewrite instruction. Preserve facts, quotations, code, links, and intentional voice."
  ].join("\n");
}
async function runPostToolUse(event) {
  const current = event ?? await readStdinJson();
  if (current.__parseError) return warn("invalid hook input; Markdown scan was skipped");
  const report = markdownPostToolReport(current);
  if (report) {
    writeJson(process.env.HARNESS_HOST === "codex" ? {
      continue: false,
      stopReason: "Markdown AI-style review feedback replaced the ordinary tool success output.",
      reason: report
    } : additionalContext("PostToolUse", report));
  }
}

// plugins/knowledge-work/src/entries/hooks/dispatcher.ts
async function runWriting() {
  const mode = process.argv[2] ?? "session";
  if (mode === "post") await runPostToolUse();
  else if (mode === "prompt" || mode === "user-prompt") await runUserPromptSubmit();
  else await runSessionStart();
}
var [host, eventName] = process.argv.slice(2);
if (!host || !eventName) throw new Error("dispatcher requires <host> <event>");
await runOwnerDispatcher(host, eventName, {
  "reporting:work-reporting-hook": ownerHookHandler(main),
  "research:evidence-based-research": ownerHookHandler(main2),
  "writing:professional-writing": ownerHookHandler(runWriting)
});
