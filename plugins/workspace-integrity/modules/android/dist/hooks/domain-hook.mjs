#!/usr/bin/env node
// harness-source-hash: sha256:51d0109ec169d4c6a22484162a83b35919f322a90e755db89eb4ef638f139e5f
import "../chunks/chunk-DTWKXBHU.mjs";

// plugins/workspace-integrity/modules/android/src/entries/hooks/domain-hook.ts
import { resolve as resolve3 } from "node:path";
import { fileURLToPath } from "node:url";

// core/src/domain-engineering-hook.ts
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute as isAbsolute2, join, relative, resolve as resolve2 } from "node:path";
import { pathToFileURL } from "node:url";

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

// core/src/hook-targets.ts
import { isAbsolute, resolve } from "node:path";

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

// core/src/domain-engineering-hook.ts
var COMMAND_SEPARATORS = /* @__PURE__ */ new Set(["&&", "||", ";", "|", "&"]);
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
function tokenBasename(token) {
  return String(token ?? "").replaceAll("\\", "/").split("/").at(-1) ?? "";
}
function splitSimpleCommands(tokens) {
  const commands = [];
  let current = [];
  for (const token of tokens) {
    if (COMMAND_SEPARATORS.has(token)) {
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
    const name = tokenBasename(token);
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
  const name = tokenBasename(command[0]);
  const args = command.slice(1);
  const operands = nonFlagOperands(args);
  const target = targetDirectory(args);
  if (name === "sed") return sedWriteTargets(args);
  if (name === "cp" || name === "install") return target ? [target] : operands.slice(-1);
  if (name === "mv") return target ? [target, ...operands] : operands;
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
  return [...new Set(targets.map((path) => isAbsolute2(path) ? resolve2(path) : resolve2(cwd, path.replace(/^\.\//u, ""))))];
}
function domainTargetsNeedPhase(policy2, targets, phase) {
  const paths = targets.map((path) => path.replaceAll("\\", "/"));
  if (phase === "pre") return paths.some((path) => policy2.protections.some((rule) => regexMatches(rule.match, path)));
  return paths.some(
    (path) => policy2.validators.some((validator) => regexMatches(validator.match, path)) || (policy2.sourceScans ?? []).some((scan) => regexMatches(scan.match, path))
  );
}
function configFileExists(cwd, plugin) {
  let cursor = resolve2(cwd);
  while (true) {
    if (existsSync(join(cursor, `.${plugin}.mjs`))) return true;
    if (existsSync(join(cursor, ".git"))) return false;
    const parent = dirname(cursor);
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
    const parent = dirname(cursor);
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
async function loadConfig(policy2, root) {
  const defaults = { checks: {}, rules: [], maxFiles: 12, timeoutMs: 1e4, missingTools: "report-once" };
  if (!root) return defaults;
  const path = join(root, `.${policy2.plugin}.mjs`);
  if (!existsSync(path)) return defaults;
  try {
    const loaded = await import(pathToFileURL(path).href);
    const raw = isRecord(loaded) ? loaded.default ?? loaded : loaded;
    if (!isRecord(raw)) return defaults;
    const checks = isRecord(raw.checks) ? Object.fromEntries(Object.entries(raw.checks).filter((entry) => validMode(entry[1]))) : {};
    const rules = Array.isArray(raw.rules) ? raw.rules.flatMap((rule, index) => {
      if (!isRecord(rule) || !(rule.match instanceof RegExp) || rule.mode !== "allow" && rule.mode !== "block") {
        warn(policy2.plugin, `rules[${index}] is invalid and was skipped`);
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
      checks,
      rules,
      maxFiles: typeof limits.maxFiles === "number" && Number.isInteger(limits.maxFiles) && limits.maxFiles >= 1 && limits.maxFiles <= 100 ? limits.maxFiles : 12,
      timeoutMs: typeof limits.timeoutMs === "number" && Number.isInteger(limits.timeoutMs) && limits.timeoutMs >= 1e3 && limits.timeoutMs <= 6e4 ? limits.timeoutMs : 1e4,
      missingTools: raw.missingTools === "silent" ? "silent" : "report-once"
    };
  } catch (error) {
    warn(policy2.plugin, `failed to load .${policy2.plugin}.mjs: ${error instanceof Error ? error.message : String(error)}`);
    return defaults;
  }
}
function protectionFor(paths, policy2, config) {
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
  return policy2.protections.find((rule) => paths.some((path) => regexMatches(rule.match, path))) ?? null;
}
function formatDeny(policy2, findings) {
  return [
    `[Protected File Guard] ${policy2.displayName}: Protected file modification blocked`,
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
  if (kind === "helm") return { command: "helm", args: ["lint", dirname(filePath)] };
  return null;
}
async function xmlValidation(filePath) {
  const errors = [];
  try {
    const { DOMParser } = await import("../chunks/lib-RVI7XFEY.mjs");
    new DOMParser({ onError: (level, message) => {
      if (level === "fatalError" || level === "error") errors.push(message);
    } }).parseFromString(readFileSync(filePath, "utf8"), "application/xml");
    return errors.length ? errors.join("\n") : null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
async function internalValidation(kind, filePath) {
  if (kind === "json") {
    try {
      JSON.parse(readFileSync(filePath, "utf8"));
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
  if (kind === "xml") return xmlValidation(filePath);
  return void 0;
}
function sourceScanFindings(scan, relativePath2, source, mode, filePath = relativePath2) {
  if (mode === "off" || !regexMatches(scan.match, relativePath2)) return [];
  return scan.inspect(filePath, source).map((hit) => ({
    check: scan.id,
    mode,
    path: `${relativePath2}:${hit.line}`,
    message: `${hit.code}: ${hit.message}`
  }));
}
async function validateFile(validator, filePath, root, timeoutMs) {
  if (validator.contentMatch) {
    try {
      if (!regexMatches(validator.contentMatch, readFileSync(filePath, "utf8"))) return null;
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
function shouldReportMissingTool(policy2, root, session, finding, mode) {
  if (!finding.missingTool) return true;
  if (mode === "silent") return false;
  const identity = createHash("sha256").update(`${policy2.plugin}\0${session}\0${root}\0${finding.check}\0${finding.missingTool}`).digest("hex");
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
async function runPre(policy2, event) {
  const targets = extractDomainTargets(event);
  if (!targets.length) return;
  const cwd = resolve2(eventCwd(event));
  if (!domainTargetsNeedPhase(policy2, targets, "pre") && !configFileExists(cwd, policy2.plugin)) return;
  const root = repoRoot(cwd) ?? cwd;
  const config = await loadConfig(policy2, repoRoot(cwd));
  const findings = targets.flatMap((filePath) => {
    const path = relativePath(filePath, root);
    if (policy2.active && !policy2.active({ root, targetPath: filePath, relativePath: path })) return [];
    const rule = protectionFor(matchPaths(filePath, root), policy2, config);
    return rule ? [{ path, rule }] : [];
  });
  if (findings.length) writeJson(preToolDeny(formatDeny(policy2, findings)));
}
async function runPost(policy2, event) {
  const cwd = resolve2(eventCwd(event));
  const rawTargets = extractDomainTargets(event);
  if (!rawTargets.length) return;
  if (!domainTargetsNeedPhase(policy2, rawTargets, "post") && !configFileExists(cwd, policy2.plugin)) return;
  const discoveredRoot = repoRoot(cwd);
  const root = discoveredRoot ?? cwd;
  const config = await loadConfig(policy2, discoveredRoot);
  const session = eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "hook";
  const targets = rawTargets.filter((filePath) => {
    if (!existsSync(filePath)) return false;
    try {
      const path = relativePath(filePath, root);
      return statSync(filePath).isFile() && statSync(filePath).size <= MAX_FILE_BYTES && !SKIP_PATH.test(path) && (!policy2.active || policy2.active({ root, targetPath: filePath, relativePath: path }));
    } catch {
      return false;
    }
  }).slice(0, config.maxFiles);
  const findings = [];
  for (const filePath of targets) {
    const path = relativePath(filePath, root);
    for (const validator of policy2.validators) {
      const mode = config.checks[validator.id] ?? validator.mode;
      if (mode === "off" || !regexMatches(validator.match, path)) continue;
      const finding = await validateFile({ ...validator, mode }, filePath, root, config.timeoutMs);
      if (finding && shouldReportMissingTool(policy2, root, session, finding, config.missingTools)) findings.push(finding);
    }
    const scans = policy2.sourceScans ?? [];
    if (!scans.length) continue;
    let source = "";
    try {
      source = readFileSync(filePath, "utf8");
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
    `[${policy2.displayName}] Domain check results`,
    "",
    ...findings.flatMap((finding) => [`- [${finding.mode}] ${finding.check}: ${finding.path}`, `  ${finding.message}`])
  ].join("\n");
  if (findings.some((finding) => finding.mode === "block")) {
    process.stderr.write(`${text}
`);
    process.exitCode = 2;
  } else writeJson(additionalContext("PostToolUse", text));
}
async function runDomainEngineeringHook(policy2, phase) {
  const event = await readStdinJson();
  if (event.__parseError) return;
  if (phase === "pre") await runPre(policy2, event);
  else if (phase === "post") await runPost(policy2, event);
  else warn(policy2.plugin, `unknown hook phase ${String(phase)}`);
}

// plugins/workspace-integrity/modules/android/src/lib/compose-detect.ts
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

// plugins/workspace-integrity/modules/android/src/policy.ts
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

// plugins/workspace-integrity/modules/android/src/entries/hooks/domain-hook.ts
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve3(process.argv[1])) runDomainEngineeringHook(policy, process.argv[2]).catch((error) => {
  process.stderr.write(`[android-engineering] hook failed open: ${error instanceof Error ? error.message : String(error)}
`);
  process.exit(0);
});
export {
  policy
};
