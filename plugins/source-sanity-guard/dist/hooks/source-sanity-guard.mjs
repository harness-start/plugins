#!/usr/bin/env node

// plugins/source-sanity-guard/src/entries/hooks/source-sanity-guard.ts
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// plugins/source-sanity-guard/src/lib/source-sanity-policy.ts
var CHECK_NAMES = [
  "backupArtifact",
  "garbledText"
];
var DEFAULT_CHECKS = Object.freeze({
  backupArtifact: "block",
  garbledText: "block"
});
var VALID_MODES = /* @__PURE__ */ new Set(["block", "report", "off"]);
var SKIP_PATH = /(?:^|\/)(?:\.git|\.cache|\.next|\.nuxt|__generated__|build|coverage|dist|generated|node_modules|target|vendor)(?:\/|$)/iu;
var SOURCE_PATH = /(?:^|\/)(?:app|client|cmd|components|include|internal|lib|packages|pkg|server|src|tests?)(?:\/|$)/iu;
var BACKUP_SUFFIX = /(?:\.bak|\.backup|\.old|\.orig|\.rej|\.swp|\.temp|\.tmp|~)$/iu;
var TEXT_PATH = /\.(?:bash|c|cc|cfg|cjs|cpp|css|cts|cxx|go|graphql|h|hh|hpp|html|ini|java|js|json|jsx|kt|kts|less|md|mjs|mts|php|py|rb|rs|sass|scss|sh|sql|svelte|swift|toml|ts|tsx|txt|vue|xml|yaml|yml|zsh)$/iu;
function warnDefault(message) {
  process.stderr.write(`[source-sanity-guard] ${message}
`);
}
function normalizeMode(value, fallback, label, warn2) {
  if (value === void 0) return fallback;
  if (VALID_MODES.has(value)) return value;
  warn2(`${label} must be "block", "report", or "off"; using ${fallback}`);
  return fallback;
}
function resolveConfig(userConfig, warn2 = warnDefault) {
  const checks = { ...DEFAULT_CHECKS };
  if (userConfig?.checks !== void 0 && (!userConfig.checks || typeof userConfig.checks !== "object" || Array.isArray(userConfig.checks))) {
    warn2('config "checks" must be an object; using defaults');
  } else {
    for (const name of CHECK_NAMES) {
      checks[name] = normalizeMode(
        userConfig?.checks?.[name],
        checks[name],
        `checks.${name}`,
        warn2
      );
    }
  }
  const overrides = [];
  if (userConfig?.overrides !== void 0 && !Array.isArray(userConfig.overrides)) {
    warn2('config "overrides" must be an array; ignoring overrides');
  } else {
    for (const [index, override] of (userConfig?.overrides ?? []).entries()) {
      if (!override || !(override.match instanceof RegExp)) {
        warn2(`override[${index}].match must be a RegExp; skipping`);
        continue;
      }
      if (!override.checks || typeof override.checks !== "object" || Array.isArray(override.checks)) {
        warn2(`override[${index}].checks must be an object; skipping`);
        continue;
      }
      const normalizedChecks = {};
      for (const name of CHECK_NAMES) {
        if (override.checks[name] === void 0) continue;
        const mode = normalizeMode(
          override.checks[name],
          null,
          `override[${index}].checks.${name}`,
          warn2
        );
        if (mode) normalizedChecks[name] = mode;
      }
      if (Object.keys(normalizedChecks).length === 0) {
        warn2(`override[${index}] has no valid checks; skipping`);
        continue;
      }
      overrides.push({ match: override.match, checks: normalizedChecks });
    }
  }
  return { checks, overrides };
}
function regexMatches(pattern, value) {
  try {
    return new RegExp(pattern.source, pattern.flags).test(value);
  } catch {
    return false;
  }
}
function modeFor(checkName, relativePath2, config) {
  for (const override of config.overrides) {
    if (override.checks[checkName] !== void 0 && regexMatches(override.match, relativePath2)) {
      return override.checks[checkName];
    }
  }
  return config.checks[checkName] ?? "off";
}
function isBuiltInSkippedPath(relativePath2) {
  return SKIP_PATH.test(relativePath2);
}
function isBackupArtifactPath(relativePath2) {
  return SOURCE_PATH.test(relativePath2) && BACKUP_SUFFIX.test(relativePath2);
}
function isTextPath(relativePath2) {
  return TEXT_PATH.test(relativePath2);
}
function analyzeGarbledText(text) {
  if (typeof text !== "string" || !text.includes("\uFFFD")) return null;
  const total = [...text].filter((character) => character === "\uFFFD").length;
  if (/\uFFFD{2,}/u.test(text) || total >= 3) {
    return { replacementCharacters: total };
  }
  return null;
}

