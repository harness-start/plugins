#!/usr/bin/env node
// harness-source-hash: sha256:d28a7dcb6a47adf9d7ab4831024e6c5c282fa6ce764dd9fdb8bb78dd725f42e3
import {
  evaluateVideoWrite,
  issueWriterCapability,
  validateVideoModel
} from "../chunks/chunk-MQOGMMXB.mjs";
import {
  findVideoProjects,
  loadVideoProject,
  resolveWorkspaceRoot
} from "../chunks/chunk-X2VNCGIS.mjs";

// plugins/video-project-delivery-guard/src/entries/hooks/video-project-delivery-guard.ts
import { relative, resolve as resolve3 } from "node:path";
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
function eventSessionId(event) {
  const context2 = nestedRecord(event, "context");
  return firstString(
    event.session_id,
    event.sessionId,
    event.sessionID,
    event.conversation_id,
    event.conversationId,
    context2?.session_id
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

// plugins/video-project-delivery-guard/src/lib/shell-policy.ts
import { basename, dirname, isAbsolute as isAbsolute2, resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";
var MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
var PLUGIN_DIRECTORY = resolve2(
  process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? MODULE_DIRECTORY,
  process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? "." : "../.."
);
var TOOL_DIRECTORY = resolve2(PLUGIN_DIRECTORY, "dist", "cli");
var WRITERS = /* @__PURE__ */ new Set(["project-lint.mjs", "project-probe.mjs", "project-release.mjs", "project-render.mjs", "project-review.mjs"]);
var READ_ONLY = /* @__PURE__ */ new Set(["file", "find", "git", "grep", "head", "jq", "ls", "pwd", "rg", "sed", "stat", "tail", "wc"]);
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
function wrapperInvocation(words, cwd, workspaceRoot) {
  if (!words || words.length < 3) return null;
  const first = words[0];
  const second = words[1];
  const third = words[2];
  if (first === void 0 || second === void 0 || third === void 0) return null;
  if (!["node", basename(process.execPath), process.execPath].includes(first)) return null;
  if (second.startsWith("-")) return null;
  const script = isAbsolute2(second) ? resolve2(second) : resolve2(cwd, second);
  const name = basename(script);
  if (dirname(resolve2(script)) !== resolve2(TOOL_DIRECTORY) || !WRITERS.has(name)) return null;
  const projectRoot = isAbsolute2(third) ? resolve2(third) : resolve2(cwd, third);
  const expectedParent = resolve2(workspaceRoot, "artifacts", "video");
  if (dirname(projectRoot) !== expectedParent || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(projectRoot))) return null;
  return { name, projectRoot, argv: [script, ...words.slice(2)] };
}
function expandKnownPluginRoot(command) {
  let expanded = String(command ?? "");
  for (const name of ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"]) {
    const value = process.env[name];
    if (!value) continue;
    expanded = expanded.replaceAll(`"\${${name}}/dist/cli/`, `"${resolve2(value)}/dist/cli/`);
  }
  return expanded;
}
function readOnlyCommand(words) {
  if (!words || words.length === 0) return false;
  const first = words[0];
  if (first === void 0) return false;
  const command = basename(first);
  if (!READ_ONLY.has(command)) return false;
  if (command === "git" && !["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(words[1] ?? "")) return false;
  if (command === "sed" && words.some((word) => /^-.*i/u.test(word))) return false;
  if (command === "find" && words.some((word) => ["-delete", "-exec", "-execdir", "-ok", "-okdir"].includes(word))) return false;
  return true;
}
function commandTouchesVideoScope(command, cwd, workspaceRoot) {
  const normalizedCommand = String(command ?? "").replaceAll("\\", "/");
  const normalizedCwd = resolve2(cwd).replaceAll("\\", "/");
  const normalizedRoot = resolve2(workspaceRoot).replaceAll("\\", "/");
  return normalizedCwd.startsWith(`${normalizedRoot}/artifacts/video/`) || /(?:^|[\s"'=])\.?\/?artifacts\/video(?:\/|[\s"']|$)/u.test(normalizedCommand) || normalizedCommand.includes(`${normalizedRoot}/artifacts/video/`);
}
function evaluateVideoShell({ command, cwd, workspaceRoot }) {
  if (!commandTouchesVideoScope(command, cwd, workspaceRoot)) return { decision: "allow" };
  const words = parseShellWords(expandKnownPluginRoot(command));
  const invocation = wrapperInvocation(words, cwd, workspaceRoot);
  if (invocation) return {
    decision: "allow",
    writer: `video-${invocation.name.slice("project-".length, -".mjs".length)}`,
    projectRoot: invocation.projectRoot,
    argv: invocation.argv
  };
  if (readOnlyCommand(words)) return { decision: "allow" };
  return { decision: "deny", code: "UNKNOWN_MUTATION_SHELL", message: "video scope permits only read-only commands or an exact registered writer invocation" };
}

// plugins/video-project-delivery-guard/src/entries/hooks/video-project-delivery-guard.ts
var nameOf = (event) => eventToolName(event);
var cwdOf = (event) => resolve3(eventCwd(event));
var sessionOf = (event) => eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown";
function targetsOf(event) {
  return extractFileTargets(event, { tools: "any" });
}
function deny(reason) {
  return preToolDeny(`[Video Project Delivery Guard] ${reason}`);
}
function context(eventName, message) {
  return additionalContext(eventName, message);
}
function isRecord2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
async function findingsFor(cwd) {
  const findings = [];
  const { workspaceRoot, roots } = await findVideoProjects(cwd);
  for (const root of roots) {
    const model = await loadVideoProject(root);
    const artifactPath = relative(workspaceRoot, root).replaceAll("\\", "/");
    if (!(model.files && "plan.contract.json" in model.files)) {
      findings.push({ artifactId: model.artifactId, code: "PLAN_CONTRACT_MISSING", path: `${artifactPath}/plan.contract.json`, message: "plan.contract.json is required to select a closure stage" });
    }
    const stage = isRecord2(model.plan) && typeof model.plan.targetStage === "string" ? model.plan.targetStage : void 0;
    for (const item of validateVideoModel(model, stage === void 0 ? {} : { stage })) findings.push({ artifactId: model.artifactId, ...item });
  }
  return { findings, projectCount: roots.length };
}
function format(findings) {
  return ["[Video Project Delivery Guard] Project contract violations", ...findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`), "recovery: Fix the named contract, proof, evidence, or output and rerun the registered video tool."].join("\n");
}
async function main() {
  const mode = process.argv[2] ?? "session";
  const event = await readStdinJson();
  if (event.__parseError) {
    process.stderr.write("[Video Project Delivery Guard] invalid hook JSON\n");
    process.exitCode = 2;
    return;
  }
  const cwd = cwdOf(event);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  if (mode === "pre") {
    for (const target of targetsOf(event)) {
      const absolutePath = resolve3(cwd, target);
      const result = evaluateVideoWrite({ relativePath: absolutePath, toolName: nameOf(event) });
      if (result.decision === "deny") {
        process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}
`);
        return;
      }
    }
    const command = extractShellCommand(event) ?? "";
    if (command) {
      const result = evaluateVideoShell({ command, cwd, workspaceRoot });
      if (result.decision === "deny") process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}
`);
      else if (result.writer && result.writer !== "video-lint" && result.projectRoot && result.argv) {
        try {
          await issueWriterCapability({ root: result.projectRoot, capability: result.writer, argv: result.argv, sessionId: sessionOf(event), triggerFrom: `video-project-delivery-guard:pre:${result.writer}` });
        } catch (error) {
          const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
          process.stdout.write(`${JSON.stringify(deny(`WRITER_CAPABILITY_DENIED: ${message}`))}
`);
        }
      }
    }
    return;
  }
  if (mode === "session") {
    const { roots } = await findVideoProjects(cwd);
    const projectCount = roots.length;
    if (projectCount > 0) process.stdout.write(`${JSON.stringify(context("SessionStart", `[Video Project Delivery Guard] discovered ${projectCount} project(s); generated outputs require registered writers; host session id=${sessionOf(event)}.`))}
`);
    return;
  }
  const { findings } = await findingsFor(cwd);
  if (mode === "post" || mode === "failure") {
    if (findings.length > 0) process.stdout.write(`${JSON.stringify(context(mode === "post" ? "PostToolUse" : "PostToolUseFailure", format(findings)))}
`);
  } else if (mode === "stop" && findings.length > 0) {
    writeJson(stopBlock(format(findings)));
  }
}
if (process.argv[1] && fileURLToPath2(import.meta.url) === resolve3(process.argv[1])) {
  main().catch((error) => {
    const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
    process.stderr.write(`[Video Project Delivery Guard] ${message}
`);
    process.exitCode = 2;
  });
}
