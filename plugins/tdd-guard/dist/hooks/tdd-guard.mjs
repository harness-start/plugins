#!/usr/bin/env node
// harness-source-hash: sha256:29ff972776d396a634c551e2a7860eb481341fbdbad2feba3ce29cc1d95354bd

// plugins/tdd-guard/src/entries/hooks/tdd-guard.ts
import { existsSync as existsSync4, readFileSync as readFileSync6 } from "node:fs";
import { resolve as resolve6 } from "node:path";
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
function eventToolUseId(event) {
  const tool = nestedRecord(event, "tool");
  const toolUse = nestedRecord(event, "tool_use");
  return firstString(
    event.tool_use_id,
    event.toolUseId,
    event.tool_call_id,
    event.toolCallId,
    toolUse?.id,
    tool?.id
  );
}

// plugins/tdd-guard/src/lib/hook-io.ts
import { isAbsolute, relative, resolve } from "node:path";

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

// plugins/tdd-guard/src/lib/hook-io.ts
function cwdOf(event) {
  const raw = event.cwd ?? event.working_directory ?? event.workingDirectory;
  if (raw !== void 0 && raw !== null && typeof raw !== "string") return resolve(raw);
  return resolve(eventCwd(event));
}
function sessionIdOf(event) {
  return eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown";
}
function toolUseIdOf(event) {
  return eventToolUseId(event) || String(event.id ?? "pending");
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
function responseOf(event) {
  return eventToolResponse(event) ?? event.error ?? null;
}
function responseText(response) {
  if (typeof response === "string") return response;
  if (isRecord(response)) {
    const fields = ["stdout", "stderr", "output", "content", "message"].map((key) => response[key]).filter((value) => typeof value === "string");
    if (fields.length > 0) return fields.join("\n");
  }
  return "";
}
function inferOutcome(event, forceFailure = false) {
  if (forceFailure) return "failure";
  const response = responseOf(event);
  if (isRecord(response)) {
    if (response.is_error === true || response.isError === true || response.error || response.interrupted === true) return "failure";
    const code = response.exit_code ?? response.exitCode ?? response.returnCode ?? response.return_code ?? response.code;
    if (Number.isFinite(Number(code))) return Number(code) === 0 ? "success" : "failure";
    if (response.success === false) return "failure";
    if (response.success === true) return "success";
  }
  const text = responseText(response);
  const exitLine = text.match(/(?:Process exited with code|Exit code:?|exited with code|exit_code)\s*:?\s*(-?\d+)/iu);
  if (exitLine?.[1] !== void 0) return Number(exitLine[1]) === 0 ? "success" : "failure";
  const failed = text.match(/(?:^|\n)#\s*fail\s+([0-9]+)/iu);
  if (failed?.[1] && Number(failed[1]) > 0) return "failure";
  const passed = text.match(/(?:^|\n)#\s*pass\s+([0-9]+)/iu);
  if (passed?.[1] && Number(passed[1]) > 0 && (!failed?.[1] || Number(failed[1]) === 0)) return "success";
  if (/(?:^|\n)not ok\s+[0-9]+\b|\b[1-9][0-9]*\s+failures?\b/iu.test(text)) return "failure";
  if (/\b0\s+failures?\b/iu.test(text)) return "success";
  return "unknown";
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
function tokenize(command) {
  const tokens = [];
  for (const match of String(command ?? "").matchAll(/"([^"]*)"|'([^']*)'|(\S+)/gu)) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return tokens;
}
function invocations(command, names) {
  const found = [];
  for (const segment of String(command ?? "").split(/\s*(?:&&|\|\||;|\n)\s*/u)) {
    const tokens = tokenize(segment);
    let index = 0;
    while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/u.test(tokens[index] ?? "")) index += 1;
    if (index >= tokens.length) continue;
    const base = String(tokens[index]).replace(/^.*\//u, "");
    if (!names.has(base)) continue;
    index += 1;
    const operands = [];
    while (index < tokens.length && (tokens[index] ?? "").startsWith("-")) {
      if (tokens[index] === "--") {
        index += 1;
        break;
      }
      index += 1;
    }
    while (index < tokens.length) {
      const token = tokens[index];
      if (token && !token.startsWith("-")) operands.push(token);
      index += 1;
    }
    found.push(operands);
  }
  return found;
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
  for (const match of command.matchAll(/\b(?:writeFile(?:Sync)?|open)\s*\(\s*["']([^"']+)["']/gu)) push(match[1]);
  for (const operands of invocations(command, /* @__PURE__ */ new Set(["rm", "unlink"]))) {
    for (const path of operands) push(path);
  }
  for (const operands of invocations(command, /* @__PURE__ */ new Set(["mv"]))) {
    for (const path of operands) push(path);
  }
  return paths;
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
function contextOutput(eventName, text) {
  return additionalContext(eventName, text);
}
function stopDeny(reason) {
  return stopBlock(reason);
}

// plugins/tdd-guard/src/lib/existing-tests.ts
import { lstatSync, readdirSync, readFileSync as readFileSync2 } from "node:fs";
import { join, relative as relative3, resolve as resolve3 } from "node:path";

// plugins/tdd-guard/src/lib/patterns.ts
import { existsSync, readFileSync } from "node:fs";
import { dirname, posix, relative as relative2, resolve as resolve2 } from "node:path";
var SKIPPED = /(?:^|\/)(?:\.git|\.cache|\.next|\.nuxt|\.venv|__generated__|build|coverage|dist|generated|node_modules|target|vendor)(?:\/|$)/iu;
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
  if (!value || SKIPPED.test(value) || /(?:^|\/)\.tdd-guard\.mjs$/u.test(value)) {
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
function pythonTargets(code) {
  const body = code.replace(/^\s*(?:from\s+[^\n]+\s+import\s+[^\n]+|import\s+[^\n]+)$/gmu, "");
  const targets = [];
  for (const match of code.matchAll(/^\s*from\s+([A-Za-z_][A-Za-z0-9_.]*)\s+import\s+([^\n#]+)/gmu)) {
    for (const item of (match[2] ?? "").replace(/[()]/gu, "").split(",")) {
      const binding = item.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/u);
      if (binding && identifierUsed(body, binding[2] ?? binding[1])) targets.push(`python:${match[1]}#${binding[1]}`);
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
  else if (language === "python") targets = pythonTargets(code);
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
    return [`python-module:${module}`, ...symbols.map((symbol) => `python:${module}#${symbol}`)];
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
  if (!descriptor) return null;
  const rest = [...descriptor.rest];
  if (kind === "test") {
    while (rest.length > 1 && SUITE_DIRECTORIES.has(rest[0]?.toLowerCase() ?? "")) rest.shift();
  }
  const name = kind === "test" ? removeTestSuffix(rest.pop(), language) : stripExtension(rest.pop());
  return `${descriptor.scope}#${[...rest, name].join("/")}`;
}
function mirrorMatches(source, testRecord) {
  const sourceIdentity = mirrorIdentity(source.path, source.language, "source");
  const testIdentity = mirrorIdentity(testRecord.path, source.language, "test");
  return Boolean(sourceIdentity && testIdentity && sourceIdentity === testIdentity);
}
function goPackageMatches(source, testRecord) {
  if (source.language !== "go") return false;
  const sourceDirectory = posix.dirname(normalize(source.path));
  const testDirectory = posix.dirname(normalize(testRecord.path));
  const sourcePackage = goPackage(withoutComments("go", source.content));
  const testPackage = String(testRecord.evidence?.package ?? "").replace(/_test$/u, "");
  const symbols = new Set(extractSourceSymbols("go", source.content));
  const references = testRecord.evidence?.references ?? [];
  if (sourceDirectory === testDirectory && sourcePackage && sourcePackage === testPackage && references.some((value) => symbols.has(value))) return true;
  return false;
}
function sourceAuthorizedByTest(source, testRecord, context = {}) {
  if (!source || !testRecord || source.language !== testRecord.language || !testRecord.evidence?.valid) return false;
  const testTargets = new Set(testRecord.evidence.targets ?? []);
  if (explicitSourceTargets(source, context).some((target) => testTargets.has(target))) return true;
  if (testTargets.size > 0) return false;
  if (goPackageMatches(source, testRecord)) return true;
  return mirrorMatches(source, testRecord);
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

// plugins/tdd-guard/src/lib/existing-tests.ts
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
      const absolutePath = join(directory, entry.name);
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
function historicalCorrespondingTests(root, source, state, context = {}) {
  return findCorrespondingTests(root, source, context).filter((path) => {
    const record = (state?.tests ?? []).find((item) => item.path === path);
    return record?.created !== true;
  });
}
function formatTestPathList(paths) {
  const values = [...new Set((paths ?? []).filter((value) => Boolean(value)))];
  if (values.length <= 4) return values.join(", ");
  return `${values.slice(0, 4).join(", ")} and ${values.length - 4} more`;
}

// plugins/tdd-guard/src/lib/git-workspace.ts
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
function restoresHeadState(root, relativePath2, { missing = false, content = "" } = {}) {
  const head = gitShowHead(root, relativePath2);
  if (head === null) return missing === true;
  if (missing) return false;
  return head === String(content ?? "");
}

// plugins/tdd-guard/src/lib/state-store.ts
import { mkdirSync as mkdirSync3, readFileSync as readFileSync5 } from "node:fs";
import { dirname as dirname3, join as join4, resolve as resolve5 } from "node:path";

// core/src/plugin-workdir.ts
import { mkdirSync, readFileSync as readFileSync4, writeFileSync } from "node:fs";
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
    current = readFileSync4(ignore, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (current !== null && normalizeGitignore(current) === "*") return;
  if (current !== null && !isStalePluginWorkdirGitignore(current)) return;
  writeFileSync(ignore, PLUGIN_WORKDIR_GITIGNORE, { encoding: "utf8", mode: 384 });
}

// core/src/state-file.ts
import { createHash, randomBytes } from "node:crypto";
import { existsSync as existsSync3, mkdirSync as mkdirSync2, renameSync, rmSync, statSync, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname as dirname2, join as join3 } from "node:path";
var DIRECTORY_MODE = 448;
var FILE_MODE = 384;
var STALE_LOCK_MS = 3e4;
var WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));
function digestKey(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
function atomicWriteJson(path, value) {
  const directory = dirname2(path);
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
  mkdirSync2(dirname2(path), { recursive: true, mode: DIRECTORY_MODE });
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

// plugins/tdd-guard/src/lib/state-store.ts
var VERSION = 3;
var STATE_DIR_RELATIVE = ".tdd-guard/state";
function emptyState() {
  return { version: VERSION, sequence: 0, pending: null, tests: [], needsGreen: null, observedRed: {} };
}
function digest(value) {
  return digestKey(value);
}
function ensureStateDir(directory) {
  mkdirSync3(directory, { recursive: true, mode: 448 });
  ensurePluginWorkdirGitignore(dirname3(directory));
}
function statePath(sessionId, root) {
  const session = sessionId || "default";
  return join4(resolve5(root), STATE_DIR_RELATIVE, `${digest(session)}.json`);
}
function readState(sessionId, root) {
  const path = statePath(sessionId, root);
  if (!path) return emptyState();
  try {
    const value = JSON.parse(readFileSync5(path, "utf8"));
    if (!isRecord(value) || value.version !== VERSION) throw new Error("version mismatch");
    return { observedRed: {}, ...value };
  } catch {
    return emptyState();
  }
}
function writeState(sessionId, root, state) {
  const path = statePath(sessionId, root);
  if (!path) return false;
  ensureStateDir(dirname3(path));
  return withPathLock(path, () => atomicWriteJson(path, { ...state, version: VERSION }));
}

// plugins/tdd-guard/src/entries/hooks/tdd-guard.ts
function warn(message) {
  process.stderr.write(`[tdd-guard] ${message}
`);
}
function readText(path) {
  try {
    return readFileSync6(path, "utf8");
  } catch {
    return "";
  }
}
function hashPath(path) {
  return existsSync4(path) ? digest(readText(path)) : "missing";
}
function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && error.message != null) return String(error.message);
  return String(error);
}
function isActiveTarget(target) {
  return target.kind !== "ignored" && target.language !== null;
}
function targetsFor(event, root) {
  return extractTargets(event).map((absolutePath) => {
    const path = relativePath(root, absolutePath);
    return { absolutePath, path, ...classifyPath(path) };
  }).filter(isActiveTarget);
}
function mixedWriteFinding() {
  return "[TDD Guard] A single tool call cannot mix test and implementation files. Use separate tool calls: write the test first, let the hook record it, then write implementation files.";
}
function testCommand(command) {
  return /(?:^|[;&|]\s*)(?:[^\s]+\/)?(?:node\s+--test|npm\s+(?:run\s+)?test|pnpm\s+(?:run\s+)?test|yarn\s+test|pytest|python(?:3)?\s+-m\s+pytest|phpunit|vendor\/bin\/phpunit|go\s+test|cargo\s+test|jest|vitest)\b/iu.test(String(command ?? ""));
}
var TEST_FILE_IN_COMMAND = /(?:^|\s)["']?((?:\.\/|\/)?[^\s;|"']*(?:Test\.php|_test\.go|test_[^/\s"']+\.py|\.(?:test|spec)\.[cm]?[jt]sx?|\.rs))["']?(?=\s|$)/gu;
function namedTestPaths(command, root) {
  const normalized = String(command ?? "").replaceAll("\\", "/");
  const found = [];
  for (const match of normalized.matchAll(TEST_FILE_IN_COMMAND)) {
    const captured = match[1] ?? "";
    const relative4 = relativePath(root, resolve6(root, captured.replace(/^\.\//u, "")));
    if (classifyPath(relative4).kind === "test") found.push(relative4);
  }
  return [...new Set(found)];
}
function coveredOutcomePaths(command, root, state, outcome) {
  const named = namedTestPaths(command, root);
  if (named.length > 0) {
    if (outcome === "success" && state.needsGreen?.testPaths?.length) {
      return named.filter((path) => state.needsGreen?.testPaths.includes(path));
    }
    return named;
  }
  if (/\b(?:--list-tests|--collect-only|--listTests)\b/u.test(String(command ?? ""))) return [];
  if (testCommand(command) && state.needsGreen?.testPaths?.length) return state.needsGreen.testPaths;
  return [];
}
function correspondingTests(root, source, context) {
  const found = new Set(findCorrespondingTests(root, source, context));
  if (!hasGitHead(root)) return [...found];
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
function headCorrespondingTests(root, source, state, context, corresponding) {
  if (hasGitHead(root)) return corresponding.filter((path) => gitPathState(root, path).tracked);
  return historicalCorrespondingTests(root, source, state, context);
}
function liveObservedRed(state, root, path) {
  const absolutePath = resolve6(root, path);
  if (!existsSync4(absolutePath)) return false;
  return (state.observedRed ?? {})[path] === hashPath(absolutePath);
}
function remainingCorrespondingTests(root, changed, testPaths) {
  const existing = (testPaths ?? []).filter((path) => existsSync4(resolve6(root, path)));
  if (existing.length > 0) return existing;
  const found = /* @__PURE__ */ new Set();
  for (const path of changed) {
    const classified = classifyPath(path);
    if (classified.kind !== "source" || !classified.language) continue;
    const absolutePath = resolve6(root, path);
    const content = existsSync4(absolutePath) ? readText(absolutePath) : gitShowHead(root, path) ?? "";
    const context = resolveLanguageContext(root, path, classified.language);
    for (const testPath of findCorrespondingTests(root, { path, language: classified.language, content }, context)) {
      found.add(testPath);
    }
  }
  return [...found];
}
async function runPre(event) {
  const root = cwdOf(event);
  const sessionId = sessionIdOf(event);
  const targets = targetsFor(event, root);
  if (targets.length === 0) return;
  const kinds = new Set(targets.map((target) => target.kind));
  if (kinds.has("test") && kinds.has("source")) {
    writeJson(preToolDeny(mixedWriteFinding()));
    return;
  }
  const state = readState(sessionId, root);
  if (kinds.has("source")) {
    if (state.needsGreen) {
      const pendingPaths = new Set(state.needsGreen.paths ?? []);
      const allRevert = targets.length > 0 && targets.every((target) => {
        if (pendingPaths.size > 0 && !pendingPaths.has(target.path)) return false;
        const deleting = targetOperation(event, target.absolutePath) === "delete";
        const current = readText(target.absolutePath);
        return restoresHeadState(root, target.path, {
          missing: deleting,
          content: proposedContent(event, target.absolutePath, current)
        });
      });
      if (allRevert) {
        state.pending = {
          kind: "revert",
          toolUseId: toolUseIdOf(event),
          targets: targets.map((target) => ({ path: target.path, beforeHash: hashPath(target.absolutePath) })),
          testPaths: state.needsGreen.testPaths ?? []
        };
        if (!writeState(sessionId, root, state)) warn("implementation snapshot could not be persisted; GREEN completion will fail closed");
        return;
      }
      writeJson(preToolDeny(`[TDD Guard] Blocked implementation edit: the previous implementation mutation still needs an observed passing test run (GREEN). Run the relevant tests successfully before another implementation change.`));
      return;
    }
    const authorizingTests = /* @__PURE__ */ new Set();
    for (const target of targets) {
      const current = readText(target.absolutePath);
      const source = { ...target, content: proposedContent(event, target.absolutePath, current) };
      const context = resolveLanguageContext(root, target.path, target.language);
      const corresponding = correspondingTests(root, source, context);
      const headCorresponding = headCorrespondingTests(root, source, state, context, corresponding);
      const redPool = headCorresponding.length > 0 ? headCorresponding : corresponding;
      const redOk = redPool.some((path) => liveObservedRed(state, root, path));
      const headGone = headCorresponding.length > 0 && headCorresponding.every((path) => !existsSync4(resolve6(root, path)));
      const headDirty = headCorresponding.some((path) => gitPathState(root, path).dirty);
      const isDelete = targetOperation(event, target.absolutePath) === "delete";
      if (redOk) {
        for (const path of redPool) if (liveObservedRed(state, root, path)) authorizingTests.add(path);
        continue;
      }
      if (isDelete && headCorresponding.length > 0 && (headGone || headDirty)) {
        for (const path of headCorresponding) authorizingTests.add(path);
        continue;
      }
      if (headCorresponding.length > 0) {
        writeJson(preToolDeny(`[TDD Guard] Blocked ${target.path}: matching tests already exist (${formatTestPathList(headCorresponding)}), but no current failing test run (RED) was observed after their latest edit. Run the relevant tests, confirm they fail for the intended behavior, then retry the implementation edit.`));
        return;
      }
      const expected = expectedTestExample(target.path, target.language);
      writeJson(preToolDeny(`[TDD Guard] Blocked ${target.path}: no matching edited test with an observed failing run (RED) is available. Create or update ${expected} with a real test case, run it and observe the intended failure, then retry.`));
      return;
    }
    if (!hasGitHead(root)) {
      writeJson(preToolDeny("[TDD Guard] Blocked implementation edit: this workspace has no git HEAD, so implementation writes are denied. Initialize a git repository with a commit, then retry."));
      return;
    }
    state.pending = {
      kind: "source",
      toolUseId: toolUseIdOf(event),
      targets: targets.map((target) => ({ path: target.path, beforeHash: hashPath(target.absolutePath) })),
      testPaths: [...authorizingTests]
    };
    if (!writeState(sessionId, root, state)) warn("implementation snapshot could not be persisted; GREEN completion will fail closed");
    return;
  }
  state.pending = {
    kind: "test",
    toolUseId: toolUseIdOf(event),
    targets: targets.map((target) => ({ path: target.path, language: target.language, beforeHash: hashPath(target.absolutePath) }))
  };
  if (!writeState(sessionId, root, state)) warn("test write snapshot could not be persisted; later implementation writes will remain blocked");
}
async function runPost(event, platform, forceFailure = false) {
  const root = cwdOf(event);
  const sessionId = sessionIdOf(event);
  const state = readState(sessionId, root);
  const command = shellCommandOf(event);
  if (command && testCommand(command)) {
    const outcome = inferOutcome(event, forceFailure);
    if (outcome === "failure" && !state.needsGreen) {
      const covered = coveredOutcomePaths(command, root, state, outcome);
      if (covered.length === 0) return;
      state.observedRed = { ...state.observedRed ?? {} };
      for (const path of covered) {
        const absolutePath = resolve6(root, path);
        if (!existsSync4(absolutePath)) continue;
        const hash = hashPath(absolutePath);
        state.observedRed[path] = hash;
        const record = (state.tests ?? []).find((item) => item.path === path);
        if (record) record.redHash = hash;
      }
      state.lastRed = { commandHash: digest(command), testHashes: covered.map((path) => state.observedRed[path]).filter((value) => Boolean(value)) };
    } else if (outcome === "success" && state.needsGreen) {
      const covered = coveredOutcomePaths(command, root, state, outcome);
      if (covered.length === 0) return;
      state.needsGreen = null;
    } else return;
    if (!writeState(sessionId, root, state)) warn("test outcome could not be persisted");
    return;
  }
  if (!state.pending || state.pending.toolUseId !== toolUseIdOf(event)) return;
  if (state.pending.kind === "source" || state.pending.kind === "revert") {
    const testPaths = state.pending.testPaths ?? [];
    const kind = state.pending.kind;
    const pendingTargets = state.pending.targets ?? [];
    const changed = pendingTargets.filter((target) => hashPath(resolve6(root, target.path)) !== target.beforeHash).map((target) => target.path);
    state.pending = null;
    if (kind === "revert") {
      const restored = pendingTargets.every((target) => {
        const missing = !existsSync4(resolve6(root, target.path));
        return restoresHeadState(root, target.path, {
          missing,
          content: missing ? "" : readText(resolve6(root, target.path))
        });
      });
      if (restored) state.needsGreen = null;
    } else if (changed.length > 0) {
      const remaining = remainingCorrespondingTests(root, changed, testPaths);
      const allDeleted = changed.every((path) => !existsSync4(resolve6(root, path)));
      if (!(allDeleted && remaining.length === 0)) {
        state.needsGreen = { paths: changed, testPaths };
        state.observedRed = {};
        for (const record of state.tests ?? []) delete record.redHash;
      }
    }
    if (!writeState(sessionId, root, state)) warn("implementation outcome could not be persisted; GREEN completion will fail closed");
    return;
  }
  const recorded = [];
  for (const target of state.pending.targets ?? []) {
    const absolutePath = resolve6(root, target.path);
    const afterHash = hashPath(absolutePath);
    state.tests = (state.tests ?? []).filter((record) => record.path !== target.path);
    if (afterHash === "missing" || afterHash === target.beforeHash) continue;
    const language = target.language ?? "";
    const context = resolveLanguageContext(root, target.path, language);
    const evidence = extractTestEvidence(language, readText(absolutePath), target.path, context);
    if (!evidence.valid) continue;
    state.sequence = (state.sequence ?? 0) + 1;
    state.tests.push({
      path: target.path,
      language,
      hash: afterHash,
      sequence: state.sequence,
      created: target.beforeHash === "missing",
      evidence
    });
    recorded.push(target.path);
  }
  state.pending = null;
  if (!writeState(sessionId, root, state)) {
    warn("test-first evidence could not be persisted; implementation writes will remain blocked");
    return;
  }
  if (recorded.length > 0 && platform !== "codex") {
    writeJson(contextOutput("PostToolUse", `[TDD Guard] Recorded test structure for ${recorded.join(", ")}. Run the relevant test command and observe the intended failure (RED) before editing implementation.`));
  }
}
async function runStop(event) {
  const root = cwdOf(event);
  const state = readState(sessionIdOf(event), root);
  if (!state.needsGreen) return;
  writeJson(stopDeny(`[TDD Guard] Completion blocked: implementation paths ${state.needsGreen.paths.join(", ")} do not yet have an observed passing test run (GREEN). Run the relevant test command successfully, then retry completion.`));
}
async function main() {
  const event = await readStdinJson();
  const mode = process.argv[2];
  const platform = process.argv[3] ?? "unknown";
  if (event.__parseError) {
    warn("hook input was not valid JSON");
    if (mode === "pre") {
      writeJson(preToolDeny("[TDD Guard] The hook could not parse this write event safely, so it was blocked. Fix the hook input, then retry."));
    }
    return;
  }
  if (mode === "pre") await runPre(event);
  else if (mode === "post" || mode === "failure") await runPost(event, platform, mode === "failure");
  else if (mode === "stop") await runStop(event);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve6(process.argv[1])) {
  main().catch((error) => {
    const mode = process.argv[2];
    warn(`hook validation failed: ${errorMessage(error)}`);
    if (mode === "pre") {
      writeJson(preToolDeny("[TDD Guard] The hook could not validate this write safely, so it was blocked. Fix the hook input or state error, then retry."));
    }
    process.exitCode = 0;
  });
}
