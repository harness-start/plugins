#!/usr/bin/env node
// harness-source-hash: sha256:e096cc68d4c4fa272f90a77cf3b4e2e96ed45371fc9cb399770df3f1e57d598d
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
} from "../chunks/chunk-ZJQ5RZVC.mjs";
import {
  eventAssistantMessage,
  eventCwd,
  eventPrompt,
  eventSessionId,
  eventToolInput,
  eventToolName,
  eventToolResponse,
  isRecord,
  readStdinJson
} from "../chunks/chunk-HKHW5YOE.mjs";

// plugins/work-reporting/src/entries/hooks/work-reporting-hook.ts
import { readFile as readFile3 } from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import { resolve as resolve4 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

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
    process.stdout.write(`${JSON.stringify(value)}
`);
  }
}

// core/src/hook-targets.ts
import { isAbsolute, resolve } from "node:path";
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
    raw.map(stripMatchingQuotes).filter(Boolean).map((path) => isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, "")))
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
  const cwd = resolve(eventCwd(event));
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

// plugins/work-reporting/src/lib/hook-io.ts
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
function contextOutput(eventName, text) {
  return additionalContext(eventName, text);
}
function stopDeny(reason) {
  return stopBlock(reason);
}

// plugins/work-reporting/src/lib/hook-policy.ts
import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute as isAbsolute2, join, relative, resolve as resolve2, sep } from "node:path";
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

// plugins/work-reporting/src/lib/hook-policy.ts
var OFFICIAL = /* @__PURE__ */ new Map([
  ["daily-work-report-collect.mjs", ["daily", "collect"]],
  ["daily-work-report-transcript-scan.mjs", ["daily", "scan"]],
  ["daily-work-report-prepare.mjs", ["daily", "prepare"]],
  ["daily-work-report-save.mjs", ["daily", "save"]],
  ["weekly-work-report-collect.mjs", ["weekly", "collect"]],
  ["weekly-work-report-transcript-scan.mjs", ["weekly", "scan"]],
  ["weekly-work-report-prepare.mjs", ["weekly", "prepare"]],
  ["weekly-work-report-save.mjs", ["weekly", "save"]],
  ["work-summary-report-collect.mjs", ["summary", "collect"]],
  ["work-summary-report-transcript-scan.mjs", ["summary", "scan"]],
  ["work-summary-report-prepare.mjs", ["summary", "prepare"]],
  ["work-summary-report-save.mjs", ["summary", "save"]],
  ["work-reporting-addition-prepare.mjs", ["report", "addition-prepare"]],
  ["work-reporting-append.mjs", ["report", "append"]],
  ["work-reporting-verify.mjs", ["report", "verify"]]
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
  const contract = OFFICIAL.get(basename(script ?? ""));
  if (!contract || script === void 0) return null;
  const [kind, action] = contract;
  if (assignments.some((item) => /^(?:PLUGIN_ROOT|CLAUDE_PLUGIN_ROOT)=/u.test(item))) {
    return { kind, action, script, error: "host-owned plugin root must not be overridden" };
  }
  try {
    return { kind, action, script, args: parseReportArgs(kind, action, tokens.slice(index + 2)) };
  } catch (error) {
    return { kind, action, script, error: errorMessage(error) };
  }
}
async function officialScriptTrusted(official, options = {}) {
  if (!official?.script || !OFFICIAL.has(basename(official.script))) return false;
  if (/^\$\{(?:PLUGIN_ROOT|CLAUDE_PLUGIN_ROOT)\}\/dist\/cli\/[a-z0-9-]+\.mjs$/u.test(official.script)) return true;
  const pluginRoot = resolve2(options.pluginRoot ?? DEFAULT_PLUGIN_ROOT);
  const cwd = resolve2(options.cwd ?? process.cwd());
  const actual = resolve2(cwd, official.script);
  const expected = join(pluginRoot, "dist", "cli", basename(official.script));
  return await physicalPath(actual) === await physicalPath(expected);
}
function reportsRoot(home2) {
  return resolve2(home2, ".ai-experts");
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
      return join(await realpath(dirname(path)), basename(path));
    } catch {
      return resolve2(path);
    }
  }
}
async function protectedCandidate(path, home2) {
  const lexical = resolve2(path);
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
    if (character === ">" && command[index + 1] !== "&") return true;
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
    const candidate = resolve2(cwd, token);
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
  const home2 = resolve2(options.home ?? process.env.HOME ?? homedir());
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
    const target = official.action === "save" ? reportPath({ kind: official.kind, ...official.args, home: home2 }) : resolve2(eventCwd(event), requiredArg(official.args.report, "--report"));
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

// plugins/work-reporting/src/lib/hook-state.ts
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile as readFile2, rename, rm, writeFile } from "node:fs/promises";
import { dirname as dirname2, join as join3, resolve as resolve3 } from "node:path";

// core/src/plugin-workdir.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join as join2 } from "node:path";
var PLUGIN_WORKDIR_GITIGNORE = "*\n";
function normalizeGitignore(text) {
  return String(text ?? "").replace(/\r\n/gu, "\n").trim();
}
function isStalePluginWorkdirGitignore(text) {
  const value = normalizeGitignore(text);
  return value === "" || value === "state/" || value === "sessions/";
}
function ensurePluginWorkdirGitignore(pluginRoot) {
  mkdirSync(pluginRoot, { recursive: true, mode: 448 });
  const ignore = join2(pluginRoot, ".gitignore");
  let current = null;
  try {
    current = readFileSync(ignore, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (current !== null && normalizeGitignore(current) === "*") return;
  if (current !== null && !isStalePluginWorkdirGitignore(current)) return;
  writeFileSync(ignore, PLUGIN_WORKDIR_GITIGNORE, { encoding: "utf8", mode: 384 });
}

// plugins/work-reporting/src/lib/hook-state.ts
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
  if (env.WORK_REPORT_INSIGHTS_DATA) return resolve3(env.WORK_REPORT_INSIGHTS_DATA);
  return join3(resolve3(eventCwd(event)), STATE_DIR_RELATIVE);
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
  await mkdir(dirname2(path), { recursive: true, mode: 448 });
  const storageRoot = env.WORK_REPORT_INSIGHTS_DATA ? resolve3(env.WORK_REPORT_INSIGHTS_DATA) : join3(resolve3(eventCwd(event)), ".work-reporting");
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

// plugins/work-reporting/src/entries/hooks/work-reporting-hook.ts
function home(env) {
  return resolve4(env.HOME || homedir2());
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
  const target = official.action === "prepare" ? reportPath({ kind: official.kind, ...official.args, home: home(env) }) : resolve4(cwd, requiredArg2(official.args.report, "--report"));
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
    const target = official.action === "save" ? reportPath({ kind: official.kind, ...official.args, home: home(env) }) : resolve4(eventCwd(event), requiredArg2(official.args.report, "--report"));
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
var entry = process.argv[1];
var isMain = Boolean(entry && resolve4(entry) === fileURLToPath2(import.meta.url));
if (isMain) await main();
export {
  runFailure,
  runPost,
  runPre,
  runPrompt,
  runSession,
  runStop
};
