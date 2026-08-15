#!/usr/bin/env node
// harness-source-hash: sha256:dabf6dd1113c58d71d04b6ebaa3b3792c605b6d37fb76b44cbe06813872b3bc5
import {
  evaluatePptxWrite,
  findPptxProjects,
  isKebabArtifactId,
  loadPptxProject,
  resolveWorkspaceRoot,
  validatePptxModel
} from "../chunks/chunk-C3BXNGNL.mjs";

// plugins/pptx-project-delivery-guard/src/entries/hooks/pptx-project-delivery-guard.ts
import { dirname as dirname2, relative as relative2, resolve as resolve4 } from "node:path";
import { fileURLToPath } from "node:url";

// core/src/artifact-scan.ts
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
async function findCarrierProjects(cwd, carrier, options = {}) {
  const workspaceRoot = resolveWorkspaceRoot(cwd, carrier);
  const artifactRoot = join(workspaceRoot, "artifacts", carrier);
  try {
    const roots = (await readdir(artifactRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && (options.requireKebab === false || isKebabArtifactId(entry.name))).slice(0, 32).map((entry) => join(artifactRoot, entry.name));
    return { workspaceRoot, roots };
  } catch (error) {
    if (error.code === "ENOENT") return { workspaceRoot, roots: [] };
    throw error;
  }
}

// core/src/artifact-shell.ts
import { basename, dirname, isAbsolute, resolve as resolve2 } from "node:path";
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
function expandKnownPluginRoot(command, env = process.env) {
  let expanded = String(command ?? "");
  for (const name of ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"]) {
    if (env[name]) expanded = expanded.replaceAll(`\${${name}}`, resolve2(env[name] ?? ""));
  }
  return expanded;
}
function evaluateRegisteredWriter(options) {
  const words = parseShellWords(expandKnownPluginRoot(options.command));
  if (!words || words.length < 3) return { ok: false };
  if (!["node", basename(process.execPath), process.execPath].includes(words[0] ?? "")) return { ok: false };
  if (words[1]?.startsWith("-")) return { ok: false };
  const script = isAbsolute(words[1] ?? "") ? resolve2(words[1] ?? "") : resolve2(options.cwd, words[1] ?? "");
  const name = basename(script);
  if (dirname(script) !== resolve2(options.toolDirectory) || !options.writers.includes(name)) return { ok: false };
  const projectRoot = isAbsolute(words[2] ?? "") ? resolve2(words[2] ?? "") : resolve2(options.cwd, words[2] ?? "");
  if (dirname(projectRoot) !== resolve2(options.workspaceRoot, "artifacts", options.carrier) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(projectRoot))) {
    return { ok: false };
  }
  return { ok: true, writer: name, projectRoot };
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
import { isAbsolute as isAbsolute2, resolve as resolve3 } from "node:path";
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
    raw.map(stripMatchingQuotes).filter(Boolean).map((path) => isAbsolute2(path) ? resolve3(path) : resolve3(cwd, path.replace(/^\.\//u, "")))
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
  const cwd = resolve3(eventCwd(event));
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

// plugins/pptx-project-delivery-guard/src/entries/hooks/pptx-project-delivery-guard.ts
var MODULE_DIRECTORY = dirname2(fileURLToPath(import.meta.url));
var PLUGIN_DIRECTORY = resolve4(
  process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? MODULE_DIRECTORY,
  process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? "." : "../.."
);
function deny(reason) {
  return preToolDeny(`[PPTX Project Delivery Guard] ${reason}`);
}
async function runPre(event) {
  const cwd = eventCwd(event);
  const name = eventToolName(event);
  for (const target of extractFileTargets(event, { tools: "any" })) {
    const result = evaluatePptxWrite({
      relativePath: relative2(cwd, resolve4(cwd, target)),
      toolName: name,
      cwd
    });
    if (result.decision === "deny") return deny(`${result.code}: ${result.message}`);
  }
  const command = extractShellCommand(event) ?? "";
  const workspaceRoot = resolveWorkspaceRoot(cwd, "pptx");
  const cwdInScope = /(?:^|[\\/])artifacts[\\/]pptx[\\/][^\\/]+(?:[\\/]|$)/u.test(cwd);
  const mutatesArtifact = (/artifacts[\\/]pptx[\\/]/u.test(command) || cwdInScope) && /(?:^|\s)(?:cp|mv|rm|touch|tee|install|python\d*|node|npm|npx)\b|[>]{1,2}/u.test(command);
  const approved = evaluateRegisteredWriter({
    command,
    cwd,
    workspaceRoot,
    carrier: "pptx",
    writers: ["project-lint.mjs", "project-release.mjs"],
    toolDirectory: resolve4(PLUGIN_DIRECTORY, "dist", "cli")
  });
  if (mutatesArtifact && !approved.ok) {
    return deny("UNKNOWN_MUTATION_SHELL: artifact mutations must use a registered PPTX wrapper");
  }
  if (/ui-ux-pro-max|--persist|design-system[\\/]MASTER\.md/u.test(command) && /artifacts[\\/]pptx[\\/]/u.test(command)) {
    return deny("COMMUNITY_SKILL_EXECUTION_DENIED: ui-ux-pro-max is read-only advice in hard scope");
  }
  return void 0;
}
async function projectFindings(cwd, forceStage) {
  const findings = [];
  const roots = typeof findPptxProjects === "function" ? await findPptxProjects(cwd) : (await findCarrierProjects(cwd, "pptx")).roots;
  for (const root of roots) {
    try {
      const model = await loadPptxProject(root);
      const stage = forceStage ?? model.plan?.targetStage ?? "source";
      for (const item of validatePptxModel(model, { stage })) {
        findings.push({ artifactId: model.artifactId, ...item });
      }
    } catch (error) {
      findings.push({ artifactId: relative2(cwd, root), code: "PROJECT_READ_FAILED", path: ".", message: error.message });
    }
  }
  return findings;
}
function formatFindings(findings) {
  return [
    "[PPTX Project Delivery Guard] Project contract violations",
    ...findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`),
    "recovery: Fix the named source/manifest/output, then run the registered validator or writer again."
  ].join("\n");
}
async function main() {
  const mode = process.argv[2] ?? "session";
  const event = await readStdinJson();
  if (event.__parseError) return;
  const cwd = eventCwd(event);
  if (mode === "pre") {
    writeJson(await runPre(event));
    return;
  }
  if (mode === "session") {
    const roots = await findPptxProjects(cwd);
    if (roots.length > 0) writeJson(additionalContext("SessionStart", `[PPTX Project Delivery Guard] discovered ${roots.length} project(s); generated outputs require registered writers.`));
    return;
  }
  if (mode === "post" || mode === "failure") {
    const findings = await projectFindings(cwd);
    if (findings.length > 0) writeJson(additionalContext(mode === "post" ? "PostToolUse" : "PostToolUseFailure", formatFindings(findings)));
    return;
  }
  if (mode === "stop") {
    const findings = await projectFindings(cwd);
    if (findings.length > 0) writeJson(stopBlock(formatFindings(findings)));
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve4(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`[PPTX Project Delivery Guard] ${error.message}
`);
    process.exitCode = 2;
  });
}
