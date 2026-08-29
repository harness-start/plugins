// harness-source-hash: sha256:230430fd2f48ea30b2238a97dd35e0ddd2522d1a741868ea1450333d3e33c83b
import {
  evaluatePrintWrite,
  validatePrintModel
} from "../chunks/chunk-YFRQQQTY.mjs";
import {
  issueWriterCapability as issueWriterCapability5
} from "../chunks/chunk-ITT6467U.mjs";
import {
  computeTrainingSubjectDigest,
  evaluateTrainingWrite,
  findTrainingProjects,
  loadTrainingProject,
  resolveWorkspaceRoot as resolveWorkspaceRoot6,
  validateTrainingModel
} from "../chunks/chunk-7ME2TRRS.mjs";
import {
  evaluateVideoWrite,
  issueWriterCapability as issueWriterCapability6,
  validateVideoModel
} from "../chunks/chunk-5RBPH2BX.mjs";
import {
  findVideoProjects,
  loadVideoProject,
  resolveWorkspaceRoot as resolveWorkspaceRoot7
} from "../chunks/chunk-CWARK7TA.mjs";
import "../chunks/chunk-GOOWI2FX.mjs";
import {
  issueWriterCapability as issueWriterCapability4
} from "../chunks/chunk-XFZ6O5CW.mjs";
import "../chunks/chunk-WD55DXJZ.mjs";
import {
  computePptxSubjectDigest,
  evaluatePptxWrite,
  findPptxProjects,
  loadPptxProject,
  resolveWorkspaceRoot as resolveWorkspaceRoot5,
  validatePptxModel
} from "../chunks/chunk-PCGQKVAV.mjs";
import {
  issueWriterCapability as issueWriterCapability3
} from "../chunks/chunk-ETDDZHSX.mjs";
import {
  computePosterSubjectDigest,
  evaluatePosterWrite,
  findPosterProjects,
  loadPosterProject,
  resolveWorkspaceRoot as resolveWorkspaceRoot4,
  validatePosterModel
} from "../chunks/chunk-44QHQQLV.mjs";
import {
  issueMusicWriterCapability
} from "../chunks/chunk-6UZBXC2X.mjs";
import {
  computeMusicSubjectDigest,
  evaluateMusicWrite,
  validateMusicModel,
  validateMusicReferenceProfile
} from "../chunks/chunk-6QCKWDPM.mjs";
import {
  isKebabArtifactId,
  markSessionEngagedArtifact,
  resolveWorkspaceRoot as resolveWorkspaceRoot3,
  sessionEngagedArtifact,
  touchesArtifact
} from "../chunks/chunk-CEII2P4K.mjs";
import {
  issueWriterCapability as issueWriterCapability2
} from "../chunks/chunk-KLSY7X4V.mjs";
import {
  computeLogoSubjectDigest,
  evaluateLogoWrite,
  validateLogoModel
} from "../chunks/chunk-SWIULHOM.mjs";
import {
  findLogoProjects,
  loadLogoProject,
  resolveWorkspaceRoot as resolveWorkspaceRoot2
} from "../chunks/chunk-YYFP4OUT.mjs";
import "../chunks/chunk-RQQ3DLME.mjs";
import "../chunks/chunk-FL36SZ6K.mjs";
import {
  issueWriterCapability
} from "../chunks/chunk-MVT3UIP7.mjs";
import "../chunks/chunk-IE4NLJBE.mjs";
import {
  computeDiagramSubjectDigest,
  evaluateDiagramWrite,
  findDiagramProjects,
  loadDiagramProject,
  resolveWorkspaceRoot,
  validateDiagramModel
} from "../chunks/chunk-MFUPLSAE.mjs";
import "../chunks/chunk-HL4EEBT7.mjs";

