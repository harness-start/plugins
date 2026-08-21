#!/usr/bin/env node
// harness-source-hash: sha256:4cb0b7f4fe58c75796fcf0f845e4bebe612b9cf6e31149f245c43087f26fe512
import {
  evaluatePrintWrite,
  isKebabArtifactId,
  markSessionEngagedArtifact,
  resolveWorkspaceRoot,
  sessionEngagedArtifact,
  touchesArtifact,
  validatePrintModel
} from "../chunks/chunk-IAWKO2KN.mjs";

// plugins/print-publication-production/src/entries/hooks/print-publication-production.ts
import { basename as basename2, dirname as dirname2, relative as relative2, resolve as resolve4 } from "node:path";
import { fileURLToPath } from "node:url";

// core/src/artifact-scan.ts
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
var SKIP_NAMES = /* @__PURE__ */ new Set(["node_modules", ".git", ".cache", ".tmp"]);
async function collectProjectFiles(root, options = {}) {
  const files = {};
  const digests = {};
  const bytes = {};
  await collect(resolve(root), resolve(root), files, digests, bytes, { value: 0 }, options);
  return { files, digests, bytes };
}
async function collect(root, directory, files, digests, bytesMap, count, options) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${entry.name}`);
    if (SKIP_NAMES.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collect(root, absolute, files, digests, bytesMap, count, options);
    } else if (entry.isFile()) {
      count.value += 1;
      if (options.maxFiles && count.value > options.maxFiles) throw new Error("PROJECT_FILE_LIMIT_EXCEEDED");
      const bytes = await readFile(absolute);
      if (options.maxFileBytes && bytes.byteLength > options.maxFileBytes) {
        throw new Error(`PROJECT_FILE_SIZE_EXCEEDED:${entry.name}`);
      }
      const filePath = relative(root, absolute).replaceAll("\\", "/");
      files[filePath] = bytes.toString("utf8");
      bytesMap[filePath] = bytes;
      digests[filePath] = createHash("sha256").update(bytes).digest("hex");
    }
  }
}
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
function isStopHookActive(event) {
  return event.stop_hook_active === true || event.stopHookActive === true;
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
function eventTouchesArtifact(event, carrier) {
  return touchesArtifact({
    cwd: eventCwd(event),
    carrier,
    command: extractShellCommand(event) ?? "",
    paths: extractFileTargets(event, { tools: "any" })
  });
}

// core/src/path-protect.ts
function isGenericMutationCommand(command) {
  const text = String(command ?? "");
  if (!text.trim()) return false;
  if (/(?:^|[^0-9])>{1,2}\s*(?:"[^"]*"|'[^']*'|\S+)/u.test(text)) return true;
  if (/<<\s*['"]?\w+/u.test(text)) return true;
  if (/(?:^|[\s;|&`(])(?:\/(?:usr\/)?bin\/)?(?:rm|mv|cp|tee|truncate|shred|unlink|chmod|chown|rsync|dd|install)\b/iu.test(text)) return true;
  if (/(?:^|[\s;|&`(])find\b[\s\S]*\s-delete\b/iu.test(text)) return true;
  if (/(?:^|[\s;|&`(])git\s+clean\b/iu.test(text)) return true;
  if (/(?:^|[\s;|&`(])sed\s+(?:-i\b|\S*i\S*\b)/iu.test(text)) return true;
  if (/(?:^|[\s;|&`(])(?:perl|ruby|python3?)\s+[^\n]*\s-i\b/iu.test(text)) return true;
  if (/(?:^|[\s;|&`(])(?:node(?:js)?|deno|bun|perl|ruby|php|lua|python3?)\b/iu.test(text)) return true;
  return false;
}

// plugins/print-publication-production/src/entries/hooks/print-publication-production.ts
var MODULE_DIRECTORY = dirname2(fileURLToPath(import.meta.url));
var PLUGIN_DIRECTORY = resolve4(
  process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? MODULE_DIRECTORY,
  process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? "." : "../.."
);
var READ_ONLY_COMMANDS = /* @__PURE__ */ new Set(["file", "find", "git", "grep", "head", "jq", "ls", "pwd", "rg", "sed", "stat", "tail", "wc"]);
function deny(reason) {
  return preToolDeny(`[Print Project Delivery Guard] ${reason}`);
}
function isReadOnlyCommand(command) {
  const words = parseShellWords(expandKnownPluginRoot(command));
  if (!words?.length) return false;
  const executable = basename2(words[0] ?? "");
  if (!READ_ONLY_COMMANDS.has(executable)) return false;
  if (executable === "git" && !["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(words[1] ?? "")) return false;
  if (executable === "sed" && words.some((word) => /^-.*i/u.test(word))) return false;
  if (executable === "find" && words.some((word) => ["-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprint0", "-fprintf", "-fls"].includes(word))) return false;
  if (executable === "rg" && words.some((word) => word === "--pre" || word.startsWith("--pre="))) return false;
  return true;
}
function targetStageOf(plan) {
  return typeof plan === "object" && plan !== null && !Array.isArray(plan) ? plan.targetStage : void 0;
}
async function findingsFor(cwd) {
  const findings = [];
  const { roots } = await findCarrierProjects(cwd, "print");
  for (const root of roots) {
    const collected = await collectProjectFiles(root, { maxFiles: 2048 });
    if (!("plan.contract.json" in collected.files)) continue;
    let plan = null;
    let project = null;
    try {
      plan = JSON.parse(collected.files["plan.contract.json"] ?? "");
    } catch {
    }
    try {
      project = JSON.parse(collected.files["print.project.json"] ?? "");
    } catch {
    }
    const model = { artifactId: basename2(root), files: collected.files, digests: collected.digests, plan, project };
    for (const item of validatePrintModel(model, { stage: targetStageOf(plan) ?? "source" })) {
      findings.push({ artifactId: model.artifactId, ...item });
    }
  }
  return findings;
}
function format(findings) {
  return [
    "[Print Project Delivery Guard] Project contract violations",
    ...findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`),
    "recovery: Fix the named variant, layer, proof, or output and rerun the registered print tool."
  ].join("\n");
}
async function main() {
  const mode = process.argv[2] ?? "session";
  const event = await readStdinJson();
  if (event.__parseError) return;
  const cwd = eventCwd(event);
  if (mode === "pre") {
    for (const target of extractFileTargets(event, { tools: "any" })) {
      const result = evaluatePrintWrite({
        relativePath: relative2(cwd, resolve4(cwd, target)),
        toolName: eventToolName(event),
        cwd
      });
      if (result.decision === "deny") {
        writeJson(deny(`${result.code}: ${result.message}`));
        return;
      }
    }
    const command = extractShellCommand(event) ?? "";
    const workspaceRoot = resolveWorkspaceRoot(cwd, "print");
    const cwdInScope = /(?:^|[\\/])artifacts[\\/]print[\\/][^\\/]+(?:[\\/]|$)/u.test(cwd);
    const activeProjectCount = isGenericMutationCommand(command) ? (await findCarrierProjects(cwd, "print")).roots.length : 0;
    const inScope = /artifacts[\\/]print[\\/]/u.test(command) || cwdInScope || activeProjectCount > 0;
    const approved = evaluateRegisteredWriter({
      command,
      cwd,
      workspaceRoot,
      carrier: "print",
      writers: ["project-lint.mjs", "project-release.mjs"],
      toolDirectory: resolve4(PLUGIN_DIRECTORY, "dist", "cli")
    });
    if (inScope && !approved.ok && !isReadOnlyCommand(command)) {
      writeJson(deny("UNKNOWN_MUTATION_SHELL: print scope permits only read-only commands or an exact registered writer invocation"));
    }
    return;
  }
  if (mode === "session") {
    const { roots } = await findCarrierProjects(cwd, "print");
    if (roots.length > 0) writeJson(additionalContext("SessionStart", "[Print Project Delivery Guard] active; generated outputs require registered writers."));
    return;
  }
  const sessionId = eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown";
  if (mode === "post" || mode === "failure") {
    if (!eventTouchesArtifact(event, "print")) return;
    markSessionEngagedArtifact({ cwd, carrier: "print", sessionId });
  }
  if (mode === "stop" && isStopHookActive(event)) return;
  if ((mode === "stop" || mode === "subagent-stop") && !sessionEngagedArtifact({ cwd, carrier: "print", sessionId })) return;
  if (mode === "subagent-stop" || mode === "post" || mode === "failure" || mode === "stop") {
    const findings = await findingsFor(cwd);
    if (mode === "post" || mode === "failure") {
      if (findings.length > 0) writeJson(additionalContext(mode === "post" ? "PostToolUse" : "PostToolUseFailure", format(findings)));
    } else if (mode === "subagent-stop") {
      if (findings.length > 0) writeJson(additionalContext("Stop", format(findings)));
    } else if (findings.length > 0) {
      writeJson(stopBlock(format(findings)));
    }
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve4(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`[Print Project Delivery Guard] ${error instanceof Error ? error.message : String(error)}
`);
    process.exitCode = 2;
  });
}
