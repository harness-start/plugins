// harness-source-hash: sha256:c522b45b7aea50eddd02f21bc5741460ecc982a37227329f030c8303e3b3a1a6
import {
  collectOwnerHookOutput,
  eventCwd,
  eventPrompt,
  eventSessionId,
  eventToolInput,
  eventToolName,
  isRecord,
  ownerHookHandler,
  readStdinJson
} from "../chunks/chunk-7KAPTPQS.mjs";

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

// core/src/hook-targets.ts
import { isAbsolute, resolve as resolve2 } from "node:path";

// core/src/state-file.ts
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname as dirname2, join } from "node:path";
var DIRECTORY_MODE = 448;
var FILE_MODE = 384;
var WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));
function digestKey(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
function atomicWriteJson(path, value) {
  const directory = dirname2(path);
  const temporary = join(directory, `.${digestKey(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
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
  const lines2 = [];
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
      if (current.trim()) lines2.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) lines2.push(current);
  return lines2;
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

// plugins/delivery-governance/src/domains/ci/merge-protect.ts
var HEAD_SHA = /^[0-9a-f]{7,40}$/iu;
var DEFAULT_BRANCH = /^(?:main|master)$/u;
function isDefaultBranchRef(value) {
  return DEFAULT_BRANCH.test(value) || /^(?:refs\/heads\/)?(?:main|master)$/u.test(value);
}
function optionBindsHeadSha(args, option) {
  return args.some((arg, index) => {
    if (arg === option) return HEAD_SHA.test(args[index + 1] ?? "");
    return arg.startsWith(`${option}=`) && HEAD_SHA.test(arg.slice(option.length + 1));
  });
}
function gitSubcommand(args) {
  let index = 0;
  while (index < args.length) {
    const token = args[index];
    const next = args[index + 1];
    if (token === "-C" && next) {
      index += 2;
      continue;
    }
    if (token !== void 0 && ["-c", "--git-dir", "--work-tree"].includes(token)) {
      index += 2;
      continue;
    }
    break;
  }
  return { subcommand: args[index] ?? "", rest: args.slice(index + 1) };
}
function pushTouchesDefaultBranch(args) {
  return args.some((arg) => {
    if (isDefaultBranchRef(arg)) return true;
    const colon = arg.lastIndexOf(":");
    if (colon <= 0) return false;
    return isDefaultBranchRef(arg.slice(colon + 1));
  });
}
function pushBindsHeadSha(args) {
  return args.some((arg) => {
    const colon = arg.lastIndexOf(":");
    if (colon <= 0 || !isDefaultBranchRef(arg.slice(colon + 1))) return false;
    return HEAD_SHA.test(arg.slice(0, colon).replace(/^\+/u, ""));
  });
}
function classifyDefaultBranchPublish(command) {
  if (!command.trim()) return null;
  for (const invocation of shellCommandInvocations(command)) {
    const name = invocation.executable;
    const args = invocation.args;
    if (name === "gh" && args[0] === "pr" && args[1] === "merge" && !optionBindsHeadSha(args, "--match-head-commit")) {
      return {
        id: "MERGE_SHA_REQUIRED",
        reason: "gh pr merge without a bound head SHA can merge a different commit than the observed pipeline",
        recovery: "include the current head SHA, for example gh pr merge --match-head-commit <sha>"
      };
    }
    if (name === "glab" && args[0] === "mr" && args[1] === "merge" && !optionBindsHeadSha(args, "--sha")) {
      return {
        id: "MERGE_SHA_REQUIRED",
        reason: "glab mr merge without a bound head SHA can merge a different commit than the observed pipeline",
        recovery: "include the current head SHA in the same command, for example glab mr merge --sha <sha>"
      };
    }
    if (name === "git") {
      const { subcommand, rest } = gitSubcommand(args);
      if (subcommand === "push" && pushTouchesDefaultBranch(rest) && !pushBindsHeadSha(rest)) {
        return {
          id: "PUSH_SHA_REQUIRED",
          reason: "git push to main/master without a bound SHA can update the default branch from a different head",
          recovery: "push an explicit object name, for example git push origin <sha>:main"
        };
      }
    }
  }
  return null;
}
function formatMergeProtectDeny(finding3) {
  return [
    `[ci-gated-delivery] ${finding3.id}: default-branch publish needs a head SHA`,
    "",
    `reason: ${finding3.reason}`,
    "",
    "blockingContract:",
    "  observedFacts: The command publishes to a merge request or default branch without a hex head SHA in the same argv.",
    "  harm: A merge or default-branch update can land a different commit than the one just observed.",
    "  unblockWhen: Repeat the command with the current head SHA bound in the same argv.",
    `  recovery: ${finding3.recovery}`,
    "",
    "This hook does not prove that required CI jobs passed."
  ].join("\n");
}

// plugins/delivery-governance/src/domains/ci/entries/hooks/ci-gated-delivery.ts
function warn(message) {
  process.stderr.write(`[ci-gated-delivery] ${message}
`);
}
async function runHook() {
  const event = await readStdinJson();
  if (event.__parseError) return warn("invalid hook input; merge-protect skipped");
  const command = extractShellCommand(event);
  if (!command) return;
  const finding3 = classifyDefaultBranchPublish(command);
  if (finding3) writeJson(preToolDeny(formatMergeProtectDeny(finding3)));
}

// plugins/delivery-governance/src/domains/git/entries/hooks/git-delivery-hook-post-tool.ts
import { resolve as resolve3 } from "node:path";

// plugins/delivery-governance/src/domains/git/lib/hook-io.ts
function extractShellCommand2(toolName, toolInput) {
  return extractShellCommand({ tool_name: toolName, tool_input: toolInput });
}
function extractWriteTargets(event) {
  return extractFileTargets(event, { includeShellWrites: true });
}
function additionalContextOutput(hookEventName, text) {
  return additionalContext(hookEventName, text);
}

// plugins/delivery-governance/src/domains/git/checks/file-checks.ts
import { execFileSync } from "node:child_process";
import { existsSync as existsSync2, lstatSync, readFileSync as readFileSync2 } from "node:fs";
import { join as join2, relative } from "node:path";
import { pathToFileURL } from "node:url";
var MAX_FILE_BYTES = 2 * 1024 * 1024;
var CONFIG_FILE_NAME = ".git-delivery.mjs";
var SKIP_PATH = /(?:^|\/)(?:\.git|\.cache|\.next|\.nuxt|__generated__|build|coverage|dist|generated|node_modules|target|vendor)(?:\/|$)/iu;
var TEXT_PATH = /\.(?:bash|c|cc|cfg|cjs|cpp|css|cts|cxx|go|graphql|h|hh|hpp|html|ini|java|js|json|jsx|kt|kts|less|md|mjs|mts|php|py|rb|rs|sass|scss|sh|sql|svelte|swift|toml|ts|tsx|txt|vue|xml|yaml|yml|zsh)$/iu;
var EMPTY_OVERRIDES = [];
var DEFAULT_CONFIG = Object.freeze({
  checks: Object.freeze({ mergeConflict: "block", worktreeCreate: "block" }),
  overrides: Object.freeze(EMPTY_OVERRIDES)
});
function warnDefault(message) {
  process.stderr.write(`[git-delivery] ${message}
`);
}
function errorText(error) {
  if (isRecord(error) && error.message != null) return String(error.message);
  return String(error);
}
function isCheckMode(value) {
  return value === "block" || value === "report" || value === "off";
}
function isWorktreeCreateMode(value) {
  return value === "block" || value === "report" || value === "allow";
}
function normalizeMode(value, fallback, label, warn3) {
  if (value === void 0) return fallback;
  if (isCheckMode(value)) return value;
  warn3(`${label} must be "block", "report", or "off"; using ${fallback}`);
  return fallback;
}
function resolveConflictConfig(userConfig, warn3 = warnDefault) {
  const checks = {
    mergeConflict: "block",
    worktreeCreate: "block"
  };
  const record = isRecord(userConfig) ? userConfig : null;
  if (record?.checks !== void 0 && (!record.checks || typeof record.checks !== "object" || Array.isArray(record.checks))) {
    warn3('config "checks" must be an object; using defaults');
  } else {
    const checksSource = record && isRecord(record.checks) ? record.checks : null;
    checks.mergeConflict = normalizeMode(
      checksSource?.mergeConflict,
      checks.mergeConflict,
      "checks.mergeConflict",
      warn3
    );
    if (checksSource?.worktreeCreate !== void 0) {
      if (isWorktreeCreateMode(checksSource.worktreeCreate)) {
        checks.worktreeCreate = checksSource.worktreeCreate;
      } else {
        warn3('checks.worktreeCreate must be "block", "report", or "allow"; using block');
      }
    }
  }
  const overrides = [];
  if (record?.overrides !== void 0 && !Array.isArray(record.overrides)) {
    warn3('config "overrides" must be an array; ignoring overrides');
  } else {
    const rawOverrides = record && Array.isArray(record.overrides) ? record.overrides : [];
    for (const [index, override] of rawOverrides.entries()) {
      if (!isRecord(override) || !(override.match instanceof RegExp)) {
        warn3(`override[${index}].match must be a RegExp; skipping`);
        continue;
      }
      if (!override.checks || typeof override.checks !== "object" || Array.isArray(override.checks)) {
        warn3(`override[${index}].checks must be an object; skipping`);
        continue;
      }
      if (!isRecord(override.checks) || override.checks.mergeConflict === void 0) {
        warn3(`override[${index}] does not declare checks.mergeConflict; skipping`);
        continue;
      }
      const mode = normalizeMode(
        override.checks.mergeConflict,
        null,
        `override[${index}].checks.mergeConflict`,
        warn3
      );
      if (mode) overrides.push({ match: override.match, mode });
    }
  }
  return { checks, overrides };
}
function modeForConflict(relativePath, config) {
  for (const override of config.overrides) {
    try {
      if (new RegExp(override.match.source, override.match.flags).test(relativePath)) return override.mode;
    } catch {
    }
  }
  return config.checks.mergeConflict;
}
function findMergeConflictMarkers(text) {
  if (typeof text !== "string") return [];
  const findings = [];
  let hasBoundaryMarker = false;
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    if (/^(?:<<<<<<<|=======|>>>>>>>)(?:\s|$)/u.test(line)) {
      const finding3 = { line: index + 1, marker: line.slice(0, 7) };
      const isBoundary = finding3.marker !== "=======";
      if (isBoundary) {
        hasBoundaryMarker = true;
      }
      if (findings.length < 10) {
        findings.push(finding3);
      } else if (isBoundary && findings.every(({ marker }) => marker === "=======")) {
        findings[findings.length - 1] = finding3;
      }
    }
  }
  return hasBoundaryMarker ? findings : [];
}
function resolveRepoRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5e3,
      maxBuffer: 1024 * 1024
    }).trim();
  } catch {
    return null;
  }
}
async function loadConflictConfig(repoRoot, warn3 = warnDefault) {
  if (!repoRoot) return resolveConflictConfig(null, warn3);
  const configPath = join2(repoRoot, CONFIG_FILE_NAME);
  if (!existsSync2(configPath)) return resolveConflictConfig(null, warn3);
  try {
    const loaded = await import(pathToFileURL(configPath).href);
    const config = isRecord(loaded) ? loaded.default ?? loaded : loaded;
    return resolveConflictConfig(config, warn3);
  } catch (error) {
    warn3(`failed to load ${CONFIG_FILE_NAME}: ${errorText(error)}; using strict defaults`);
    return resolveConflictConfig(null, warn3);
  }
}
function repositoryRelativePath(filePath, repoRoot, cwd) {
  const base = repoRoot ?? cwd;
  const candidate = relative(base, filePath).replaceAll("\\", "/");
  return candidate.startsWith("../") ? filePath.replaceAll("\\", "/") : candidate;
}
function conflictFileFindings(filePaths, repoRoot, cwd, config) {
  const findings = [];
  for (const filePath of filePaths) {
    if (!existsSync2(filePath)) continue;
    const path = repositoryRelativePath(filePath, repoRoot, cwd);
    if (SKIP_PATH.test(path) || !TEXT_PATH.test(path)) continue;
    const mode = modeForConflict(path, config);
    if (mode === "off") continue;
    let stat;
    try {
      stat = lstatSync(filePath);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE_BYTES) continue;
    let text;
    try {
      text = readFileSync2(filePath, "utf8");
    } catch {
      continue;
    }
    for (const marker of findMergeConflictMarkers(text)) {
      findings.push({ path, mode, ...marker });
      if (findings.length >= 10) return findings;
    }
  }
  return findings;
}
function formatConflictFindings(findings) {
  return [
    "[Git Delivery Guards] Unresolved merge conflict detected",
    "",
    ...findings.map((finding3) => `- ${finding3.path}:${finding3.line} (${finding3.marker})`),
    "",
    "The file has already been written; the hook will not roll it back automatically.",
    "",
    "blockingContract:",
    "  observedFacts: The final text file still contains standard merge-conflict markers after the write.",
    "  harm: Unresolved conflicts can break builds, runtime behavior, and commit semantics.",
    "  unblockWhen: Resolve both sides of the change and remove every conflict marker.",
    "  recovery: Reread the complete file, preserve the correct semantics, remove the markers, and run relevant verification."
  ].join("\n");
}

// plugins/delivery-governance/src/domains/git/entries/hooks/git-delivery-hook-post-tool.ts
async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const targets = extractWriteTargets(event);
  if (!targets.length) return;
  const cwd = resolve3(eventCwd(event));
  const repoRoot = resolveRepoRoot(cwd);
  const config = await loadConflictConfig(repoRoot);
  const findings = conflictFileFindings(targets, repoRoot, cwd, config);
  if (!findings.length) return;
  const message = formatConflictFindings(findings);
  if (findings.some((finding3) => finding3.mode === "block")) {
    process.stderr.write(`${message}
`);
    process.exitCode = 2;
  } else {
    writeJson(additionalContextOutput("PostToolUse", message));
  }
}

// plugins/delivery-governance/src/domains/git/checks/command-rules.ts
import { lstatSync as lstatSync2, readFileSync as readFileSync3 } from "node:fs";
import { resolve as resolve4 } from "node:path";
var TYPES = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert"
];
var BRANCH = new RegExp(`^(?:${TYPES.join("|")})/[a-z0-9][a-z0-9._\\-/]{1,79}$`, "u");
var COMMIT = new RegExp(`^(?:${TYPES.join("|")})(?:\\([^)]+\\))?!?:\\s.+`, "u");
var GENERIC = /^(?:fix|update|move|迁移|修复|优化|调整|兼容|补充|完善|修改|cleanup|clean up|refactor|misc|stuff)$/iu;
var GARBLED = /\uFFFD|[\x00-\x08\x0E-\x1F\x7F]|[\uE000-\uF8FF]|\u00C3[\u0080-\u00BF]/u;
function finding(action, id, reason, command, recovery) {
  return { action, id, reason, command, recovery };
}
function gitInvocations(command, initialCwd) {
  if (typeof command !== "string" || !command.trim()) return [];
  return shellCommandInvocations(command).flatMap((invocation) => {
    if (invocation.executable !== "git" || invocation.stdinDriven) return [];
    const rawArgs = invocation.args;
    let cursor = 0;
    let cwd = resolve4(initialCwd);
    while (cursor < rawArgs.length) {
      const token = rawArgs[cursor];
      const next = rawArgs[cursor + 1];
      if (token === "-C" && next) {
        cwd = resolve4(cwd, next);
        cursor += 2;
        continue;
      }
      if (token !== void 0 && ["-c", "--git-dir", "--work-tree", "--namespace", "--config-env"].includes(token)) {
        cursor += 2;
        continue;
      }
      if (token !== void 0 && /^--(?:git-dir|work-tree|namespace|config-env)=/u.test(token)) {
        cursor += 1;
        continue;
      }
      break;
    }
    return [{ cwd, subcommand: rawArgs[cursor] ?? "", args: rawArgs.slice(cursor + 1) }];
  });
}
function gitAdd(invocation, command) {
  if (invocation.subcommand !== "add") return null;
  const args = invocation.args;
  if (args.some((token) => bulkAddPathspec(token) || token.startsWith("--pathspec-from-file"))) {
    return finding(
      "deny",
      "Git Add Guard",
      "bulk staging may include changes from other tasks",
      command,
      "stage each file explicitly with git add <specific-file-path>"
    );
  }
  const hasBulk = args.some(
    (token) => ["-A", "--all", "-u", "--update"].includes(token) || /^-[^-]*[Au]/u.test(token)
  );
  const explicit = args.some((token, index) => {
    const previous = index > 0 ? args[index - 1] : void 0;
    return !token.startsWith("-") && (previous === void 0 || !["--chmod", "--intent-to-add"].includes(previous));
  });
  if (hasBulk && !explicit) {
    return finding(
      "deny",
      "Git Add Guard",
      "-A/--all/-u without a specific path stages changes in bulk",
      command,
      "stage each file explicitly with git add <specific-file-path>"
    );
  }
  return null;
}
function bulkAddPathspec(token) {
  if ([".", "./", "*", "./*", ":/", ":(top)"].includes(token)) return true;
  if (token.startsWith(":!") || token.startsWith(":^")) return true;
  if (token.startsWith(":/")) return /[*?[\]]/u.test(token.slice(2));
  if (!token.startsWith(":(")) return /[*?[\]]/u.test(token);
  const close = token.indexOf(")");
  if (close < 0) return false;
  const magic = token.slice(2, close).split(",").map((part) => part.trim()).filter(Boolean);
  const pattern = token.slice(close + 1);
  const literalOnly = magic.every((part) => part === "literal" || part === "top");
  return !pattern || !literalOnly || /[*?[\]]/u.test(pattern);
}
function destructiveGit(invocation, command) {
  const subcommand = invocation.subcommand;
  const args = invocation.args;
  if (subcommand === "update-ref" && args.includes("-d") && args.some((arg) => arg.startsWith("refs/original/"))) {
    return finding(
      "deny",
      "Dangerous Git Command",
      "deleting refs/original removes recovery references from history rewrites",
      command,
      "clean up recovery references only after a controlled history migration is verified"
    );
  }
  if (subcommand === "reset" && args.includes("--hard")) {
    return finding(
      "deny",
      "Dangerous Git Command",
      "git reset --hard discards uncommitted changes",
      command,
      "save the diff or stash first, then use a non-destructive reset"
    );
  }
  if (subcommand === "clean") {
    const dryRun = args.includes("-n") || args.includes("--dry-run") || args.some((arg) => /^-[^-]*n/u.test(arg));
    const destructive = args.some((arg) => ["--force", "--directory"].includes(arg) || /^-[^-]*[fd]/u.test(arg));
    if (destructive && !dryRun) {
      return finding(
        "deny",
        "Dangerous Git Command",
        "git clean -f/-d permanently deletes untracked files or directories",
        command,
        "run git clean -nd first and handle targets individually"
      );
    }
  }
  if (subcommand === "push") {
    const lease = args.some((arg) => arg === "--force-with-lease" || arg.startsWith("--force-with-lease="));
    const force = args.some((arg) => arg === "--force" || arg === "-f" || /^-[^-]*f/u.test(arg));
    if (force && !lease) {
      return finding(
        "deny",
        "Dangerous Git Command",
        "git push --force overwrites remote history",
        command,
        "use --force-with-lease and verify the remote baseline"
      );
    }
  }
  if (["filter-repo", "filter-branch"].includes(subcommand)) {
    return finding(
      "deny",
      "Dangerous Git Command",
      `${subcommand} rewrites repository history`,
      command,
      "run it in a separate clone and preserve recovery references"
    );
  }
  if (subcommand === "stash" && args[0] === "clear") {
    return finding(
      "deny",
      "Dangerous Git Command",
      "git stash clear permanently deletes every stash",
      command,
      "inspect stashes individually and delete only an explicitly authorized stash"
    );
  }
  if (subcommand === "stash" && args[0] === "drop") {
    const approved = /(?:^|[;&|]\s*)AI_EXPERTS_ALLOW_GIT_STASH_DROP=1\s+git(?:\s+-\S+)*\s+stash\s+drop\s+['"]?stash@\{\d+\}['"]?(?:\s|$)/u.test(command);
    const stashRef = args[1];
    if (!approved || args.length !== 2 || stashRef === void 0 || !/^stash@\{\d+\}$/u.test(stashRef)) {
      return finding(
        "deny",
        "Dangerous Git Command",
        "git stash drop requires an inline approval sentinel and an explicit stash@{N}",
        command,
        "use AI_EXPERTS_ALLOW_GIT_STASH_DROP=1 git stash drop 'stash@{N}'"
      );
    }
  }
  if (subcommand === "checkout" && args.includes("--") && args.some((arg) => [".", "./", "*", "./*"].includes(arg))) {
    return finding(
      "deny",
      "Dangerous Git Command",
      "bulk checkout discards working-tree changes",
      command,
      "save the diff first and restore one file at a time"
    );
  }
  if (subcommand === "restore" && (args.some((arg) => [".", "./", "*", "./*"].includes(arg)) || args.some((arg, index) => arg === "--source=HEAD" || arg === "--source" && args[index + 1] === "HEAD"))) {
    return finding(
      "deny",
      "Dangerous Git Command",
      "git restore overwrites working-tree changes from HEAD or a bulk target",
      command,
      "save the diff and restore only an explicitly authorized individual file and source"
    );
  }
  return null;
}
function branchName(invocation, command) {
  if (!["checkout", "switch"].includes(invocation.subcommand)) return null;
  const args = invocation.args;
  const flagIndex = args.findIndex((arg) => ["-b", "-B", "-c", "-C", "--create", "--force-create"].includes(arg));
  const branch = flagIndex >= 0 ? args[flagIndex + 1] : null;
  if (!branch || BRANCH.test(branch)) return null;
  return finding(
    "deny",
    "Branch Naming Guard",
    `branch name ${branch} does not match <type>/<lowercase-slug>`,
    command,
    `use ${TYPES.join("|")}/<lowercase-slug>`
  );
}
function worktreeAction(args) {
  for (const token of args) {
    if (token === "--") continue;
    if (token.startsWith("-")) continue;
    return token;
  }
  return "";
}
function worktreeCreate(invocation, command) {
  if (invocation.subcommand !== "worktree") return null;
  if (worktreeAction(invocation.args) !== "add") return null;
  return finding(
    "deny",
    "Worktree Create Guard",
    "unsolicited git worktree add creates an extra linked checkout",
    command,
    "stay on the current checkout and use an ordinary short-lived branch; create a worktree only after the user asks for an isolated workspace or repository configuration explicitly allows it"
  );
}
function conflictChoice(invocation, command) {
  if (!["checkout", "restore"].includes(invocation.subcommand)) return null;
  const args = invocation.args;
  if (!args.includes("--ours") && !args.includes("--theirs")) return null;
  const divider = args.indexOf("--");
  const candidates = divider >= 0 ? args.slice(divider + 1) : args.filter((arg) => !arg.startsWith("-") && !["checkout", "restore"].includes(arg));
  const targets = candidates.filter((arg) => !["ours", "theirs"].includes(arg));
  const unsafe = targets.length !== 1 || targets.some((target) => {
    if ([".", "./", "*", "./*"].includes(target) || /[*?[]/u.test(target) || target.endsWith("/")) return true;
    try {
      return lstatSync2(resolve4(invocation.cwd, target)).isDirectory();
    } catch {
      return false;
    }
  });
  return unsafe ? finding(
    "deny",
    "Bulk Conflict Choice Guard",
    "ours/theirs may be applied only to one explicit file",
    command,
    "review each conflict and choose a side one file at a time"
  ) : null;
}
function commitMessage(invocation, command) {
  if (invocation.subcommand !== "commit") return null;
  const args = invocation.args;
  if (args.some((arg) => /^(?:--amend|--fixup|--squash)(?:=|$)/u.test(arg))) return null;
  if (/\$\(\s*cat\s+<</u.test(command)) {
    return finding(
      "deny",
      "Commit Heredoc Guard",
      "commit messages must not be generated through heredoc command substitution",
      command,
      "use one or more git commit -m strings"
    );
  }
  const paragraphs = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === void 0) continue;
    const next = args[index + 1];
    if (["-m", "--message"].includes(token) && next) {
      index += 1;
      paragraphs.push(next);
    } else if (token.startsWith("--message=")) {
      paragraphs.push(token.slice(10));
    } else if (/^-m.+/u.test(token)) {
      paragraphs.push(token.slice(2));
    } else if (["-F", "--file"].includes(token) && next) {
      index += 1;
      const path = next;
      try {
        paragraphs.push(readFileSync3(resolve4(invocation.cwd, path), "utf8"));
      } catch {
      }
    } else if (token.startsWith("--file=")) {
      try {
        paragraphs.push(readFileSync3(resolve4(invocation.cwd, token.slice(7)), "utf8"));
      } catch {
      }
    } else if (/^-F.+/u.test(token)) {
      try {
        paragraphs.push(readFileSync3(resolve4(invocation.cwd, token.slice(2)), "utf8"));
      } catch {
      }
    }
  }
  const message = paragraphs.join("\n\n").trim();
  if (!message) return null;
  const first = message.split("\n").find((line) => line.trim())?.trim() ?? "";
  const description = (first.match(/^[^:]+:\s*(.+)$/u)?.[1] ?? first).trim();
  const issues = [];
  if (first.length < 8) issues.push("first line is too short");
  if (!COMMIT.test(first)) issues.push("not in Conventional Commits format");
  if (GENERIC.test(description)) issues.push("description is too vague");
  if (GARBLED.test(message)) issues.push("contains garbled text or control characters");
  return issues.length ? finding(
    "deny",
    "Commit Message Guard",
    issues.join("\uFF1B"),
    command,
    "use <type>(<scope>): <specific-description>"
  ) : null;
}
function classifyDeliveryCommand(command, cwd) {
  const findings = [];
  for (const invocation of gitInvocations(command, cwd)) {
    for (const result of [
      gitAdd(invocation, command),
      destructiveGit(invocation, command),
      branchName(invocation, command),
      conflictChoice(invocation, command),
      commitMessage(invocation, command),
      worktreeCreate(invocation, command)
    ]) {
      if (result) findings.push(result);
    }
  }
  return findings;
}
function formatDeliveryFinding(value) {
  return [
    `[${value.id}] ${value.action === "deny" ? "Blocked" : "Risk notice"}`,
    "",
    `Reason: ${value.reason}`,
    `Recovery/alternative: ${value.recovery}`,
    ...value.action === "deny" ? [
      "",
      "blockingContract:",
      "  observedFacts: The command or repository state matched a local Git delivery rule.",
      "  harm: The operation may lose changes, contaminate commit boundaries, hide conflicts, or impair recovery.",
      "  unblockWhen: Use an operation with explicit targets, recoverability, and clear commit boundaries.",
      `  recovery: ${value.recovery}`
    ] : []
  ].join("\n");
}

// plugins/delivery-governance/src/domains/git/checks/state-checks.ts
import { execFileSync as execFileSync2 } from "node:child_process";
import {
  existsSync as existsSync3,
  lstatSync as lstatSync3,
  readFileSync as readFileSync4,
  unlinkSync
} from "node:fs";
import { basename, extname, join as join3, posix, resolve as resolve5 } from "node:path";
var WRITE_COMMANDS = /* @__PURE__ */ new Set([
  "add",
  "am",
  "checkout",
  "cherry-pick",
  "commit",
  "merge",
  "mv",
  "pull",
  "rebase",
  "reset",
  "restore",
  "rm",
  "stash",
  "switch"
]);
var LOCK_AGE_MS = 5 * 60 * 1e3;
var MANIFESTS = [
  "package.json",
  "composer.json",
  "go.mod",
  "Cargo.toml",
  "pyproject.toml",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "mix.exs",
  "Gemfile",
  "CMakeLists.txt"
];
var SOURCE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".c",
  ".cpp",
  ".cs",
  ".ex",
  ".go",
  ".h",
  ".hpp",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".kts",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".scala",
  ".sh",
  ".svelte",
  ".swift",
  ".ts",
  ".tsx",
  ".vue"
]);
var CONFIG_EXTENSIONS = /* @__PURE__ */ new Set([
  ".cfg",
  ".conf",
  ".env",
  ".hcl",
  ".ini",
  ".json",
  ".properties",
  ".tf",
  ".tfvars",
  ".toml",
  ".xml",
  ".yaml",
  ".yml"
]);
function errorText2(error) {
  if (isRecord(error) && error.message != null) return String(error.message);
  return String(error);
}
function git(args, cwd) {
  try {
    return execFileSync2("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 8e3,
      maxBuffer: 2 * 1024 * 1024
    }).trim();
  } catch {
    return null;
  }
}
function lines(args, cwd) {
  const output = git(args, cwd);
  return output === null ? null : output ? output.split("\n").filter(Boolean) : [];
}
function finding2(action, id, reason, recovery) {
  return { action, id, reason, recovery };
}
function processState(pid) {
  try {
    process.kill(pid, 0);
    return "alive";
  } catch (error) {
    if (isRecord(error) && error.code === "ESRCH") return "dead";
    return "unknown";
  }
}
function staleLock(invocation) {
  if (!WRITE_COMMANDS.has(invocation.subcommand)) return null;
  const rawGitDir = git(["rev-parse", "--git-dir"], invocation.cwd);
  if (!rawGitDir) return null;
  const lockPath = resolve5(invocation.cwd, rawGitDir, "index.lock");
  if (!existsSync3(lockPath)) return null;
  let snapshot;
  try {
    snapshot = lstatSync3(lockPath);
  } catch {
    return null;
  }
  if (!snapshot.isFile() || snapshot.isSymbolicLink()) {
    return finding2(
      "deny",
      "Git Lock Guard",
      `${lockPath} is not a regular lock file that can be handled safely`,
      "stop Git writes and manually inspect the Git directory and lock-file type"
    );
  }
  const age = Date.now() - snapshot.mtimeMs;
  if (age < LOCK_AGE_MS) {
    return finding2(
      "deny",
      "Git Lock Guard",
      `index.lock is only ${Math.max(0, Math.round(age / 1e3))} seconds old and has not passed the safety threshold`,
      "wait for the current Git operation to finish, then retry"
    );
  }
  let parsedPid = null;
  try {
    const match = readFileSync4(lockPath, "utf8").slice(0, 64).match(/^(\d+)\s/u)?.[1];
    if (match !== void 0) parsedPid = Number(match);
  } catch {
  }
  if (parsedPid === null || !Number.isSafeInteger(parsedPid) || parsedPid <= 0) {
    return finding2(
      "deny",
      "Git Lock Guard",
      "the stale index.lock has no verifiable holder PID; automatic deletion is refused",
      `confirm that no Git process is running, then delete ${lockPath} manually`
    );
  }
  const pid = parsedPid;
  const holder = processState(pid);
  if (holder !== "dead") {
    return finding2(
      "deny",
      "Git Lock Guard",
      holder === "alive" ? `PID ${pid} recorded by index.lock is still alive` : `cannot confirm that PID ${pid} has exited`,
      "wait for the holder to finish; handle the lock file only after confirming that the process exited"
    );
  }
  try {
    const current = lstatSync3(lockPath);
    const sameFile = current.isFile() && !current.isSymbolicLink() && current.dev === snapshot.dev && current.ino === snapshot.ino && current.mtimeMs === snapshot.mtimeMs;
    if (!sameFile) {
      return finding2(
        "deny",
        "Git Lock Guard",
        "index.lock changed during verification; automatic deletion is refused",
        "recheck the current Git holder and lock-file state"
      );
    }
    unlinkSync(lockPath);
    return finding2(
      "report",
      "Git Lock Guard",
      `removed an index.lock that was ${Math.round(age / 1e3)} seconds old after PID ${pid} exited`,
      "no action is required; if Git still fails, check for a new lock holder"
    );
  } catch (error) {
    return finding2(
      "deny",
      "Git Lock Guard",
      `the stale index.lock could not be removed safely: ${errorText2(error)}`,
      `confirm that no Git process is running, then delete ${lockPath} manually`
    );
  }
}
function readBoundaryRules(root) {
  const configPath = join3(root, ".ai-experts", "commit-boundaries.json");
  if (!existsSync3(configPath)) return { rules: [], error: null };
  let value;
  try {
    value = JSON.parse(readFileSync4(configPath, "utf8"));
  } catch (error) {
    return { rules: [], error: `failed to parse ${configPath}: ${errorText2(error)}` };
  }
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.boundaries)) {
    return { rules: [], error: `${configPath} must contain version: 1 and a boundaries array` };
  }
  const rules = [];
  const ids = /* @__PURE__ */ new Set();
  for (const [index, item] of value.boundaries.entries()) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim() || ids.has(item.id) || !Array.isArray(item.prefixes) || item.prefixes.length === 0) {
      return { rules: [], error: `boundaries[${index}] must have a unique non-empty id and a non-empty prefixes array` };
    }
    ids.add(item.id);
    for (const prefixValue of item.prefixes) {
      if (typeof prefixValue !== "string" || !prefixValue.trim()) {
        return { rules: [], error: `boundaries[${index}].prefixes may contain only non-empty strings` };
      }
      const segments = prefixValue.replaceAll("\\", "/").split("/");
      if (segments.includes("..")) {
        return { rules: [], error: `a prefix in boundaries[${index}] must not contain ..` };
      }
      const prefix = prefixValue.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/+$/u, "");
      rules.push({ id: item.id, prefix });
    }
  }
  rules.sort((left, right) => right.prefix.length - left.prefix.length);
  return { rules, error: null };
}
function boundaryFor(file, root, rules) {
  const normalized = file.replaceAll("\\", "/");
  const explicit = rules.find(
    (rule) => !rule.prefix || normalized === rule.prefix || normalized.startsWith(`${rule.prefix}/`)
  );
  if (explicit) return explicit.id;
  let directory = posix.dirname(normalized);
  while (true) {
    const diskPath = directory === "." ? root : join3(root, directory);
    if (MANIFESTS.some((name) => existsSync3(join3(diskPath, name)))) {
      return directory === "." ? "repo-root" : directory;
    }
    if (directory === ".") return "repo-root";
    const parent = posix.dirname(directory);
    if (parent === directory) return "repo-root";
    directory = parent;
  }
}
function commitState(invocation) {
  if (invocation.subcommand !== "commit" || invocation.args.some(
    (arg) => /^(?:--amend|--fixup|--squash)(?:=|$)/u.test(arg)
  )) return [];
  const staged = lines(["diff", "--cached", "--name-only"], invocation.cwd);
  if (!staged) return [];
  const unstaged = lines(["diff", "--name-only"], invocation.cwd);
  const unstagedSet = new Set(unstaged ?? []);
  const overlap = staged.filter((file) => unstagedSet.has(file));
  const findings = [];
  const commitAll = invocation.args.some((arg) => arg === "-a" || arg === "--all" || /^-[^-]*a/u.test(arg));
  if (overlap.length && !commitAll) {
    findings.push(finding2(
      "report",
      "Partial Staging Guard",
      `${overlap.length} file(s) have both staged and unstaged changes: ${overlap.slice(0, 8).join(", ")}`,
      "inspect git diff --cached -- <file> and git diff -- <file> separately"
    ));
  }
  const files = commitAll ? [.../* @__PURE__ */ new Set([...staged, ...unstaged ?? []])] : staged;
  if (!files.length) return findings;
  const root = git(["rev-parse", "--show-toplevel"], invocation.cwd) || invocation.cwd;
  const boundaryConfig = readBoundaryRules(root);
  if (boundaryConfig.error) {
    findings.push(finding2(
      "deny",
      "Commit Scope Guard",
      boundaryConfig.error,
      "fix .ai-experts/commit-boundaries.json before committing again"
    ));
    return findings;
  }
  const nameStatus = lines(["diff", "--cached", "--name-status"], invocation.cwd);
  if (nameStatus?.length && nameStatus.every((line) => /^R\d*\t/u.test(line))) {
    if (files.length > 15) {
      findings.push(finding2(
        "report",
        "Commit Scope Guard",
        `rename-only commit contains ${files.length} migration entries`,
        "confirm that every migration mapping has been reconciled"
      ));
    }
    return findings;
  }
  const groups = /* @__PURE__ */ new Map();
  for (const file of files) {
    const boundary = boundaryFor(file, root, boundaryConfig.rules);
    if (!groups.has(boundary)) groups.set(boundary, { source: false, config: false });
    const group = groups.get(boundary);
    if (!group) continue;
    const extension = extname(file).toLowerCase();
    if (SOURCE_EXTENSIONS.has(extension)) group.source = true;
    if (CONFIG_EXTENSIONS.has(extension) || /^(?:Dockerfile|Jenkinsfile|Makefile)$/u.test(basename(file))) group.config = true;
  }
  const mixed = [...groups.values()].some((group) => group.source && group.config);
  if (groups.size >= 2 || mixed) {
    findings.push(finding2(
      "deny",
      "Commit Scope Guard",
      `commit crosses ${groups.size} manifest/explicit boundaries or mixes source with config/infra: ${[...groups.keys()].join(", ")}`,
      "unstage the batch and git add/commit each declared boundary and concern separately"
    ));
  } else if (files.length > 15) {
    findings.push(finding2(
      "report",
      "Commit Scope Guard",
      `one commit contains ${files.length} files`,
      "check whether it can be split into smaller atomic commits"
    ));
  }
  return findings;
}
function deliveryStateFindings(cwd, command) {
  return gitInvocations(command, cwd).flatMap((invocation) => {
    const lock = staleLock(invocation);
    return lock ? [lock, ...commitState(invocation)] : commitState(invocation);
  });
}

// plugins/delivery-governance/src/domains/git/lib/worktree-intent.ts
import { mkdirSync as mkdirSync3, readFileSync as readFileSync6 } from "node:fs";
import { dirname as dirname3, isAbsolute as isAbsolute2, join as join5, relative as relative2, resolve as resolve6 } from "node:path";

// core/src/plugin-workdir.ts
import { mkdirSync as mkdirSync2, readFileSync as readFileSync5, writeFileSync as writeFileSync2 } from "node:fs";
import { join as join4 } from "node:path";
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
  const ignore = join4(pluginRoot2, ".gitignore");
  let current = null;
  try {
    current = readFileSync5(ignore, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (current !== null && normalizeGitignore(current) === "*") return;
  if (current !== null && !isStalePluginWorkdirGitignore(current)) return;
  writeFileSync2(ignore, PLUGIN_WORKDIR_GITIGNORE, { encoding: "utf8", mode: 384 });
}

// plugins/delivery-governance/src/domains/git/lib/worktree-intent.ts
var WORKTREE_STATE_DIR = ".git-delivery/state";
var RECEIPT_VERSION = 1;
var CREATION_PATTERNS = [
  /\b(?:create|creating|use|using)\s+(?:a |an |the )?(?:linked |isolated )?(?:git\s+)?worktree\b/iu,
  /(?:用|使用)\s*git\s+worktree\b/iu,
  /隔离\s*(?:工作区|checkout|检出|审查)/iu,
  /\bisolation\s*[:=]\s*worktree\b/iu,
  /\.worktrees\//u,
  /(?:创建|新建|开一个)[^。.\n]{0,20}worktree/iu,
  /worktree[^。.\n]{0,20}(?:创建|新建)/iu
];
function stripNegatedSpans(text) {
  return text.replace(/(?:不要|别|勿|禁止)[^。\n]{0,40}(?:git\s+)?worktree\b(?:\s+\S+)*/giu, " ").replace(/(?:do not|don't|without)\s+(?:use |create |creating )?(?:a |an )?(?:git\s+)?worktree\b(?:\s+\S+)*/giu, " ").replace(/不要改\s*git\s*工作区/giu, " ");
}
function userRequestedWorktreeCreate(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) return false;
  const remaining = stripNegatedSpans(prompt);
  return CREATION_PATTERNS.some((pattern) => pattern.test(remaining));
}
function worktreeIsolationRequested(toolInput) {
  if (!isRecord(toolInput)) return false;
  const isolation = toolInput.isolation ?? toolInput.Isolation;
  if (isolation === "worktree") return true;
  return isRecord(isolation) && (isolation.type === "worktree" || isolation.mode === "worktree");
}
function worktreeCreateReceiptPath(cwd, sessionId) {
  return join5(
    resolve6(cwd),
    WORKTREE_STATE_DIR,
    "sessions",
    digestKey(sessionId || "missing"),
    "worktree-create.json"
  );
}
function isWorktreeAuthorizationStateTarget(cwd, target) {
  const stateRoot = resolve6(cwd, WORKTREE_STATE_DIR);
  const candidate = resolve6(target);
  const relation = relative2(stateRoot, candidate);
  return relation === "" || !relation.startsWith("..") && !isAbsolute2(relation);
}
function commandReferencesWorktreeAuthorizationState(command) {
  return /(?:^|[^A-Za-z0-9._-])\.git-delivery[\\/]state(?:[\\/]|\b)/u.test(command);
}
function isWorktreeCreateSource(value) {
  return value === "user-prompt";
}
function parseReceipt(value) {
  if (!isRecord(value) || value.version !== RECEIPT_VERSION || value.allowed !== true) {
    return null;
  }
  if (!isWorktreeCreateSource(value.source) || typeof value.createdAt !== "string" || !value.createdAt) {
    return null;
  }
  return {
    version: 1,
    allowed: true,
    source: "user-prompt",
    createdAt: value.createdAt
  };
}
function readWorktreeCreateReceipt(cwd, sessionId) {
  if (!sessionId) return null;
  try {
    return parseReceipt(JSON.parse(readFileSync6(worktreeCreateReceiptPath(cwd, sessionId), "utf8")));
  } catch {
    return null;
  }
}
function recordWorktreeCreateAllowance(cwd, sessionId, source, _processId) {
  if (!sessionId || source !== "user-prompt") return false;
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  const receipt = { version: 1, allowed: true, source, createdAt };
  const path = worktreeCreateReceiptPath(cwd, sessionId);
  mkdirSync3(dirname3(path), { recursive: true, mode: 448 });
  ensurePluginWorkdirGitignore(join5(resolve6(cwd), ".git-delivery"));
  return atomicWriteJson(path, receipt);
}
function isWorktreeCreatePermitted(mode, receipt) {
  if (mode === "allow") return true;
  return receipt?.allowed === true;
}

// plugins/delivery-governance/src/domains/git/entries/hooks/git-delivery-hook-pre-tool.ts
var WORKTREE_CREATE_ID = "Worktree Create Guard";
var WORKTREE_ISOLATION_FINDING = {
  action: "deny",
  id: WORKTREE_CREATE_ID,
  reason: "unsolicited host isolation: worktree creates an extra linked checkout",
  command: "isolation: worktree",
  recovery: "spawn the subagent in the current checkout; create a worktree only after the user asks for an isolated workspace or repository configuration explicitly allows it"
};
async function main2() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const toolInput = eventToolInput(event);
  const command = extractShellCommand2(eventToolName(event), toolInput);
  const cwd = eventCwd(event);
  const repoRoot = resolveRepoRoot(cwd);
  const findings = command ? [...classifyDeliveryCommand(command, cwd), ...deliveryStateFindings(cwd, command)] : [];
  const protectedTarget = extractWriteTargets(event).find((target) => isWorktreeAuthorizationStateTarget(repoRoot ?? cwd, target));
  const protectedCommand = command && commandReferencesWorktreeAuthorizationState(command) ? command : null;
  if (protectedTarget || protectedCommand) {
    findings.push({
      action: "deny",
      id: "Authorization State Guard",
      reason: "plugin-owned worktree authorization state may be accessed only by the bundled Hooks",
      command: protectedTarget ?? protectedCommand ?? WORKTREE_STATE_DIR,
      recovery: "do not access .git-delivery/state directly; ask the user to request a worktree or configure checks.worktreeCreate"
    });
  }
  if (worktreeIsolationRequested(toolInput)) findings.push(WORKTREE_ISOLATION_FINDING);
  if (!findings.length) return;
  const config = await loadConflictConfig(repoRoot);
  const receipt = readWorktreeCreateReceipt(repoRoot ?? cwd, eventSessionId(event));
  const permitted = isWorktreeCreatePermitted(config.checks.worktreeCreate, receipt);
  const resolved = findings.flatMap((finding3) => {
    if (finding3.id !== WORKTREE_CREATE_ID) return [finding3];
    if (permitted) return [];
    if (config.checks.worktreeCreate === "report") return [{ ...finding3, action: "report" }];
    return [finding3];
  });
  const denied = resolved.find((finding3) => finding3.action === "deny");
  if (denied) writeJson(preToolDeny(formatDeliveryFinding(denied)));
  else if (resolved.length) {
    writeJson(additionalContextOutput(
      "PreToolUse",
      resolved.map(formatDeliveryFinding).join("\n\n")
    ));
  }
}

// plugins/delivery-governance/src/domains/git/entries/hooks/git-delivery-hook-user-prompt.ts
async function main3() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  if (!userRequestedWorktreeCreate(eventPrompt(event))) return;
  const cwd = eventCwd(event);
  recordWorktreeCreateAllowance(resolveRepoRoot(cwd) ?? cwd, eventSessionId(event), "user-prompt");
}

// plugins/delivery-governance/src/domains/history/source-protect.ts
function gitSubcommand2(args) {
  let index = 0;
  while (index < args.length) {
    const token = args[index];
    const next = args[index + 1];
    if (token === "-C" && next) {
      index += 2;
      continue;
    }
    if (token !== void 0 && ["-c", "--git-dir", "--work-tree", "--namespace", "--config-env"].includes(token)) {
      index += 2;
      continue;
    }
    if (token !== void 0 && /^--(?:git-dir|work-tree|namespace|config-env)=/u.test(token)) {
      index += 1;
      continue;
    }
    break;
  }
  return { subcommand: args[index] ?? "", rest: args.slice(index + 1) };
}
function classifySourceProtectCommand(command) {
  if (!command.trim()) return null;
  for (const invocation of shellCommandInvocations(command)) {
    const executable = invocation.executable;
    if (executable === "git-filter-repo") {
      return {
        id: "SOURCE_FILTER_REPO",
        reason: "git filter-repo rewrites history and must not run against the source repository",
        recovery: "run node <plugin>/dist/cli/harness.mjs migration execute with a sealed preflight"
      };
    }
    if (executable !== "git") continue;
    const { subcommand, rest } = gitSubcommand2(invocation.args);
    if (subcommand === "filter-repo" || subcommand === "filter-branch") {
      return {
        id: "SOURCE_FILTER_REPO",
        reason: `${subcommand} rewrites history and must not run against the source repository`,
        recovery: "run node <plugin>/dist/cli/harness.mjs migration execute with a sealed preflight"
      };
    }
    if (subcommand === "reset" && rest.includes("--hard")) {
      return {
        id: "SOURCE_RESET_HARD",
        reason: "git reset --hard discards source worktree state",
        recovery: "leave the source repository unchanged; use the plugin execute CLI in a separate clone"
      };
    }
    if (subcommand === "push") {
      const force = rest.some(
        (arg) => arg === "--force" || arg === "-f" || arg === "--force-if-includes" || arg.startsWith("--force-with-lease") || /^-[^-]*f/u.test(arg)
      );
      if (force) {
        return {
          id: "SOURCE_FORCE_PUSH",
          reason: "force-push can rewrite the source remote",
          recovery: "do not push from the source during migration; publish only the new target repository when authorized"
        };
      }
    }
  }
  return null;
}
function formatSourceProtectDeny(finding3) {
  return [
    `[repository-history-migration] ${finding3.id}: source repository stays read-only`,
    "",
    `reason: ${finding3.reason}`,
    "",
    "blockingContract:",
    "  observedFacts: The shell command would mutate or rewrite the source Git repository.",
    "  harm: History extraction must leave the source worktree, refs, and remotes unchanged.",
    "  unblockWhen: Use the sealed plugin execute CLI, or choose a non-destructive source command.",
    `  recovery: ${finding3.recovery}`
  ].join("\n");
}

// plugins/delivery-governance/src/domains/history/entries/hooks/repository-history-migration.ts
function warn2(message) {
  process.stderr.write(`[repository-history-migration] ${message}
`);
}
async function runPreToolUse() {
  const event = await readStdinJson();
  if (event.__parseError) return warn2("invalid hook input; source-protect skipped");
  const command = extractShellCommand(event);
  if (!command) return;
  const finding3 = classifySourceProtectCommand(command);
  if (finding3) writeJson(preToolDeny(formatSourceProtectDeny(finding3)));
}

// plugins/delivery-governance/src/entries/hooks/dispatcher.ts
var [host, eventName] = process.argv.slice(2);
if (!host || !eventName) throw new Error("dispatcher requires <host> <event>");
await runOwnerDispatcher(host, eventName, {
  "ci:ci-gated-delivery": ownerHookHandler(runHook),
  "git:git-delivery-hook-post-tool": ownerHookHandler(main),
  "git:git-delivery-hook-pre-tool": ownerHookHandler(main2),
  "git:git-delivery-hook-user-prompt": ownerHookHandler(main3),
  "history:repository-history-migration": ownerHookHandler(runPreToolUse)
});
