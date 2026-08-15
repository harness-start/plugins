#!/usr/bin/env node
// harness-source-hash: sha256:24f0a8d9334954e599ceef19b4ebf1ac278a96569d4312beb23913dd7d0b135a

// plugins/execution-loop-guard/src/entries/hooks/execution-loop-guard.ts
import { relative as relative2, resolve as resolve4 } from "node:path";
import { fileURLToPath } from "node:url";

// plugins/execution-loop-guard/src/lib/config.ts
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
var CONFIG_NAMES = [
  ".execution-loop-guard.mjs",
  ".execution-loop-guard.cjs",
  ".execution-loop-guard.js"
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
  process.stderr.write(`[execution-loop-guard] ${message}
`);
}
function cloneRegex(pattern) {
  return new RegExp(pattern.source, pattern.flags);
}
function mode(value, fallback, label, warn2) {
  if (value === void 0) return fallback;
  if (VALID_MODES.has(value)) return value;
  warn2(`${label} must be "block", "report", or "off"; using ${fallback}`);
  return fallback;
}
function positiveInteger(value, fallback, label, warn2, { allowZero = false } = {}) {
  const minimum = allowZero ? 0 : 1;
  if (value === void 0) return fallback;
  if (Number.isInteger(value) && value >= minimum) return value;
  warn2(`${label} must be an integer >= ${minimum}; using ${fallback}`);
  return fallback;
}
function thresholdPair(source, reportKey, blockKey, defaults, label, warn2) {
  const reportAt = positiveInteger(source?.[reportKey], defaults[reportKey], `${label}.${reportKey}`, warn2);
  const blockAt = positiveInteger(source?.[blockKey], defaults[blockKey], `${label}.${blockKey}`, warn2);
  if (reportAt < blockAt) return { [reportKey]: reportAt, [blockKey]: blockAt };
  warn2(`${label}.${reportKey} must be lower than ${label}.${blockKey}; using defaults`);
  return { [reportKey]: defaults[reportKey], [blockKey]: defaults[blockKey] };
}
function regex(value, fallback, label, warn2) {
  if (value === void 0) return cloneRegex(fallback);
  if (value instanceof RegExp) return cloneRegex(value);
  warn2(`${label} must be a RegExp; using the default`);
  return cloneRegex(fallback);
}
function exemptPaths(value, warn2) {
  const builtIns = DEFAULT_CONFIG.editLoop.exemptPaths.map(cloneRegex);
  if (value === void 0) return builtIns;
  if (!Array.isArray(value)) {
    warn2("editLoop.exemptPaths must be an array of RegExp values; using built-ins");
    return builtIns;
  }
  const custom = [];
  for (const [index, pattern] of value.entries()) {
    if (pattern instanceof RegExp) custom.push(cloneRegex(pattern));
    else warn2(`editLoop.exemptPaths[${index}] must be a RegExp; skipping`);
  }
  return [...builtIns, ...custom];
}
function resolveConfig(userConfig, warn2 = defaultWarn) {
  const user = userConfig && typeof userConfig === "object" && !Array.isArray(userConfig) ? userConfig : {};
  if (userConfig != null && user !== userConfig) warn2("config default export must be an object; using defaults");
  const checksSource = user.checks && typeof user.checks === "object" && !Array.isArray(user.checks) ? user.checks : {};
  if (user.checks !== void 0 && checksSource !== user.checks) {
    warn2("checks must be an object; using defaults");
  }
  const checks = Object.fromEntries(
    Object.entries(DEFAULT_CONFIG.checks).map(([name, fallback]) => [
      name,
      mode(checksSource[name], fallback, `checks.${name}`, warn2)
    ])
  );
  const editSource = user.editLoop && typeof user.editLoop === "object" && !Array.isArray(user.editLoop) ? user.editLoop : {};
  const editThresholds = thresholdPair(
    editSource,
    "reportAt",
    "blockAt",
    DEFAULT_CONFIG.editLoop,
    "editLoop",
    warn2
  );
  const editLoop = {
    ...editThresholds,
    windowMinutes: positiveInteger(
      editSource.windowMinutes,
      DEFAULT_CONFIG.editLoop.windowMinutes,
      "editLoop.windowMinutes",
      warn2
    ),
    exemptPaths: exemptPaths(editSource.exemptPaths, warn2)
  };
  const repeatSource = user.commandRepeat && typeof user.commandRepeat === "object" && !Array.isArray(user.commandRepeat) ? user.commandRepeat : {};
  const commandRepeat = {
    ...thresholdPair(
      repeatSource,
      "failureReportAt",
      "failureBlockAt",
      DEFAULT_CONFIG.commandRepeat,
      "commandRepeat",
      warn2
    ),
    ...thresholdPair(
      repeatSource,
      "successReportAt",
      "successBlockAt",
      DEFAULT_CONFIG.commandRepeat,
      "commandRepeat",
      warn2
    ),
    windowMinutes: positiveInteger(
      repeatSource.windowMinutes,
      DEFAULT_CONFIG.commandRepeat.windowMinutes,
      "commandRepeat.windowMinutes",
      warn2
    ),
    retryBypass: regex(
      repeatSource.retryBypass,
      DEFAULT_CONFIG.commandRepeat.retryBypass,
      "commandRepeat.retryBypass",
      warn2
    )
  };
  const pollingSource = user.polling && typeof user.polling === "object" && !Array.isArray(user.polling) ? user.polling : {};
  const polling = {
    sleepBudgetSeconds: positiveInteger(
      pollingSource.sleepBudgetSeconds,
      DEFAULT_CONFIG.polling.sleepBudgetSeconds,
      "polling.sleepBudgetSeconds",
      warn2
    ),
    queryBudgetCount: positiveInteger(
      pollingSource.queryBudgetCount,
      DEFAULT_CONFIG.polling.queryBudgetCount,
      "polling.queryBudgetCount",
      warn2
    ),
    windowMinutes: positiveInteger(
      pollingSource.windowMinutes,
      DEFAULT_CONFIG.polling.windowMinutes,
      "polling.windowMinutes",
      warn2
    ),
    cooldownMinutes: positiveInteger(
      pollingSource.cooldownMinutes,
      DEFAULT_CONFIG.polling.cooldownMinutes,
      "polling.cooldownMinutes",
      warn2,
      { allowZero: true }
    ),
    maxSleepPerCommandSeconds: positiveInteger(
      pollingSource.maxSleepPerCommandSeconds,
      DEFAULT_CONFIG.polling.maxSleepPerCommandSeconds,
      "polling.maxSleepPerCommandSeconds",
      warn2
    ),
    whileLoopAssumedIterations: positiveInteger(
      pollingSource.whileLoopAssumedIterations,
      DEFAULT_CONFIG.polling.whileLoopAssumedIterations,
      "polling.whileLoopAssumedIterations",
      warn2
    ),
    pollBypass: regex(
      pollingSource.pollBypass,
      DEFAULT_CONFIG.polling.pollBypass,
      "polling.pollBypass",
      warn2
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
async function loadProjectConfig(cwd, warn2 = defaultWarn) {
  const repoRoot = resolveRepoRoot(cwd);
  if (!repoRoot) return { config: resolveConfig(null, warn2), repoRoot: null };
  for (const name of CONFIG_NAMES) {
    const path = join(repoRoot, name);
    if (!existsSync(path)) continue;
    try {
      const loaded = await import(pathToFileURL(path).href);
      return { config: resolveConfig(loaded.default ?? loaded, warn2), repoRoot };
    } catch (error) {
      warn2(`failed to load ${name}: ${error instanceof Error ? error.message : String(error)}; using defaults`);
      return { config: resolveConfig(null, warn2), repoRoot };
    }
  }
  return { config: resolveConfig(null, warn2), repoRoot };
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

// core/src/hook-output.ts
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
  if (options.echoStderr) process.stderr.write(`${context}
`);
  if (options.suppressJson) return null;
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

// plugins/execution-loop-guard/src/lib/hook-io.ts
function extractSessionId(event) {
  return eventSessionId(event) || null;
}
function extractCwd(event) {
  return eventCwd(event);
}
function extractToolName(event) {
  return eventToolName(event);
}
function extractToolInput(event) {
  return eventToolInput(event);
}
function extractToolResponse(event) {
  return eventToolResponse(event);
}
function extractToolWait(event) {
  const fullName = String(extractToolName(event));
  const name = fullName.split(".").at(-1)?.toLowerCase();
  const input = extractToolInput(event);
  if (name === "list_agents") return { label: fullName, sleepSeconds: 0, queryCount: 1 };
  if (name === "wait_agent") {
    const milliseconds = Number(input?.timeout_ms ?? input?.timeoutMs ?? 0);
    return milliseconds > 0 ? { label: fullName, sleepSeconds: milliseconds / 1e3, queryCount: 0 } : null;
  }
  if (name === "wait" || name === "write_stdin") {
    const milliseconds = Number(input?.yield_time_ms ?? input?.yieldTimeMs ?? 0);
    return milliseconds > 0 ? { label: fullName, sleepSeconds: milliseconds / 1e3, queryCount: 0 } : null;
  }
  return null;
}
function extractFileTargets2(event) {
  return extractFileTargets(event);
}
function contextOutput(eventName, text) {
  return additionalContext(eventName, text, {
    echoStderr: Boolean(process.env.PLUGIN_ROOT) && eventName === "PostToolUse",
    suppressJson: Boolean(process.env.PLUGIN_ROOT) && eventName === "PostToolUse"
  });
}

// plugins/execution-loop-guard/src/lib/execution-loop-policy.ts
import { createHash } from "node:crypto";
import { existsSync as existsSync2, lstatSync, readFileSync, realpathSync } from "node:fs";
import { relative, resolve as resolve2 } from "node:path";
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
  return createHash("sha256").update(normalizeCommand(command)).digest("hex");
}
function directCommandWords(command) {
  const words = [];
  let word = "";
  let quote = null;
  let escaped = false;
  const source = String(command ?? "").trim();
  if (!source || /[\r\n]/u.test(source)) return null;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
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
function commandInputFingerprint(command, cwd, repoRoot) {
  const words = directCommandWords(command);
  if (!words?.length) return null;
  const root = resolve2(repoRoot);
  const inputs = [];
  for (const word of words) {
    const candidate = resolve2(cwd, word.replace(/^\.\//u, ""));
    try {
      const real = realpathSync(candidate);
      const rel = relative(root, real).replaceAll("\\", "/");
      if (!rel || rel === ".." || rel.startsWith("../") || !existsSync2(real) || !lstatSync(real).isFile()) continue;
      inputs.push(`${rel}\0${createHash("sha256").update(readFileSync(real)).digest("hex")}`);
    } catch {
    }
  }
  if (inputs.length === 0) return null;
  return createHash("sha256").update([...new Set(inputs)].sort().join("\0")).digest("hex");
}
function failureSignature(command, response) {
  let serialized = "";
  try {
    serialized = JSON.stringify(response ?? null);
  } catch {
    serialized = String(response ?? "");
  }
  const normalizedResponse = serialized.replace(/\u001b\[[0-9;]*m/gu, "").replace(/\s+/gu, " ").trim().slice(-8192);
  return createHash("sha256").update(`${normalizeCommand(command)}\0${normalizedResponse}`).digest("hex");
}
function inferCommandOutcome(event, forceFailure = false) {
  if (forceFailure) return "failure";
  const response = extractToolResponse(event);
  if (typeof response === "string") {
    const matches = [...response.matchAll(/(?:^|\r?\n)(?:Process exited with code|Exit code:?)\s+(-?\d+)(?=\r?\n|$)/giu)];
    const code = matches.at(-1)?.[1];
    if (code !== void 0) return Number.parseInt(code, 10) === 0 ? "success" : "failure";
  }
  if (response && typeof response === "object" && !Array.isArray(response)) {
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

// plugins/execution-loop-guard/src/lib/state-store.ts
import { mkdirSync as mkdirSync3, readFileSync as readFileSync3 } from "node:fs";
import { dirname as dirname2, join as join4, resolve as resolve3 } from "node:path";

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
function ensurePluginWorkdirGitignore(pluginRoot) {
  mkdirSync(pluginRoot, { recursive: true, mode: 448 });
  const ignore = join2(pluginRoot, ".gitignore");
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

// core/src/state-file.ts
import { createHash as createHash2, randomBytes } from "node:crypto";
import { existsSync as existsSync3, mkdirSync as mkdirSync2, renameSync, rmSync, statSync, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname, join as join3 } from "node:path";
var DIRECTORY_MODE = 448;
var FILE_MODE = 384;
var STALE_LOCK_MS = 3e4;
var WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));
function digestKey(value) {
  return createHash2("sha256").update(String(value)).digest("hex");
}
function atomicWriteJson(path, value) {
  const directory = dirname(path);
  const temporary = join3(directory, `.${digestKey(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    mkdirSync2(directory, { recursive: true, mode: DIRECTORY_MODE });
    writeFileSync2(temporary, `${JSON.stringify(value)}
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
  mkdirSync2(dirname(path), { recursive: true, mode: DIRECTORY_MODE });
  const deadline = Date.now() + 5e3;
  while (true) {
    try {
      mkdirSync2(lockPath, { mode: DIRECTORY_MODE });
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
        if (!existsSync3(lockPath)) continue;
      }
      if (Date.now() >= deadline) throw new Error(`Timed out acquiring lock: ${lockPath}`);
      Atomics.wait(WAIT_BUFFER, 0, 0, 10);
    }
  }
}

// plugins/execution-loop-guard/src/lib/state-store.ts
var VERSION = 1;
var STATE_DIR_RELATIVE = ".execution-loop-guard/state";
function digest(value) {
  return digestKey(value);
}
function ensureStateDir(directory) {
  mkdirSync3(directory, { recursive: true, mode: 448 });
  ensurePluginWorkdirGitignore(dirname2(directory));
}
function statePath(event) {
  const cwd = resolve3(extractCwd(event));
  const session = extractSessionId(event) ?? "default";
  return join4(cwd, STATE_DIR_RELATIVE, `${digest(session)}.json`);
}
function emptyState() {
  return { version: VERSION, updatedAt: 0, edits: {}, command: null, polling: null };
}
function readState(path) {
  if (!path) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync3(path, "utf8"));
    if (!parsed || parsed.version !== VERSION || typeof parsed !== "object") return emptyState();
    return {
      version: VERSION,
      updatedAt: Number(parsed.updatedAt) || 0,
      edits: parsed.edits && typeof parsed.edits === "object" && !Array.isArray(parsed.edits) ? parsed.edits : {},
      command: parsed.command && typeof parsed.command === "object" ? parsed.command : null,
      polling: parsed.polling && typeof parsed.polling === "object" ? parsed.polling : null
    };
  } catch {
    return emptyState();
  }
}
function writeState(path, state) {
  if (!path) return false;
  ensureStateDir(dirname2(path));
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

// plugins/execution-loop-guard/src/entries/hooks/execution-loop-guard.ts
function warn(message) {
  process.stderr.write(`[execution-loop-guard] ${message}
`);
}
function relativePath(path, repoRoot, cwd) {
  const base = repoRoot ?? cwd;
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
function runPre(event, config, repoRoot, cwd) {
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
      const inputFingerprint = commandInputFingerprint(command, cwd, repoRoot);
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
    const bypassPolling = command?.trim() && regexMatches(config.polling.pollBypass, command);
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
function recordCommandOutcome(event, config, forceFailure, repoRoot, cwd) {
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
    const inputFingerprint = commandInputFingerprint(command, cwd, repoRoot);
    const previous = state.command && now - Number(state.command.lastSeen) <= config.commandRepeat.windowMinutes * 6e4 && state.command.commandHash === normalizedHash && (state.command.inputFingerprint ?? null) === inputFingerprint ? state.command : null;
    const signature = outcome === "failure" ? failureSignature(command, extractToolResponse(event)) : null;
    const sameFailure = outcome === "failure" && previous?.lastOutcome === "failure" && previous.failureSignature === signature;
    state.command = {
      commandHash: normalizedHash,
      inputFingerprint,
      failStreak: outcome === "failure" ? sameFailure ? Number(previous.failStreak) + 1 : 1 : 0,
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
function recordEdits(event, config, repoRoot, cwd) {
  const targets = extractFileTargets2(event);
  if (targets.length === 0 || config.checks.editLoop === "off") return;
  const now = Date.now();
  const result = updateState(event, (state) => {
    const findings = [];
    const windowMs = config.editLoop.windowMinutes * 6e4;
    for (const target of targets) {
      const path = relativePath(target, repoRoot, cwd);
      if (config.editLoop.exemptPaths.some((pattern) => regexMatches(pattern, path))) continue;
      const key = digest(resolve4(target));
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
async function main(mode2 = process.argv[2]) {
  const event = await readStdinJson();
  if (event.__parseError || !["pre", "post", "failure"].includes(mode2)) return;
  const cwd = resolve4(extractCwd(event));
  const { config, repoRoot } = await loadProjectConfig(cwd, warn);
  if (mode2 === "pre") {
    runPre(event, config, repoRoot, cwd);
    return;
  }
  recordCommandOutcome(event, config, mode2 === "failure", repoRoot, cwd);
  if (mode2 === "post") recordEdits(event, config, repoRoot, cwd);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve4(process.argv[1])) {
  main().catch((error) => {
    warn(`hook failed open: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(0);
  });
}
export {
  main
};
