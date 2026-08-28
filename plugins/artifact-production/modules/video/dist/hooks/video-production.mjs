#!/usr/bin/env node
// harness-source-hash: sha256:ffd517e46fb1a2824017357bfc2bc74469ca19f363f912dfd229786bc368cead
import {
  evaluateVideoWrite,
  issueWriterCapability,
  validateVideoModel
} from "../chunks/chunk-3XUI2V55.mjs";
import "../chunks/chunk-2EO5NQK7.mjs";
import {
  findVideoProjects,
  loadVideoProject,
  resolveWorkspaceRoot
} from "../chunks/chunk-4VTHAUE5.mjs";

// plugins/artifact-production/modules/video/src/entries/hooks/video-production.ts
import { relative, resolve as resolve4 } from "node:path";
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
function additionalContext(hookEventName, context2, options = {}) {
  const codexToolReport = Boolean(process.env.PLUGIN_ROOT) && TOOL_LIFECYCLE_EVENTS.has(hookEventName);
  const echoStderr = options.echoStderr ?? codexToolReport;
  const suppressJson = codexToolReport || Boolean(options.suppressJson);
  if (echoStderr) process.stderr.write(`${context2}
`);
  if (suppressJson) return null;
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

// plugins/artifact-production/modules/video/src/lib/shell-policy.ts
import { basename as basename2, dirname as dirname3, isAbsolute as isAbsolute2, resolve as resolve3 } from "node:path";
import { fileURLToPath } from "node:url";
var MODULE_DIRECTORY = dirname3(fileURLToPath(import.meta.url));
var PLUGIN_DIRECTORY = resolve3(
  process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? MODULE_DIRECTORY,
  process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? "." : "../.."
);
var TOOL_DIRECTORY = resolve3(PLUGIN_DIRECTORY, "dist", "cli");
var WRITERS = /* @__PURE__ */ new Set(["project-admit.mjs", "project-init.mjs", "project-lint.mjs", "project-probe.mjs", "project-release.mjs", "project-render.mjs", "project-review.mjs", "project-shot-stage.mjs"]);
var PROFILES = /* @__PURE__ */ new Set(["motion-explainer", "product-promo", "short-form", "talking-head", "reference-led", "micro-drama"]);
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
  if (!["node", basename2(process.execPath), process.execPath].includes(first)) return null;
  if (second.startsWith("-")) return null;
  const script = isAbsolute2(second) ? resolve3(second) : resolve3(cwd, second);
  const name = basename2(script);
  if (dirname3(resolve3(script)) !== resolve3(TOOL_DIRECTORY) || !WRITERS.has(name)) return null;
  const projectRoot = isAbsolute2(third) ? resolve3(third) : resolve3(cwd, third);
  const expectedParent = resolve3(workspaceRoot, "artifacts", "video");
  if (dirname3(projectRoot) !== expectedParent || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename2(projectRoot))) return null;
  if (name === "project-init.mjs" && (words.length !== 7 || words[3] !== "--profile" || !PROFILES.has(words[4] ?? "") || words[5] !== "--mode" || !["guided", "autonomous"].includes(words[6] ?? ""))) return null;
  if (name === "project-admit.mjs" && words.length !== 4) return null;
  if (name === "project-review.mjs" && words.length !== 4) return null;
  if (name === "project-shot-stage.mjs" && words.length !== 6) return null;
  if (["project-lint.mjs", "project-probe.mjs", "project-release.mjs"].includes(name) && words.length !== 3) return null;
  if (name === "project-render.mjs" && ![4, 5].includes(words.length)) return null;
  return { name, projectRoot, argv: [script, ...words.slice(2)] };
}
function expandKnownPluginRoot(command) {
  let expanded = String(command ?? "");
  for (const name of ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"]) {
    const value = process.env[name];
    if (!value) continue;
    expanded = expanded.replaceAll(`"\${${name}}/dist/cli/`, `"${resolve3(value)}/dist/cli/`);
  }
  return expanded;
}
function readOnlyCommand(words) {
  if (!words || words.length === 0) return false;
  const first = words[0];
  if (first === void 0) return false;
  const command = basename2(first);
  if (!READ_ONLY.has(command)) return false;
  if (command === "git" && !["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(words[1] ?? "")) return false;
  if (command === "sed" && words.some((word) => /^-.*i/u.test(word))) return false;
  if (command === "find" && words.some((word) => ["-delete", "-exec", "-execdir", "-ok", "-okdir"].includes(word))) return false;
  return true;
}
function commandTouchesVideoScope(command, cwd, workspaceRoot) {
  const normalizedCommand = String(command ?? "").replaceAll("\\", "/");
  const normalizedCwd = resolve3(cwd).replaceAll("\\", "/");
  const normalizedRoot = resolve3(workspaceRoot).replaceAll("\\", "/");
  return normalizedCwd.startsWith(`${normalizedRoot}/artifacts/video/`) || /(?:^|[\s"'=])\.?\/?artifacts\/video(?:\/|[\s"']|$)/u.test(normalizedCommand) || normalizedCommand.includes(`${normalizedRoot}/artifacts/video/`);
}
function evaluateVideoShell({ command, cwd, workspaceRoot, activeProjectCount = 0 }) {
  if (!commandTouchesVideoScope(command, cwd, workspaceRoot) && !(activeProjectCount > 0 && isGenericMutationCommand(String(command ?? "")))) return { decision: "allow" };
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

// plugins/artifact-production/modules/video/src/entries/hooks/video-production.ts
var nameOf = (event) => eventToolName(event);
var cwdOf = (event) => resolve4(eventCwd(event));
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
      const absolutePath = resolve4(cwd, target);
      const result = evaluateVideoWrite({ relativePath: absolutePath, toolName: nameOf(event) });
      if (result.decision === "deny") {
        process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}
`);
        return;
      }
    }
    const command = extractShellCommand(event) ?? "";
    if (command) {
      const activeProjectCount = isGenericMutationCommand(command) ? (await findVideoProjects(cwd)).roots.length : 0;
      const result = evaluateVideoShell({ command, cwd, workspaceRoot, activeProjectCount });
      if (result.decision === "deny") process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}
`);
      else if (result.writer && result.writer !== "video-lint" && result.projectRoot && result.argv) {
        try {
          await issueWriterCapability({ root: result.projectRoot, capability: result.writer, argv: result.argv, sessionId: sessionOf(event), triggerFrom: `video-production:pre:${result.writer}` });
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
  if (mode === "post" || mode === "failure") {
    if (!eventTouchesArtifact(event, "video")) return;
    markSessionEngagedArtifact({ cwd, carrier: "video", sessionId: sessionOf(event) });
  }
  if (mode === "stop" && isStopHookActive(event)) return;
  if ((mode === "stop" || mode === "subagent-stop") && !sessionEngagedArtifact({ cwd, carrier: "video", sessionId: sessionOf(event) })) return;
  if (mode === "subagent-stop" || mode === "post" || mode === "failure" || mode === "stop") {
    const { findings } = await findingsFor(cwd);
    if (mode === "post" || mode === "failure") {
      if (findings.length > 0) process.stdout.write(`${JSON.stringify(context(mode === "post" ? "PostToolUse" : "PostToolUseFailure", format(findings)))}
`);
    } else if (mode === "subagent-stop") {
      if (findings.length > 0) writeJson(context("Stop", format(findings)));
    } else if (findings.length > 0) {
      writeJson(stopBlock(format(findings)));
    }
  }
}
if (process.argv[1] && fileURLToPath2(import.meta.url) === resolve4(process.argv[1])) {
  main().catch((error) => {
    const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
    process.stderr.write(`[Video Project Delivery Guard] ${message}
`);
    process.exitCode = 2;
  });
}
