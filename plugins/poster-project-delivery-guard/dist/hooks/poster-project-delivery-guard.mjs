#!/usr/bin/env node
// harness-source-hash: sha256:be7a15ea39520d27c2bb2386c62b7ab975f445783cb760993783e3f16ed76e54
import {
  evaluatePosterWrite,
  validatePosterModel
} from "../chunks/chunk-QYRYTXR3.mjs";

// plugins/poster-project-delivery-guard/src/entries/hooks/poster-project-delivery-guard.ts
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename as basename2, dirname as dirname2, join, relative, resolve as resolve3 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

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
function additionalContext(hookEventName, context2, options = {}) {
  if (options.echoStderr) process.stderr.write(`${context2}
`);
  if (options.suppressJson) return null;
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

// plugins/poster-project-delivery-guard/src/lib/shell-policy.ts
import { basename, dirname, isAbsolute as isAbsolute2, resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";
var MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
var PLUGIN_DIRECTORY = resolve2(
  process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? MODULE_DIRECTORY,
  process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? "." : "../.."
);
var TOOL_DIRECTORY = resolve2(PLUGIN_DIRECTORY, "dist", "cli");
var WRITERS = /* @__PURE__ */ new Set(["project-lint.mjs", "project-release.mjs"]);
var READ_ONLY = /* @__PURE__ */ new Set(["file", "git", "grep", "head", "jq", "ls", "pwd", "rg", "stat", "tail", "wc"]);
function parseShellWords(command) {
  const words = [];
  let current = "";
  let quote = null;
  let escaped = false;
  for (const char of String(command ?? "")) {
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
      if (quote === '"' && (char === "$" || char === "`")) return null;
      current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/u.test(char)) {
      if (current) {
        words.push(current);
        current = "";
      }
      continue;
    }
    if (/[;&|><`$(){}\n\r]/u.test(char)) return null;
    current += char;
  }
  if (escaped || quote) return null;
  if (current) words.push(current);
  return words;
}
function expandKnownPluginRoot(command) {
  let expanded = String(command ?? "");
  for (const name of ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"]) {
    if (process.env[name]) expanded = expanded.replaceAll(`\${${name}}`, resolve2(process.env[name]));
  }
  return expanded;
}
function wrapperInvocation(words, cwd, workspaceRoot) {
  if (!words || words.length < 3 || !["node", basename(process.execPath), process.execPath].includes(words[0]) || words[1].startsWith("-")) {
    return null;
  }
  const script = isAbsolute2(words[1]) ? resolve2(words[1]) : resolve2(cwd, words[1]);
  const name = basename(script);
  if (dirname(script) !== resolve2(TOOL_DIRECTORY) || !WRITERS.has(name)) return null;
  const projectRoot = isAbsolute2(words[2]) ? resolve2(words[2]) : resolve2(cwd, words[2]);
  if (dirname(projectRoot) !== resolve2(workspaceRoot, "artifacts", "poster") || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(projectRoot))) {
    return null;
  }
  if (name === "project-release.mjs" && words.length !== 3) return null;
  if (name === "project-lint.mjs" && words.slice(3).some((word) => word.startsWith("-"))) return null;
  return { name, projectRoot };
}
function readOnlyCommand(words) {
  if (!words?.length || words[0] !== basename(words[0]) || !READ_ONLY.has(words[0])) return false;
  if (words[0] === "git") {
    if (!["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(words[1] ?? "")) return false;
    if (words.some((word) => word === "--output" || word.startsWith("--output=") || /^-o.+/u.test(word) || ["--ext-diff", "--textconv"].includes(word))) {
      return false;
    }
  }
  if (words[0] === "rg" && words.some((word) => word === "--pre" || word.startsWith("--pre="))) return false;
  return true;
}
function touchesPoster(command, cwd, workspaceRoot) {
  const normalized = String(command ?? "").replaceAll("\\", "/");
  const root = resolve2(workspaceRoot).replaceAll("\\", "/");
  const current = resolve2(cwd).replaceAll("\\", "/");
  return current.startsWith(`${root}/artifacts/poster/`) || /(?:^|[\s"'=])\.?\/?artifacts\/poster(?:\/|[\s"']|$)/u.test(normalized) || normalized.includes(`${root}/artifacts/poster/`);
}
function evaluatePosterShell({ command, cwd, workspaceRoot }) {
  if (!touchesPoster(command, cwd, workspaceRoot)) return { decision: "allow" };
  const words = parseShellWords(expandKnownPluginRoot(command));
  const invocation = wrapperInvocation(words, cwd, workspaceRoot);
  if (invocation) return { decision: "allow", writer: invocation.name, projectRoot: invocation.projectRoot };
  if (readOnlyCommand(words)) return { decision: "allow" };
  return {
    decision: "deny",
    code: "UNKNOWN_MUTATION_SHELL",
    message: "poster scope permits only read-only commands or an exact registered writer invocation"
  };
}

// plugins/poster-project-delivery-guard/src/entries/hooks/poster-project-delivery-guard.ts
var nameOf = (event) => eventToolName(event);
var cwdOf = (event) => resolve3(eventCwd(event));
function targetsOf(event) {
  return extractFileTargets(event, { tools: "any" });
}
function deny(reason) {
  return preToolDeny(`[Poster Project Delivery Guard] ${reason}`);
}
function context(eventName, message) {
  return additionalContext(eventName, message);
}
function resolveWorkspaceRoot(cwd) {
  let current = resolve3(cwd);
  while (current !== dirname2(current)) {
    if (basename2(dirname2(current)) === "poster" && basename2(dirname2(dirname2(current))) === "artifacts") {
      return dirname2(dirname2(dirname2(current)));
    }
    current = dirname2(current);
  }
  return resolve3(cwd);
}
async function discover(cwd) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const root = join(workspaceRoot, "artifacts", "poster");
  try {
    return (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.name)).slice(0, 32).map((entry) => join(root, entry.name));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}
async function collect(root, directory, files, digests, bytesMap) {
  if (Object.keys(files).length >= 2048) throw new Error("PROJECT_FILE_LIMIT_EXCEEDED");
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${entry.name}`);
    if (["node_modules", ".git", ".cache", ".tmp"].includes(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) await collect(root, absolute, files, digests, bytesMap);
    else if (entry.isFile()) {
      const filePath = relative(root, absolute).replaceAll("\\", "/");
      const bytes = await readFile(absolute);
      files[filePath] = bytes.toString("utf8");
      bytesMap[filePath] = bytes;
      digests[filePath] = createHash("sha256").update(bytes).digest("hex");
    }
  }
}
async function findingsFor(cwd) {
  const findings = [];
  for (const root of await discover(cwd)) {
    const files = {};
    const digests = {};
    const bytes = {};
    await collect(root, root, files, digests, bytes);
    if (!("plan.contract.json" in files)) continue;
    let plan = null;
    let project = null;
    try {
      plan = JSON.parse(files["plan.contract.json"]);
    } catch {
    }
    try {
      project = JSON.parse(files["poster.project.json"]);
    } catch {
    }
    const model = { artifactId: basename2(root), files, digests, bytes, plan, project };
    for (const item of validatePosterModel(model, { stage: plan?.targetStage ?? "source" })) findings.push({ artifactId: model.artifactId, ...item });
  }
  return findings;
}
function format(findings) {
  return ["[Poster Project Delivery Guard] Project contract violations", ...findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`), "recovery: Fix the named variant, layer, proof, or output and rerun the registered poster tool."].join("\n");
}
async function main() {
  const mode = process.argv[2] ?? "session";
  const event = await readStdinJson();
  if (event.__parseError) return;
  const cwd = cwdOf(event);
  if (mode === "pre") {
    for (const target of targetsOf(event)) {
      const result = evaluatePosterWrite({
        relativePath: relative(cwd, resolve3(cwd, target)),
        toolName: nameOf(event),
        cwd
      });
      if (result.decision === "deny") {
        process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}
`);
        return;
      }
    }
    const command = extractShellCommand(event) ?? "";
    if (command) {
      const result = evaluatePosterShell({ command, cwd, workspaceRoot: resolveWorkspaceRoot(cwd) });
      if (result.decision === "deny") {
        process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}
`);
      }
    }
    return;
  }
  const findings = await findingsFor(cwd);
  if (mode === "session") {
    if ((await discover(cwd)).length > 0) process.stdout.write(`${JSON.stringify(context("SessionStart", "[Poster Project Delivery Guard] active; generated outputs require registered writers."))}
`);
  } else if (mode === "post" || mode === "failure") {
    if (findings.length > 0) process.stdout.write(`${JSON.stringify(context(mode === "post" ? "PostToolUse" : "PostToolUseFailure", format(findings)))}
`);
  } else if (mode === "stop" && findings.length > 0) {
    writeJson(stopBlock(format(findings)));
  }
}
if (process.argv[1] && fileURLToPath2(import.meta.url) === resolve3(process.argv[1])) main().catch((error) => {
  process.stderr.write(`[Poster Project Delivery Guard] ${error.message}
`);
  process.exitCode = 2;
});