// core/src/aio-dispatcher.ts
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// core/src/owner-hook-runtime.ts
import { AsyncLocalStorage } from "node:async_hooks";
var invocationStorage = new AsyncLocalStorage();
var OwnerHookExitError = class extends Error {
  status;
  constructor(status) {
    super(`owner hook exited with status ${status}`);
    this.name = "OwnerHookExitError";
    this.status = status;
  }
};
function currentOwnerHookEvent() {
  return invocationStorage.getStore()?.event;
}
function collectOwnerHookOutput(value) {
  const invocation2 = invocationStorage.getStore();
  if (!invocation2) return false;
  if (value !== null && value !== void 0) invocation2.outputs.push(value);
  return true;
}
async function invokeOwnerHook(event, args, operation) {
  const outputs = [];
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;
  process.argv = [originalArgv[0] ?? process.execPath, originalArgv[1] ?? "owner-hook", ...args];
  process.exitCode = void 0;
  try {
    await invocationStorage.run({ args, event, outputs }, operation);
    if (typeof process.exitCode === "number" && process.exitCode !== 0) {
      throw new OwnerHookExitError(process.exitCode);
    }
    return outputs;
  } finally {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
  }
}
function ownerHookHandler(operation) {
  return async ({ args, event }) => {
    try {
      return await invokeOwnerHook(event, args, operation);
    } catch (error) {
      if (error instanceof OwnerHookExitError) {
        process.exitCode = error.status;
        return [];
      }
      throw error;
    }
  };
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
  if (input === process.stdin) {
    const current = currentOwnerHookEvent();
    if (current) return current;
  }
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
  const context3 = nestedRecord(event, "context");
  return firstString(
    event.session_id,
    event.sessionId,
    event.sessionID,
    event.conversation_id,
    event.conversationId,
    context3?.session_id
  );
}
function eventAgentId(event) {
  const context3 = nestedRecord(event, "context");
  return firstString(event.agent_id, event.agentId, context3?.agent_id, context3?.agentId);
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

// core/src/aio-dispatcher.ts
function pluginRoot() {
  const configured = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT;
  if (configured) return resolve(configured);
  const entry = process.argv[1];
  if (!entry) return process.cwd();
  return resolve(dirname(entry), "../..");
}
function matches(matcher, name) {
  if (!matcher) return true;
  try {
    return new RegExp(`^(?:${matcher})$`, "u").test(name);
  } catch {
    return false;
  }
}
function parseEvent(raw) {
  try {
    const parsed = raw.trim() ? JSON.parse(raw) : {};
    return isRecord(parsed) ? parsed : {};
  } catch {
    return { __parseError: true };
  }
}
function combinedOutput(eventName2, outputs) {
  for (const output of outputs) {
    if (output.decision === "block" || output.hookSpecificOutput?.permissionDecision === "deny") return output;
  }
  const codexFeedback = outputs.filter((output) => output.continue === false && Boolean(output.reason));
  if (codexFeedback.length > 0) {
    return {
      continue: false,
      stopReason: codexFeedback.map((output) => output.stopReason).filter(Boolean).join("\n") || "Plugin review feedback replaced the ordinary tool success output.",
      reason: codexFeedback.map((output) => output.reason).filter(Boolean).join("\n\n")
    };
  }
  const contexts = outputs.map((output) => output.hookSpecificOutput?.additionalContext).filter((context3) => Boolean(context3));
  if (contexts.length === 0) return null;
  return { hookSpecificOutput: { hookEventName: eventName2, additionalContext: contexts.join("\n\n") } };
}
async function withTimeout(operation, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function dispatchHookRoutes(input) {
  const event = parseEvent(input.raw);
  const name = String(event.tool_name ?? event.toolName ?? "");
  const outputs = [];
  const failures = [];
  for (const route of input.routes[input.eventName] ?? []) {
    if (event.__parseError !== true && !matches(route.matcher, name)) continue;
    const handler = input.handlers[route.handler];
    if (!handler) {
      failures.push(`${route.handler}: owner handler is not registered`);
      continue;
    }
    const trigger = route.trigger ?? `${input.host}:${input.eventName}`;
    try {
      const value = await withTimeout(
        Promise.resolve(handler({
          args: route.args ?? [],
          event,
          eventName: input.eventName,
          host: input.host,
          raw: input.raw,
          trigger
        })),
        route.timeoutMs ?? 6e4,
        route.handler
      );
      if (Array.isArray(value)) outputs.push(...value);
      else if (value) outputs.push(value);
      const output = combinedOutput(input.eventName, outputs);
      if (output?.decision === "block" || output?.hookSpecificOutput?.permissionDecision === "deny") return { output, failures };
    } catch (error) {
      failures.push(`${route.handler}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { output: combinedOutput(input.eventName, outputs), failures };
}
async function runOwnerDispatcher(host2, eventName2, handlers) {
  const root = pluginRoot();
  const raw = readFileSync(0, "utf8");
  let routes;
  try {
    routes = JSON.parse(readFileSync(resolve(root, "routes", `${host2}.json`), "utf8"));
  } catch (error) {
    process.stderr.write(`[aio-dispatcher] unable to load ${host2} routes: ${String(error)}
`);
    return;
  }
  const { output, failures } = await dispatchHookRoutes({ eventName: eventName2, handlers, host: host2, raw, routes });
  for (const failure of failures) process.stderr.write(`[aio-dispatcher] ${failure}
`);
  if (output) process.stdout.write(`${JSON.stringify(output)}
`);
  else if (failures.length > 0) process.exitCode = 1;
}

// plugins/artifact-production/src/domains/diagram/entries/hooks/diagram-production.ts
import { createHash } from "node:crypto";
import { relative, resolve as resolve4 } from "node:path";

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
function additionalContext(hookEventName, context3, options = {}) {
  const codexToolReport = Boolean(process.env.PLUGIN_ROOT) && TOOL_LIFECYCLE_EVENTS.has(hookEventName);
  const echoStderr = options.echoStderr ?? codexToolReport;
  const suppressJson = codexToolReport || Boolean(options.suppressJson);
  if (echoStderr) process.stderr.write(`${context3}
`);
  if (suppressJson) return null;
  return {
    hookSpecificOutput: {
      hookEventName,
      additionalContext: context3
    }
  };
}
function stopBlock(reason) {
  return { decision: "block", reason };
}
function writeJson(value) {
  if (value !== null && value !== void 0) {
    if (collectOwnerHookOutput(value)) return;
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

// plugins/artifact-production/src/domains/diagram/lib/shell-policy.ts
import { basename, dirname as dirname2, isAbsolute as isAbsolute2, resolve as resolve3 } from "node:path";
import { fileURLToPath } from "node:url";
var MODULE_DIRECTORY = dirname2(fileURLToPath(import.meta.url));
var ENTRY_DIRECTORY = dirname2(resolve3(process.argv[1] ?? process.cwd()));
var PLUGIN_DIRECTORY = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? resolve3(process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? ".") : ["dispatcher.mjs", "harness.mjs"].includes(basename(process.argv[1] ?? "")) ? resolve3(ENTRY_DIRECTORY, "../..") : resolve3(MODULE_DIRECTORY, "../../../..");
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
  if (!words || words.length < 5) return null;
  const [runtime, entry, resource, action, rootWord] = words;
  if (!runtime || !entry || resource !== "diagram" || !action || !rootWord || !["node", basename(process.execPath), process.execPath].includes(runtime) || entry.startsWith("-")) return null;
  const script = isAbsolute2(entry) ? resolve3(entry) : resolve3(cwd, entry);
  const name = `project-${action}.mjs`;
  if (dirname2(script) !== TOOL_DIRECTORY || basename(script) !== "harness.mjs" || !WRITERS.has(name)) return null;
  const projectRoot = isAbsolute2(rootWord) ? resolve3(rootWord) : resolve3(cwd, rootWord);
  if (dirname2(projectRoot) !== resolve3(workspaceRoot, "artifacts", "diagram") || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(projectRoot))) return null;
  const hasExternalInput = name === "project-import.mjs" || name === "project-review.mjs";
  const exact = hasExternalInput ? words.length === 6 && isAbsolute2(words[5] ?? "") : words.length === 5;
  if (!exact) return null;
  return { name, projectRoot, argv: [script, ...words.slice(2)] };
}
function readOnly(words) {
  if (!words?.length) return false;
  const command = basename(words[0] ?? "");
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
function evaluateDiagramShell({ command, cwd, workspaceRoot }) {
  if (!commandTouchesDiagramScope(command, cwd, workspaceRoot)) return { decision: "allow" };
  const words = parseShellWords(expandKnownPluginRoot(command));
  const registered = invocation(words, cwd, workspaceRoot);
  if (registered) return { decision: "allow", writer: `diagram-${registered.name.slice("project-".length, -".mjs".length)}`, projectRoot: registered.projectRoot, argv: registered.argv };
  if (readOnly(words)) return { decision: "allow" };
  return { decision: "deny", code: "UNKNOWN_MUTATION_SHELL", message: "diagram scope permits only read-only commands or an exact registered writer invocation" };
}

// plugins/artifact-production/src/domains/diagram/entries/hooks/diagram-production.ts
var deny = (reason) => preToolDeny(`[Diagram Project Delivery Guard] ${reason}`);
var initDigest = (root) => createHash("sha256").update(`diagram-init:${resolve4(root)}`).digest("hex");
async function runPre(event) {
  const cwd = resolve4(eventCwd(event));
  for (const target of extractFileTargets(event, { tools: "any" })) {
    const result = evaluateDiagramWrite({ relativePath: relative(cwd, resolve4(cwd, target)), toolName: eventToolName(event), cwd });
    if (result.decision === "deny") return deny(`${result.code}: ${result.message}`);
  }
  const command = extractShellCommand(event);
  if (!command) return void 0;
  const decision = evaluateDiagramShell({ command, cwd, workspaceRoot: resolveWorkspaceRoot(cwd) });
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

// plugins/artifact-production/src/domains/logo/entries/hooks/brand-logo-production.ts
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve as resolve6 } from "node:path";

// plugins/artifact-production/src/domains/logo/lib/shell-policy.ts
import { basename as basename2, dirname as dirname3, isAbsolute as isAbsolute3, resolve as resolve5 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
var MODULE_DIRECTORY2 = dirname3(fileURLToPath2(import.meta.url));
var ENTRY_DIRECTORY2 = dirname3(resolve5(process.argv[1] ?? process.cwd()));
var PLUGIN_DIRECTORY2 = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? resolve5(process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? ".") : ["dispatcher.mjs", "harness.mjs"].includes(basename2(process.argv[1] ?? "")) ? resolve5(ENTRY_DIRECTORY2, "../..") : resolve5(MODULE_DIRECTORY2, "../../../..");
var TOOL_DIRECTORY2 = resolve5(PLUGIN_DIRECTORY2, "dist", "cli");
var WRITERS2 = /* @__PURE__ */ new Set(["project-advice.mjs", "project-lint.mjs", "project-lock.mjs", "project-preview.mjs", "project-render.mjs", "project-release.mjs", "project-review.mjs", "project-stage.mjs", "project-validate.mjs"]);
var MUTATING_WRITERS = /* @__PURE__ */ new Set(["project-advice.mjs", "project-lock.mjs", "project-preview.mjs", "project-render.mjs", "project-release.mjs", "project-review.mjs", "project-stage.mjs"]);
var READ_ONLY2 = /* @__PURE__ */ new Set(["file", "git", "grep", "head", "jq", "ls", "pwd", "rg", "stat", "tail", "wc"]);
function parseShellWords2(command) {
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
function expandKnownPluginRoot2(command) {
  let expanded = String(command ?? "");
  for (const name of ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"]) {
    const value = process.env[name];
    if (value) expanded = expanded.replaceAll(`\${${name}}`, resolve5(value));
  }
  return expanded;
}
function wrapperInvocation(words, cwd, workspaceRoot) {
  const first = words?.[0];
  const second = words?.[1];
  const resource = words?.[2];
  const action = words?.[3];
  const rootWord = words?.[4];
  if (!words || words.length < 5 || first === void 0 || second === void 0 || resource !== "logo" || action === void 0 || rootWord === void 0 || !["node", basename2(process.execPath), process.execPath].includes(first) || second.startsWith("-")) return null;
  const script = isAbsolute3(second) ? resolve5(second) : resolve5(cwd, second);
  const name = `project-${action}.mjs`;
  if (dirname3(script) !== resolve5(TOOL_DIRECTORY2) || basename2(script) !== "harness.mjs" || !WRITERS2.has(name)) return null;
  const projectRoot = isAbsolute3(rootWord) ? resolve5(rootWord) : resolve5(cwd, rootWord);
  if (dirname3(projectRoot) !== resolve5(workspaceRoot, "artifacts", "logo") || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename2(projectRoot))) return null;
  if (name === "project-release.mjs" && words.length !== 5) return null;
  if (name === "project-lock.mjs" && words.length !== 5) return null;
  if (["project-advice.mjs", "project-review.mjs"].includes(name) && words.length !== 6) return null;
  if (name === "project-render.mjs" && (words.length !== 6 || !["source", "release"].includes(words[5] ?? ""))) return null;
  if (name === "project-stage.mjs" && (words.length !== 6 || words[5] !== "release")) return null;
  if (name === "project-validate.mjs") {
    const args = words.slice(5);
    while (args.length > 0) {
      const value = args.shift();
      if (value === "--json") continue;
      if (value !== void 0 && /^--stage=(?:source|release)$/u.test(value)) continue;
      if (value === "--stage" && ["source", "release"].includes(args.shift() ?? "")) continue;
      return null;
    }
  }
  if (name === "project-preview.mjs") {
    if (words.length !== 5) return null;
  }
  return { name, projectRoot, argv: [script, ...words.slice(2)] };
}
function readOnlyCommand(words) {
  const command = words?.[0];
  if (!words?.length || command === void 0 || command !== basename2(command) || !READ_ONLY2.has(command)) return false;
  if (command === "git") {
    if (!["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(words[1] ?? "")) return false;
    if (words.some((word) => word === "--output" || word.startsWith("--output=") || /^-o.+/u.test(word) || ["--ext-diff", "--textconv"].includes(word))) return false;
  }
  if (command === "rg" && words.some((word) => word === "--pre" || word.startsWith("--pre="))) return false;
  return true;
}
function touchesLogo(command, cwd, workspaceRoot) {
  const normalized = String(command ?? "").replaceAll("\\", "/");
  const root = resolve5(workspaceRoot).replaceAll("\\", "/");
  const current = resolve5(cwd).replaceAll("\\", "/");
  return current.startsWith(`${root}/artifacts/logo/`) || /(?:^|[\s"'=])\.?\/?artifacts\/logo(?:\/|[\s"']|$)/u.test(normalized) || normalized.includes(`${root}/artifacts/logo/`);
}
function evaluateLogoShell({
  command,
  cwd,
  workspaceRoot
}) {
  if (!touchesLogo(command, cwd, workspaceRoot)) return { decision: "allow" };
  const words = parseShellWords2(expandKnownPluginRoot2(command));
  const invocation2 = wrapperInvocation(words, cwd, workspaceRoot);
  if (invocation2) {
    const writer = MUTATING_WRITERS.has(invocation2.name) ? `logo-${invocation2.name.slice("project-".length, -".mjs".length)}` : void 0;
    return { decision: "allow", ...writer ? { writer } : {}, projectRoot: invocation2.projectRoot, argv: invocation2.argv };
  }
  if (readOnlyCommand(words)) return { decision: "allow" };
  return { decision: "deny", code: "UNKNOWN_MUTATION_SHELL", message: "logo scope permits only read-only commands or an exact registered writer invocation" };
}

// plugins/artifact-production/src/domains/logo/entries/hooks/brand-logo-production.ts
var inputOf = (event) => eventToolInput(event);
var nameOf = (event) => eventToolName(event);
var cwdOf = (event) => resolve6(eventCwd(event));
function principalId(event) {
  const codexThreadId = process.env.HARNESS_HOST === "codex" ? process.env.CODEX_THREAD_ID : void 0;
  if (codexThreadId) return codexThreadId;
  const sessionId = eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown";
  const agentId = eventAgentId(event);
  return agentId ? `${sessionId}:agent:${agentId}` : sessionId;
}
function codexHome(capability) {
  if (capability !== "logo-review" || process.env.HARNESS_HOST !== "codex") return void 0;
  return resolve6(process.env.CODEX_HOME || join(homedir(), ".codex"));
}
function targetsOf(event) {
  const input = inputOf(event);
  const extras = [];
  for (const key of ["source_path", "sourcePath", "destination_path", "destinationPath", "old_path", "oldPath", "new_path", "newPath"]) {
    if (typeof input[key] === "string") extras.push(input[key]);
  }
  return [.../* @__PURE__ */ new Set([...extractFileTargets(event, { tools: "any" }), ...extras.map((path) => resolve6(cwdOf(event), path))])];
}
function deny2(reason) {
  return preToolDeny(`[Logo Project Delivery Guard] ${reason}`);
}
function context(eventName2, message) {
  return additionalContext(eventName2, message);
}
async function existingPlanTarget(cwd, target) {
  const absolute = resolve6(cwd, target);
  if (!/(?:^|[\\/])artifacts[\\/]logo[\\/][^\\/]+[\\/]plan\.contract\.json$/u.test(absolute)) return false;
  try {
    await access(absolute);
    return true;
  } catch {
    return false;
  }
}
function planTargetStage(plan) {
  return typeof plan === "object" && plan !== null && !Array.isArray(plan) && "targetStage" in plan ? plan.targetStage : void 0;
}
async function findingsFor(cwd) {
  const findings = [];
  const { roots } = await findLogoProjects(cwd);
  for (const root of roots) {
    const model = await loadLogoProject(root);
    const stage = planTargetStage(model.plan);
    for (const item of validateLogoModel(model, { stage })) findings.push({ artifactId: model.artifactId, ...item });
  }
  findings.sort((left, right) => left.code.localeCompare(right.code) || left.artifactId.localeCompare(right.artifactId) || left.path.localeCompare(right.path));
  return { findings, projectCount: roots.length };
}
function format2(findings) {
  return ["[Logo Project Delivery Guard] Project contract violations", ...findings.slice(0, 100).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`), "recovery: Fix the named contract, vector, proof, evidence, or output and rerun the registered logo tool."].join("\n");
}
async function main2() {
  const mode = process.argv[2] ?? "session";
  const event = await readStdinJson();
  if (event.__parseError) {
    process.stderr.write("[Logo Project Delivery Guard] invalid hook JSON\n");
    process.exitCode = 2;
    return;
  }
  if (mode === "stop" && isStopHookActive(event)) return;
  const cwd = cwdOf(event);
  const workspaceRoot = resolveWorkspaceRoot2(cwd);
  if (mode === "pre") {
    for (const target of targetsOf(event)) {
      if (await existingPlanTarget(cwd, target)) {
        process.stdout.write(`${JSON.stringify(deny2("PLAN_STAGE_WRITER_REQUIRED: existing plan changes require project-stage.mjs"))}
`);
        return;
      }
      const result = evaluateLogoWrite({ relativePath: resolve6(cwd, target), toolName: nameOf(event) });
      if (result.decision === "deny") {
        process.stdout.write(`${JSON.stringify(deny2(`${result.code}: ${result.message}`))}
`);
        return;
      }
    }
    const command = extractShellCommand(event) ?? "";
    if (command) {
      const result = evaluateLogoShell({ command, cwd, workspaceRoot });
      if (result.decision === "deny") {
        process.stdout.write(`${JSON.stringify(deny2(`${result.code}: ${result.message}`))}
`);
        return;
      }
      if (!result.writer || !result.projectRoot || !result.argv) return;
      const { roots } = await findLogoProjects(cwd);
      if (!roots.includes(result.projectRoot)) process.stdout.write(`${JSON.stringify(deny2("PROJECT_ROOT_UNREGISTERED: registered writers require a discovered non-symlink logo project root"))}
`);
      else {
        try {
          const trustedCodexHome = codexHome(result.writer);
          await issueWriterCapability2({ root: result.projectRoot, capability: result.writer, argv: result.argv, subjectDigest: computeLogoSubjectDigest(await loadLogoProject(result.projectRoot)), sessionId: principalId(event), ...trustedCodexHome ? { codexHome: trustedCodexHome } : {}, triggerFrom: `brand-logo-production:pre:${result.writer}` });
        } catch (error) {
          process.stdout.write(`${JSON.stringify(deny2(`WRITER_CAPABILITY_DENIED: ${error instanceof Error ? error.message : String(error)}`))}
`);
        }
      }
    }
    return;
  }
  if (mode === "session") {
    const { roots } = await findLogoProjects(cwd);
    if (roots.length > 0) process.stdout.write(`${JSON.stringify(context("SessionStart", `[Logo Project Delivery Guard] discovered ${roots.length} project(s). Use $logo-project-authoring; advice, render, preview, review, stage, and release require registered writers. session=${eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown"}.`))}
`);
    return;
  }
  if (mode === "subagent") {
    const agentId = eventAgentId(event);
    if (agentId) process.stdout.write(`${JSON.stringify(context("SubagentStart", `[Logo Project Delivery Guard] trusted subagent principal=${principalId(event)}. When this subagent is explicitly assigned the independent logo review, use this exact value as reviewer.sessionId in the external review input, inspect the current digest-bound artifacts, and invoke project-review.mjs from this subagent only.`))}
`);
    return;
  }
  if (mode === "post" || mode === "failure") {
    if (!eventTouchesArtifact(event, "logo")) return;
    markSessionEngagedArtifact({ cwd, carrier: "logo", sessionId: principalId(event) });
  }
  if (mode === "stop" && !sessionEngagedArtifact({ cwd, carrier: "logo", sessionId: principalId(event) })) return;
  const { findings } = await findingsFor(cwd);
  if (mode === "post" || mode === "failure") {
    if (findings.length > 0) process.stdout.write(`${JSON.stringify(context(mode === "post" ? "PostToolUse" : "PostToolUseFailure", format2(findings)))}
`);
  } else if (mode === "stop" && findings.length > 0) {
    process.stdout.write(`${JSON.stringify(stopBlock(format2(findings)))}
`);
  }
}

// plugins/artifact-production/src/domains/music/entries/hooks/music-production.ts
import { createHash as createHash3 } from "node:crypto";
import { basename as basename4, dirname as dirname5, relative as relative3, resolve as resolve10 } from "node:path";

// core/src/artifact-scan.ts
import { createHash as createHash2 } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join as join2, relative as relative2, resolve as resolve7 } from "node:path";
var SKIP_NAMES = /* @__PURE__ */ new Set(["node_modules", ".git", ".cache", ".tmp"]);
async function collectProjectFiles(root, options = {}) {
  const files = {};
  const digests = {};
  const bytes = {};
  await collect(resolve7(root), resolve7(root), files, digests, bytes, { value: 0 }, options);
  return { files, digests, bytes };
}
async function collect(root, directory, files, digests, bytesMap, count, options) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${entry.name}`);
    if (SKIP_NAMES.has(entry.name)) continue;
    const absolute = join2(directory, entry.name);
    if (entry.isDirectory()) {
      await collect(root, absolute, files, digests, bytesMap, count, options);
    } else if (entry.isFile()) {
      count.value += 1;
      if (options.maxFiles && count.value > options.maxFiles) throw new Error("PROJECT_FILE_LIMIT_EXCEEDED");
      const bytes = await readFile(absolute);
      if (options.maxFileBytes && bytes.byteLength > options.maxFileBytes) {
        throw new Error(`PROJECT_FILE_SIZE_EXCEEDED:${entry.name}`);
      }
      const filePath = relative2(root, absolute).replaceAll("\\", "/");
      files[filePath] = bytes.toString("utf8");
      bytesMap[filePath] = bytes;
      digests[filePath] = createHash2("sha256").update(bytes).digest("hex");
    }
  }
}
async function findCarrierProjects(cwd, carrier, options = {}) {
  const workspaceRoot = resolveWorkspaceRoot3(cwd, carrier);
  const artifactRoot = join2(workspaceRoot, "artifacts", carrier);
  try {
    const roots = (await readdir(artifactRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && (options.requireKebab === false || isKebabArtifactId(entry.name))).slice(0, 32).map((entry) => join2(artifactRoot, entry.name));
    return { workspaceRoot, roots };
  } catch (error) {
    if (error.code === "ENOENT") return { workspaceRoot, roots: [] };
    throw error;
  }
}

// plugins/artifact-production/src/domains/music/lib/shell-policy.ts
import { resolve as resolve9 } from "node:path";

// core/src/artifact-shell.ts
import { basename as basename3, dirname as dirname4, isAbsolute as isAbsolute4, resolve as resolve8 } from "node:path";
function parseShellWords3(command) {
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
function expandKnownPluginRoot3(command, env = process.env) {
  let expanded = String(command ?? "");
  for (const name of ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"]) {
    if (env[name]) expanded = expanded.replaceAll(`\${${name}}`, resolve8(env[name] ?? ""));
  }
  return expanded;
}
function evaluateRegisteredWriter(options) {
  const words = parseShellWords3(expandKnownPluginRoot3(options.command));
  if (!words || words.length < 5) return { ok: false };
  if (!["node", basename3(process.execPath), process.execPath].includes(words[0] ?? "")) return { ok: false };
  if (words[1]?.startsWith("-")) return { ok: false };
  const script = isAbsolute4(words[1] ?? "") ? resolve8(words[1] ?? "") : resolve8(options.cwd, words[1] ?? "");
  if (dirname4(script) !== resolve8(options.toolDirectory) || basename3(script) !== "harness.mjs") return { ok: false };
  if (words[2] !== options.resource) return { ok: false };
  const name = `project-${words[3] ?? ""}.mjs`;
  if (!options.writers.includes(name)) return { ok: false };
  const projectRoot = isAbsolute4(words[4] ?? "") ? resolve8(words[4] ?? "") : resolve8(options.cwd, words[4] ?? "");
  if (dirname4(projectRoot) !== resolve8(options.workspaceRoot, "artifacts", options.carrier) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename3(projectRoot))) {
    return { ok: false };
  }
  return { ok: true, writer: name, projectRoot };
}

// plugins/artifact-production/src/domains/music/lib/shell-policy.ts
var MUSIC_WRITERS = [
  "project-advice.mjs",
  "project-init.mjs",
  "project-lint.mjs",
  "project-optimize.mjs",
  "project-preview.mjs",
  "project-reference.mjs",
  "project-render.mjs",
  "project-review.mjs",
  "project-stage.mjs",
  "project-release.mjs"
];
var CAPABILITIES = {
  "project-advice.mjs": "music-advice",
  "project-init.mjs": "music-init",
  "project-optimize.mjs": "music-optimize",
  "project-preview.mjs": "music-preview",
  "project-reference.mjs": "music-reference",
  "project-render.mjs": "music-render",
  "project-review.mjs": "music-review",
  "project-stage.mjs": "music-stage",
  "project-release.mjs": "music-release"
};
function evaluateMusicShell({ command, cwd, workspaceRoot, toolDirectory }) {
  const cwdInScope = /(?:^|[\\/])artifacts[\\/]music[\\/][^\\/]+(?:[\\/]|$)/u.test(cwd);
  const commandInScope = /artifacts[\\/]music[\\/]/u.test(command) || cwdInScope;
  if (!commandInScope) return { decision: "outside" };
  const expanded = expandKnownPluginRoot3(command);
  const words = parseShellWords3(expanded);
  if (!words) return { decision: "deny", code: "SHELL_SHAPE_DENIED", message: "compound commands, redirection, interpolation, and shell control syntax are not allowed in music scope" };
  const safeReadOnly = /^(?:pwd|ls|cat|head|tail|stat|file|sha256sum)$/u.test(words[0] ?? "") || words[0] === "git" && ["status", "diff"].includes(words[1] ?? "");
  if (safeReadOnly) return { decision: "read-only" };
  const approved = evaluateRegisteredWriter({ command: expanded, cwd, workspaceRoot, carrier: "music", writers: MUSIC_WRITERS, toolDirectory, resource: "music" });
  if (!approved.ok) return { decision: "deny", code: "UNKNOWN_MUTATION_SHELL", message: "music scope allows only an exact registered writer invocation or a narrow read-only command" };
  const extra = words.slice(5);
  const shapeValid = approved.writer === "project-init.mjs" ? extra.every((word) => ["--skip-install", "--install-browser"].includes(word)) && new Set(extra).size === extra.length : approved.writer === "project-reference.mjs" ? words.length === 7 : ["project-advice.mjs", "project-review.mjs"].includes(approved.writer) ? words.length === 6 : approved.writer === "project-stage.mjs" ? words.length === 6 && words[5] === "release" : approved.writer === "project-preview.mjs" ? words.length === 5 || words.length === 6 && words[5] === "--evidence-only" : words.length === 5;
  if (!shapeValid) return { decision: "deny", code: "WRITER_ARGUMENTS_INVALID", message: "registered music writers require their exact documented argument shape" };
  const script = resolve9(words[1] ?? "");
  const capability = CAPABILITIES[approved.writer];
  return capability ? { decision: "registered", writer: approved.writer, projectRoot: approved.projectRoot, capability, argv: [script, ...words.slice(2)] } : { decision: "registered", writer: approved.writer, projectRoot: approved.projectRoot, argv: [script, ...words.slice(2)] };
}

// plugins/artifact-production/src/domains/music/entries/hooks/music-production.ts
var PLUGIN_DIRECTORY3 = resolve10(
  process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? dirname5(resolve10(process.argv[1] ?? process.cwd())),
  process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? "." : "../.."
);
function deny3(reason) {
  return preToolDeny(`[Music Project Delivery Guard] ${reason}`);
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function findingsFor2(cwd) {
  const findings = [];
  const { roots } = await findCarrierProjects(cwd, "music");
  for (const root of roots) {
    const collected = await collectProjectFiles(root, { maxFiles: 4096, maxFileBytes: 512 * 1024 * 1024 });
    if (!("plan.contract.json" in collected.files)) continue;
    const parse = (filePath) => {
      try {
        return JSON.parse(collected.files[filePath] ?? "");
      } catch {
        return null;
      }
    };
    const plan = parse("plan.contract.json");
    const project = parse("music.project.json");
    const model = {
      artifactId: basename4(root),
      files: collected.files,
      digests: collected.digests,
      plan,
      project: isRecord2(project) ? project : null
    };
    const stage = isRecord2(plan) && typeof plan.targetStage === "string" ? plan.targetStage : "source";
    for (const item of validateMusicModel(model, { stage })) {
      findings.push({ artifactId: model.artifactId, ...item });
    }
  }
  return findings;
}
function format3(findings) {
  return [
    "[Music Project Delivery Guard] Project contract violations",
    ...findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`),
    "recovery: Use $music-project-authoring to refresh advice, optimize, render, and preview; use a separate $music-project-review session before stage and release."
  ].join("\n");
}
function isReferenceDownstreamPath(projectRoot, target) {
  const path = relative3(projectRoot, target).replaceAll("\\", "/");
  return path === "plan.direction.json" || path === "plan.arrangement.json" || path === "src/composition.mjs" || path.startsWith("src/instruments/");
}
async function main3() {
  const mode = process.argv[2] ?? "session";
  const event = await readStdinJson();
  if (event.__parseError) return;
  if (mode === "stop" && isStopHookActive(event)) return;
  const cwd = eventCwd(event);
  if (mode === "pre") {
    for (const target of extractFileTargets(event, { tools: "any" })) {
      const absoluteTarget = resolve10(cwd, target);
      const result = evaluateMusicWrite({
        relativePath: relative3(cwd, absoluteTarget),
        toolName: eventToolName(event),
        cwd
      });
      if (result.decision === "deny") {
        writeJson(deny3(`${result.code}: ${result.message}`));
        return;
      }
      const normalized = absoluteTarget.replaceAll("\\", "/");
      const projectMatch = /^(?<root>.*\/artifacts\/music\/[a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/u.exec(normalized);
      if (projectMatch?.groups?.root) {
        try {
          const collected = await collectProjectFiles(projectMatch.groups.root, { maxFiles: 4096, maxFileBytes: 512 * 1024 * 1024 });
          const plan = JSON.parse(collected.files["plan.contract.json"] ?? "null");
          if (plan?.targetStage === "release") {
            writeJson(deny3("RELEASE_STAGE_LOCKED: source and plan files cannot be edited after the monotonic release transition"));
            return;
          }
          if (isReferenceDownstreamPath(projectMatch.groups.root, absoluteTarget)) {
            const model = { artifactId: basename4(projectMatch.groups.root), files: collected.files, digests: collected.digests };
            if (validateMusicReferenceProfile(model).length > 0) {
              writeJson(deny3("REFERENCE_PROFILE_REQUIRED: source-analysis briefs require a current controlled reference profile before direction or source edits"));
              return;
            }
          }
        } catch {
        }
      }
    }
    const command = extractShellCommand(event) ?? "";
    const shell = evaluateMusicShell({ command, cwd, workspaceRoot: resolveWorkspaceRoot3(cwd, "music"), toolDirectory: resolve10(PLUGIN_DIRECTORY3, "dist", "cli") });
    if (shell.decision === "deny") {
      writeJson(deny3(`${shell.code}: ${shell.message}`));
      return;
    }
    if (shell.decision === "registered" && shell.capability) {
      const sessionId2 = eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown";
      if (shell.writer === "project-init.mjs") {
        try {
          const subjectDigest = createHash3("sha256").update(`music-production@0.4.0
init\0${shell.projectRoot}`).digest("hex");
          await issueMusicWriterCapability({ root: shell.projectRoot, capability: shell.capability, argv: shell.argv, subjectDigest, sessionId: sessionId2, ...process.env.AI_EXPERTS_TRIGGER_FROM ? { triggerFrom: process.env.AI_EXPERTS_TRIGGER_FROM } : {} });
        } catch (error) {
          writeJson(deny3(error instanceof Error ? error.message : String(error)));
        }
        return;
      }
      const collected = await collectProjectFiles(shell.projectRoot, { maxFiles: 4096, maxFileBytes: 512 * 1024 * 1024 });
      const parsed = (path) => {
        try {
          return JSON.parse(collected.files[path] ?? "null");
        } catch {
          return null;
        }
      };
      const model = { artifactId: basename4(shell.projectRoot), files: collected.files, digests: collected.digests, plan: parsed("plan.contract.json"), project: parsed("music.project.json") };
      try {
        if (isRecord2(model.plan) && model.plan.targetStage === "release" && shell.writer !== "project-release.mjs") throw new Error("RELEASE_STAGE_LOCKED");
        if (["project-optimize.mjs", "project-render.mjs", "project-preview.mjs", "project-review.mjs", "project-stage.mjs", "project-release.mjs"].includes(shell.writer) && validateMusicReferenceProfile(model).length > 0) throw new Error("REFERENCE_PROFILE_REQUIRED");
        await issueMusicWriterCapability({ root: shell.projectRoot, capability: shell.capability, argv: shell.argv, subjectDigest: computeMusicSubjectDigest(model), sessionId: sessionId2, ...process.env.AI_EXPERTS_TRIGGER_FROM ? { triggerFrom: process.env.AI_EXPERTS_TRIGGER_FROM } : {} });
      } catch (error) {
        writeJson(deny3(error instanceof Error ? error.message : String(error)));
      }
    }
    return;
  }
  if (mode === "session") {
    const { roots } = await findCarrierProjects(cwd, "music");
    if (roots.length > 0) writeJson(additionalContext("SessionStart", "[Music Project Delivery Guard] active. Use $music-project-authoring for production and hand the current digest to a separate $music-project-review session."));
    return;
  }
  const sessionId = eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown";
  if (mode === "post" || mode === "failure") {
    if (!eventTouchesArtifact(event, "music")) return;
    markSessionEngagedArtifact({ cwd, carrier: "music", sessionId });
  }
  if ((mode === "stop" || mode === "subagent-stop") && !sessionEngagedArtifact({ cwd, carrier: "music", sessionId })) return;
  if (mode === "subagent-stop" || mode === "post" || mode === "failure" || mode === "stop") {
    const findings = await findingsFor2(cwd);
    if (mode === "post" || mode === "failure") {
      if (findings.length > 0) writeJson(additionalContext(mode === "post" ? "PostToolUse" : "PostToolUseFailure", format3(findings)));
    } else if (mode === "subagent-stop") {
      if (findings.length > 0) writeJson(additionalContext("Stop", format3(findings)));
    } else if (findings.length > 0) {
      writeJson(stopBlock(format3(findings)));
    }
  }
}

// plugins/artifact-production/src/domains/poster/entries/hooks/poster-production.ts
import { createHash as createHash4 } from "node:crypto";
import { relative as relative4, resolve as resolve12 } from "node:path";

// plugins/artifact-production/src/domains/poster/lib/shell-policy.ts
import { basename as basename5, dirname as dirname6, isAbsolute as isAbsolute5, resolve as resolve11 } from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
var MODULE_DIRECTORY3 = dirname6(fileURLToPath3(import.meta.url));
var ENTRY_DIRECTORY3 = dirname6(resolve11(process.argv[1] ?? process.cwd()));
var PLUGIN_DIRECTORY4 = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? resolve11(process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? ".") : ["dispatcher.mjs", "harness.mjs"].includes(basename5(process.argv[1] ?? "")) ? resolve11(ENTRY_DIRECTORY3, "../..") : resolve11(MODULE_DIRECTORY3, "../../../..");
var TOOL_DIRECTORY3 = resolve11(PLUGIN_DIRECTORY4, "dist", "cli");
var WRITERS3 = /* @__PURE__ */ new Set(["project-init.mjs", "project-lint.mjs", "project-probe.mjs", "project-release.mjs", "project-render.mjs", "project-review.mjs"]);
var PROFILES = /* @__PURE__ */ new Set(["regional-culture", "mondo", "editorial", "academic", "custom"]);
var READ_ONLY3 = /* @__PURE__ */ new Set(["find", "git", "grep", "head", "jq", "ls", "pwd", "rg", "stat", "tail", "wc"]);
function parseShellWords4(command) {
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
function expandKnownPluginRoot4(command) {
  let expanded = String(command ?? "");
  for (const name of ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"]) {
    const value = process.env[name];
    if (value) expanded = expanded.replaceAll(`"\${${name}}/dist/cli/`, `"${resolve11(value)}/dist/cli/`);
  }
  return expanded;
}
function wrapperInvocation2(words, cwd, workspaceRoot) {
  if (!words || words.length < 5) return null;
  const [runtime, entry, resource, action, rootWord] = words;
  if (!runtime || !entry || resource !== "poster" || !action || !rootWord || !["node", basename5(process.execPath), process.execPath].includes(runtime) || entry.startsWith("-")) return null;
  const script = isAbsolute5(entry) ? resolve11(entry) : resolve11(cwd, entry);
  const name = `project-${action}.mjs`;
  if (dirname6(script) !== TOOL_DIRECTORY3 || basename5(script) !== "harness.mjs" || !WRITERS3.has(name)) return null;
  const projectRoot = isAbsolute5(rootWord) ? resolve11(rootWord) : resolve11(cwd, rootWord);
  if (dirname6(projectRoot) !== resolve11(workspaceRoot, "artifacts", "poster") || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename5(projectRoot))) return null;
  if (name === "project-init.mjs" && (words.length !== 7 || words[5] !== "--profile" || !PROFILES.has(words[6] ?? ""))) return null;
  if (name === "project-review.mjs" && words.length !== 6) return null;
  if (!["project-init.mjs", "project-review.mjs"].includes(name) && words.length !== 5) return null;
  return { name, projectRoot, argv: [script, ...words.slice(2)] };
}
function readOnlyCommand2(words) {
  if (!words?.length) return false;
  const command = basename5(words[0] ?? "");
  if (!READ_ONLY3.has(command)) return false;
  if (command === "git" && (!["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(words[1] ?? "") || words.some((word) => word === "--output" || word.startsWith("--output=")))) return false;
  if (command === "find" && words.some((word) => ["-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprint0", "-fprintf", "-fls"].includes(word))) return false;
  if (command === "rg" && words.some((word) => word === "--pre" || word.startsWith("--pre="))) return false;
  return true;
}
function commandTouchesPosterScope(command, cwd, workspaceRoot) {
  const normalizedCommand = String(command ?? "").replaceAll("\\", "/");
  const normalizedCwd = resolve11(cwd).replaceAll("\\", "/");
  const normalizedRoot = resolve11(workspaceRoot).replaceAll("\\", "/");
  return normalizedCwd.startsWith(`${normalizedRoot}/artifacts/poster/`) || /(?:^|[\s"'=])\.?\/?artifacts\/poster(?:\/|[\s"']|$)/u.test(normalizedCommand) || normalizedCommand.includes(`${normalizedRoot}/artifacts/poster/`);
}
function evaluatePosterShell({ command, cwd, workspaceRoot }) {
  if (!commandTouchesPosterScope(command, cwd, workspaceRoot)) return { decision: "allow" };
  const words = parseShellWords4(expandKnownPluginRoot4(command));
  const invocation2 = wrapperInvocation2(words, cwd, workspaceRoot);
  if (invocation2) return { decision: "allow", writer: `poster-${invocation2.name.slice("project-".length, -".mjs".length)}`, projectRoot: invocation2.projectRoot, argv: invocation2.argv };
  if (readOnlyCommand2(words)) return { decision: "allow" };
  return { decision: "deny", code: "UNKNOWN_MUTATION_SHELL", message: "poster scope permits only read-only commands or an exact registered writer invocation" };
}

// plugins/artifact-production/src/domains/poster/entries/hooks/poster-production.ts
var deny4 = (reason) => preToolDeny(`[Poster Project Delivery Guard] ${reason}`);
var initDigest2 = (root) => createHash4("sha256").update(`poster-init:${resolve12(root)}`).digest("hex");
async function runPre2(event) {
  const cwd = resolve12(eventCwd(event));
  for (const target of extractFileTargets(event, { tools: "any" })) {
    const result = evaluatePosterWrite({ relativePath: relative4(cwd, resolve12(cwd, target)), toolName: eventToolName(event), cwd });
    if (result.decision === "deny") return deny4(`${result.code}: ${result.message}`);
  }
  const command = extractShellCommand(event);
  if (!command) return void 0;
  const decision = evaluatePosterShell({ command, cwd, workspaceRoot: resolveWorkspaceRoot4(cwd) });
  if (decision.decision === "deny") return deny4(`${decision.code}: ${decision.message}`);
  if (decision.writer && decision.writer !== "poster-lint" && decision.projectRoot && decision.argv) {
    try {
      const subjectDigest = decision.writer === "poster-init" ? initDigest2(decision.projectRoot) : computePosterSubjectDigest(await loadPosterProject(decision.projectRoot));
      await issueWriterCapability3({
        root: decision.projectRoot,
        capability: decision.writer,
        argv: decision.argv,
        subjectDigest,
        sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown",
        triggerFrom: `poster-production:pre:${decision.writer}`
      });
    } catch (error) {
      return deny4(`WRITER_CAPABILITY_DENIED: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return void 0;
}
var targetStage2 = (plan) => typeof plan === "object" && plan !== null && !Array.isArray(plan) ? plan.targetStage : void 0;
var reviewRequested = (plan) => ["review", "release"].includes(String(targetStage2(plan)));
async function projectFindings2(cwd, subagent = false) {
  const findings = [];
  for (const root of await findPosterProjects(cwd)) {
    try {
      const model = await loadPosterProject(root);
      const stage = subagent && reviewRequested(model.plan) ? "review" : targetStage2(model.plan) ?? "source";
      for (const item of validatePosterModel(model, { stage })) findings.push({ artifactId: model.artifactId ?? relative4(cwd, root), ...item });
    } catch (error) {
      findings.push({ artifactId: relative4(cwd, root), code: "PROJECT_READ_FAILED", path: ".", message: error instanceof Error ? error.message : String(error) });
    }
  }
  return findings;
}
function formatFindings(findings) {
  return ["[Poster Project Delivery Guard] Project contract violations", ...findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`), "recovery: Fix the named brief/design/source/output, then rerun the registered poster writer."].join("\n");
}
async function main4() {
  const mode = process.argv[2] ?? "session";
  const event = await readStdinJson();
  if (event.__parseError) {
    process.stderr.write("[Poster Project Delivery Guard] invalid hook JSON\n");
    process.exitCode = 2;
    return;
  }
  const cwd = eventCwd(event);
  if (mode === "pre") {
    writeJson(await runPre2(event));
    return;
  }
  if (mode === "session") {
    const roots = await findPosterProjects(cwd);
    if (roots.length) writeJson(additionalContext("SessionStart", `[Poster Project Delivery Guard] discovered ${roots.length} project(s). Use $poster-project-authoring; generated SVG/PNG, evidence, review, and release files require registered writers. session=${eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown"}.`));
    return;
  }
  if (mode === "post" || mode === "failure") {
    if (!eventTouchesArtifact(event, "poster")) return;
    markSessionEngagedArtifact({ cwd, carrier: "poster", sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown" });
    const findings = await projectFindings2(cwd);
    if (findings.length) writeJson(additionalContext(mode === "post" ? "PostToolUse" : "PostToolUseFailure", formatFindings(findings)));
    return;
  }
  if (mode === "subagent-stop") {
    if (!sessionEngagedArtifact({ cwd, carrier: "poster", sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown" })) return;
    const findings = await projectFindings2(cwd, true);
    if (findings.length) writeJson(additionalContext("Stop", formatFindings(findings)));
    return;
  }
  if (mode === "stop") {
    if (isStopHookActive(event) || !sessionEngagedArtifact({ cwd, carrier: "poster", sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown" })) return;
    const findings = await projectFindings2(cwd);
    if (findings.length) writeJson(stopBlock(formatFindings(findings)));
  }
}

// plugins/artifact-production/src/domains/presentation/entries/hooks/presentation-production.ts
import { relative as relative5, resolve as resolve14 } from "node:path";

// plugins/artifact-production/src/domains/presentation/lib/shell-policy.ts
import { realpathSync } from "node:fs";
import { basename as basename6, dirname as dirname7, isAbsolute as isAbsolute6, resolve as resolve13 } from "node:path";
import { fileURLToPath as fileURLToPath4 } from "node:url";
var MODULE_DIRECTORY4 = dirname7(fileURLToPath4(import.meta.url));
var ENTRY_DIRECTORY4 = dirname7(resolve13(process.argv[1] ?? process.cwd()));
var PLUGIN_DIRECTORY5 = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? resolve13(process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? ".") : ["dispatcher.mjs", "harness.mjs"].includes(basename6(process.argv[1] ?? "")) ? resolve13(ENTRY_DIRECTORY4, "../..") : resolve13(MODULE_DIRECTORY4, "../../../..");
var TOOL_DIRECTORY4 = resolve13(PLUGIN_DIRECTORY5, "dist", "cli");
var WRITERS4 = /* @__PURE__ */ new Set(["project-init.mjs", "project-lint.mjs", "project-probe.mjs", "project-release.mjs", "project-render.mjs", "project-review.mjs"]);
var READ_ONLY4 = /* @__PURE__ */ new Set(["file", "find", "git", "grep", "head", "jq", "ls", "pwd", "rg", "sed", "stat", "tail", "wc"]);
function canonicalPath(path) {
  const absolute = resolve13(path);
  try {
    return realpathSync(absolute);
  } catch {
    const parent = dirname7(absolute);
    return parent === absolute ? absolute : resolve13(canonicalPath(parent), basename6(absolute));
  }
}
function parseShellWords5(command) {
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
function expandKnownPluginRoot5(command) {
  let expanded = String(command ?? "");
  for (const name of ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"]) {
    const value = process.env[name];
    if (value) expanded = expanded.replaceAll(`"\${${name}}/dist/cli/`, `"${resolve13(value)}/dist/cli/`);
  }
  return expanded;
}
function wrapperInvocation3(words, cwd, workspaceRoot) {
  if (!words || words.length < 5) return null;
  const [first, second, resource, action, rootWord] = words;
  if (!first || !second || resource !== "presentation" || !action || !rootWord || !["node", basename6(process.execPath), process.execPath].includes(first) || second.startsWith("-")) return null;
  const script = isAbsolute6(second) ? resolve13(second) : resolve13(cwd, second);
  const name = `project-${action}.mjs`;
  if (dirname7(script) !== TOOL_DIRECTORY4 || basename6(script) !== "harness.mjs" || !WRITERS4.has(name)) return null;
  const projectRoot = isAbsolute6(rootWord) ? resolve13(rootWord) : resolve13(cwd, rootWord);
  const canonicalProjectRoot = canonicalPath(projectRoot);
  const canonicalCarrierRoot = canonicalPath(resolve13(workspaceRoot, "artifacts", "pptx"));
  if (dirname7(canonicalProjectRoot) !== canonicalCarrierRoot || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename6(canonicalProjectRoot))) return null;
  return { name, projectRoot: canonicalProjectRoot, argv: [script, resource, action, canonicalProjectRoot, ...words.slice(5)] };
}
function readOnlyCommand3(words) {
  if (!words?.length) return false;
  const command = basename6(words[0] ?? "");
  if (!READ_ONLY4.has(command)) return false;
  if (command === "git" && !["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(words[1] ?? "")) return false;
  if (command === "sed" && words.some((word) => /^-.*i/u.test(word))) return false;
  if (command === "find" && words.some((word) => ["-delete", "-exec", "-execdir", "-ok", "-okdir"].includes(word))) return false;
  return true;
}
function commandTouchesPptxScope(command, cwd, workspaceRoot) {
  const normalizedCommand = String(command ?? "").replaceAll("\\", "/");
  const normalizedCwd = resolve13(cwd).replaceAll("\\", "/");
  const normalizedRoot = resolve13(workspaceRoot).replaceAll("\\", "/");
  return normalizedCwd.startsWith(`${normalizedRoot}/artifacts/pptx/`) || /(?:^|[\\/])artifacts[\\/]pptx[\\/]/u.test(normalizedCommand) || /(?:^|[\s"'=])\.?\/?artifacts\/pptx(?:\/|[\s"']|$)/u.test(normalizedCommand) || normalizedCommand.includes(`${normalizedRoot}/artifacts/pptx/`);
}
function evaluatePptxShell({ command, cwd, workspaceRoot }) {
  if (!commandTouchesPptxScope(command, cwd, workspaceRoot)) return { decision: "allow" };
  const words = parseShellWords5(expandKnownPluginRoot5(command));
  const invocation2 = wrapperInvocation3(words, cwd, workspaceRoot);
  if (invocation2) return { decision: "allow", writer: `pptx-${invocation2.name.slice("project-".length, -".mjs".length)}`, projectRoot: invocation2.projectRoot, argv: invocation2.argv };
  if (readOnlyCommand3(words)) return { decision: "allow" };
  return { decision: "deny", code: "UNKNOWN_MUTATION_SHELL", message: "PPTX scope permits only read-only commands or an exact registered writer invocation" };
}

// plugins/artifact-production/src/domains/presentation/entries/hooks/presentation-production.ts
function deny5(reason) {
  return preToolDeny(`[PPTX Project Delivery Guard] ${reason}`);
}
async function runPre3(event) {
  const cwd = resolve14(eventCwd(event));
  const name = eventToolName(event);
  for (const target of extractFileTargets(event, { tools: "any" })) {
    const result = evaluatePptxWrite({
      relativePath: relative5(cwd, resolve14(cwd, target)),
      toolName: name,
      cwd
    });
    if (result.decision === "deny") return deny5(`${result.code}: ${result.message}`);
  }
  const command = extractShellCommand(event);
  if (command) {
    const decision = evaluatePptxShell({ command, cwd, workspaceRoot: resolveWorkspaceRoot5(cwd) });
    if (decision.decision === "deny") return deny5(`${decision.code}: ${decision.message}`);
    if (decision.writer && !["pptx-init", "pptx-lint"].includes(decision.writer) && decision.projectRoot && decision.argv) {
      try {
        const model = await loadPptxProject(decision.projectRoot);
        await issueWriterCapability4({
          root: decision.projectRoot,
          capability: decision.writer,
          argv: decision.argv,
          subjectDigest: computePptxSubjectDigest(model),
          sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown",
          triggerFrom: `presentation-production:pre:${decision.writer}`
        });
      } catch (error) {
        return deny5(`WRITER_CAPABILITY_DENIED: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return void 0;
}
function planTargetStage2(plan) {
  return typeof plan === "object" && plan !== null && !Array.isArray(plan) ? plan.targetStage : void 0;
}
async function projectFindings3(cwd, forceStage) {
  const findings = [];
  const roots = typeof findPptxProjects === "function" ? await findPptxProjects(cwd) : (await findCarrierProjects(cwd, "pptx")).roots;
  for (const root of roots) {
    try {
      const model = await loadPptxProject(root);
      const stage = forceStage ?? planTargetStage2(model.plan) ?? "source";
      for (const item of validatePptxModel(model, { stage })) {
        findings.push({ artifactId: model.artifactId ?? relative5(cwd, root), ...item });
      }
    } catch (error) {
      findings.push({ artifactId: relative5(cwd, root), code: "PROJECT_READ_FAILED", path: ".", message: error instanceof Error ? error.message : String(error) });
    }
  }
  return findings;
}
function formatFindings2(findings) {
  return [
    "[PPTX Project Delivery Guard] Project contract violations",
    ...findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`),
    "recovery: Fix the named source/manifest/output, then run the registered validator or writer again."
  ].join("\n");
}
async function main5() {
  const mode = process.argv[2] ?? "session";
  const event = await readStdinJson();
  if (event.__parseError) {
    process.stderr.write("[PPTX Project Delivery Guard] invalid hook JSON\n");
    process.exitCode = 2;
    return;
  }
  const cwd = eventCwd(event);
  if (mode === "pre") {
    writeJson(await runPre3(event));
    return;
  }
  if (mode === "session") {
    const roots = await findPptxProjects(cwd);
    if (roots.length > 0) writeJson(additionalContext("SessionStart", `[PPTX Project Delivery Guard] discovered ${roots.length} project(s). Follow the bundled pptx-deck-authoring orchestrator; generated outputs require registered init/lint/render/probe/review/release writers; host session id=${eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown"}.`));
    return;
  }
  if (mode === "post" || mode === "failure") {
    if (!eventTouchesArtifact(event, "pptx")) return;
    markSessionEngagedArtifact({ cwd, carrier: "pptx", sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown" });
    const findings = await projectFindings3(cwd);
    if (findings.length > 0) writeJson(additionalContext(mode === "post" ? "PostToolUse" : "PostToolUseFailure", formatFindings2(findings)));
    return;
  }
  if (mode === "subagent-stop") {
    if (!sessionEngagedArtifact({ cwd, carrier: "pptx", sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown" })) return;
    const findings = await projectFindings3(cwd, "review");
    if (findings.length > 0) writeJson(additionalContext("Stop", formatFindings2(findings)));
    return;
  }
  if (mode === "stop") {
    if (isStopHookActive(event) || !sessionEngagedArtifact({ cwd, carrier: "pptx", sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown" })) return;
    const findings = await projectFindings3(cwd);
    if (findings.length > 0) writeJson(stopBlock(formatFindings2(findings)));
  }
}

// plugins/artifact-production/src/domains/print/entries/hooks/print-publication-production.ts
import { basename as basename7, dirname as dirname8, relative as relative6, resolve as resolve15 } from "node:path";
var PLUGIN_DIRECTORY6 = resolve15(
  process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? dirname8(resolve15(process.argv[1] ?? process.cwd())),
  process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? "." : "../.."
);
var READ_ONLY_COMMANDS = /* @__PURE__ */ new Set(["file", "find", "git", "grep", "head", "jq", "ls", "pwd", "rg", "sed", "stat", "tail", "wc"]);
function deny6(reason) {
  return preToolDeny(`[Print Project Delivery Guard] ${reason}`);
}
function isReadOnlyCommand(command) {
  const words = parseShellWords3(expandKnownPluginRoot3(command));
  if (!words?.length) return false;
  const executable = basename7(words[0] ?? "");
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
async function findingsFor3(cwd) {
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
    const model = { artifactId: basename7(root), files: collected.files, digests: collected.digests, plan, project };
    for (const item of validatePrintModel(model, { stage: targetStageOf(plan) ?? "source" })) {
      findings.push({ artifactId: model.artifactId, ...item });
    }
  }
  return findings;
}
function format4(findings) {
  return [
    "[Print Project Delivery Guard] Project contract violations",
    ...findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`),
    "recovery: Fix the named variant, layer, proof, or output and rerun the registered print tool."
  ].join("\n");
}
async function main6() {
  const mode = process.argv[2] ?? "session";
  const event = await readStdinJson();
  if (event.__parseError) return;
  const cwd = eventCwd(event);
  if (mode === "pre") {
    for (const target of extractFileTargets(event, { tools: "any" })) {
      const result = evaluatePrintWrite({
        relativePath: relative6(cwd, resolve15(cwd, target)),
        toolName: eventToolName(event),
        cwd
      });
      if (result.decision === "deny") {
        writeJson(deny6(`${result.code}: ${result.message}`));
        return;
      }
    }
    const command = extractShellCommand(event) ?? "";
    const workspaceRoot = resolveWorkspaceRoot3(cwd, "print");
    const cwdInScope = /(?:^|[\\/])artifacts[\\/]print[\\/][^\\/]+(?:[\\/]|$)/u.test(cwd);
    const inScope = /artifacts[\\/]print[\\/]/u.test(command) || cwdInScope;
    const approved = evaluateRegisteredWriter({
      command,
      cwd,
      workspaceRoot,
      carrier: "print",
      writers: ["project-lint.mjs", "project-release.mjs"],
      toolDirectory: resolve15(PLUGIN_DIRECTORY6, "dist", "cli"),
      resource: "print"
    });
    if (inScope && !approved.ok && !isReadOnlyCommand(command)) {
      writeJson(deny6("UNKNOWN_MUTATION_SHELL: print scope permits only read-only commands or an exact registered writer invocation"));
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
    const findings = await findingsFor3(cwd);
    if (mode === "post" || mode === "failure") {
      if (findings.length > 0) writeJson(additionalContext(mode === "post" ? "PostToolUse" : "PostToolUseFailure", format4(findings)));
    } else if (mode === "subagent-stop") {
      if (findings.length > 0) writeJson(additionalContext("Stop", format4(findings)));
    } else if (findings.length > 0) {
      writeJson(stopBlock(format4(findings)));
    }
  }
}

// plugins/artifact-production/src/domains/training/entries/hooks/training-program-design.ts
import { relative as relative7, resolve as resolve17 } from "node:path";

// plugins/artifact-production/src/domains/training/lib/shell-policy.ts
import { basename as basename8, dirname as dirname9, isAbsolute as isAbsolute7, resolve as resolve16 } from "node:path";
import { fileURLToPath as fileURLToPath5 } from "node:url";
var MODULE_DIRECTORY5 = dirname9(fileURLToPath5(import.meta.url));
var ENTRY_DIRECTORY5 = dirname9(resolve16(process.argv[1] ?? process.cwd()));
var PLUGIN_DIRECTORY7 = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? resolve16(process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? ".") : ["dispatcher.mjs", "harness.mjs"].includes(basename8(process.argv[1] ?? "")) ? resolve16(ENTRY_DIRECTORY5, "../..") : resolve16(MODULE_DIRECTORY5, "../../../..");
var TOOL_DIRECTORY5 = resolve16(PLUGIN_DIRECTORY7, "dist", "cli");
var WRITERS5 = /* @__PURE__ */ new Set(["project-init.mjs", "project-lint.mjs", "project-render.mjs", "project-review.mjs", "project-release.mjs"]);
var READ_ONLY5 = /* @__PURE__ */ new Set(["file", "find", "git", "grep", "head", "jq", "ls", "pwd", "rg", "sed", "stat", "tail", "wc"]);
function parseShellWords6(command) {
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
function expandKnownPluginRoot6(command) {
  let expanded = String(command ?? "");
  for (const name of ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"]) {
    const value = process.env[name];
    if (value) expanded = expanded.replaceAll(`"\${${name}}/dist/cli/`, `"${resolve16(value)}/dist/cli/`);
  }
  return expanded;
}
function wrapperInvocation4(words, cwd, workspaceRoot) {
  if (!words || words.length < 5) return null;
  const [first, second, resource, action, rootWord] = words;
  if (!first || !second || resource !== "training" || !action || !rootWord || !["node", basename8(process.execPath), process.execPath].includes(first) || second.startsWith("-")) return null;
  const script = isAbsolute7(second) ? resolve16(second) : resolve16(cwd, second);
  const name = `project-${action}.mjs`;
  if (dirname9(script) !== TOOL_DIRECTORY5 || basename8(script) !== "harness.mjs" || !WRITERS5.has(name)) return null;
  const projectRoot = isAbsolute7(rootWord) ? resolve16(rootWord) : resolve16(cwd, rootWord);
  if (dirname9(projectRoot) !== resolve16(workspaceRoot, "artifacts", "training") || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename8(projectRoot))) return null;
  return { name, projectRoot, argv: [script, ...words.slice(2)] };
}
function readOnlyCommand4(words) {
  if (!words?.length) return false;
  const command = basename8(words[0] ?? "");
  if (!READ_ONLY5.has(command)) return false;
  if (command === "git" && !["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(words[1] ?? "")) return false;
  if (command === "sed" && words.some((word) => /^-.*i/u.test(word))) return false;
  if (command === "find" && words.some((word) => ["-delete", "-exec", "-execdir", "-ok", "-okdir"].includes(word))) return false;
  return true;
}
function commandTouchesTrainingScope(command, cwd, workspaceRoot) {
  const normalizedCommand = String(command ?? "").replaceAll("\\", "/");
  const normalizedCwd = resolve16(cwd).replaceAll("\\", "/");
  const normalizedRoot = resolve16(workspaceRoot).replaceAll("\\", "/");
  return normalizedCwd.startsWith(`${normalizedRoot}/artifacts/training/`) || /(?:^|[\s"'=])\.?\/?artifacts\/training(?:\/|[\s"']|$)/u.test(normalizedCommand) || normalizedCommand.includes(`${normalizedRoot}/artifacts/training/`);
}
function evaluateTrainingShell({ command, cwd, workspaceRoot }) {
  if (!commandTouchesTrainingScope(command, cwd, workspaceRoot)) return { decision: "allow" };
  const words = parseShellWords6(expandKnownPluginRoot6(command));
  const invocation2 = wrapperInvocation4(words, cwd, workspaceRoot);
  if (invocation2) return { decision: "allow", writer: `training-${invocation2.name.slice("project-".length, -".mjs".length)}`, projectRoot: invocation2.projectRoot, argv: invocation2.argv };
  if (readOnlyCommand4(words)) return { decision: "allow" };
  return { decision: "deny", code: "UNKNOWN_MUTATION_SHELL", message: "training scope permits only read-only commands or an exact registered writer invocation" };
}

// plugins/artifact-production/src/domains/training/entries/hooks/training-program-design.ts
var LABEL = "[Training Program Delivery Guard]";
function deny7(reason) {
  return preToolDeny(`${LABEL} ${reason}`);
}
async function runPre4(event) {
  const cwd = resolve17(eventCwd(event));
  const toolName = eventToolName(event);
  for (const target of extractFileTargets(event, { tools: "any" })) {
    const decision2 = evaluateTrainingWrite({ relativePath: relative7(cwd, resolve17(cwd, target)), toolName, cwd });
    if (decision2.decision === "deny") return deny7(`${decision2.code}: ${decision2.message}`);
  }
  const command = extractShellCommand(event);
  if (!command) return void 0;
  const decision = evaluateTrainingShell({ command, cwd, workspaceRoot: resolveWorkspaceRoot6(cwd) });
  if (decision.decision === "deny") return deny7(`${decision.code}: ${decision.message}`);
  if (decision.writer && ["training-render", "training-review", "training-release"].includes(decision.writer) && decision.projectRoot && decision.argv) {
    try {
      const model = await loadTrainingProject(decision.projectRoot);
      await issueWriterCapability5({
        root: decision.projectRoot,
        capability: decision.writer,
        argv: decision.argv,
        subjectDigest: computeTrainingSubjectDigest(model),
        sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown",
        triggerFrom: process.env.AI_EXPERTS_TRIGGER_FROM || `training-program-design:pre:${decision.writer}`
      });
    } catch (error) {
      return deny7(`WRITER_CAPABILITY_DENIED: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return void 0;
}
function targetStage3(plan) {
  return typeof plan === "object" && plan !== null && !Array.isArray(plan) ? plan.targetStage : void 0;
}
function feedbackStage(files) {
  if ("receipt.release.json" in files) return "release";
  if ("review.training.json" in files) return "review";
  if ("evidence.render.json" in files || Object.keys(files).some((path) => path.startsWith("dist/"))) return "materials";
  if (".training-delivery-journal.json" in files) return "brief";
  return null;
}
async function projectFindings4(cwd, forceStage, { generatedOnly = false } = {}) {
  const findings = [];
  for (const root of await findTrainingProjects(cwd)) {
    try {
      const model = await loadTrainingProject(root);
      const currentStage = generatedOnly ? feedbackStage(model.files) : forceStage ?? targetStage3(model.plan) ?? "brief";
      if (!currentStage) continue;
      for (const item of validateTrainingModel(model, { stage: currentStage })) {
        findings.push({ artifactId: model.artifactId, ...item });
      }
    } catch (error) {
      findings.push({ artifactId: relative7(cwd, root), code: "PROJECT_READ_FAILED", path: ".", message: error instanceof Error ? error.message : String(error) });
    }
  }
  return findings;
}
function formatFindings3(findings) {
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
async function main7() {
  const mode = process.argv[2] ?? "session";
  const event = await readStdinJson();
  if (event.__parseError) {
    if (mode === "pre") writeJson(deny7("HOOK_INPUT_INVALID: invalid hook JSON; refusing a possibly protected mutation"));
    else process.stderr.write(`${LABEL} invalid hook JSON; non-mutating hook failed open
`);
    return;
  }
  const cwd = eventCwd(event);
  if (mode === "pre") {
    writeJson(await runPre4(event));
    return;
  }
  if (mode === "session") {
    const roots = await findTrainingProjects(cwd);
    const context3 = roots.length > 0 ? `${LABEL} discovered ${roots.length} active training project(s). Follow the bundled training-program-design Skill; generated materials, review, and release evidence require registered writers.` : `${LABEL} no training project is active. Route to the bundled training-program-design Skill only when the user asks to design or adapt training; otherwise take no action.`;
    writeJson(additionalContext("SessionStart", context3));
    return;
  }
  if (mode === "post" || mode === "failure") {
    if (!eventTouchesArtifact(event, "training")) return;
    markSessionEngagedArtifact({ cwd, carrier: "training", sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown" });
    const findings = await projectFindings4(cwd, void 0, { generatedOnly: true });
    if (findings.length > 0) writeJson(additionalContext(mode === "post" ? "PostToolUse" : "PostToolUseFailure", formatFindings3(findings)));
    return;
  }
  if (mode === "subagent-stop") {
    if (!sessionEngagedArtifact({ cwd, carrier: "training", sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown" })) return;
    const findings = await projectFindings4(cwd, "review");
    if (findings.length > 0) writeJson(additionalContext("Stop", `${formatFindings3(findings)}
reviewBoundary: Reviewer output is advisory; it has no release authority.`));
    return;
  }
  if (mode === "stop") {
    if (isStopHookActive(event) || !sessionEngagedArtifact({ cwd, carrier: "training", sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown" })) return;
    const findings = await projectFindings4(cwd);
    if (findings.length > 0) writeJson(stopBlock(formatFindings3(findings)));
  }
}

// plugins/artifact-production/src/domains/video/entries/hooks/video-production.ts
import { relative as relative8, resolve as resolve19 } from "node:path";

// plugins/artifact-production/src/domains/video/lib/shell-policy.ts
import { basename as basename9, dirname as dirname10, isAbsolute as isAbsolute8, resolve as resolve18 } from "node:path";
import { fileURLToPath as fileURLToPath6 } from "node:url";
var MODULE_DIRECTORY6 = dirname10(fileURLToPath6(import.meta.url));
var ENTRY_DIRECTORY6 = dirname10(resolve18(process.argv[1] ?? process.cwd()));
var PLUGIN_DIRECTORY8 = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? resolve18(process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? ".") : ["dispatcher.mjs", "harness.mjs"].includes(basename9(process.argv[1] ?? "")) ? resolve18(ENTRY_DIRECTORY6, "../..") : resolve18(MODULE_DIRECTORY6, "../../../..");
var TOOL_DIRECTORY6 = resolve18(PLUGIN_DIRECTORY8, "dist", "cli");
var WRITERS6 = /* @__PURE__ */ new Set(["project-admit.mjs", "project-init.mjs", "project-lint.mjs", "project-probe.mjs", "project-release.mjs", "project-render.mjs", "project-review.mjs", "project-shot-stage.mjs"]);
var PROFILES2 = /* @__PURE__ */ new Set(["motion-explainer", "product-promo", "short-form", "talking-head", "reference-led", "micro-drama"]);
var READ_ONLY6 = /* @__PURE__ */ new Set(["file", "find", "git", "grep", "head", "jq", "ls", "pwd", "rg", "sed", "stat", "tail", "wc"]);
function parseShellWords7(command) {
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
function wrapperInvocation5(words, cwd, workspaceRoot) {
  if (!words || words.length < 5) return null;
  const first = words[0];
  const second = words[1];
  const resource = words[2];
  const action = words[3];
  const rootWord = words[4];
  if (first === void 0 || second === void 0 || resource !== "video" || action === void 0 || rootWord === void 0) return null;
  if (!["node", basename9(process.execPath), process.execPath].includes(first)) return null;
  if (second.startsWith("-")) return null;
  const script = isAbsolute8(second) ? resolve18(second) : resolve18(cwd, second);
  const name = `project-${action}.mjs`;
  if (dirname10(resolve18(script)) !== resolve18(TOOL_DIRECTORY6) || basename9(script) !== "harness.mjs" || !WRITERS6.has(name)) return null;
  const projectRoot = isAbsolute8(rootWord) ? resolve18(rootWord) : resolve18(cwd, rootWord);
  const expectedParent = resolve18(workspaceRoot, "artifacts", "video");
  if (dirname10(projectRoot) !== expectedParent || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename9(projectRoot))) return null;
  if (name === "project-init.mjs" && (words.length !== 9 || words[5] !== "--profile" || !PROFILES2.has(words[6] ?? "") || words[7] !== "--mode" || !["guided", "autonomous"].includes(words[8] ?? ""))) return null;
  if (name === "project-admit.mjs" && words.length !== 6) return null;
  if (name === "project-review.mjs" && words.length !== 6) return null;
  if (name === "project-shot-stage.mjs" && words.length !== 8) return null;
  if (["project-lint.mjs", "project-probe.mjs", "project-release.mjs"].includes(name) && words.length !== 5) return null;
  if (name === "project-render.mjs" && ![6, 7].includes(words.length)) return null;
  return { name, projectRoot, argv: [script, ...words.slice(2)] };
}
function expandKnownPluginRoot7(command) {
  let expanded = String(command ?? "");
  for (const name of ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"]) {
    const value = process.env[name];
    if (!value) continue;
    expanded = expanded.replaceAll(`"\${${name}}/dist/cli/`, `"${resolve18(value)}/dist/cli/`);
  }
  return expanded;
}
function readOnlyCommand5(words) {
  if (!words || words.length === 0) return false;
  const first = words[0];
  if (first === void 0) return false;
  const command = basename9(first);
  if (!READ_ONLY6.has(command)) return false;
  if (command === "git" && !["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(words[1] ?? "")) return false;
  if (command === "sed" && words.some((word) => /^-.*i/u.test(word))) return false;
  if (command === "find" && words.some((word) => ["-delete", "-exec", "-execdir", "-ok", "-okdir"].includes(word))) return false;
  return true;
}
function commandTouchesVideoScope(command, cwd, workspaceRoot) {
  const normalizedCommand = String(command ?? "").replaceAll("\\", "/");
  const normalizedCwd = resolve18(cwd).replaceAll("\\", "/");
  const normalizedRoot = resolve18(workspaceRoot).replaceAll("\\", "/");
  return normalizedCwd.startsWith(`${normalizedRoot}/artifacts/video/`) || /(?:^|[\s"'=])\.?\/?artifacts\/video(?:\/|[\s"']|$)/u.test(normalizedCommand) || normalizedCommand.includes(`${normalizedRoot}/artifacts/video/`);
}
function evaluateVideoShell({ command, cwd, workspaceRoot }) {
  if (!commandTouchesVideoScope(command, cwd, workspaceRoot)) return { decision: "allow" };
  const words = parseShellWords7(expandKnownPluginRoot7(command));
  const invocation2 = wrapperInvocation5(words, cwd, workspaceRoot);
  if (invocation2) return {
    decision: "allow",
    writer: `video-${invocation2.name.slice("project-".length, -".mjs".length)}`,
    projectRoot: invocation2.projectRoot,
    argv: invocation2.argv
  };
  if (readOnlyCommand5(words)) return { decision: "allow" };
  return { decision: "deny", code: "UNKNOWN_MUTATION_SHELL", message: "video scope permits only read-only commands or an exact registered writer invocation" };
}

// plugins/artifact-production/src/domains/video/entries/hooks/video-production.ts
var nameOf2 = (event) => eventToolName(event);
var cwdOf2 = (event) => resolve19(eventCwd(event));
var sessionOf = (event) => eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown";
function targetsOf2(event) {
  return extractFileTargets(event, { tools: "any" });
}
function deny8(reason) {
  return preToolDeny(`[Video Project Delivery Guard] ${reason}`);
}
function context2(eventName2, message) {
  return additionalContext(eventName2, message);
}
function isRecord3(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
async function findingsFor4(cwd) {
  const findings = [];
  const { workspaceRoot, roots } = await findVideoProjects(cwd);
  for (const root of roots) {
    const model = await loadVideoProject(root);
    const artifactPath = relative8(workspaceRoot, root).replaceAll("\\", "/");
    if (!(model.files && "plan.contract.json" in model.files)) {
      findings.push({ artifactId: model.artifactId, code: "PLAN_CONTRACT_MISSING", path: `${artifactPath}/plan.contract.json`, message: "plan.contract.json is required to select a closure stage" });
    }
    const stage = isRecord3(model.plan) && typeof model.plan.targetStage === "string" ? model.plan.targetStage : void 0;
    for (const item of validateVideoModel(model, stage === void 0 ? {} : { stage })) findings.push({ artifactId: model.artifactId, ...item });
  }
  return { findings, projectCount: roots.length };
}
function format5(findings) {
  return ["[Video Project Delivery Guard] Project contract violations", ...findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`), "recovery: Fix the named contract, proof, evidence, or output and rerun the registered video tool."].join("\n");
}
async function main8() {
  const mode = process.argv[2] ?? "session";
  const event = await readStdinJson();
  if (event.__parseError) {
    process.stderr.write("[Video Project Delivery Guard] invalid hook JSON\n");
    process.exitCode = 2;
    return;
  }
  const cwd = cwdOf2(event);
  const workspaceRoot = resolveWorkspaceRoot7(cwd);
  if (mode === "pre") {
    for (const target of targetsOf2(event)) {
      const absolutePath = resolve19(cwd, target);
      const result = evaluateVideoWrite({ relativePath: absolutePath, toolName: nameOf2(event) });
      if (result.decision === "deny") {
        process.stdout.write(`${JSON.stringify(deny8(`${result.code}: ${result.message}`))}
`);
        return;
      }
    }
    const command = extractShellCommand(event) ?? "";
    if (command) {
      const result = evaluateVideoShell({ command, cwd, workspaceRoot });
      if (result.decision === "deny") process.stdout.write(`${JSON.stringify(deny8(`${result.code}: ${result.message}`))}
`);
      else if (result.writer && result.writer !== "video-lint" && result.projectRoot && result.argv) {
        try {
          await issueWriterCapability6({ root: result.projectRoot, capability: result.writer, argv: result.argv, sessionId: sessionOf(event), triggerFrom: `video-production:pre:${result.writer}` });
        } catch (error) {
          const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
          process.stdout.write(`${JSON.stringify(deny8(`WRITER_CAPABILITY_DENIED: ${message}`))}
`);
        }
      }
    }
    return;
  }
  if (mode === "session") {
    const { roots } = await findVideoProjects(cwd);
    const projectCount = roots.length;
    if (projectCount > 0) process.stdout.write(`${JSON.stringify(context2("SessionStart", `[Video Project Delivery Guard] discovered ${projectCount} project(s); generated outputs require registered writers; host session id=${sessionOf(event)}.`))}
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
    const { findings } = await findingsFor4(cwd);
    if (mode === "post" || mode === "failure") {
      if (findings.length > 0) process.stdout.write(`${JSON.stringify(context2(mode === "post" ? "PostToolUse" : "PostToolUseFailure", format5(findings)))}
`);
    } else if (mode === "subagent-stop") {
      if (findings.length > 0) writeJson(context2("Stop", format5(findings)));
    } else if (findings.length > 0) {
      writeJson(stopBlock(format5(findings)));
    }
  }
}

// plugins/artifact-production/src/entries/hooks/dispatcher.ts
var [host, eventName] = process.argv.slice(2);
if (!host || !eventName) throw new Error("dispatcher requires <host> <event>");
await runOwnerDispatcher(host, eventName, {
  "diagram:diagram-production": ownerHookHandler(main),
  "logo:brand-logo-production": ownerHookHandler(main2),
  "music:music-production": ownerHookHandler(main3),
  "poster:poster-production": ownerHookHandler(main4),
  "presentation:presentation-production": ownerHookHandler(main5),
  "print:print-publication-production": ownerHookHandler(main6),
  "training:training-program-design": ownerHookHandler(main7),
  "video:video-production": ownerHookHandler(main8)
});
