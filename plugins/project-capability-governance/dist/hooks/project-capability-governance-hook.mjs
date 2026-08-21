#!/usr/bin/env node
// harness-source-hash: sha256:c48323ef2b904e74f653a74922bd5e5c6215188e3def4f9c5cacd35920a6a3e6
import {
  consumeNoticeDelta,
  ensureCapabilityWorkspace,
  eventCwd,
  eventSessionId,
  eventToolInput,
  eventToolName,
  isProposalInboxTarget,
  isRecord,
  proposalLocation,
  readStdinJson,
  renderHumanNotice,
  validateProposalDocument
} from "../chunks/chunk-OWB7754U.mjs";

// plugins/project-capability-governance/src/entries/hooks/project-capability-governance-hook.ts
import { execFileSync } from "node:child_process";
import { appendFile, lstat } from "node:fs/promises";
import { resolve as resolve3 } from "node:path";
import { fileURLToPath } from "node:url";

// plugins/project-capability-governance/src/lib/hook-io.ts
import { isAbsolute as isAbsolute2, resolve as resolve2 } from "node:path";

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

// plugins/project-capability-governance/src/lib/hook-io.ts
function extractSessionId(event) {
  return eventSessionId(event) || "unknown";
}
function extractShellCommand2(event) {
  return extractShellCommand(event) ?? "";
}
function extractShellWorkingDirectory(event) {
  if (!isShellTool(eventToolName(event))) return null;
  const input = eventToolInput(event);
  const value = input.workdir ?? input.cwd ?? input.working_directory ?? input.workingDirectory;
  if (typeof value !== "string" || !value.trim()) return null;
  return isAbsolute2(value) ? resolve2(value) : resolve2(eventCwd(event), value);
}
function extractFileTargets2(event) {
  return extractFileTargets(event);
}
function extractWriteContent(event) {
  const input = eventToolInput(event);
  const value = input.content ?? input.file_text ?? input.text;
  if (typeof value === "string") return value;
  if (!/^(?:apply_patch|ApplyPatch)$/u.test(String(eventToolName(event)))) return null;
  const patch = input.patch ?? input.input ?? "";
  if (typeof patch !== "string") return null;
  const lines = patch.split("\n");
  const directives = lines.map((line, index) => ({ line, index })).filter(({ line }) => /^\*\*\*\s+(?:Add|Update|Delete) File:\s+/u.test(line));
  const firstDirective = directives[0];
  if (directives.length !== 1 || !firstDirective || !/^\*\*\*\s+Add File:\s+/u.test(firstDirective.line)) return null;
  const end = lines.indexOf("*** End Patch", firstDirective.index + 1);
  if (end < 0) return null;
  const body = lines.slice(firstDirective.index + 1, end);
  if (body.length === 0 || body.some((line) => !line.startsWith("+"))) return null;
  return body.map((line) => line.slice(1)).join("\n");
}
function isFileTool(event) {
  return isFileMutationTool(eventToolName(event));
}
function isShellTool2(event) {
  return isShellTool(eventToolName(event));
}
function contextOutput(eventName, text) {
  return additionalContext(eventName, text);
}
function systemMessageOutput(text) {
  return { systemMessage: text };
}

