#!/usr/bin/env node
// harness-source-hash: sha256:1c9de1287e40228f25b06d3da5a459095c1d3a9c5d5f18df4c89e986fee00eae

// plugins/engineering-workflow/modules/testing/src/entries/hooks/test-driven-development.ts
import { readFileSync as readFileSync4 } from "node:fs";
import { isAbsolute as isAbsolute2, relative as relative4, resolve as resolve5, sep } from "node:path";
import { fileURLToPath } from "node:url";

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

// plugins/engineering-workflow/modules/testing/src/lib/hook-io.ts
import { basename, isAbsolute, join, relative, resolve } from "node:path";

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
    process.stdout.write(`${JSON.stringify(value)}
`);
  }
}

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
var SHELL_TOOLS = /* @__PURE__ */ new Set([
  "bash",
  "exec",
  "execcommand",
  "localshell",
  "shell",
  "shellcommand"
]);
function canonicalToolName(name) {
  return String(name ?? "").replaceAll("_", "").toLowerCase();
}
function isFileMutationTool(name) {
  return FILE_MUTATION_TOOLS.has(canonicalToolName(name));
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
  const invocations2 = [];
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
      if (invocation) invocations2.push(invocation);
      segment = [];
    }
  }
  return invocations2;
}

// plugins/engineering-workflow/modules/testing/src/lib/hook-io.ts
function cwdOf(event) {
  const raw = event.cwd ?? event.working_directory ?? event.workingDirectory;
  if (raw !== void 0 && raw !== null && typeof raw !== "string") return resolve(raw);
  return resolve(eventCwd(event));
}
function toolNameOf(event) {
  return canonicalToolName(eventToolName(event));
}
function toolInputOf(event) {
  return eventToolInput(event);
}
function shellCommandOf(event) {
  return extractShellCommand(event);
}
function stripQuotes(value) {
  const text = String(value ?? "").trim();
  if (text.length >= 2 && (text.startsWith('"') && text.endsWith('"') || text.startsWith("'") && text.endsWith("'"))) return text.slice(1, -1);
  return text;
}
function nestedPaths(input) {
  if (!isRecord(input)) return [];
  const paths = [];
  for (const key of ["file_path", "filePath", "path", "target_file", "output_file", "notebook_path"]) {
    const value = input[key];
    if (typeof value === "string" && value) paths.push(value);
  }
  if (Array.isArray(input.edits)) for (const edit of input.edits) paths.push(...nestedPaths(edit));
  return paths;
}
function patchPaths(input) {
  const text = patchText(input);
  const paths = [];
  for (const line of text.split("\n")) {
    const file = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u);
    if (file?.[1]) paths.push(stripQuotes(file[1]));
    const move = line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (move?.[1]) paths.push(stripQuotes(move[1]));
  }
  return paths;
}
function patchText(input) {
  if (typeof input === "string") return input;
  if (!isRecord(input)) return "";
  return [input.patch, input.input, input.command].filter((value) => typeof value === "string").join("\n");
}
function contentFromPatch(input, target, cwd, currentText) {
  const targetPath = resolve(target);
  let active = false;
  let targetMode = "";
  const added = [];
  for (const line of patchText(input).split("\n")) {
    const file = line.match(/^\*\*\*\s+(Add|Update|Delete) File:\s+(.+)$/u);
    if (file?.[1] && file[2]) {
      active = resolve(cwd, stripQuotes(file[2])) === targetPath;
      if (active) targetMode = file[1].toLowerCase();
      continue;
    }
    if (/^\*\*\*\s+/u.test(line)) {
      active = false;
      continue;
    }
    if (active && line.startsWith("+") && !line.startsWith("+++")) added.push(line.slice(1));
  }
  if (targetMode === "add" && added.length > 0) return added.join("\n");
  if (targetMode === "update" && added.length > 0) return `${currentText}
${added.join("\n")}`;
  return currentText;
}
function invocations(command, names) {
  const found = [];
  for (const invocation of shellCommandInvocations(String(command ?? ""))) {
    if (!names.has(invocation.executable)) continue;
    const operands = [];
    let optionsEnded = false;
    for (const token of invocation.args) {
      if (!optionsEnded && token === "--") {
        optionsEnded = true;
        continue;
      }
      if (!optionsEnded && token.startsWith("-")) continue;
      if (token) operands.push(token);
    }
    found.push(operands);
  }
  return found;
}
function sedInPlacePaths(command) {
  const paths = [];
  for (const invocation of shellCommandInvocations(String(command ?? ""))) {
    if (invocation.executable !== "sed") continue;
    const args = invocation.args;
    let inPlace = false;
    let programFromOption = false;
    const positional = [];
    for (let cursor = 0; cursor < args.length; cursor += 1) {
      const argument = args[cursor] ?? "";
      if (argument === "--") {
        positional.push(...args.slice(cursor + 1).filter(Boolean));
        break;
      }
      if (argument === "-i" || /^-[^-]*i/u.test(argument) || argument === "--in-place" || argument.startsWith("--in-place=")) {
        inPlace = true;
        if (argument === "-i" && /^(?:|\.[^/]+)$/u.test(args[cursor + 1] ?? "")) cursor += 1;
        continue;
      }
      if (argument === "-e" || argument === "--expression" || argument === "-f" || argument === "--file") {
        programFromOption = true;
        cursor += 1;
        continue;
      }
      if (/^(?:-e|--expression=|-f|--file=)/u.test(argument)) {
        programFromOption = true;
        continue;
      }
      if (argument.startsWith("-")) continue;
      positional.push(argument);
    }
    if (inPlace) paths.push(...programFromOption ? positional : positional.slice(1));
  }
  return paths;
}
function copyInstallTargets(command) {
  const paths = [];
  for (const invocation of shellCommandInvocations(String(command ?? ""))) {
    if (invocation.executable !== "cp" && invocation.executable !== "install") continue;
    const operands = [];
    let targetDirectory = null;
    for (let cursor = 0; cursor < invocation.args.length; cursor += 1) {
      const argument = invocation.args[cursor] ?? "";
      if (argument === "--") {
        operands.push(...invocation.args.slice(cursor + 1).filter(Boolean));
        break;
      }
      if (argument === "-t" || argument === "--target-directory") {
        targetDirectory = invocation.args[cursor + 1] ?? null;
        cursor += 1;
        continue;
      }
      if (argument.startsWith("--target-directory=")) {
        targetDirectory = argument.slice("--target-directory=".length) || null;
        continue;
      }
      if (/^-t.+/u.test(argument)) {
        targetDirectory = argument.slice(2) || null;
        continue;
      }
      if (argument.startsWith("-")) continue;
      operands.push(argument);
    }
    if (targetDirectory) {
      paths.push(targetDirectory, ...operands.map((source) => join(targetDirectory, basename(source))));
      continue;
    }
    if (operands.length < 2) continue;
    const destination = operands.at(-1) ?? "";
    paths.push(destination, ...operands.slice(0, -1).map((source) => join(destination, basename(source))));
  }
  return paths;
}
function shellPaths(input) {
  const command = String(input.command ?? input.cmd ?? "");
  const paths = [];
  const push = (raw) => {
    const value = String(raw ?? "").trim().replace(/^['"]|['"]$/gu, "");
    if (value && !value.startsWith("-")) paths.push(value);
  };
  for (const match of command.matchAll(/(?:^|[^0-9>])>{1,2}\s*("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  for (const match of command.matchAll(/\btee\b(?:\s+-[A-Za-z]+)*\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  for (const match of command.matchAll(/\btouch\b(?:\s+--)?\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  for (const match of command.matchAll(/\bwriteFile(?:Sync)?\s*\(\s*["']([^"']+)["']/gu)) push(match[1]);
  for (const match of command.matchAll(/\bopen\s*\(\s*["']([^"']+)["']\s*,\s*(?:mode\s*=\s*)?["']([^"']+)["']/gu)) {
    if (/[wax+]/iu.test(match[2] ?? "")) push(match[1]);
  }
  for (const operands of invocations(command, /* @__PURE__ */ new Set(["rm", "unlink"]))) {
    for (const path of operands) push(path);
  }
  for (const operands of invocations(command, /* @__PURE__ */ new Set(["mv"]))) {
    for (const path of operands) push(path);
  }
  for (const path of copyInstallTargets(command)) push(path);
  for (const path of sedInPlacePaths(command)) push(path);
  return paths;
}
function gitSubcommand(args) {
  let cursor = 0;
  while (cursor < args.length) {
    const token = args[cursor] ?? "";
    if (["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env"].includes(token)) {
      cursor += 2;
      continue;
    }
    if (/^--(?:git-dir|work-tree|namespace|config-env)=/u.test(token)) {
      cursor += 1;
      continue;
    }
    break;
  }
  return { command: args[cursor] ?? "", args: args.slice(cursor + 1) };
}
function opaqueShellMutation(event) {
  const command = shellCommandOf(event);
  if (!command) return null;
  for (const invocation of shellCommandInvocations(command)) {
    if (invocation.executable === "git") {
      const git = gitSubcommand(invocation.args);
      if (git.command === "apply" && !git.args.some((argument) => ["--check", "--stat", "--numstat", "--summary"].includes(argument))) {
        return "git apply can mutate implementation paths that are not visible in the hook event";
      }
    }
    if (invocation.executable === "patch" && !invocation.args.includes("--dry-run")) {
      return "patch can mutate implementation paths that are not visible in the hook event";
    }
  }
  return null;
}
function resolvedEquals(cwd, rawPath, absolutePath) {
  return resolve(cwd, stripQuotes(rawPath)) === resolve(absolutePath);
}
function extractTargets(event) {
  const name = toolNameOf(event);
  const input = toolInputOf(event);
  const raw = isFileMutationTool(name) ? [...nestedPaths(input), ...patchPaths(input)] : isShellTool(name) ? shellPaths(input) : [];
  const cwd = cwdOf(event);
  return [...new Set(raw.map(stripQuotes).filter(Boolean).map((path) => isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, ""))))];
}
function targetOperation(event, absolutePath) {
  const cwd = cwdOf(event);
  const input = toolInputOf(event);
  for (const line of patchText(input).split("\n")) {
    const file = line.match(/^\*\*\*\s+Delete File:\s+(.+)$/u);
    if (file?.[1] && resolvedEquals(cwd, file[1], absolutePath)) return "delete";
  }
  const command = shellCommandOf(event);
  if (command) {
    for (const operands of invocations(command, /* @__PURE__ */ new Set(["rm", "unlink"]))) {
      if (operands.some((path) => resolvedEquals(cwd, path, absolutePath))) return "delete";
    }
    for (const operands of invocations(command, /* @__PURE__ */ new Set(["mv"]))) {
      const sources = operands.length > 1 ? operands.slice(0, -1) : operands;
      if (sources.some((path) => resolvedEquals(cwd, path, absolutePath))) return "delete";
    }
  }
  return "write";
}
function proposedContent(event, target, currentText = "") {
  const input = toolInputOf(event);
  const paths = nestedPaths(input).map((path) => resolve(cwdOf(event), path));
  if (paths.includes(resolve(target)) && typeof input.content === "string") return input.content;
  if (paths.includes(resolve(target)) && typeof input.new_string === "string" && typeof input.old_string === "string" && currentText.includes(input.old_string)) {
    return currentText.replace(input.old_string, input.new_string);
  }
  return contentFromPatch(input, target, cwdOf(event), currentText);
}
function relativePath(root, path) {
  return relative(root, resolve(path)).replaceAll("\\", "/") || ".";
}

// plugins/engineering-workflow/modules/testing/src/lib/existing-tests.ts
import { lstatSync, readdirSync, readFileSync as readFileSync2 } from "node:fs";
import { join as join2, relative as relative3, resolve as resolve3 } from "node:path";

// plugins/engineering-workflow/modules/testing/src/lib/patterns.ts
import { existsSync, readFileSync } from "node:fs";
import { dirname, posix, relative as relative2, resolve as resolve2 } from "node:path";
var SKIPPED = /(?:^|\/)(?:\.git|\.cache|\.next|\.nuxt|\.venv|__generated__|artifacts|build|coverage|dist|generated|node_modules|target|vendor)(?:\/|$)/iu;
var TEST_DIRECTORY = /(?:^|\/)(?:test|tests|spec|specs|__tests__)(?:\/|$)/iu;
var TEST_ROOTS = /* @__PURE__ */ new Set(["test", "tests", "spec", "specs"]);
var SOURCE_ROOTS = /* @__PURE__ */ new Set(["app", "lib", "src"]);
var SUITE_DIRECTORIES = /* @__PURE__ */ new Set(["acceptance", "feature", "functional", "integration", "unit"]);
var EXTENSIONS = [
  ["typescript", /\.(?:cts|mts|ts|tsx)$/iu],
  ["javascript", /\.(?:cjs|js|jsx|mjs)$/iu],
  ["python", /\.(?:py|pyi)$/iu],
  ["php", /\.php$/iu],
  ["rust", /\.rs$/iu],
  ["go", /\.go$/iu]
];
var RESERVED = /* @__PURE__ */ new Set([
  "assert",
  "class",
  "const",
  "def",
  "describe",
  "extends",
  "false",
  "final",
  "from",
  "function",
  "import",
  "interface",
  "namespace",
  "new",
  "null",
  "package",
  "public",
  "require",
  "return",
  "self",
  "static",
  "struct",
  "test",
  "this",
  "trait",
  "true",
  "type",
  "use",
  "void"
]);
function normalize(path) {
  return String(path ?? "").replaceAll("\\", "/").replace(/^\.\//u, "");
}
function isSkippedPath(path) {
  return SKIPPED.test(normalize(path));
}
function insideRoot(root, path) {
  const value = relative2(resolve2(root), resolve2(path));
  return value === "" || !value.startsWith("..") && !value.startsWith("/");
}
function nearestManifest(root, path, name) {
  const workspace = resolve2(root);
  let directory = resolve2(workspace, dirname(normalize(path)));
  while (insideRoot(workspace, directory)) {
    const candidate = resolve2(directory, name);
    if (existsSync(candidate)) return candidate;
    if (directory === workspace) break;
    directory = dirname(directory);
  }
  return null;
}
function relativeDirectory(root, path) {
  const value = normalize(relative2(resolve2(root), dirname(resolve2(path))));
  return value === "." ? "" : value;
}
function tomlSection(text, name) {
  const header = new RegExp(`^\\[${name}\\]\\s*$`, "mu").exec(text);
  if (!header) return "";
  const remainder = text.slice(header.index + header[0].length);
  const next = /^\s*\[[^\]]+\]\s*$/mu.exec(remainder);
  return next ? remainder.slice(0, next.index) : remainder;
}
function resolveLanguageContext(root, path, language) {
  if (language === "python") {
    const module = sourceModule(path);
    const separator = module.lastIndexOf(".");
    if (separator < 0) return {};
    const packageName = module.slice(0, separator);
    const initializer = resolve2(root, dirname(normalize(path)), "__init__.py");
    if (!insideRoot(root, initializer) || !existsSync(initializer)) return {};
    const reexports = [];
    const text = withoutComments("python", readFileSync(initializer, "utf8"));
    for (const match of text.matchAll(/^\s*from\s+([.A-Za-z_][A-Za-z0-9_.]*)\s+import\s+([^\n#]+)/gmu)) {
      const specifier = match[1] ?? "";
      const dots = specifier.match(/^\.+/u)?.[0].length ?? 0;
      const imported = dots === 0 ? specifier : [
        ...packageName.split(".").slice(0, Math.max(0, packageName.split(".").length - dots + 1)),
        specifier.slice(dots)
      ].filter(Boolean).join(".");
      if (imported !== module) continue;
      for (const item of (match[2] ?? "").replace(/[()]/gu, "").split(",")) {
        const binding = item.trim().match(/^(\*|[A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/u);
        if (binding?.[1]) {
          reexports.push({
            sourceSymbol: binding[1],
            publicTarget: `python:${packageName}#${binding[2] ?? binding[1]}`
          });
        }
      }
    }
    return { pythonReexports: reexports };
  }
  if (language === "rust") {
    const manifest = nearestManifest(root, path, "Cargo.toml");
    if (!manifest) return {};
    const text = readFileSync(manifest, "utf8");
    const libraryName = tomlSection(text, "lib").match(/^\s*name\s*=\s*["']([^"']+)["']/mu)?.[1];
    const packageName = tomlSection(text, "package").match(/^\s*name\s*=\s*["']([^"']+)["']/mu)?.[1];
    const name = libraryName ?? packageName;
    if (!name) return {};
    return { rustCrateName: name.replaceAll("-", "_"), rustCrateRoot: relativeDirectory(root, manifest) };
  }
  if (language === "go") {
    const manifest = nearestManifest(root, path, "go.mod");
    if (!manifest) return {};
    const modulePath = readFileSync(manifest, "utf8").match(/^\s*module\s+(\S+)/mu)?.[1];
    if (!modulePath) return {};
    return { goModulePath: modulePath, goModuleRoot: relativeDirectory(root, manifest) };
  }
  return {};
}
function languageFor(path) {
  for (const [language, pattern] of EXTENSIONS) if (pattern.test(path)) return language;
  return null;
}
function isTestPath(path, language) {
  const name = posix.basename(path);
  if (language === "php") return TEST_DIRECTORY.test(path) || /Test\.php$/u.test(name);
  if (language === "python") return TEST_DIRECTORY.test(path) || /^test_.+\.py$/u.test(name) || /_test\.py$/u.test(name);
  if (["javascript", "typescript"].includes(language)) {
    return TEST_DIRECTORY.test(path) || /\.(?:test|spec)\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/iu.test(name);
  }
  if (language === "rust") return TEST_DIRECTORY.test(path);
  if (language === "go") return /_test\.go$/u.test(name);
  return false;
}
function classifyPath(path) {
  const value = normalize(path);
  if (!value || SKIPPED.test(value) || /(?:^|\/)\.test-driven-development\.mjs$/u.test(value)) {
    return { kind: "ignored", language: null };
  }
  const language = languageFor(value);
  if (!language) return { kind: "ignored", language: null };
  return { kind: isTestPath(value, language) ? "test" : "source", language };
}
function matches(text, pattern, group = 1) {
  const found = [];
  for (const match of String(text ?? "").matchAll(pattern)) {
    const value = match[group];
    if (value) found.push(value);
  }
  return found;
}
function unique(values) {
  return [...new Set(values.filter((value) => Boolean(value)))];
}
function identifiers(text) {
  return unique(matches(text, /\b([A-Za-z_$][A-Za-z0-9_$]{2,})\b/gu).filter((value) => !RESERVED.has(value.toLowerCase())));
}
function withoutComments(language, text) {
  let value = String(text ?? "");
  if (["php", "javascript", "typescript", "rust", "go"].includes(language)) {
    value = value.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*$/gmu, "");
  }
  if (language === "python") return value.replace(/#.*$/gmu, "");
  if (language === "php") return value.replace(/#(?!\[).*$/gmu, "");
  return value;
}
function testNames(language, text) {
  if (language === "php") {
    return [
      ...matches(text, /\bfunction\s+(test[A-Za-z0-9_]*)\s*\(/gu),
      ...matches(text, /#\s*\[\s*Test\s*\][\s\S]{0,160}?\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/gu),
      ...matches(text, /\b(?:it|test)\s*\(\s*["']([^"']+)["']/gu)
    ];
  }
  if (language === "python") return matches(text, /^\s*def\s+(test_[A-Za-z0-9_]*)\s*\(/gmu);
  if (["javascript", "typescript"].includes(language)) {
    return matches(text, /\b(?:it|test)\s*\(\s*["'`]([^"'`]+)["'`]/gu);
  }
  if (language === "rust") return matches(text, /#\s*\[\s*test\s*\][\s\S]{0,160}?\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gu);
  if (language === "go") return matches(text, /\bfunc\s+(Test[A-Za-z0-9_]*)\s*\(/gu);
  return [];
}
function identifierUsed(text, identifier) {
  if (!identifier) return false;
  return new RegExp(`\\b${identifier.replace(/[$]/gu, "\\$")}\\b`, "u").test(text);
}
function phpNamespace(code) {
  return code.match(/\bnamespace\s+([A-Za-z_\\][A-Za-z0-9_\\]*)\s*[;{]/u)?.[1]?.replace(/^\\/u, "") ?? "";
}
function phpImports(code) {
  const imports = /* @__PURE__ */ new Map();
  for (const match of code.matchAll(/^\s*use\s+(?!function\b|const\b)([A-Za-z_\\][A-Za-z0-9_\\]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*;/gmu)) {
    const qualified = (match[1] ?? "").replace(/^\\/u, "");
    imports.set(match[2] ?? qualified.split("\\").at(-1) ?? "", qualified);
  }
  return imports;
}
function resolvePhpName(name, namespace, imports) {
  const value = String(name ?? "").trim();
  if (!value) return "";
  if (value.startsWith("\\")) return value.slice(1);
  const [head, ...tail] = value.split("\\");
  if (head !== void 0 && imports.has(head)) return [imports.get(head), ...tail].join("\\");
  return namespace ? `${namespace}\\${value}` : value;
}
function phpCoverageTargets(raw, code) {
  const namespace = phpNamespace(code);
  const imports = phpImports(code);
  const targets = [];
  for (const reference of matches(code, /\bCoversClass\s*\(\s*([\\A-Za-z_][\\A-Za-z0-9_]*)\s*::class\s*\)/gu)) {
    targets.push(`php:${resolvePhpName(reference, namespace, imports)}`);
  }
  for (const reference of matches(raw, /@covers\s+([\\A-Za-z_][\\A-Za-z0-9_]*)(?:::[A-Za-z_][A-Za-z0-9_]*)?/gu)) {
    targets.push(`php:${resolvePhpName(reference, namespace, imports)}`);
  }
  return unique(targets);
}
function pythonImportModule(specifier, testPath) {
  const dots = specifier.match(/^\.+/u)?.[0].length ?? 0;
  if (dots === 0) return specifier;
  const packageSegments = stripExtension(testPath).split("/");
  packageSegments.pop();
  const keep = packageSegments.length - dots + 1;
  if (keep < 0) return "";
  return [
    ...packageSegments.slice(0, keep),
    specifier.slice(dots)
  ].filter(Boolean).join(".");
}
function pythonTargets(code, testPath) {
  const body = code.replace(/^\s*(?:from\s+[^\n]+\s+import\s+[^\n]+|import\s+[^\n]+)$/gmu, "");
  const targets = [];
  for (const match of code.matchAll(/^\s*from\s+([.A-Za-z_][A-Za-z0-9_.]*)\s+import\s+([^\n#]+)/gmu)) {
    const importedModule = pythonImportModule(match[1] ?? "", testPath);
    if (!importedModule) continue;
    for (const item of (match[2] ?? "").replace(/[()]/gu, "").split(",")) {
      const binding = item.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/u);
      if (binding && identifierUsed(body, binding[2] ?? binding[1])) {
        targets.push(`python:${importedModule}#${binding[1]}`);
        if (/^[a-z_][a-z0-9_]*$/u.test(binding[1] ?? "")) {
          const namespaceModule = `${importedModule}.${binding[1]}`;
          targets.push(`python-module:${namespaceModule}`);
          const local = binding[2] ?? binding[1] ?? "";
          for (const member of matches(body, new RegExp(`\\b${local}\\.([A-Za-z_][A-Za-z0-9_]*)`, "gu"))) {
            targets.push(`python:${namespaceModule}#${member}`);
          }
        }
      }
    }
  }
  for (const match of code.matchAll(/^\s*import\s+([A-Za-z_][A-Za-z0-9_.]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*$/gmu)) {
    const local = match[2] ?? match[1]?.split(".")[0];
    if (identifierUsed(body, local)) targets.push(`python-module:${match[1]}`);
  }
  return unique(targets);
}
function stripExtension(path) {
  return normalize(path).replace(/\.(?:cjs|cts|js|jsx|mjs|mts|php|py|pyi|rs|ts|tsx|go)$/iu, "");
}
function javascriptTargets(code, testPath) {
  const body = code.replace(/\bimport\s+[\s\S]*?\s+from\s+["'][^"']+["']\s*;?/gu, "").replace(/\b(?:const|let|var)\s+[^=]+?=\s*require\s*\(\s*["'][^"']+["']\s*\)\s*;?/gu, "");
  const targets = [];
  const addModule = (specifier, bindings) => {
    if (!specifier.startsWith(".")) return;
    if (!bindings.some((binding) => identifierUsed(body, binding))) return;
    const resolved = stripExtension(posix.normalize(posix.join(posix.dirname(normalize(testPath)), specifier)));
    targets.push(`javascript-module:${resolved}`);
  };
  for (const match of code.matchAll(/\bimport\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/gu)) {
    const clause = (match[1] ?? "").replace(/^type\s+/u, "").trim();
    const bindings = [];
    const namespace = clause.match(/^\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/u);
    if (namespace?.[1]) bindings.push(namespace[1]);
    const named = clause.match(/\{([\s\S]*?)\}/u)?.[1] ?? "";
    for (const item of named.split(",")) {
      const binding = item.trim().replace(/^type\s+/u, "").match(/^([A-Za-z_$][A-Za-z0-9_$]*)(?:\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*))?$/u);
      if (binding) bindings.push(binding[2] ?? binding[1] ?? "");
    }
    const defaultBinding = clause.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:,|$)/u)?.[1];
    if (defaultBinding) bindings.push(defaultBinding);
    addModule(match[2] ?? "", bindings);
  }
  for (const match of code.matchAll(/\b(?:const|let|var)\s+(.+?)\s*=\s*require\s*\(\s*["']([^"']+)["']\s*\)/gu)) {
    const bindings = identifiers(match[1] ?? "");
    addModule(match[2] ?? "", bindings);
  }
  const sourceReaders = /* @__PURE__ */ new Set(["readFileSync"]);
  for (const match of code.matchAll(/\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(\s*([A-Za-z_$][A-Za-z0-9_$]*)(?:\s*:[^,)]*)?[^)]*\)\s*(?::[^{]+)?\{([\s\S]{0,1200}?)\n?\}/gu)) {
    const helper = match[1] ?? "";
    const parameter = match[2] ?? "";
    const helperBody = match[3] ?? "";
    const escapedParameter = parameter.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const readsParameter = new RegExp(`\\breadFileSync\\s*\\([^;\\n]{0,500}\\b${escapedParameter}\\b[^;\\n]{0,500}\\)`, "u").test(helperBody);
    if (readsParameter) sourceReaders.add(helper);
  }
  for (const match of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\(\s*["']([^"']+)["']\s*\)/gu)) {
    const binding = match[1] ?? "";
    const reader = match[2] ?? "";
    const sourcePath = normalize(match[3] ?? "");
    const remainder = code.slice((match.index ?? 0) + match[0].length);
    if (!sourceReaders.has(reader) || !identifierUsed(remainder, binding) || !/^(?:app|lib|src)\//u.test(sourcePath)) continue;
    targets.push(`javascript-module:${stripExtension(sourcePath)}`);
  }
  return unique(targets);
}
function rustTargets(code, context) {
  const body = code.replace(/^\s*use\s+[^;]+;\s*$/gmu, "");
  const crateName = String(context.rustCrateName ?? "");
  const crateRoot = normalize(context.rustCrateRoot ?? "");
  if (!crateName) return [];
  const targets = [];
  for (const match of code.matchAll(/^\s*use\s+([^;]+)\s*;/gmu)) {
    const expression = (match[1] ?? "").trim();
    const grouped = expression.match(/^(.+?)::\{(.+)\}$/u);
    const paths = grouped ? (grouped[2] ?? "").split(",").map((item) => `${grouped[1]}::${item.trim()}`) : [expression];
    for (const path of paths) {
      const alias = path.match(/\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/u)?.[1];
      const segments = path.replace(/\s+as\s+[A-Za-z_][A-Za-z0-9_]*$/u, "").split("::");
      const item = segments.pop();
      if (!identifierUsed(body, alias ?? item)) continue;
      const importedCrate = segments.shift()?.replaceAll("-", "_");
      if (importedCrate !== crateName.replaceAll("-", "_")) continue;
      targets.push(`rust:${crateRoot}:${crateName}#${segments.join("::")}#${item}`);
    }
  }
  return unique(targets);
}
function goPackage(code) {
  return code.match(/^\s*package\s+([A-Za-z_][A-Za-z0-9_]*)/mu)?.[1] ?? "";
}
function goTargets(code) {
  const body = code.replace(/^\s*import\s+(?:\([^)]*\)|[^\n]+)$/gmu, "");
  const targets = [];
  for (const match of code.matchAll(/^\s*(?:import\s+)?(?:([A-Za-z_][A-Za-z0-9_]*)\s+)?"([^"]+)"\s*$/gmu)) {
    const local = match[1] ?? match[2]?.split("/").at(-1);
    for (const used of body.matchAll(new RegExp(`\\b${local}\\.([A-Za-z_][A-Za-z0-9_]*)`, "gu"))) {
      targets.push(`go-import:${match[2]}#${used[1]}`);
    }
  }
  return unique(targets);
}
function extractTestEvidence(language, text, testPath = "", context = {}) {
  const raw = String(text ?? "");
  const code = withoutComments(language, raw);
  const names = unique(testNames(language, code));
  let targets = [];
  if (language === "php") targets = phpCoverageTargets(raw, code);
  else if (language === "python") targets = pythonTargets(code, testPath);
  else if (["javascript", "typescript"].includes(language)) targets = javascriptTargets(code, testPath);
  else if (language === "rust") targets = rustTargets(code, context);
  else if (language === "go") targets = goTargets(code);
  return {
    valid: names.length > 0,
    testNames: names,
    targets,
    references: identifiers(code),
    package: language === "go" ? goPackage(code) : ""
  };
}
function sourceModule(path) {
  const segments = stripExtension(path).split("/");
  const sourceIndex = segments.reduce((found, segment, index) => ["lib", "src"].includes(segment.toLowerCase()) ? index : found, -1);
  const moduleSegments = sourceIndex >= 0 ? segments.slice(sourceIndex + 1) : segments;
  if (moduleSegments.at(-1) === "__init__") moduleSegments.pop();
  return moduleSegments.join(".");
}
function javascriptModule(path) {
  return stripExtension(path);
}
function rustModule(path) {
  const segments = stripExtension(path).split("/");
  const index = segments.lastIndexOf("src");
  if (index < 0) return null;
  const scope = segments.slice(0, index).join("/");
  const modules = segments.slice(index + 1);
  const last = modules.at(-1);
  if (last !== void 0 && ["lib", "main", "mod"].includes(last)) modules.pop();
  return { scope, module: modules.join("::") };
}
function extractSourceSymbols(language, text) {
  const value = withoutComments(language, text);
  if (language === "php") {
    const namespace = phpNamespace(value);
    return unique(matches(value, /\b(?:class|interface|trait|enum|function)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gu).map((symbol) => namespace ? `${namespace}\\${symbol}` : symbol));
  }
  if (language === "python") return unique(matches(value, /^\s*(?:class|def)\s+([A-Za-z_][A-Za-z0-9_]*)/gmu));
  if (["javascript", "typescript"].includes(language)) {
    return unique(matches(value, /\b(?:export\s+)?(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gu));
  }
  if (language === "rust") return unique(matches(value, /\b(?:pub\s+)?(?:fn|struct|enum|trait|type)\s+([A-Za-z_][A-Za-z0-9_]*)/gu));
  if (language === "go") return unique(matches(value, /\b(?:func|type)\s+(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)/gu));
  return [];
}
function goImportPath(sourcePath, context) {
  const modulePath = String(context.goModulePath ?? "").replace(/\/$/u, "");
  if (!modulePath) return "";
  const moduleRoot = normalize(context.goModuleRoot ?? "");
  const directory = posix.dirname(normalize(sourcePath));
  const relativePackage = moduleRoot ? posix.relative(moduleRoot, directory) : directory;
  if (relativePackage.startsWith("..")) return "";
  return relativePackage === "." || relativePackage === "" ? modulePath : `${modulePath}/${relativePackage}`;
}
function explicitSourceTargets(source, context) {
  const symbols = extractSourceSymbols(source.language, source.content);
  if (source.language === "php") return symbols.map((symbol) => `php:${symbol}`);
  if (source.language === "python") {
    const module = sourceModule(source.path);
    const reexports = context.pythonReexports ?? [];
    return [
      `python-module:${module}`,
      ...symbols.map((symbol) => `python:${module}#${symbol}`),
      ...reexports.flatMap(({ sourceSymbol, publicTarget }) => {
        if (sourceSymbol === "*" && publicTarget.endsWith("#*")) {
          const prefix = publicTarget.slice(0, -1);
          return symbols.map((symbol) => `${prefix}${symbol}`);
        }
        return symbols.includes(sourceSymbol) ? [publicTarget] : [];
      })
    ];
  }
  if (["javascript", "typescript"].includes(source.language)) {
    const module = javascriptModule(source.path);
    return [`javascript-module:${module}`, `javascript-module:${module.replace(/\/index$/u, "")}`];
  }
  if (source.language === "rust") {
    const descriptor = rustModule(source.path);
    const crateName = String(context.rustCrateName ?? "");
    const crateRoot = normalize(context.rustCrateRoot ?? "");
    if (!descriptor || !crateName || descriptor.scope !== crateRoot) return [];
    return symbols.map((symbol) => `rust:${crateRoot}:${crateName}#${descriptor.module}#${symbol}`);
  }
  if (source.language === "go") {
    const importPath = goImportPath(source.path, context);
    return importPath ? symbols.map((symbol) => `go-import:${importPath}#${symbol}`) : [];
  }
  return [];
}
function removeTestSuffix(name, language) {
  let value = stripExtension(name);
  if (language === "php") value = value.replace(/Test$/u, "");
  else if (language === "python") value = value.replace(/^test_/u, "").replace(/_test$/u, "");
  else if (["javascript", "typescript"].includes(language)) value = value.replace(/\.(?:test|spec)$/u, "");
  else if (language === "go") value = value.replace(/_test$/u, "");
  return value;
}
function rootDescriptor(path, roots) {
  const segments = normalize(path).split("/");
  const index = segments.findIndex((segment) => roots.has(segment.toLowerCase()));
  if (index < 0) return null;
  return { scope: segments.slice(0, index).join("/"), rest: segments.slice(index + 1) };
}
function mirrorIdentity(path, language, kind) {
  if (["javascript", "typescript"].includes(language) && kind === "test") {
    const segments = normalize(path).split("/").filter((segment) => segment !== "__tests__");
    const name2 = removeTestSuffix(segments.pop(), language);
    if (/\.(?:test|spec)$/u.test(stripExtension(posix.basename(path)))) {
      const colocated = rootDescriptor([...segments, name2].join("/"), SOURCE_ROOTS);
      if (colocated) return `${colocated.scope}#${colocated.rest.join("/")}`;
    }
  }
  if (language === "go") {
    const directory = posix.dirname(normalize(path));
    return `${directory}/${kind === "test" ? removeTestSuffix(posix.basename(path), language) : stripExtension(posix.basename(path))}`;
  }
  const descriptor = rootDescriptor(path, kind === "test" ? TEST_ROOTS : SOURCE_ROOTS);
  if (!descriptor) {
    if (kind !== "source") return null;
    const normalized = normalize(path);
    return `${posix.dirname(normalized)}#${removeTestSuffix(posix.basename(normalized), language)}`;
  }
  const rest = [...descriptor.rest];
  if (kind === "test") {
    while (rest.length > 1 && SUITE_DIRECTORIES.has(rest[0]?.toLowerCase() ?? "")) rest.shift();
  }
  const name = kind === "test" ? removeTestSuffix(rest.pop(), language) : stripExtension(rest.pop());
  return `${descriptor.scope}#${[...rest, name].join("/")}`;
}
function mirrorMatches(source, testRecord2) {
  const sourceIdentity = mirrorIdentity(source.path, source.language, "source");
  const testIdentity = mirrorIdentity(testRecord2.path, source.language, "test");
  return Boolean(sourceIdentity && testIdentity && sourceIdentity === testIdentity);
}
function pythonPackageReexportMatches(source, testRecord2) {
  if (source.language !== "python" || !mirrorMatches(source, testRecord2)) return false;
  const module = sourceModule(source.path);
  const separator = module.lastIndexOf(".");
  if (separator < 0) return false;
  const packageName = module.slice(0, separator);
  const targets = new Set(testRecord2.evidence?.targets ?? []);
  return extractSourceSymbols("python", source.content).some((symbol) => targets.has(`python:${packageName}#${symbol}`));
}
function goPackageMatches(source, testRecord2) {
  if (source.language !== "go") return false;
  const sourceDirectory = posix.dirname(normalize(source.path));
  const testDirectory = posix.dirname(normalize(testRecord2.path));
  const sourcePackage = goPackage(withoutComments("go", source.content));
  const testPackage = String(testRecord2.evidence?.package ?? "").replace(/_test$/u, "");
  const symbols = new Set(extractSourceSymbols("go", source.content));
  const references = testRecord2.evidence?.references ?? [];
  if (sourceDirectory === testDirectory && sourcePackage && sourcePackage === testPackage && references.some((value) => symbols.has(value))) return true;
  return false;
}
function sourceAuthorizedByTest(source, testRecord2, context = {}) {
  if (!source || !testRecord2 || source.language !== testRecord2.language || !testRecord2.evidence?.valid) return false;
  const testTargets = new Set(testRecord2.evidence.targets ?? []);
  if (explicitSourceTargets(source, context).some((target) => testTargets.has(target))) return true;
  if (pythonPackageReexportMatches(source, testRecord2)) return true;
  if (testTargets.size > 0) return false;
  if (goPackageMatches(source, testRecord2)) return true;
  return mirrorMatches(source, testRecord2);
}
function pascal(value) {
  return String(value).split(/[-_]/u).filter(Boolean).map((part) => (part[0]?.toUpperCase() ?? "") + part.slice(1)).join("");
}
function languageTestFileName(stem, language) {
  if (language === "php") return `${pascal(stem)}Test.php`;
  if (language === "python") return `test_${stem}.py`;
  if (language === "javascript") return `${stem}.test.js`;
  if (language === "typescript") return `${stem}.test.ts`;
  if (language === "rust") return `${stem}.rs`;
  if (language === "go") return `${stem}_test.go`;
  return stem;
}
function suiteExampleName(language) {
  return ["python", "javascript", "typescript"].includes(language) ? "unit" : "Unit";
}
function expectedMirrorTestPaths(sourcePath, language) {
  const normalized = normalize(sourcePath);
  if (language === "go") {
    const directory = posix.dirname(normalized);
    const fileName2 = languageTestFileName(stripExtension(posix.basename(normalized)), language);
    return [directory === "." ? fileName2 : `${directory}/${fileName2}`];
  }
  const descriptor = rootDescriptor(normalized, SOURCE_ROOTS);
  const rest = descriptor ? [...descriptor.rest] : normalized.split("/").filter(Boolean);
  const stem = stripExtension(rest.pop() ?? "");
  const relativeDir = rest.join("/");
  const scopePrefix = descriptor?.scope ? `${descriptor.scope}/` : "";
  const fileName = languageTestFileName(stem, language);
  const withDir = relativeDir ? `${relativeDir}/` : "";
  const paths = [
    `${scopePrefix}tests/${withDir}${fileName}`,
    `${scopePrefix}tests/${suiteExampleName(language)}/${withDir}${fileName}`
  ];
  if (["javascript", "typescript"].includes(language)) {
    const sourceDir = posix.dirname(normalized);
    paths.push(sourceDir === "." ? fileName : `${sourceDir}/${fileName}`);
  }
  return paths;
}
function expectedTestExample(sourcePath, language) {
  const listed = expectedMirrorTestPaths(sourcePath, language).join(" or ");
  if (!listed) return "a matching test file";
  if (language === "php") return `${listed} or a test with #[CoversClass(Target::class)]`;
  if (language === "python") return `${listed} or a test importing the exact module`;
  if (language === "javascript" || language === "typescript") return `${listed} or a test with an exact relative import`;
  if (language === "rust") return `${listed} or a test using the exact crate module item`;
  if (language === "go") return `${listed} in the same package referencing a declared symbol`;
  return listed;
}

// plugins/engineering-workflow/modules/testing/src/lib/existing-tests.ts
var MAX_TEST_BYTES = 1048576;
function readLimited(path) {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > MAX_TEST_BYTES) return "";
    return readFileSync2(path, "utf8");
  } catch {
    return "";
  }
}
function listTestFiles(root, language) {
  const workspace = resolve3(root);
  const found = [];
  const stack = [workspace];
  while (stack.length > 0) {
    const directory = stack.pop();
    if (directory === void 0) continue;
    let entries = [];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
      const absolutePath = join2(directory, entry.name);
      const path = relative3(workspace, absolutePath).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        if (isSkippedPath(`${path}/`)) continue;
        stack.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const classified = classifyPath(path);
      if (classified.kind === "test" && classified.language === language) found.push(path);
    }
  }
  return found.sort();
}
function findCorrespondingTests(root, source, context = {}) {
  if (!source?.path || !source.language) return [];
  const found = [];
  for (const path of listTestFiles(root, source.language)) {
    const testContext = resolveLanguageContext(root, path, source.language);
    const evidence = extractTestEvidence(source.language, readLimited(resolve3(root, path)), path, testContext);
    if (sourceAuthorizedByTest(source, { path, language: source.language, evidence }, context)) {
      found.push(path);
    }
  }
  return found;
}
function formatTestPathList(paths) {
  const values = [...new Set((paths ?? []).filter((value) => Boolean(value)))];
  if (values.length <= 4) return values.join(", ");
  return `${values.slice(0, 4).join(", ")} and ${values.length - 4} more`;
}

// plugins/engineering-workflow/modules/testing/src/lib/git-workspace.ts
import { spawnSync } from "node:child_process";
import { existsSync as existsSync2, readFileSync as readFileSync3, realpathSync } from "node:fs";
import { resolve as resolve4 } from "node:path";
function sameDirectory(left, right) {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return resolve4(left) === resolve4(right);
  }
}
function gitEnv() {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_OBJECT_DIRECTORY;
  delete env.GIT_ALTERNATE_OBJECT_DIRECTORIES;
  delete env.GIT_PREFIX;
  return env;
}
function runGit(root, args) {
  try {
    return spawnSync("git", ["-c", "safe.directory=*", "-c", "core.hooksPath=/dev/null", ...args], {
      cwd: root,
      encoding: "utf8",
      timeout: 1e4,
      stdio: ["ignore", "pipe", "pipe"],
      env: gitEnv()
    });
  } catch {
    return { status: 1, stdout: "", stderr: "" };
  }
}
function hasGitHead(root) {
  if (!root) return false;
  const inside = runGit(root, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0 || inside.stdout.trim() !== "true") return false;
  const toplevel = runGit(root, ["rev-parse", "--show-toplevel"]);
  if (toplevel.status !== 0 || !sameDirectory(toplevel.stdout.trim(), root)) return false;
  const head = runGit(root, ["rev-parse", "HEAD"]);
  return head.status === 0 && Boolean(head.stdout.trim());
}
function gitShowHead(root, relativePath2) {
  const path = String(relativePath2 ?? "").replaceAll("\\", "/");
  if (!root || !path || path === ".") return null;
  const shown = runGit(root, ["show", `HEAD:${path}`]);
  if (shown.status !== 0) return null;
  return shown.stdout;
}
function gitPathState(root, relativePath2) {
  try {
    const head = gitShowHead(root, relativePath2);
    const tracked = head !== null;
    const absolutePath = resolve4(root, relativePath2);
    const present = existsSync2(absolutePath);
    if (!tracked && !present) return { tracked: false, present: false, dirty: false };
    if (!tracked) return { tracked: false, present: true, dirty: true };
    if (!present) return { tracked: true, present: false, dirty: true };
    let current = "";
    try {
      current = readFileSync3(absolutePath, "utf8");
    } catch {
      return { tracked: true, present: true, dirty: true };
    }
    return { tracked: true, present: true, dirty: current !== head };
  } catch {
    return { tracked: false, present: false, dirty: false };
  }
}
function listHeadPaths(root) {
  const listed = runGit(root, ["ls-tree", "-r", "--name-only", "HEAD"]);
  if (listed.status !== 0) return [];
  return listed.stdout.split("\n").map((path) => path.trim()).filter(Boolean);
}
function listDirtyPaths(root) {
  if (!hasGitHead(root)) return [];
  const changed = runGit(root, ["diff", "--name-only", "HEAD", "--"]);
  const untracked = runGit(root, ["ls-files", "--others", "--exclude-standard"]);
  const paths = [
    ...changed.status === 0 ? changed.stdout.split("\n") : [],
    ...untracked.status === 0 ? untracked.stdout.split("\n") : []
  ];
  return [...new Set(paths.map((path) => path.trim().replaceAll("\\", "/")).filter(Boolean))];
}
function restoresHeadState(root, relativePath2, { missing = false, content = "" } = {}) {
  const head = gitShowHead(root, relativePath2);
  if (head === null) return missing === true;
  if (missing) return false;
  return head === String(content ?? "");
}

// plugins/engineering-workflow/modules/testing/src/entries/hooks/test-driven-development.ts
function warn(message) {
  process.stderr.write(`[test-driven-development] ${message}
`);
}
function readText(path) {
  try {
    return readFileSync4(path, "utf8");
  } catch {
    return "";
  }
}
function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && error.message != null) return String(error.message);
  return String(error);
}
function isActiveTarget(target) {
  return target.kind !== "ignored" && target.language !== null;
}
function isInsideRoot(root, path) {
  const value = relative4(resolve5(root), resolve5(path));
  return value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute2(value);
}
function targetsFor(event, root) {
  return extractTargets(event).filter((absolutePath) => isInsideRoot(root, absolutePath)).map((absolutePath) => {
    const path = relativePath(root, absolutePath);
    return { absolutePath, path, ...classifyPath(path) };
  }).filter(isActiveTarget);
}
function mixedWriteFinding() {
  return "[TDD Guard] A single tool call cannot mix test and implementation files. Use separate tool calls: change the test first, then change the implementation.";
}
function headCorrespondingTests(root, source, context) {
  if (!hasGitHead(root)) return [];
  const found = /* @__PURE__ */ new Set();
  for (const path of listHeadPaths(root)) {
    const classified = classifyPath(path);
    if (classified.kind !== "test" || classified.language !== source.language) continue;
    const content = gitShowHead(root, path);
    if (content == null) continue;
    const testContext = resolveLanguageContext(root, path, source.language);
    const evidence = extractTestEvidence(source.language, content, path, testContext);
    if (sourceAuthorizedByTest(source, { path, language: source.language, evidence }, context)) {
      found.add(path);
    }
  }
  return [...found];
}
function dirtyLiveTests(root, source, context) {
  return findCorrespondingTests(root, source, context).filter((path) => {
    const state = gitPathState(root, path);
    return state.present && state.dirty;
  });
}
function restoresBaseline(root, event, target) {
  const deleting = targetOperation(event, target.absolutePath) === "delete";
  if (!deleting && shellCommandOf(event)) return false;
  const current = readText(target.absolutePath);
  return restoresHeadState(root, target.path, {
    missing: deleting,
    content: deleting ? "" : proposedContent(event, target.absolutePath, current)
  });
}
function dirtySourceTargets(root) {
  return listDirtyPaths(root).map((path) => {
    const absolutePath = resolve5(root, path);
    return { absolutePath, path, ...classifyPath(path) };
  }).filter((target) => isActiveTarget(target) && target.kind === "source" && gitPathState(root, target.path).present);
}
function testRecord(root, event, target, proposed) {
  const deleting = proposed && targetOperation(event, target.absolutePath) === "delete";
  if (deleting) return null;
  const content = proposed ? proposedContent(event, target.absolutePath, readText(target.absolutePath)) : readText(target.absolutePath);
  const context = resolveLanguageContext(root, target.path, target.language);
  return {
    path: target.path,
    language: target.language,
    evidence: extractTestEvidence(target.language, content, target.path, context),
    dirty: gitShowHead(root, target.path) !== content
  };
}
function testChangeBreaksAuthorization(root, event, target, eventTargets) {
  const current = testRecord(root, event, target, false);
  if (!current?.dirty) return null;
  const proposed = testRecord(root, event, target, true);
  for (const dirtySource of dirtySourceTargets(root)) {
    if (dirtySource.language !== target.language) continue;
    const source = sourceForTarget(root, event, dirtySource, false);
    const context = resolveLanguageContext(root, dirtySource.path, dirtySource.language);
    if (!sourceAuthorizedByTest(source, current, context)) continue;
    if (proposed?.dirty && sourceAuthorizedByTest(source, proposed, context)) continue;
    const candidates = /* @__PURE__ */ new Set([
      ...dirtyLiveTests(root, source, context),
      ...eventTargets.filter((candidate) => candidate.kind === "test" && candidate.language === target.language).map((candidate) => candidate.path)
    ]);
    candidates.delete(target.path);
    const hasAlternative = [...candidates].some((path) => {
      const changedTarget = eventTargets.find((candidate) => candidate.kind === "test" && candidate.path === path);
      const record = changedTarget ? testRecord(root, event, changedTarget, true) : testRecord(root, event, {
        absolutePath: resolve5(root, path),
        path,
        kind: "test",
        language: target.language
      }, false);
      return record?.dirty === true && sourceAuthorizedByTest(source, record, context);
    });
    if (!hasAlternative) return dirtySource.path;
  }
  return null;
}
function sourceForTarget(root, event, target, deleting) {
  const current = readText(target.absolutePath);
  return {
    path: target.path,
    language: target.language,
    content: deleting ? current || gitShowHead(root, target.path) || "" : proposedContent(event, target.absolutePath, current)
  };
}
function denySourceChange(target, tests) {
  if (tests.length > 0) {
    writeJson(preToolDeny(`[TDD Guard] Blocked ${target.path}: matching tests exist (${formatTestPathList(tests)}), but none has changed relative to git HEAD. Change a corresponding test first, then retry the implementation change.`));
    return;
  }
  writeJson(preToolDeny(`[TDD Guard] Blocked ${target.path}: no changed corresponding test exists. Create or update ${expectedTestExample(target.path, target.language)} with a real test case first, then retry the implementation change.`));
}
function checkSourceTarget(root, event, target) {
  if (restoresBaseline(root, event, target)) return true;
  const deleting = targetOperation(event, target.absolutePath) === "delete";
  const source = sourceForTarget(root, event, target, deleting);
  const context = resolveLanguageContext(root, target.path, target.language);
  if (deleting) {
    const historical = headCorrespondingTests(root, source, context);
    if (historical.length > 0 && historical.every((path) => gitPathState(root, path).dirty)) return true;
    denySourceChange(target, historical);
    return false;
  }
  const current = findCorrespondingTests(root, source, context);
  if (dirtyLiveTests(root, source, context).length > 0) return true;
  denySourceChange(target, current);
  return false;
}
function testFirstFileOrderContext() {
  return [
    "[TDD Guard] Test-first file order is enforced against git HEAD.",
    "Change a corresponding test in a separate tool call before changing implementation.",
    "A single patch or tool call cannot mix test and source files. A dirty test may cover later implementation edits.",
    "This hook does not run tests and does not prove RED/GREEN. Optional method: load `tdd-red-green` for the red-green-refactor loop. Skill load is not a hook prerequisite."
  ].join("\n");
}
function runSessionStart() {
  writeJson(additionalContext("SessionStart", testFirstFileOrderContext()));
}
async function runPre(event) {
  const root = cwdOf(event);
  const targets = targetsFor(event, root);
  if (targets.length === 0) {
    const opaqueMutation = opaqueShellMutation(event);
    if (opaqueMutation) {
      writeJson(preToolDeny(`[TDD Guard] Blocked opaque implementation mutation: ${opaqueMutation}. Use file tools or an explicit patch whose target paths can be checked against corresponding tests.`));
    }
    return;
  }
  const kinds = new Set(targets.map((target) => target.kind));
  if (kinds.has("test") && kinds.has("source")) {
    writeJson(preToolDeny(mixedWriteFinding()));
    return;
  }
  if (!kinds.has("source")) {
    for (const target of targets) {
      if (target.kind !== "test") continue;
      const affectedSource = testChangeBreaksAuthorization(root, event, target, targets);
      if (affectedSource) {
        writeJson(preToolDeny(`[TDD Guard] Blocked ${target.path}: deleting or weakening this test would leave dirty implementation ${affectedSource} without a changed corresponding test. Restore the implementation first or keep another changed corresponding test.`));
        return;
      }
    }
    return;
  }
  if (!hasGitHead(root)) {
    writeJson(preToolDeny("[TDD Guard] Blocked implementation change: this workspace has no git HEAD. Initialize a git repository with a commit, then change a corresponding test before retrying."));
    return;
  }
  for (const target of targets) {
    if (target.kind === "source" && !checkSourceTarget(root, event, target)) return;
  }
}
async function main() {
  const event = await readStdinJson();
  const mode = process.argv[2];
  if (event.__parseError) {
    warn("hook input was not valid JSON");
    if (mode === "pre") {
      writeJson(preToolDeny("[TDD Guard] The hook could not parse this implementation event safely, so it was blocked. Fix the hook input, then retry."));
    } else if (mode === "session-start") {
      warn("advisory context was skipped");
    }
    return;
  }
  if (mode === "pre") await runPre(event);
  else if (mode === "session-start") runSessionStart();
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve5(process.argv[1])) {
  main().catch((error) => {
    const mode = process.argv[2];
    warn(`hook validation failed: ${errorMessage(error)}`);
    if (mode === "pre") {
      writeJson(preToolDeny("[TDD Guard] The hook could not validate this implementation change safely, so it was blocked. Fix the hook input or git state, then retry."));
    }
    process.exitCode = 0;
  });
}
