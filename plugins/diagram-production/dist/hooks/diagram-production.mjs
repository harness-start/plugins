#!/usr/bin/env node
// harness-source-hash: sha256:cafc8a70a5c6e53a6b3fdd264e889af9ee073b12efe2533e339d952816910a88
import {
  issueWriterCapability
} from "../chunks/chunk-HZ56MVVV.mjs";
import {
  computeDiagramSubjectDigest,
  evaluateDiagramWrite,
  findDiagramProjects,
  loadDiagramProject,
  resolveWorkspaceRoot,
  validateDiagramModel
} from "../chunks/chunk-KM6KTTP3.mjs";

// plugins/diagram-production/src/entries/hooks/diagram-production.ts
import { createHash as createHash2 } from "node:crypto";
import { relative, resolve as resolve4 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// core/src/artifact-paths.ts
import { existsSync as existsSync2, readFileSync, readdirSync } from "node:fs";
import { basename, dirname as dirname2, join as join2, resolve } from "node:path";

// core/src/state-file.ts
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
var DIRECTORY_MODE = 448;
var FILE_MODE = 384;
var WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));
function digestKey(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
function atomicWriteJson(path, value) {
  const directory = dirname(path);
  const temporary = join(directory, `.${digestKey(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    mkdirSync(directory, { recursive: true, mode: DIRECTORY_MODE });
    writeFileSync(temporary, `${JSON.stringify(value)}
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

// core/src/artifact-paths.ts
function resolveWorkspaceRoot2(cwd, carrier) {
  let current = resolve(cwd);
  while (current !== dirname2(current)) {
    if (basename(dirname2(current)) === carrier && basename(dirname2(dirname2(current))) === "artifacts") {
      return dirname2(dirname2(dirname2(current)));
    }
    current = dirname2(current);
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
var ARTIFACT_SESSION_SCHEMA = "artifact-session-engagement/v1";
function artifactSessionMarker(options) {
  const sessionId = String(options.sessionId ?? "").trim();
  if (!sessionId || sessionId === "hook" || sessionId === "unknown") return null;
  const dataRoot = options.dataRoot ?? (process.env.HARNESS_HOST === "codex" ? process.env.PLUGIN_DATA : process.env.CLAUDE_PLUGIN_DATA || process.env.PLUGIN_DATA);
  if (!dataRoot) return null;
  const workspaceDigest = digestKey(resolveWorkspaceRoot2(options.cwd, options.carrier));
  const sessionDigest = digestKey(sessionId);
  const key = digestKey(`${workspaceDigest}\0${options.carrier}\0${sessionDigest}`);
  return { path: join2(dataRoot, "artifact-session-engagement", `${key}.json`), workspaceDigest, sessionDigest };
}
function markSessionEngagedArtifact(options) {
  const marker = artifactSessionMarker(options);
  if (!marker) return false;
  return atomicWriteJson(marker.path, {
    schema: ARTIFACT_SESSION_SCHEMA,
    workspaceDigest: marker.workspaceDigest,
    carrier: options.carrier,
    sessionDigest: marker.sessionDigest
  });
}
function hasSessionEngagement(options) {
  const marker = artifactSessionMarker(options);
  if (!marker) return false;
  try {
    const value = JSON.parse(readFileSync(marker.path, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const record = value;
    return record.schema === ARTIFACT_SESSION_SCHEMA && record.workspaceDigest === marker.workspaceDigest && record.carrier === options.carrier && record.sessionDigest === marker.sessionDigest;
  } catch {
    return false;
  }
}
function sessionEngagedArtifact(options) {
  const cwd = resolve(options.cwd);
  const { carrier } = options;
  if (cwdInsideArtifact(cwd, carrier)) return true;
  if (hasSessionEngagement(options)) return true;
  const workspace = resolveWorkspaceRoot2(cwd, carrier);
  const artifactRoot = join2(workspace, "artifacts", carrier);
  const journal = artifactJournalName(carrier);
  if (existsSync2(artifactRoot)) {
    try {
      for (const entry of readdirSync(artifactRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (existsSync2(join2(artifactRoot, entry.name, journal))) return true;
      }
    } catch {
    }
  }
  return false;
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
import { isAbsolute, resolve as resolve2 } from "node:path";
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
    raw.map(stripMatchingQuotes).filter(Boolean).map((path) => isAbsolute(path) ? resolve2(path) : resolve2(cwd, path.replace(/^\.\//u, "")))
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
  const cwd = resolve2(eventCwd(event));
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

// plugins/diagram-production/src/lib/shell-policy.ts
import { basename as basename2, dirname as dirname3, isAbsolute as isAbsolute2, resolve as resolve3 } from "node:path";
import { fileURLToPath } from "node:url";
var MODULE_DIRECTORY = dirname3(fileURLToPath(import.meta.url));
var PLUGIN_DIRECTORY = resolve3(process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? MODULE_DIRECTORY, process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? "." : "../..");
var TOOL_DIRECTORY = resolve3(PLUGIN_DIRECTORY, "dist", "cli");
var WRITERS = /* @__PURE__ */ new Set(["project-init.mjs", "project-import.mjs", "project-lint.mjs", "project-render.mjs", "project-probe.mjs", "project-review.mjs", "project-release.mjs"]);
var READ_ONLY = /* @__PURE__ */ new Set(["find", "git", "grep", "head", "jq", "ls", "pwd", "rg", "stat", "tail", "wc"]);
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
    if (value) expanded = expanded.replaceAll(`"\${${name}}/dist/cli/`, `"${resolve3(value)}/dist/cli/`);
  }
  return expanded;
}
function invocation(words, cwd, workspaceRoot) {
  if (!words || words.length < 3) return null;
  const [runtime, entry, rootWord] = words;
  if (!runtime || !entry || !rootWord || !["node", basename2(process.execPath), process.execPath].includes(runtime) || entry.startsWith("-")) return null;
  const script = isAbsolute2(entry) ? resolve3(entry) : resolve3(cwd, entry);
  const name = basename2(script);
  if (dirname3(script) !== TOOL_DIRECTORY || !WRITERS.has(name)) return null;
  const projectRoot = isAbsolute2(rootWord) ? resolve3(rootWord) : resolve3(cwd, rootWord);
  if (dirname3(projectRoot) !== resolve3(workspaceRoot, "artifacts", "diagram") || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename2(projectRoot))) return null;
  const hasExternalInput = name === "project-import.mjs" || name === "project-review.mjs";
  const exact = hasExternalInput ? words.length === 4 && isAbsolute2(words[3] ?? "") : words.length === 3;
  if (!exact) return null;
  return { name, projectRoot, argv: [script, ...words.slice(2)] };
}
function readOnly(words) {
  if (!words?.length) return false;
  const command = basename2(words[0] ?? "");
  if (!READ_ONLY.has(command)) return false;
  if (command === "git" && (!["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(words[1] ?? "") || words.some((word) => word === "--output" || word.startsWith("--output=")))) return false;
  if (command === "find" && words.some((word) => ["-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprint0", "-fprintf", "-fls"].includes(word))) return false;
  return command !== "rg" || !words.some((word) => word === "--pre" || word.startsWith("--pre="));
}
function commandTouchesDiagramScope(command, cwd, workspaceRoot) {
  const normalizedCommand = String(command ?? "").replaceAll("\\", "/");
  const normalizedCwd = resolve3(cwd).replaceAll("\\", "/");
  const normalizedRoot = resolve3(workspaceRoot).replaceAll("\\", "/");
  return normalizedCwd.startsWith(`${normalizedRoot}/artifacts/diagram/`) || /(?:^|[\s"'=])\.?\/?artifacts\/diagram(?:\/|[\s"']|$)/u.test(normalizedCommand) || normalizedCommand.includes(`${normalizedRoot}/artifacts/diagram/`);
}
function evaluateDiagramShell({ command, cwd, workspaceRoot, activeProjectCount = 0 }) {
  if (!commandTouchesDiagramScope(command, cwd, workspaceRoot) && !(activeProjectCount > 0 && isGenericMutationCommand(String(command ?? "")))) return { decision: "allow" };
  const words = parseShellWords(expandKnownPluginRoot(command));
  const registered = invocation(words, cwd, workspaceRoot);
  if (registered) return { decision: "allow", writer: `diagram-${registered.name.slice("project-".length, -".mjs".length)}`, projectRoot: registered.projectRoot, argv: registered.argv };
  if (readOnly(words)) return { decision: "allow" };
  return { decision: "deny", code: "UNKNOWN_MUTATION_SHELL", message: "diagram scope permits only read-only commands or an exact registered writer invocation" };
}

// plugins/diagram-production/src/entries/hooks/diagram-production.ts
var deny = (reason) => preToolDeny(`[Diagram Project Delivery Guard] ${reason}`);
var initDigest = (root) => createHash2("sha256").update(`diagram-init:${resolve4(root)}`).digest("hex");
async function runPre(event) {
  const cwd = resolve4(eventCwd(event));
  for (const target of extractFileTargets(event, { tools: "any" })) {
    const result = evaluateDiagramWrite({ relativePath: relative(cwd, resolve4(cwd, target)), toolName: eventToolName(event), cwd });
    if (result.decision === "deny") return deny(`${result.code}: ${result.message}`);
  }
  const command = extractShellCommand(event);
  if (!command) return void 0;
  const activeProjectCount = isGenericMutationCommand(command) ? (await findDiagramProjects(cwd)).length : 0;
  const decision = evaluateDiagramShell({ command, cwd, workspaceRoot: resolveWorkspaceRoot(cwd), activeProjectCount });
  if (decision.decision === "deny") return deny(`${decision.code}: ${decision.message}`);
  if (decision.writer && decision.writer !== "diagram-lint" && decision.projectRoot && decision.argv) {
    try {
      const subjectDigest = decision.writer === "diagram-init" ? initDigest(decision.projectRoot) : computeDiagramSubjectDigest(await loadDiagramProject(decision.projectRoot));
      await issueWriterCapability({ root: decision.projectRoot, capability: decision.writer, argv: decision.argv, subjectDigest, sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown", triggerFrom: `diagram-production:pre:${decision.writer}` });
    } catch (error) {
      return deny(`WRITER_CAPABILITY_DENIED: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return void 0;
}
var targetStage = (plan) => typeof plan === "object" && plan !== null && !Array.isArray(plan) ? plan.targetStage : void 0;
async function projectFindings(cwd, subagent = false) {
  const findings = [];
  for (const root of await findDiagramProjects(cwd)) {
    try {
      const model = await loadDiagramProject(root);
      const requested = String(targetStage(model.plan) ?? "source");
      const stage = subagent && ["review", "release"].includes(requested) ? "review" : requested;
      for (const item of validateDiagramModel(model, { stage })) findings.push({ artifactId: model.artifactId ?? relative(cwd, root), ...item });
    } catch (error) {
      findings.push({ artifactId: relative(cwd, root), code: "PROJECT_READ_FAILED", path: ".", message: error instanceof Error ? error.message : String(error) });
    }
  }
  return findings;
}
var format = (findings) => ["[Diagram Project Delivery Guard] Project contract violations", ...findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`), "recovery: Fix the named source/design/output, then rerun the registered diagram writer."].join("\n");
async function main() {
  const mode = process.argv[2] ?? "session";
  const event = await readStdinJson();
  if (event.__parseError) {
    process.stderr.write("[Diagram Project Delivery Guard] invalid hook JSON\n");
    process.exitCode = 2;
    return;
  }
  const cwd = eventCwd(event);
  if (mode === "pre") {
    writeJson(await runPre(event));
    return;
  }
  if (mode === "session") {
    const roots = await findDiagramProjects(cwd);
    if (roots.length) writeJson(additionalContext("SessionStart", `[Diagram Project Delivery Guard] discovered ${roots.length} project(s). Use $diagram-project-authoring; generated outputs and evidence require registered writers. session=${eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown"}.`));
    return;
  }
  const sessionId = eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown";
  if (mode === "post" || mode === "failure") {
    if (!eventTouchesArtifact(event, "diagram")) return;
    markSessionEngagedArtifact({ cwd, carrier: "diagram", sessionId });
    const findings = await projectFindings(cwd);
    if (findings.length) writeJson(additionalContext(mode === "post" ? "PostToolUse" : "PostToolUseFailure", format(findings)));
    return;
  }
  if (mode === "subagent-stop") {
    if (!sessionEngagedArtifact({ cwd, carrier: "diagram", sessionId })) return;
    const findings = await projectFindings(cwd, true);
    if (findings.length) writeJson(additionalContext("Stop", format(findings)));
    return;
  }
  if (mode === "stop") {
    if (isStopHookActive(event) || !sessionEngagedArtifact({ cwd, carrier: "diagram", sessionId })) return;
    const findings = await projectFindings(cwd);
    if (findings.length) writeJson(stopBlock(format(findings)));
  }
}
if (process.argv[1] && fileURLToPath2(import.meta.url) === resolve4(process.argv[1])) main().catch((error) => {
  process.stderr.write(`[Diagram Project Delivery Guard] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});
