#!/usr/bin/env node
// harness-source-hash: sha256:7dbd753bc157e61becaf4e4c98315b72361e6f0aafc7465003f54905a0acfd46
import {
  issueWriterCapability
} from "../chunks/chunk-DWPSMNZX.mjs";
import "../chunks/chunk-AZMNGOZB.mjs";
import {
  computePptxSubjectDigest,
  evaluatePptxWrite,
  findPptxProjects,
  loadPptxProject,
  resolveWorkspaceRoot,
  validatePptxModel
} from "../chunks/chunk-SY4XKZY6.mjs";

// plugins/presentation-production/src/entries/hooks/presentation-production.ts
import { relative as relative2, resolve as resolve5 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// core/src/artifact-scan.ts
import { readdir, readFile } from "node:fs/promises";
import { join as join2, relative, resolve as resolve2 } from "node:path";

// core/src/artifact-paths.ts
import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
var KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
function isKebabArtifactId(name) {
  return KEBAB.test(name);
}
function resolveWorkspaceRoot2(cwd, carrier) {
  let current = resolve(cwd);
  while (current !== dirname(current)) {
    if (basename(dirname(current)) === carrier && basename(dirname(dirname(current))) === "artifacts") {
      return dirname(dirname(dirname(current)));
    }
    current = dirname(current);
  }
  return resolve(cwd);
}
function touchesArtifact(options) {
  const { cwd, carrier, command = "", paths = [] } = options;
  const marker = `artifacts/${carrier}`;
  const cwdNorm = resolve(cwd).replaceAll("\\", "/");
  const workspace = resolveWorkspaceRoot2(cwd, carrier).replaceAll("\\", "/");
  if (cwdNorm === `${workspace}/${marker}` || cwdNorm.startsWith(`${workspace}/${marker}/`)) return true;
  return [command, ...paths].join("\n").replaceAll("\\", "/").includes(marker);
}
function artifactJournalName(carrier) {
  return `.${carrier}-delivery-journal.json`;
}
function cwdInsideArtifact(cwd, carrier) {
  const cwdNorm = resolve(cwd).replaceAll("\\", "/");
  const workspace = resolveWorkspaceRoot2(cwd, carrier).replaceAll("\\", "/");
  const marker = `artifacts/${carrier}`;
  return cwdNorm === `${workspace}/${marker}` || cwdNorm.startsWith(`${workspace}/${marker}/`);
}
function sessionEngagedArtifact(options) {
  const cwd = resolve(options.cwd);
  const { carrier } = options;
  if (cwdInsideArtifact(cwd, carrier)) return true;
  const workspace = resolveWorkspaceRoot2(cwd, carrier);
  const artifactRoot = join(workspace, "artifacts", carrier);
  const journal = artifactJournalName(carrier);
  if (existsSync(artifactRoot)) {
    try {
      for (const entry of readdirSync(artifactRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (existsSync(join(artifactRoot, entry.name, journal))) return true;
      }
    } catch {
    }
  }
  return false;
}

// core/src/artifact-scan.ts
async function findCarrierProjects(cwd, carrier, options = {}) {
  const workspaceRoot = resolveWorkspaceRoot2(cwd, carrier);
  const artifactRoot = join2(workspaceRoot, "artifacts", carrier);
  try {
    const roots = (await readdir(artifactRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && (options.requireKebab === false || isKebabArtifactId(entry.name))).slice(0, 32).map((entry) => join2(artifactRoot, entry.name));
    return { workspaceRoot, roots };
  } catch (error) {
    if (error.code === "ENOENT") return { workspaceRoot, roots: [] };
    throw error;
  }
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
import { isAbsolute, resolve as resolve3 } from "node:path";
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
    raw.map(stripMatchingQuotes).filter(Boolean).map((path) => isAbsolute(path) ? resolve3(path) : resolve3(cwd, path.replace(/^\.\//u, "")))
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

// plugins/presentation-production/src/lib/shell-policy.ts
import { basename as basename2, dirname as dirname2, isAbsolute as isAbsolute2, resolve as resolve4 } from "node:path";
import { fileURLToPath } from "node:url";
var MODULE_DIRECTORY = dirname2(fileURLToPath(import.meta.url));
var PLUGIN_DIRECTORY = resolve4(process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? MODULE_DIRECTORY, process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? "." : "../..");
var TOOL_DIRECTORY = resolve4(PLUGIN_DIRECTORY, "dist", "cli");
var WRITERS = /* @__PURE__ */ new Set(["project-init.mjs", "project-lint.mjs", "project-probe.mjs", "project-release.mjs", "project-render.mjs", "project-review.mjs"]);
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
    if (value) expanded = expanded.replaceAll(`"\${${name}}/dist/cli/`, `"${resolve4(value)}/dist/cli/`);
  }
  return expanded;
}
function wrapperInvocation(words, cwd, workspaceRoot) {
  if (!words || words.length < 3) return null;
  const [first, second, third] = words;
  if (!first || !second || !third || !["node", basename2(process.execPath), process.execPath].includes(first) || second.startsWith("-")) return null;
  const script = isAbsolute2(second) ? resolve4(second) : resolve4(cwd, second);
  const name = basename2(script);
  if (dirname2(script) !== TOOL_DIRECTORY || !WRITERS.has(name)) return null;
  const projectRoot = isAbsolute2(third) ? resolve4(third) : resolve4(cwd, third);
  if (dirname2(projectRoot) !== resolve4(workspaceRoot, "artifacts", "pptx") || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename2(projectRoot))) return null;
  return { name, projectRoot, argv: [script, ...words.slice(2)] };
}
function readOnlyCommand(words) {
  if (!words?.length) return false;
  const command = basename2(words[0] ?? "");
  if (!READ_ONLY.has(command)) return false;
  if (command === "git" && !["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(words[1] ?? "")) return false;
  if (command === "sed" && words.some((word) => /^-.*i/u.test(word))) return false;
  if (command === "find" && words.some((word) => ["-delete", "-exec", "-execdir", "-ok", "-okdir"].includes(word))) return false;
  return true;
}
function commandTouchesPptxScope(command, cwd, workspaceRoot) {
  const normalizedCommand = String(command ?? "").replaceAll("\\", "/");
  const normalizedCwd = resolve4(cwd).replaceAll("\\", "/");
  const normalizedRoot = resolve4(workspaceRoot).replaceAll("\\", "/");
  return normalizedCwd.startsWith(`${normalizedRoot}/artifacts/pptx/`) || /(?:^|[\s"'=])\.?\/?artifacts\/pptx(?:\/|[\s"']|$)/u.test(normalizedCommand) || normalizedCommand.includes(`${normalizedRoot}/artifacts/pptx/`);
}
function evaluatePptxShell({ command, cwd, workspaceRoot }) {
  if (!commandTouchesPptxScope(command, cwd, workspaceRoot)) return { decision: "allow" };
  const words = parseShellWords(expandKnownPluginRoot(command));
  const invocation = wrapperInvocation(words, cwd, workspaceRoot);
  if (invocation) return { decision: "allow", writer: `pptx-${invocation.name.slice("project-".length, -".mjs".length)}`, projectRoot: invocation.projectRoot, argv: invocation.argv };
  if (readOnlyCommand(words)) return { decision: "allow" };
  return { decision: "deny", code: "UNKNOWN_MUTATION_SHELL", message: "PPTX scope permits only read-only commands or an exact registered writer invocation" };
}

// plugins/presentation-production/src/entries/hooks/presentation-production.ts
function deny(reason) {
  return preToolDeny(`[PPTX Project Delivery Guard] ${reason}`);
}
async function runPre(event) {
  const cwd = resolve5(eventCwd(event));
  const name = eventToolName(event);
  for (const target of extractFileTargets(event, { tools: "any" })) {
    const result = evaluatePptxWrite({
      relativePath: relative2(cwd, resolve5(cwd, target)),
      toolName: name,
      cwd
    });
    if (result.decision === "deny") return deny(`${result.code}: ${result.message}`);
  }
  const command = extractShellCommand(event);
  if (command) {
    const decision = evaluatePptxShell({ command, cwd, workspaceRoot: resolveWorkspaceRoot(cwd) });
    if (decision.decision === "deny") return deny(`${decision.code}: ${decision.message}`);
    if (decision.writer && !["pptx-init", "pptx-lint"].includes(decision.writer) && decision.projectRoot && decision.argv) {
      try {
        const model = await loadPptxProject(decision.projectRoot);
        await issueWriterCapability({
          root: decision.projectRoot,
          capability: decision.writer,
          argv: decision.argv,
          subjectDigest: computePptxSubjectDigest(model),
          sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown",
          triggerFrom: `presentation-production:pre:${decision.writer}`
        });
      } catch (error) {
        return deny(`WRITER_CAPABILITY_DENIED: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return void 0;
}
function planTargetStage(plan) {
  return typeof plan === "object" && plan !== null && !Array.isArray(plan) ? plan.targetStage : void 0;
}
async function projectFindings(cwd, forceStage) {
  const findings = [];
  const roots = typeof findPptxProjects === "function" ? await findPptxProjects(cwd) : (await findCarrierProjects(cwd, "pptx")).roots;
  for (const root of roots) {
    try {
      const model = await loadPptxProject(root);
      const stage = forceStage ?? planTargetStage(model.plan) ?? "source";
      for (const item of validatePptxModel(model, { stage })) {
        findings.push({ artifactId: model.artifactId ?? relative2(cwd, root), ...item });
      }
    } catch (error) {
      findings.push({ artifactId: relative2(cwd, root), code: "PROJECT_READ_FAILED", path: ".", message: error instanceof Error ? error.message : String(error) });
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
  if (event.__parseError) {
    process.stderr.write("[PPTX Project Delivery Guard] invalid hook JSON\n");
    process.exitCode = 2;
    return;
  }
  const cwd = eventCwd(event);
  if (mode === "pre") {
    writeJson(await runPre(event));
    return;
  }
  if (mode === "session") {
    const roots = await findPptxProjects(cwd);
    if (roots.length > 0) writeJson(additionalContext("SessionStart", `[PPTX Project Delivery Guard] discovered ${roots.length} project(s). Follow the bundled pptx-deck-authoring orchestrator; generated outputs require registered init/lint/render/probe/review/release writers; host session id=${eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown"}.`));
    return;
  }
  if (mode === "post" || mode === "failure") {
    if (!eventTouchesArtifact(event, "pptx")) return;
    const findings = await projectFindings(cwd);
    if (findings.length > 0) writeJson(additionalContext(mode === "post" ? "PostToolUse" : "PostToolUseFailure", formatFindings(findings)));
    return;
  }
  if (mode === "subagent-stop") {
    if (!sessionEngagedArtifact({ cwd, carrier: "pptx" })) return;
    const findings = await projectFindings(cwd, "review");
    if (findings.length > 0) writeJson(additionalContext("Stop", formatFindings(findings)));
    return;
  }
  if (mode === "stop") {
    if (isStopHookActive(event) || !sessionEngagedArtifact({ cwd, carrier: "pptx" })) return;
    const findings = await projectFindings(cwd);
    if (findings.length > 0) writeJson(stopBlock(formatFindings(findings)));
  }
}
if (process.argv[1] && fileURLToPath2(import.meta.url) === resolve5(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`[PPTX Project Delivery Guard] ${error instanceof Error ? error.message : String(error)}
`);
    process.exitCode = 2;
  });
}