// plugins/source-sanity-guard/src/entries/hooks/source-sanity-guard.ts
var CONFIG_FILE_NAME = ".source-sanity-guard.mjs";
var FILE_TOOLS = /* @__PURE__ */ new Set([
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
var COMMAND_SEPARATORS = /* @__PURE__ */ new Set(["&&", "||", ";", "|", "&"]);
var SIMPLE_WRAPPERS = /* @__PURE__ */ new Set(["busybox", "command", "exec", "nohup", "time"]);
function tokenizeShell(command) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaped = false;
  const text = String(command ?? "");
  const flush = () => {
    if (current) {
      tokens.push(current);
      current = "";
    }
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/u.test(char)) {
      flush();
      continue;
    }
    if (char === ";") {
      flush();
      tokens.push(";");
      continue;
    }
    if (char === "|" || char === "&") {
      flush();
      if (text[index + 1] === char) {
        tokens.push(char + char);
        index += 1;
      } else {
        tokens.push(char);
      }
      continue;
    }
    current += char;
  }
  flush();
  return tokens;
}
function splitSimpleCommands(tokens) {
  const commands = [];
  let current = [];
  for (const token of tokens) {
    if (COMMAND_SEPARATORS.has(token)) {
      if (current.length) commands.push(current);
      current = [];
      continue;
    }
    current.push(token);
  }
  if (current.length) commands.push(current);
  return commands;
}
function tokenBasename(token) {
  return String(token ?? "").replaceAll("\\", "/").split("/").at(-1) ?? "";
}
function unwrapCommand(tokens) {
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(token)) {
      index += 1;
      continue;
    }
    const name = tokenBasename(token);
    if (SIMPLE_WRAPPERS.has(name)) {
      index += 1;
      while (index < tokens.length && tokens[index].startsWith("-") && tokens[index] !== "--") {
        index += 1;
      }
      if (tokens[index] === "--") index += 1;
      continue;
    }
    if (name === "sudo") {
      index += 1;
      while (index < tokens.length && tokens[index].startsWith("-")) {
        const option = tokens[index];
        index += 1;
        if (["-C", "-g", "-u", "--group", "--user"].includes(option)) index += 1;
      }
      continue;
    }
    if (name === "env") {
      index += 1;
      while (index < tokens.length && tokens[index].startsWith("-")) index += 1;
      continue;
    }
    if (name === "timeout") {
      index += 1;
      while (index < tokens.length && tokens[index].startsWith("-")) {
        const option = tokens[index];
        index += 1;
        if (["-k", "-s", "--kill-after", "--signal"].includes(option)) index += 1;
      }
      if (index < tokens.length && !tokens[index].startsWith("-")) index += 1;
      continue;
    }
    if (name === "nice" || name === "stdbuf") {
      index += 1;
      while (index < tokens.length && tokens[index].startsWith("-")) index += 1;
      continue;
    }
    break;
  }
  return tokens.slice(index);
}
function nonFlagOperands(args) {
  const operands = [];
  let skipNext = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
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
function targetDirectory(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
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
  const dest = targetDirectory(args);
  if (dest) return [dest];
  const operands = nonFlagOperands(args);
  return operands.length ? [operands.at(-1)] : [];
}
function moveWriteTargets(args) {
  const dest = targetDirectory(args);
  const operands = nonFlagOperands(args);
  return dest ? [dest, ...operands] : operands;
}
function looksLikeSedScript(token) {
  return /(?:^|[0-9,${}]*[!]*s)[/#@|]./u.test(token);
}
function sedWriteTargets(args) {
  const inplace = args.some(
    (arg) => arg === "--in-place" || arg.startsWith("--in-place=") || /^-[A-Za-z]*i/u.test(arg)
  );
  if (!inplace) return [];
  const files = [];
  let skipNext = false;
  let skippedScript = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
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
function commandWriteTargets(tokens) {
  const invocation = unwrapCommand(tokens);
  if (!invocation.length) return [];
  const name = tokenBasename(invocation[0]);
  const args = invocation.slice(1);
  if (name === "sed") return sedWriteTargets(args);
  if (name === "cp") return copyDestTargets(args);
  if (name === "mv") return moveWriteTargets(args);
  if (name === "rm") return nonFlagOperands(args);
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
  for (const tokens of splitSimpleCommands(tokenizeShell(text))) {
    for (const path of commandWriteTargets(tokens)) push(path);
  }
  return [...new Set(paths)];
}
function warn(message) {
  process.stderr.write(`[source-sanity-guard] ${message}
`);
}
async function readStdinJson() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { __parseError: true };
  }
}
function extractToolName(event) {
  return event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? "";
}
function canonicalToolName(value) {
  return String(value ?? "").replaceAll("_", "").toLowerCase();
}
function extractToolInput(event) {
  return event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {};
}
function extractCwd(event) {
  return event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd();
}
function stripMatchingQuotes(value) {
  const text = String(value ?? "").trim();
  if (text.length >= 2 && (text.startsWith('"') && text.endsWith('"') || text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}
function extractPatchTargets(payload) {
  if (typeof payload !== "string") return [];
  const targets = [];
  for (const line of payload.split("\n")) {
    const file = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u);
    if (file) targets.push(stripMatchingQuotes(file[1]));
    const move = line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (move) targets.push(stripMatchingQuotes(move[1]));
  }
  return targets;
}
function objectPaths(input) {
  if (!input || typeof input !== "object") return [];
  const paths = [];
  for (const key of [
    "file_path",
    "filePath",
    "path",
    "target_file",
    "output_file",
    "outputFile",
    "notebook_path",
    "notebookPath"
  ]) {
    if (typeof input[key] === "string" && input[key]) paths.push(input[key]);
  }
  if (Array.isArray(input.edits)) {
    for (const edit of input.edits) paths.push(...objectPaths(edit));
  }
  return paths;
}
function extractFileTargets(event) {
  const toolName = canonicalToolName(extractToolName(event));
  const input = extractToolInput(event);
  const cwd = extractCwd(event);
  if (SHELL_TOOLS.has(toolName)) {
    const command = typeof input?.command === "string" ? input.command : typeof input?.cmd === "string" ? input.cmd : "";
    return [...new Set(extractShellWriteTargets(command).map(stripMatchingQuotes).filter(Boolean).map(
      (path) => isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, ""))
    ))];
  }
  if (!FILE_TOOLS.has(toolName)) return [];
  const targets = objectPaths(input);
  const patch = typeof input === "string" ? input : [input?.patch, input?.input, input?.command].filter((value) => typeof value === "string").join("\n");
  targets.push(...extractPatchTargets(patch));
  return [...new Set(targets.map(stripMatchingQuotes).filter(Boolean).map(
    (path) => isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, ""))
  ))];
}
function extractInsertedText(event) {
  const toolName = canonicalToolName(extractToolName(event));
  const input = extractToolInput(event);
  const texts = [];
  if (SHELL_TOOLS.has(toolName)) {
    const command = typeof input?.command === "string" ? input.command : typeof input?.cmd === "string" ? input.cmd : "";
    if (command) texts.push(command);
  }
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    for (const key of ["content", "new_string", "newString", "text", "cell_source", "patch", "input"]) {
      if (typeof value[key] === "string") texts.push(value[key]);
    }
    if (Array.isArray(value.edits)) value.edits.forEach(visit);
  };
  if (typeof input === "string") texts.push(input);
  else visit(input);
  return texts.join("\n");
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
function relativePath(filePath, repoRoot, cwd) {
  const base = repoRoot ?? cwd;
  const candidate = relative(base, filePath).replaceAll("\\", "/");
  return candidate.startsWith("../") ? filePath.replaceAll("\\", "/") : candidate;
}
async function loadUserConfig(repoRoot) {
  if (!repoRoot) return null;
  const configPath = join(repoRoot, CONFIG_FILE_NAME);
  if (!existsSync(configPath)) return null;
  try {
    const loaded = await import(pathToFileURL(configPath).href);
    return loaded.default ?? loaded;
  } catch (error) {
    warn(`failed to load ${CONFIG_FILE_NAME}: ${error.message}`);
    return null;
  }
}
function preToolDeny(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason
    }
  };
}
function reportOutput(eventName, text) {
  return {
    hookSpecificOutput: {
      hookEventName: eventName,
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
async function runPre(event, config, repoRoot, cwd) {
  const targets = extractFileTargets(event);
  if (targets.length === 0) return;
  const insertedText = extractInsertedText(event);
  const garbled = analyzeGarbledText(insertedText);
  const findings = [];
  let hasBlock = false;
  for (const target of targets) {
    const path = relativePath(target, repoRoot, cwd);
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
  writeOutput(hasBlock ? preToolDeny(message) : reportOutput("PreToolUse", message));
}
async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const cwd = resolve(extractCwd(event));
  const repoRoot = resolveRepoRoot(cwd);
  const config = resolveConfig(await loadUserConfig(repoRoot));
  await runPre(event, config, repoRoot, cwd);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    warn(`hook failed open: ${error.message}`);
    process.exit(0);
  });
}
export {
  extractFileTargets,
  extractInsertedText,
  extractPatchTargets,
  extractShellWriteTargets,
  main,
  resolveRepoRoot
};
