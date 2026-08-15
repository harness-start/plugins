#!/usr/bin/env node
// harness-source-hash: sha256:fd95f1c50268b3bb0a6c3356df28e0a91064bac9751f5f2c76a44cae30c46690
import {
  findLogoProjects,
  loadLogoProject,
  resolveWorkspaceRoot
} from "../chunks/chunk-EXGNXS6X.mjs";
import {
  evaluateLogoWrite,
  validateLogoModel
} from "../chunks/chunk-4AGBB5MK.mjs";

// plugins/logo-project-delivery-guard/src/entries/hooks/logo-project-delivery-guard.ts
import { access } from "node:fs/promises";
import { resolve as resolve3 } from "node:path";
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
function isStopHookActive(event) {
  return event.stop_hook_active === true || event.stopHookActive === true;
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

// plugins/logo-project-delivery-guard/src/lib/shell-policy.ts
import { basename, dirname, isAbsolute as isAbsolute2, resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";
var MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
var PLUGIN_DIRECTORY = resolve2(
  process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? MODULE_DIRECTORY,
  process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? "." : "../.."
);
var TOOL_DIRECTORY = resolve2(PLUGIN_DIRECTORY, "dist", "cli");
var WRITERS = /* @__PURE__ */ new Set(["project-lint.mjs", "project-preview.mjs", "project-render.mjs", "project-release.mjs", "project-stage.mjs", "project-validate.mjs"]);
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
  for (const name of ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"]) if (process.env[name]) expanded = expanded.replaceAll(`\${${name}}`, resolve2(process.env[name]));
  return expanded;
}
function wrapperInvocation(words, cwd, workspaceRoot) {
  if (!words || words.length < 3 || !["node", basename(process.execPath), process.execPath].includes(words[0]) || words[1].startsWith("-")) return null;
  const script = isAbsolute2(words[1]) ? resolve2(words[1]) : resolve2(cwd, words[1]);
  const name = basename(script);
  if (dirname(script) !== resolve2(TOOL_DIRECTORY) || !WRITERS.has(name)) return null;
  const projectRoot = isAbsolute2(words[2]) ? resolve2(words[2]) : resolve2(cwd, words[2]);
  if (dirname(projectRoot) !== resolve2(workspaceRoot, "artifacts", "logo") || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(projectRoot))) return null;
  if (name === "project-release.mjs" && words.length !== 3) return null;
  if (name === "project-render.mjs" && (words.length !== 4 || !["source", "release"].includes(words[3]))) return null;
  if (name === "project-stage.mjs" && (words.length !== 4 || words[3] !== "release")) return null;
  if (name === "project-validate.mjs") {
    const args = words.slice(3);
    while (args.length > 0) {
      const value = args.shift();
      if (value === "--json") continue;
      if (/^--stage=(?:source|release)$/u.test(value)) continue;
      if (value === "--stage" && ["source", "release"].includes(args.shift())) continue;
      return null;
    }
  }
  if (name === "project-preview.mjs") {
    const args = words.slice(3);
    while (args.length > 0) {
      const value = args.shift();
      if (value === "--write-review") continue;
      return null;
    }
  }
  return { name, projectRoot };
}
function readOnlyCommand(words) {
  if (!words?.length || words[0] !== basename(words[0]) || !READ_ONLY.has(words[0])) return false;
  const command = words[0];
  if (command === "git") {
    if (!["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(words[1] ?? "")) return false;
    if (words.some((word) => word === "--output" || word.startsWith("--output=") || /^-o.+/u.test(word) || ["--ext-diff", "--textconv"].includes(word))) return false;
  }
  if (command === "rg" && words.some((word) => word === "--pre" || word.startsWith("--pre="))) return false;
  return true;
}
function touchesLogo(command, cwd, workspaceRoot) {
  const normalized = String(command ?? "").replaceAll("\\", "/");
  const root = resolve2(workspaceRoot).replaceAll("\\", "/");
  const current = resolve2(cwd).replaceAll("\\", "/");
  return current.startsWith(`${root}/artifacts/logo/`) || /(?:^|[\s"'=])\.?\/?artifacts\/logo(?:\/|[\s"']|$)/u.test(normalized) || normalized.includes(`${root}/artifacts/logo/`);
}
function evaluateLogoShell({ command, cwd, workspaceRoot, activeProjectCount = 0 }) {
  if (activeProjectCount < 1 && !touchesLogo(command, cwd, workspaceRoot)) return { decision: "allow" };
  const words = parseShellWords(expandKnownPluginRoot(command));
  const invocation = wrapperInvocation(words, cwd, workspaceRoot);
  if (invocation) return { decision: "allow", writer: invocation.name, projectRoot: invocation.projectRoot };
  if (readOnlyCommand(words)) return { decision: "allow" };
  return { decision: "deny", code: "UNKNOWN_MUTATION_SHELL", message: "logo scope permits only read-only commands or an exact registered writer invocation" };
}

// plugins/logo-project-delivery-guard/src/entries/hooks/logo-project-delivery-guard.ts
var inputOf = (event) => eventToolInput(event);
var nameOf = (event) => eventToolName(event);
var cwdOf = (event) => resolve3(eventCwd(event));
function targetsOf(event) {
  const input = inputOf(event);
  const extras = [];
  for (const key of ["source_path", "sourcePath", "destination_path", "destinationPath", "old_path", "oldPath", "new_path", "newPath"]) {
    if (typeof input[key] === "string") extras.push(input[key]);
  }
  return [.../* @__PURE__ */ new Set([...extractFileTargets(event, { tools: "any" }), ...extras.map((path) => resolve3(cwdOf(event), path))])];
}
function deny(reason) {
  return preToolDeny(`[Logo Project Delivery Guard] ${reason}`);
}
function context(eventName, message) {
  return additionalContext(eventName, message);
}
async function existingPlanTarget(cwd, target) {
  const absolute = resolve3(cwd, target);
  if (!/(?:^|[\\/])artifacts[\\/]logo[\\/][^\\/]+[\\/]plan\.contract\.json$/u.test(absolute)) return false;
  try {
    await access(absolute);
    return true;
  } catch {
    return false;
  }
}
async function findingsFor(cwd) {
  const findings = [];
  const { roots } = await findLogoProjects(cwd);
  for (const root of roots) {
    const model = await loadLogoProject(root);
    const stage = model.plan?.targetStage;
    for (const item of validateLogoModel(model, { stage })) findings.push({ artifactId: model.artifactId, ...item });
  }
  findings.sort((left, right) => left.code.localeCompare(right.code) || left.artifactId.localeCompare(right.artifactId) || left.path.localeCompare(right.path));
  return { findings, projectCount: roots.length };
}
function format(findings) {
  return ["[Logo Project Delivery Guard] Project contract violations", ...findings.slice(0, 100).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`), "recovery: Fix the named contract, vector, proof, evidence, or output and rerun the registered logo tool."].join("\n");
}
async function main() {
  const mode = process.argv[2] ?? "session";
  const event = await readStdinJson();
  if (event.__parseError) {
    process.stderr.write("[Logo Project Delivery Guard] invalid hook JSON\n");
    process.exitCode = 2;
    return;
  }
  if (mode === "stop" && isStopHookActive(event)) return;
  const cwd = cwdOf(event);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  if (mode === "pre") {
    for (const target of targetsOf(event)) {
      if (await existingPlanTarget(cwd, target)) {
        process.stdout.write(`${JSON.stringify(deny("PLAN_STAGE_WRITER_REQUIRED: existing plan changes require project-stage.mjs"))}
`);
        return;
      }
      const result = evaluateLogoWrite({ relativePath: resolve3(cwd, target), toolName: nameOf(event) });
      if (result.decision === "deny") {
        process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}
`);
        return;
      }
    }
    const command = extractShellCommand(event) ?? "";
    if (command) {
      const { roots } = await findLogoProjects(cwd);
      const result = evaluateLogoShell({ command, cwd, workspaceRoot, activeProjectCount: roots.length });
      if (result.writer && !roots.includes(result.projectRoot)) process.stdout.write(`${JSON.stringify(deny("PROJECT_ROOT_UNREGISTERED: registered writers require a discovered non-symlink logo project root"))}
`);
      else if (result.decision === "deny") process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}
`);
    }
    return;
  }
  if (mode === "session") {
    const { roots } = await findLogoProjects(cwd);
    if (roots.length > 0) process.stdout.write(`${JSON.stringify(context("SessionStart", `[Logo Project Delivery Guard] discovered ${roots.length} project(s); generated outputs require project-render and release requires project-release.`))}
`);
    return;
  }
  const { findings } = await findingsFor(cwd);
  if (mode === "post" || mode === "failure") {
    if (findings.length > 0) process.stdout.write(`${JSON.stringify(context(mode === "post" ? "PostToolUse" : "PostToolUseFailure", format(findings)))}
`);
  } else if (mode === "stop" && findings.length > 0) {
    process.stdout.write(`${JSON.stringify(stopBlock(format(findings)))}
`);
  }
}
if (process.argv[1] && fileURLToPath2(import.meta.url) === resolve3(process.argv[1])) main().catch((error) => {
  process.stderr.write(`[Logo Project Delivery Guard] ${error.message}
`);
  process.exitCode = 2;
});
