#!/usr/bin/env node
// harness-source-hash: sha256:85b13c2563bdc59fda6a978b54a670ea3995eff826a4b0880d4dd0c0892b9729
import {
  issueWriterCapability
} from "../chunks/chunk-32HEFPD2.mjs";
import {
  computeTrainingSubjectDigest,
  evaluateTrainingWrite,
  findTrainingProjects,
  loadTrainingProject,
  resolveWorkspaceRoot,
  validateTrainingModel
} from "../chunks/chunk-WWIPRB2V.mjs";

// plugins/training-program-design/src/entries/hooks/training-program-design.ts
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

// plugins/training-program-design/src/lib/shell-policy.ts
import { basename, dirname, isAbsolute as isAbsolute2, resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";
var MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
var PLUGIN_DIRECTORY = resolve2(process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? MODULE_DIRECTORY, process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? "." : "../..");
var TOOL_DIRECTORY = resolve2(PLUGIN_DIRECTORY, "dist", "cli");
var WRITERS = /* @__PURE__ */ new Set(["project-init.mjs", "project-lint.mjs", "project-render.mjs", "project-review.mjs", "project-release.mjs"]);
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
function expandKnownPluginRoot(command) {
  let expanded = String(command ?? "");
  for (const name of ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"]) {
    const value = process.env[name];
    if (value) expanded = expanded.replaceAll(`"\${${name}}/dist/cli/`, `"${resolve2(value)}/dist/cli/`);
  }
  return expanded;
}
function wrapperInvocation(words, cwd, workspaceRoot) {
  if (!words || words.length < 3) return null;
  const [first, second, third] = words;
  if (!first || !second || !third || !["node", basename(process.execPath), process.execPath].includes(first) || second.startsWith("-")) return null;
  const script = isAbsolute2(second) ? resolve2(second) : resolve2(cwd, second);
  const name = basename(script);
  if (dirname(script) !== TOOL_DIRECTORY || !WRITERS.has(name)) return null;
  const projectRoot = isAbsolute2(third) ? resolve2(third) : resolve2(cwd, third);
  if (dirname(projectRoot) !== resolve2(workspaceRoot, "artifacts", "training") || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(projectRoot))) return null;
  return { name, projectRoot, argv: [script, ...words.slice(2)] };
}
function readOnlyCommand(words) {
  if (!words?.length) return false;
  const command = basename(words[0] ?? "");
  if (!READ_ONLY.has(command)) return false;
  if (command === "git" && !["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(words[1] ?? "")) return false;
  if (command === "sed" && words.some((word) => /^-.*i/u.test(word))) return false;
  if (command === "find" && words.some((word) => ["-delete", "-exec", "-execdir", "-ok", "-okdir"].includes(word))) return false;
  return true;
}
function commandTouchesTrainingScope(command, cwd, workspaceRoot) {
  const normalizedCommand = String(command ?? "").replaceAll("\\", "/");
  const normalizedCwd = resolve2(cwd).replaceAll("\\", "/");
  const normalizedRoot = resolve2(workspaceRoot).replaceAll("\\", "/");
  return normalizedCwd.startsWith(`${normalizedRoot}/artifacts/training/`) || /(?:^|[\s"'=])\.?\/?artifacts\/training(?:\/|[\s"']|$)/u.test(normalizedCommand) || normalizedCommand.includes(`${normalizedRoot}/artifacts/training/`);
}
function evaluateTrainingShell({ command, cwd, workspaceRoot }) {
  if (!commandTouchesTrainingScope(command, cwd, workspaceRoot)) return { decision: "allow" };
  const words = parseShellWords(expandKnownPluginRoot(command));
  const invocation = wrapperInvocation(words, cwd, workspaceRoot);
  if (invocation) return { decision: "allow", writer: `training-${invocation.name.slice("project-".length, -".mjs".length)}`, projectRoot: invocation.projectRoot, argv: invocation.argv };
  if (readOnlyCommand(words)) return { decision: "allow" };
  return { decision: "deny", code: "UNKNOWN_MUTATION_SHELL", message: "training scope permits only read-only commands or an exact registered writer invocation" };
}

// plugins/training-program-design/src/entries/hooks/training-program-design.ts
var LABEL = "[Training Program Delivery Guard]";
function deny(reason) {
  return preToolDeny(`${LABEL} ${reason}`);
}
async function runPre(event) {
  const cwd = resolve3(eventCwd(event));
  const toolName = eventToolName(event);
  for (const target of extractFileTargets(event, { tools: "any" })) {
    const decision2 = evaluateTrainingWrite({ relativePath: relative(cwd, resolve3(cwd, target)), toolName, cwd });
    if (decision2.decision === "deny") return deny(`${decision2.code}: ${decision2.message}`);
  }
  const command = extractShellCommand(event);
  if (!command) return void 0;
  const decision = evaluateTrainingShell({ command, cwd, workspaceRoot: resolveWorkspaceRoot(cwd) });
  if (decision.decision === "deny") return deny(`${decision.code}: ${decision.message}`);
  if (decision.writer && ["training-render", "training-review", "training-release"].includes(decision.writer) && decision.projectRoot && decision.argv) {
    try {
      const model = await loadTrainingProject(decision.projectRoot);
      await issueWriterCapability({
        root: decision.projectRoot,
        capability: decision.writer,
        argv: decision.argv,
        subjectDigest: computeTrainingSubjectDigest(model),
        sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown",
        triggerFrom: process.env.AI_EXPERTS_TRIGGER_FROM || `training-program-design:pre:${decision.writer}`
      });
    } catch (error) {
      return deny(`WRITER_CAPABILITY_DENIED: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return void 0;
}
function targetStage(plan) {
  return typeof plan === "object" && plan !== null && !Array.isArray(plan) ? plan.targetStage : void 0;
}
function feedbackStage(files) {
  if ("receipt.release.json" in files) return "release";
  if ("review.training.json" in files) return "review";
  if ("evidence.render.json" in files || Object.keys(files).some((path) => path.startsWith("dist/"))) return "materials";
  if (".training-delivery-journal.json" in files) return "brief";
  return null;
}
async function projectFindings(cwd, forceStage, { generatedOnly = false } = {}) {
  const findings = [];
  for (const root of await findTrainingProjects(cwd)) {
    try {
      const model = await loadTrainingProject(root);
      const currentStage = generatedOnly ? feedbackStage(model.files) : forceStage ?? targetStage(model.plan) ?? "brief";
      if (!currentStage) continue;
      for (const item of validateTrainingModel(model, { stage: currentStage })) {
        findings.push({ artifactId: model.artifactId, ...item });
      }
    } catch (error) {
      findings.push({ artifactId: relative(cwd, root), code: "PROJECT_READ_FAILED", path: ".", message: error instanceof Error ? error.message : String(error) });
    }
  }
  return findings;
}
function formatFindings(findings) {
  const facts = findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`);
  return [
    `${LABEL} stage contract is incomplete.`,
    "observedFacts:",
    ...facts,
    "harm: The requested training stage is not supported by current source, evidence, review, or receipt state.",
    "unblockWhen: Every listed violation is resolved and the validator passes at plan.contract.json targetStage.",
    "recovery: Edit only plan.contract.json or training-package.json, then use the registered lint/render/review/release wrapper in order."
  ].join("\n");
}
async function main() {
  const mode = process.argv[2] ?? "session";
  const event = await readStdinJson();
  if (event.__parseError) {
    if (mode === "pre") writeJson(deny("HOOK_INPUT_INVALID: invalid hook JSON; refusing a possibly protected mutation"));
    else process.stderr.write(`${LABEL} invalid hook JSON; non-mutating hook failed open
`);
    return;
  }
  const cwd = eventCwd(event);
  if (mode === "pre") {
    writeJson(await runPre(event));
    return;
  }
  if (mode === "session") {
    const roots = await findTrainingProjects(cwd);
    const context = roots.length > 0 ? `${LABEL} discovered ${roots.length} active training project(s). Follow the bundled training-program-design Skill; generated materials, review, and release evidence require registered writers.` : `${LABEL} no training project is active. Route to the bundled training-program-design Skill only when the user asks to design or adapt training; otherwise take no action.`;
    writeJson(additionalContext("SessionStart", context));
    return;
  }
  if (mode === "post" || mode === "failure") {
    const findings = await projectFindings(cwd, void 0, { generatedOnly: true });
    if (findings.length > 0) writeJson(additionalContext(mode === "post" ? "PostToolUse" : "PostToolUseFailure", formatFindings(findings)));
    return;
  }
  if (mode === "subagent-stop") {
    const findings = await projectFindings(cwd, "review");
    if (findings.length > 0) writeJson(additionalContext("Stop", `${formatFindings(findings)}
reviewBoundary: Reviewer output is advisory; it has no release authority.`));
    return;
  }
  if (mode === "stop") {
    const findings = await projectFindings(cwd);
    if (findings.length > 0) writeJson(stopBlock(formatFindings(findings)));
  }
}
if (process.argv[1] && fileURLToPath2(import.meta.url) === resolve3(process.argv[1])) {
  main().catch((error) => {
    const message = `${LABEL} ${error instanceof Error ? error.message : String(error)}`;
    if ((process.argv[2] ?? "session") === "pre") writeJson(deny(`HOOK_FAILURE: ${message}`));
    else process.stderr.write(`${message}
`);
  });
}