// plugins/project-capability-governance/src/entries/hooks/project-capability-governance-hook.ts
function shellSingleQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}
function sessionContext() {
  return [
    "[Project Capability Discovery] Observe only durable, project-specific capability candidates.",
    "Qualify an SOP only after two occurrences or an explicit future-standardization request, with a reusable multi-step flow and measurable acceptance.",
    "Qualify a hard Hook only after one severe or two ordinary violations, with an observable event, deterministic predicate, target harm, recovery, and near-miss.",
    "Exclude current-task TODOs, one-offs, generic advice, and hooks whose only evidence is activation or extra model turns.",
    "When a candidate qualifies, the parent agent may create one schema-valid pending proposal directly.",
    "For a difficult judgment, the parent may ask an ordinary read-only subagent for advice in plain language; the parent remains responsible for checking the evidence and writing the proposal.",
    "Subagents are optional advisers. They receive no plugin-defined identity, reservation, lifecycle, write authority, or approval power."
  ].join("\n");
}
async function persistClaudeSession(event) {
  const environmentFile = process.env.CLAUDE_ENV_FILE;
  if (!environmentFile) return;
  const lines = [
    `export AI_EXPERTS_SESSION_ID=${shellSingleQuote(extractSessionId(event))}`
  ];
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    lines.push(`export PROJECT_CAPABILITY_GOVERNANCE_ROOT=${shellSingleQuote(process.env.CLAUDE_PLUGIN_ROOT)}`);
  }
  await appendFile(environmentFile, `${lines.join("\n")}
`, "utf8");
}
function shellMayMutate(command) {
  const value = String(command ?? "");
  if (/(?:^|[;&|()\s])(?:apply_patch|cp|dd|install|ln|mkdir|mv|rm|rmdir|tee|touch|truncate)(?:\s|$)/iu.test(value)) return true;
  if (/(?:^|[;&|()\s])(?:node|perl|php|python3?|ruby)(?:\s|$)/iu.test(value)) return true;
  if (/(?:^|[;&|()\s])(?:sed|perl)\s+[^;&|\n]*-[^\s]*i/iu.test(value)) return true;
  if (/(?:^|[;&|()\s])git\s+(?:clean|mv|restore|rm)(?:\s|$)/iu.test(value)) return true;
  if (/(?:^|[^0-9])>{1,2}(?:\s|$)/u.test(value)) return true;
  return false;
}
function resolveProjectRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      timeout: 5e3,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return resolve3(cwd);
  }
}
async function runStop(event) {
  const projectRoot = resolveProjectRoot(eventCwd(event));
  const delta = await consumeNoticeDelta(projectRoot);
  if (delta.length === 0) return;
  writeJson(systemMessageOutput(renderHumanNotice(delta.length)));
}
async function runSession(event) {
  await persistClaudeSession(event);
  writeJson(contextOutput("SessionStart", sessionContext()));
}
async function handleProposalWrite(event, projectRoot, locations) {
  const relevant = locations.filter((location2) => location2 !== null);
  if (relevant.length === 0) return false;
  if (relevant.length !== locations.length || relevant.length !== 1) {
    writeJson(preToolDeny("[Project Capability Governance] proposal writes must target one exact inbox Markdown file"));
    return true;
  }
  const location = relevant[0];
  if (!location) {
    writeJson(preToolDeny("[Project Capability Governance] proposal writes must target one exact inbox Markdown file"));
    return true;
  }
  const toolName = String(eventToolName(event));
  const content = extractWriteContent(event);
  if (location.status !== "pending" || !/^(?:Write|create_file|apply_patch)$/iu.test(toolName) || content === null) {
    writeJson(preToolDeny("[Project Capability Governance] create one new pending proposal with Write/create_file or a single Add File patch"));
    return true;
  }
  const checked = validateProposalDocument(content, location.fileName);
  if (!checked.ok) {
    writeJson(preToolDeny(`[Project Capability Governance] invalid proposal: ${checked.reason}`));
    return true;
  }
  try {
    await lstat(location.absolute);
    writeJson(preToolDeny("[Project Capability Governance] an existing proposal path cannot be overwritten"));
    return true;
  } catch (error) {
    if (!isRecord(error) || error.code !== "ENOENT") {
      writeJson(preToolDeny(`[Project Capability Governance] proposal target cannot be inspected safely: ${error instanceof Error ? error.message : String(error)}`));
      return true;
    }
  }
  await ensureCapabilityWorkspace(projectRoot);
  return true;
}
async function runPre(event) {
  const projectRoot = resolveProjectRoot(eventCwd(event));
  if (isFileTool(event)) {
    const targets = extractFileTargets2(event);
    const locations = targets.map((target) => proposalLocation(projectRoot, target));
    if (targets.some((target) => isProposalInboxTarget(projectRoot, target)) && locations.every((location) => !location)) {
      writeJson(preToolDeny("[Project Capability Governance] non-canonical mutation under the proposal inbox is forbidden"));
      return;
    }
    if (await handleProposalWrite(event, projectRoot, locations)) return;
  }
  if (isShellTool2(event)) {
    const command = extractShellCommand2(event) ?? "";
    const commandNamesInbox = /\.project-capabilities[\\/]inbox/iu.test(command);
    const workingDirectory = extractShellWorkingDirectory(event);
    const targetsInbox = commandNamesInbox || workingDirectory && isProposalInboxTarget(projectRoot, workingDirectory);
    if (targetsInbox && shellMayMutate(command)) {
      writeJson(preToolDeny("[Project Capability Governance] direct shell mutation of the proposal inbox is forbidden; use the governance lifecycle command"));
    }
  }
}
async function main() {
  const mode = process.argv[2] ?? "stop";
  const event = await readStdinJson();
  if (event.__parseError) return;
  try {
    if (mode === "session" || mode === "SessionStart") await runSession(event);
    else if (mode === "pre" || mode === "PreToolUse") await runPre(event);
    else if (mode === "stop" || mode === "Stop") await runStop(event);
  } catch (error) {
    process.stderr.write(`[project-capability-governance] ${error instanceof Error ? error.message : String(error)}
`);
  }
}
var isMain = process.argv[1] && resolve3(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
export {
  resolveProjectRoot,
  runPre,
  runSession,
  runStop
};
