#!/usr/bin/env node
// harness-source-hash: sha256:89b2f425cf8fde9cda8839159dbc4976ff0c80fa3766ead2c724dd95d5b5759c

// plugins/workspace-integrity/modules/source/src/entries/hooks/source-integrity.ts
import { execFileSync as execFileSync2 } from "node:child_process";
import { existsSync as existsSync2 } from "node:fs";
import { isAbsolute as isAbsolute3, join as join2, relative as relative2, resolve as resolve3 } from "node:path";
import { fileURLToPath, pathToFileURL as pathToFileURL2 } from "node:url";

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

// plugins/workspace-integrity/modules/source/src/lib/source-sanity-policy.ts
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
var SKIP_PATH = /(?:^|\/)(?:\.git|\.cache|\.next|\.nuxt|__generated__|build|coverage|dist|generated|node_modules|target|vendor)(?:\/|$)/iu;
var SOURCE_PATH = /(?:^|\/)(?:app|client|cmd|components|include|internal|lib|packages|pkg|server|src|tests?)(?:\/|$)/iu;
var BACKUP_SUFFIX = /(?:\.bak|\.backup|\.old|\.orig|\.rej|\.swp|\.temp|\.tmp|~)$/iu;
var TEXT_PATH = /\.(?:bash|c|cc|cfg|cjs|cpp|css|cts|cxx|go|graphql|h|hh|hpp|html|ini|java|js|json|jsx|kt|kts|less|md|mjs|mts|php|py|rb|rs|sass|scss|sh|sql|svelte|swift|toml|ts|tsx|txt|vue|xml|yaml|yml|zsh)$/iu;
function warnDefault(message) {
  process.stderr.write(`[source-integrity] ${message}
`);
}
function normalizeMode(value, fallback, label, warn2) {
  if (value === void 0) return fallback;
  if (isCheckMode(value)) return value;
  warn2(`${label} must be "block", "report", or "off"; using ${fallback}`);
  return fallback;
}
function resolveConfig(userConfig, warn2 = warnDefault) {
  const record = isRecord(userConfig) ? userConfig : void 0;
  const checks = { ...DEFAULT_CHECKS };
  if (record?.checks !== void 0 && (!record.checks || typeof record.checks !== "object" || Array.isArray(record.checks))) {
    warn2('config "checks" must be an object; using defaults');
  } else {
    const checksSource = isRecord(record?.checks) ? record.checks : void 0;
    for (const name of CHECK_NAMES) {
      checks[name] = normalizeMode(
        checksSource?.[name],
        checks[name],
        `checks.${name}`,
        warn2
      );
    }
  }
  const overrides = [];
  if (record?.overrides !== void 0 && !Array.isArray(record.overrides)) {
    warn2('config "overrides" must be an array; ignoring overrides');
  } else {
    const rawOverrides = Array.isArray(record?.overrides) ? record.overrides : [];
    for (const [index, override] of rawOverrides.entries()) {
      if (!isRecord(override) || !(override.match instanceof RegExp)) {
        warn2(`override[${index}].match must be a RegExp; skipping`);
        continue;
      }
      if (!override.checks || typeof override.checks !== "object" || Array.isArray(override.checks)) {
        warn2(`override[${index}].checks must be an object; skipping`);
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
    const mode = override.checks[checkName];
    if (mode !== void 0 && regexMatches(override.match, relativePath2)) {
      return mode;
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

// plugins/workspace-integrity/modules/source/src/lib/encoding-runner.ts
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute as isAbsolute2, join, relative, resolve as resolve2 } from "node:path";
import { pathToFileURL } from "node:url";

// plugins/workspace-integrity/modules/source/src/lib/encoding-policy.ts
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
function extractPatchPaths(payload) {
  return patchPaths(payload);
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

// plugins/workspace-integrity/modules/source/src/lib/encoding-runner.ts
var MAX_FILE_BYTES = 2 * 1024 * 1024;
var CONFIG_FILE_NAME = ".source-integrity.mjs";
var BUILTIN_RULES = [
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
function normalizeUserRule(rule, index, warn2 = warnConfig) {
  if (!isRecord(rule) || !(rule.match instanceof RegExp)) {
    warn2(`rule[${index}]: "match" must be a RegExp, skipping`);
    return null;
  }
  const mode = rule.mode ?? "block";
  if (mode !== "block" && mode !== "skip") {
    warn2(`rule[${index}]: "mode" must be "block" or "skip", skipping`);
    return null;
  }
  return { match: rule.match, mode };
}
function resolveRules(userConfig, warn2 = warnConfig) {
  const record = isRecord(userConfig) ? userConfig : void 0;
  if (record?.rules !== void 0 && !Array.isArray(record.rules)) {
    warn2('config "rules" must be an array; using built-in rules');
    return [...BUILTIN_RULES];
  }
  const userRules = (Array.isArray(record?.rules) ? record.rules : []).map((rule, index) => normalizeUserRule(rule, index, warn2)).filter((rule) => rule !== null);
  return [...userRules, ...BUILTIN_RULES];
}
function matchRule(relativePath2, rules) {
  for (const rule of rules) {
    try {
      if (new RegExp(rule.match.source, rule.match.flags).test(relativePath2)) {
        return rule;
      }
    } catch {
      continue;
    }
  }
  return null;
}
async function loadUserConfig(repoRoot) {
  const configPath = join(repoRoot, CONFIG_FILE_NAME);
  if (!existsSync(configPath)) return null;
  try {
    const loaded = await import(pathToFileURL(configPath).href);
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
    if (raw) paths.push(isAbsolute2(raw) ? resolve2(raw) : resolve2(cwd, raw.replace(/^\.\//u, "")));
  }
  return [...new Set(paths)];
}
function resolveRepoRoot(filePath) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: dirname(filePath),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5e3
    }).trim();
  } catch {
    return null;
  }
}
function relativeMatchPath(filePath, repoRoot, cwd) {
  if (repoRoot) return relative(repoRoot, filePath).replaceAll("\\", "/");
  const fromCwd = relative(cwd, filePath).replaceAll("\\", "/");
  return fromCwd.startsWith("../") ? filePath.replaceAll("\\", "/") : fromCwd;
}
function readFileCapped(filePath) {
  try {
    if (statSync(filePath).size > MAX_FILE_BYTES) return null;
    return readFileSync(filePath);
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
  process.exit(2);
}
async function runEncodingPost(event) {
  const cwd = eventCwd(event);
  const candidates = extractFilePaths(event).filter(existsSync);
  if (candidates.length === 0) return;
  const firstCandidate = candidates[0];
  if (!firstCandidate) return;
  const repoRoot = resolveRepoRoot(firstCandidate);
  const userConfig = repoRoot ? await loadUserConfig(repoRoot) : null;
  const rules = resolveRules(userConfig);
  const findings = [];
  for (const filePath of candidates) {
    const matchPath = relativeMatchPath(filePath, repoRoot, cwd);
    const rule = matchRule(matchPath, rules);
    if (!rule || rule.mode === "skip") continue;
    const buffer = readFileCapped(filePath);
    if (buffer === null) continue;
    const issue = analyzeEncoding(buffer);
    if (issue) findings.push({ path: matchPath, issue });
    if (findings.length >= 10) break;
  }
  if (findings.length > 0) block(findings);
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

// plugins/workspace-integrity/modules/source/src/entries/hooks/source-integrity.ts
var CONFIG_FILE_NAME2 = ".source-integrity.mjs";
var COMMAND_SEPARATORS = /* @__PURE__ */ new Set(["&&", "||", ";", "|", "&"]);
var SIMPLE_WRAPPERS = /* @__PURE__ */ new Set(["busybox", "command", "exec", "nohup", "time"]);
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
    if (token === void 0) break;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(token)) {
      index += 1;
      continue;
    }
    const name = tokenBasename(token);
    if (SIMPLE_WRAPPERS.has(name)) {
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
function nonFlagOperands(args) {
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
function targetDirectory(args) {
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
  const dest = targetDirectory(args);
  if (dest) return [dest];
  const operands = nonFlagOperands(args);
  const last = operands.at(-1);
  return last === void 0 ? [] : [last];
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
  process.stderr.write(`[source-integrity] ${message}
`);
}
var extractPatchTargets = extractPatchPaths;
function extractFileTargets2(event) {
  if (isShellTool(eventToolName(event))) {
    const cwd = eventCwd(event);
    return [...new Set(
      extractShellWriteTargets(extractShellCommand(event) ?? "").filter(Boolean).map((path) => isAbsolute3(path) ? resolve3(path) : resolve3(cwd, path.replace(/^\.\//u, "")))
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
function resolveRepoRoot2(cwd) {
  try {
    return execFileSync2("git", ["rev-parse", "--show-toplevel"], {
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
  const candidate = relative2(base, filePath).replaceAll("\\", "/");
  return candidate.startsWith("../") ? filePath.replaceAll("\\", "/") : candidate;
}
async function loadUserConfig2(repoRoot) {
  if (!repoRoot) return null;
  const configPath = join2(repoRoot, CONFIG_FILE_NAME2);
  if (!existsSync2(configPath)) return null;
  try {
    const loaded = await import(pathToFileURL2(configPath).href);
    return loaded.default ?? loaded;
  } catch (error) {
    warn(`failed to load ${CONFIG_FILE_NAME2}: ${error instanceof Error ? error.message : String(error)}`);
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
  const targets = extractFileTargets2(event);
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
  const mode = process.argv[2] ?? "pre";
  if (mode === "post") {
    await runEncodingPost(event);
    return;
  }
  const cwd = resolve3(eventCwd(event));
  const repoRoot = resolveRepoRoot2(cwd);
  const config = resolveConfig(await loadUserConfig2(repoRoot));
  await runPre(event, config, repoRoot, cwd);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve3(process.argv[1])) {
  main().catch((error) => {
    warn(`hook failed open: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(0);
  });
}
export {
  extractFileTargets2 as extractFileTargets,
  extractInsertedText,
  extractPatchTargets,
  extractShellWriteTargets,
  main,
  resolveRepoRoot2 as resolveRepoRoot
};
