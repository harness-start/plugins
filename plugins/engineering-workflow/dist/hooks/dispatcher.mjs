// harness-source-hash: sha256:77602d3f9aa61c2535da235cff9515fc2753c443ea3c42d361b9b68abd9706b2
import {
  DEFAULT_CONFIG,
  canonicalizeLedgerPath,
  commandFlag,
  describeLedger,
  ensurePluginWorkdirGitignore,
  eventAssistantMessage,
  eventCwd,
  eventSessionId,
  eventToolInput,
  eventToolName,
  eventToolResponse,
  findLedgerDir,
  formatFindings,
  inspectChange,
  isLedgerManagedPath,
  isOfficialWriterCommand,
  isRecord,
  isWorkOrderPath,
  loadLedger,
  loadProjectConfig,
  parseWriterStdout,
  scanLedgers,
  writerActionFromCommand
} from "../chunks/chunk-GKZQHUQ5.mjs";

// core/src/aio-dispatcher.ts
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
  const contexts = outputs.map((output) => output.hookSpecificOutput?.additionalContext).filter((context2) => Boolean(context2));
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
  const name = input.eventName === "SessionStart" ? String(event.source ?? "startup") : String(event.tool_name ?? event.toolName ?? "");
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

// plugins/engineering-workflow/src/domains/debugging/hook.ts
import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync, existsSync, readFileSync as readFileSync3, realpathSync as realpathSync2 } from "node:fs";
import { execFileSync as execFileSync2 } from "node:child_process";
import { relative as relative2, resolve as resolve6 } from "node:path";

// core/src/path-protect.ts
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
function commandMentionsRoot(command, rootRel, rootAbs) {
  const text = String(command ?? "");
  if (!text.trim()) return false;
  const normalized = String(rootRel ?? "").replace(/^\.\//u, "").replace(/\/+$/u, "");
  const markers = [rootRel, normalized, rootAbs, normalized ? `${normalized}/` : null, normalized ? `./${normalized}` : null, normalized ? `./${normalized}/` : null].filter(Boolean);
  return markers.some((marker) => new RegExp(
    `(?:^|[\\s;|&\`"'(){}\\[\\]])${escapeRegExp(marker)}(?:$|[\\s;|&\`"'(){}\\[\\]//])`,
    "u"
  ).test(text));
}
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

// plugins/engineering-workflow/src/domains/debugging/lib/hook-io.ts
import { isAbsolute as isAbsolute2, resolve as resolve3 } from "node:path";

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

// core/src/hook-targets.ts
import { isAbsolute, resolve as resolve2 } from "node:path";

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

// plugins/engineering-workflow/src/domains/debugging/lib/hook-io.ts
function extractSessionId(event) {
  return eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || null;
}
function extractToolResponse(event) {
  return eventToolResponse(event) ?? event.error ?? null;
}
function stripMatchingQuotes2(value) {
  const text = String(value ?? "").trim();
  if (text.length >= 2 && (text.startsWith('"') && text.endsWith('"') || text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}
function objectPaths2(input) {
  if (!isRecord(input)) return [];
  const paths = [];
  for (const key of ["file_path", "filePath", "path", "target_file", "targetFile", "output_file", "outputFile", "notebook_path", "notebookPath"]) {
    const value = input[key];
    if (typeof value === "string" && value) paths.push(value);
  }
  if (Array.isArray(input.paths)) {
    paths.push(...input.paths.filter((path) => typeof path === "string"));
  }
  if (Array.isArray(input.edits)) for (const edit of input.edits) paths.push(...objectPaths2(edit));
  return paths;
}
function responsePaths(response) {
  const paths = [];
  if (isRecord(response)) {
    if (response.changes && typeof response.changes === "object" && !Array.isArray(response.changes)) {
      paths.push(...Object.keys(response.changes));
    }
    paths.push(...objectPaths2(response));
    for (const key of ["output", "stdout", "text"]) {
      if (typeof response[key] === "string") paths.push(...responsePaths(response[key]));
    }
    return paths;
  }
  if (typeof response !== "string") return paths;
  for (const line of response.split("\n")) {
    const status = line.match(/^(?:A|M|D|R[0-9]*)\s+(.+)$/u);
    const changed = line.match(/^(?:added|updated|deleted):\s+(.+)$/iu);
    if (status?.[1]) paths.push(stripMatchingQuotes2(status[1]));
    if (changed?.[1]) paths.push(stripMatchingQuotes2(changed[1]));
  }
  return paths;
}
function extractFileTargets2(event) {
  const cwd = resolve3(eventCwd(event));
  const core = extractFileTargets(event);
  const extras = responsePaths(extractToolResponse(event)).map((value) => isAbsolute2(value) ? resolve3(value) : resolve3(cwd, stripMatchingQuotes2(value).replace(/^\.\//u, "")));
  return [.../* @__PURE__ */ new Set([...core, ...extras])];
}
function isMutationTool(event) {
  return isFileMutationTool(eventToolName(event));
}
function responseText(response) {
  if (typeof response === "string") return response;
  if (isRecord(response)) {
    const fields = ["stdout", "stderr", "output", "content", "message"].map((key) => response[key]).filter((value) => typeof value === "string");
    if (fields.length > 0) return fields.join("\n");
  }
  try {
    return JSON.stringify(response ?? "");
  } catch {
    return String(response ?? "");
  }
}
function inferOutcome(event, forceFailure = false) {
  if (forceFailure) return "failure";
  const response = extractToolResponse(event);
  if (isRecord(response)) {
    if (response.is_error === true || response.isError === true || response.error || response.interrupted === true) return "failure";
    const code = response.exit_code ?? response.exitCode ?? response.code;
    if (Number.isFinite(Number(code))) return Number(code) === 0 ? "success" : "failure";
    if (response.success === false) return "failure";
    if (response.success === true) return "success";
  }
  const text = responseText(response);
  const codes = [...text.matchAll(/(?:Process exited with code|Exit code:?|exited with code)\s+(-?[0-9]+)/giu)];
  const lastCode = codes.at(-1)?.[1];
  if (lastCode !== void 0) return Number(lastCode) === 0 ? "success" : "failure";
  const failed = text.match(/(?:^|\n)#\s*fail\s+([0-9]+)/iu);
  if (failed?.[1] && Number(failed[1]) > 0) return "failure";
  const passed = text.match(/(?:^|\n)#\s*pass\s+([0-9]+)/iu);
  if (passed?.[1] && Number(passed[1]) > 0 && (!failed?.[1] || Number(failed[1]) === 0)) return "success";
  if (/(?:^|\n)not ok\s+[0-9]+\b|command failed|is_error["']?\s*:\s*true/iu.test(text)) return "failure";
  if (!process.env.PLUGIN_ROOT && isRecord(response)) return "success";
  return "unknown";
}
function contextOutput(eventName2, text) {
  return additionalContext(eventName2, text);
}
function stopDeny(reason) {
  return stopBlock(reason);
}

// plugins/engineering-workflow/src/domains/debugging/lib/state-store.ts
import { createHash, randomBytes } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync as readFileSync2, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname as dirname2, join, resolve as resolve4 } from "node:path";
var VERSION = 1;
var TTL_MS = 24 * 60 * 60 * 1e3;
var STATE_DIR_RELATIVE = ".debug-workflow/.state";
function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
function debugWorkdir(from) {
  let cursor = resolve4(from);
  while (basename(cursor) !== ".debug-workflow") {
    const parent = dirname2(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
  return cursor;
}
function ensureStateDir(directory) {
  mkdirSync(directory, { recursive: true, mode: 448 });
  const workdir = debugWorkdir(directory);
  if (workdir) ensurePluginWorkdirGitignore(workdir);
}
function emptyState() {
  return { version: VERSION, bound: false, workOrderPath: null, workOrderId: null, epoch: 0, activeBugId: null, revision: 0, eventSeq: 0, mutationSeq: 0, receipts: [], attempts: {}, invalid: false, updatedAt: 0 };
}
function asReceipts(value) {
  if (!Array.isArray(value)) return [];
  const receipts = [];
  for (const item of value.slice(-1e3)) {
    if (isRecord(item)) receipts.push({ ...item, id: typeof item.id === "string" ? item.id : String(item.id ?? "") });
    else receipts.push({ id: "", value: item });
  }
  return receipts;
}
function asAttempts(value) {
  if (!isRecord(value)) return {};
  const attempts = {};
  for (const [key, count] of Object.entries(value)) attempts[key] = Number(count);
  return attempts;
}
function nullableString(value) {
  if (value === null || value === void 0) return null;
  return typeof value === "string" ? value : String(value);
}
function sanitize(value) {
  if (!isRecord(value) || value.version !== VERSION || Date.now() - Number(value.updatedAt || 0) > TTL_MS) return emptyState();
  return {
    ...emptyState(),
    bound: Boolean(value.bound),
    workOrderPath: nullableString(value.workOrderPath),
    workOrderId: nullableString(value.workOrderId),
    epoch: Number(value.epoch) || 0,
    activeBugId: nullableString(value.activeBugId),
    revision: Number(value.revision) || 0,
    eventSeq: Number(value.eventSeq) || 0,
    mutationSeq: Number(value.mutationSeq) || 0,
    receipts: asReceipts(value.receipts),
    attempts: asAttempts(value.attempts),
    invalid: Boolean(value.invalid),
    updatedAt: Number(value.updatedAt) || 0
  };
}
function statePath(sessionId, cwd) {
  const session = sessionId || "default";
  return join(resolve4(cwd), STATE_DIR_RELATIVE, "sessions", `${digest(session)}.json`);
}
function atomicWrite(path, value) {
  if (!path) return false;
  const directory = dirname2(path);
  const temp = join(directory, `.${digest(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    ensureStateDir(directory);
    writeFileSync(temp, `${JSON.stringify(value)}
`, { encoding: "utf8", mode: 384, flag: "wx" });
    renameSync(temp, path);
    return true;
  } catch {
    try {
      rmSync(temp, { force: true });
    } catch {
    }
    return false;
  }
}
function read(path, fallback = null) {
  try {
    const parsed = JSON.parse(readFileSync2(path, "utf8"));
    return parsed;
  } catch {
    return fallback;
  }
}
function readState(sessionId, cwd) {
  return sanitize(read(statePath(sessionId, cwd), null));
}
function writeState(sessionId, cwd, state) {
  state.updatedAt = Date.now();
  return atomicWrite(statePath(sessionId, cwd), state);
}
function registryPath(repoRoot2, workOrderId) {
  return join(resolve4(repoRoot2), STATE_DIR_RELATIVE, "leases", `${digest(workOrderId)}.json`);
}
function acquireLease({ repoRoot: repoRoot2, workOrderId, epoch, sessionId, leaseMinutes, now = Date.now() }) {
  const path = registryPath(repoRoot2, workOrderId);
  if (!path) return { ok: true, persisted: false };
  const lock = `${path}.lock`;
  const createLock = () => {
    mkdirSync(dirname2(path), { recursive: true, mode: 448 });
    mkdirSync(lock, { mode: 448 });
  };
  try {
    createLock();
  } catch {
    try {
      if (now - statSync(lock).mtimeMs <= 3e4) return { ok: false, reason: "work-order lease update is already in progress" };
      rmdirSync(lock);
      createLock();
    } catch {
      return { ok: false, reason: "work-order lease update is already in progress" };
    }
  }
  try {
    const current = read(path, null);
    const currentRecord = isRecord(current) ? current : null;
    const live = Boolean(currentRecord && Number(currentRecord.expiresAt) > now);
    if (live && currentRecord && currentRecord.sessionId !== sessionId) return { ok: false, reason: `work order is leased by another session until ${new Date(Number(currentRecord.expiresAt)).toISOString()}` };
    if (currentRecord && currentRecord.sessionId !== sessionId && Number(epoch) <= Number(currentRecord.maxEpoch || 0)) return { ok: false, reason: `run.epoch must exceed ${String(currentRecord.maxEpoch)} when another session resumes this work order` };
    const next = { workOrderId, maxEpoch: Math.max(Number(epoch), Number(currentRecord?.maxEpoch || 0)), sessionId, expiresAt: now + leaseMinutes * 6e4, updatedAt: now };
    return { ok: atomicWrite(path, next), persisted: true, reason: "failed to persist work-order lease" };
  } finally {
    try {
      rmdirSync(lock);
    } catch {
    }
  }
}
function releaseLease({ repoRoot: repoRoot2, workOrderId, sessionId }) {
  const path = registryPath(repoRoot2, workOrderId);
  if (!path) return false;
  const current = read(path, null);
  if (!isRecord(current) || current.sessionId !== sessionId) return false;
  current.expiresAt = 0;
  return atomicWrite(path, current);
}

// plugins/engineering-workflow/src/domains/debugging/lib/workflow.ts
import { createHash as createHash2 } from "node:crypto";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { relative, resolve as resolve5 } from "node:path";
function gitRoot(cwd) {
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", timeout: 5e3, stdio: ["ignore", "pipe", "ignore"] }).trim();
    return resolve5(cwd, relative(realpathSync(cwd), realpathSync(top)));
  } catch {
    return resolve5(cwd);
  }
}
function hash(value) {
  return createHash2("sha256").update(String(value)).digest("hex");
}
function normalizeCommand(command) {
  return String(command ?? "").trim().replace(/\s+/gu, " ");
}
function safeRegex(pattern) {
  try {
    return new RegExp(pattern, "u");
  } catch {
    return null;
  }
}
function matchesAny(value, patterns) {
  return patterns.some((pattern) => Boolean(safeRegex(pattern)?.test(value)));
}
function configuredOutcome(command, observed, config) {
  const normalized = normalizeCommand(command);
  if (matchesAny(normalized, config.commands.expectedFailurePatterns)) return "failure";
  if (matchesAny(normalized, config.commands.expectedSuccessPatterns)) return "success";
  return observed;
}
function classifyCommand(command, bug, config) {
  const normalized = normalizeCommand(command);
  const reproduction = isRecord(bug?.symptom) ? bug.symptom.reproduction : void 0;
  if (normalizeCommand(reproduction) === normalized || matchesAny(normalized, config.commands.reproductionPatterns)) return "reproduction";
  if (matchesAny(normalized, config.commands.verificationPatterns) || /(?:^|\s)(?:test|tests|pytest|phpunit|rspec|cargo test|go test|npm test|pnpm test|yarn test|mvn test|gradle test)(?:\s|$)/iu.test(normalized)) return "verification";
  return "command";
}
function classifyPath(path, repoRoot2, config) {
  const rel = relative(repoRoot2, resolve5(path)).replaceAll("\\", "/");
  const groups = config.paths;
  if (matchesAny(rel, groups.nonCodePatterns)) return "non-code";
  if (matchesAny(rel, groups.diagnosticPatterns) || /(?:^|\/)(?:tmp|temp|debug|diagnostics?)(?:\/|$)/iu.test(rel)) return "diagnostic";
  if (matchesAny(rel, groups.testPatterns) || /(?:^|\/)(?:test|tests|spec|specs|__tests__)(?:\/|$)|(?:\.test|\.spec)\.[^.]+$/iu.test(rel)) return "test";
  if (matchesAny(rel, groups.codePatterns)) return "code";
  if (/\.(?:md|txt|rst|adoc|png|jpe?g|gif|svg|pdf)$/iu.test(rel)) return "non-code";
  return "code";
}
function sameLedgerPath(left, right) {
  if (!left || !right) return false;
  return canonicalizeLedgerPath(left) === canonicalizeLedgerPath(right);
}
function bindWorkOrderAfterMutation({ cwd, sessionId, touchedPaths, config = DEFAULT_CONFIG, now = Date.now() }) {
  const repoRoot2 = gitRoot(cwd);
  const candidates = [...new Set((Array.isArray(touchedPaths) ? touchedPaths : []).map((path) => canonicalizeLedgerPath(String(path))))].filter((path) => isWorkOrderPath(path, repoRoot2, config));
  if (candidates.length === 0) return { kind: "idle" };
  if (candidates.length > 1) return { kind: "invalid", findings: ["one hook event cannot bind multiple work orders"] };
  const candidate = candidates[0];
  if (candidate === void 0) return { kind: "idle" };
  let existing = readState(sessionId, repoRoot2);
  if (existing.bound && existing.workOrderPath && !sameLedgerPath(existing.workOrderPath, candidate)) {
    const previous = loadLedger(existing.workOrderPath, config);
    const previousComplete = previous.valid && previous.workOrder.status === "closed" && completionFindings({ kind: "inactive", repoRoot: repoRoot2, state: existing, workOrder: previous.workOrder }).length === 0;
    if (previous.valid && (["aborted", "paused"].includes(String(previous.workOrder.status)) || previousComplete)) {
      releaseLease({ repoRoot: repoRoot2, workOrderId: String(previous.workOrder.id ?? ""), sessionId });
      existing = emptyState();
    } else {
      return { kind: "conflict", path: candidate, findings: [`this session is already bound to ${relative(repoRoot2, existing.workOrderPath)}`] };
    }
  }
  const checked = loadLedger(candidate, config);
  if (!checked.valid) {
    const state2 = {
      ...existing.bound ? existing : emptyState(),
      bound: true,
      workOrderPath: candidate,
      invalid: true,
      eventSeq: existing.bound ? existing.eventSeq + 1 : 1,
      updatedAt: now
    };
    writeState(sessionId, repoRoot2, state2);
    return { kind: "invalid", repoRoot: repoRoot2, state: state2, path: candidate, findings: checked.findings };
  }
  const workOrder = checked.workOrder;
  if (existing.bound && existing.workOrderId && existing.workOrderId !== workOrder.id) {
    existing.invalid = true;
    existing.eventSeq += 1;
    writeState(sessionId, repoRoot2, existing);
    return { kind: "invalid", repoRoot: repoRoot2, state: existing, path: candidate, findings: ["a corrected bound work order must preserve its id and run.epoch"] };
  }
  if (existing.bound && existing.workOrderId && Number(workOrder.run?.epoch) < Number(existing.epoch)) {
    existing.invalid = true;
    existing.eventSeq += 1;
    writeState(sessionId, repoRoot2, existing);
    return { kind: "invalid", repoRoot: repoRoot2, state: existing, path: candidate, findings: ["a corrected bound work order must preserve its id and run.epoch"] };
  }
  const active = workOrder.status === "open" && workOrder.run?.state === "active";
  if (active) {
    const lease = acquireLease({ repoRoot: repoRoot2, workOrderId: String(workOrder.id ?? ""), epoch: workOrder.run?.epoch, sessionId, leaseMinutes: config.limits.leaseMinutes, now });
    if (!lease.ok) return { kind: "conflict", path: candidate, findings: [lease.reason ?? "work-order lease update is already in progress"] };
  }
  const state = {
    ...existing.bound ? existing : emptyState(),
    bound: true,
    workOrderPath: checked.path ?? candidate,
    workOrderId: workOrder.id == null ? null : String(workOrder.id),
    epoch: Number(workOrder.run?.epoch) || 0,
    activeBugId: workOrder.activeBugId == null ? null : String(workOrder.activeBugId),
    revision: existing.bound ? existing.revision + 1 : 1,
    eventSeq: existing.bound ? existing.eventSeq + 1 : 1,
    invalid: false,
    updatedAt: now
  };
  writeState(sessionId, repoRoot2, state);
  return { kind: "bound", repoRoot: repoRoot2, workOrder, state, active };
}
function refreshBoundWorkOrder({ cwd, sessionId, config = DEFAULT_CONFIG }) {
  const repoRoot2 = gitRoot(cwd);
  const state = readState(sessionId, repoRoot2);
  if (!state.bound || !state.workOrderPath) return { kind: "idle", repoRoot: repoRoot2, state };
  const checked = loadLedger(state.workOrderPath, config);
  if (!checked.valid) {
    state.invalid = true;
    writeState(sessionId, repoRoot2, state);
    return { kind: "invalid", repoRoot: repoRoot2, state, findings: checked.findings };
  }
  if (checked.workOrder.id !== state.workOrderId) return { kind: "invalid", repoRoot: repoRoot2, state, findings: ["bound work-order id or run.epoch changed unexpectedly"] };
  if (Number(checked.workOrder.run?.epoch) < Number(state.epoch)) return { kind: "invalid", repoRoot: repoRoot2, state, findings: ["bound work-order id or run.epoch changed unexpectedly"] };
  if (Number(checked.workOrder.run?.epoch) > Number(state.epoch)) {
    state.epoch = Number(checked.workOrder.run?.epoch);
    writeState(sessionId, repoRoot2, state);
  }
  state.invalid = false;
  state.activeBugId = checked.workOrder.activeBugId == null ? null : String(checked.workOrder.activeBugId);
  if (checked.workOrder.status !== "open" || checked.workOrder.run?.state !== "active") {
    return { kind: "inactive", repoRoot: repoRoot2, state, workOrder: checked.workOrder };
  }
  return { kind: "active", repoRoot: repoRoot2, state, workOrder: checked.workOrder };
}
function recordReceipt({ cwd, sessionId, config = DEFAULT_CONFIG, kind, command = null, paths = [], outcome = null, summary = "", now = Date.now() }) {
  const live = refreshBoundWorkOrder({ cwd, sessionId, config });
  if (live.kind !== "active") return live;
  const bug = live.workOrder.bugs.find((item) => item.id === live.workOrder.activeBugId);
  live.state.eventSeq += 1;
  if (kind === "mutation") live.state.mutationSeq = live.state.eventSeq;
  const receipt = {
    id: `R-${live.state.eventSeq}`,
    bugId: bug.id,
    kind: command ? classifyCommand(command, bug, config) : kind,
    commandHash: command ? hash(normalizeCommand(command)) : null,
    paths: paths.map((path) => relative(live.repoRoot, resolve5(path)).replaceAll("\\", "/")).slice(0, 20),
    outcome,
    summary: String(summary).replace(/\s+/gu, " ").slice(0, 240),
    mutationSeq: live.state.mutationSeq,
    revision: live.state.revision,
    at: now
  };
  live.state.receipts.push(receipt);
  if (receipt.kind === "reproduction" && outcome === "failure" && Number(receipt.mutationSeq) > 0) {
    const attemptKey = String(bug.id ?? "");
    live.state.attempts[attemptKey] = Number(live.state.attempts[attemptKey] || 0) + 1;
  }
  live.state.receipts = live.state.receipts.slice(-config.limits.maxReceipts);
  writeState(sessionId, live.repoRoot, live.state);
  return { ...live, kind: "recorded", receipt };
}
function preMutationDecision({ cwd, sessionId, paths, config = DEFAULT_CONFIG }) {
  const live = refreshBoundWorkOrder({ cwd, sessionId, config });
  if (["idle", "inactive"].includes(live.kind)) return { action: "allow", reason: "no active bound work order" };
  const boundPath = live.kind === "invalid" ? live.state?.workOrderPath : void 0;
  if (live.kind === "invalid" && boundPath && paths.length > 0 && paths.every((path) => resolve5(path) === resolve5(boundPath))) {
    return { action: "allow", reason: "allowing correction of the invalid bound work order" };
  }
  if (live.kind !== "active") return { action: config.mode === "block" ? "block" : "report", reason: `bound work order is invalid: ${(live.findings ?? []).join("; ")}` };
  const bug = live.workOrder.bugs.find((item) => item.id === live.workOrder.activeBugId);
  const codePaths = paths.filter((path) => classifyPath(path, live.repoRoot, config) === "code" && !isWorkOrderPath(path, live.repoRoot, config));
  if (codePaths.length === 0) return { action: "allow" };
  const attempts = Number(live.state.attempts[String(bug.id ?? "")] || 0);
  if (attempts >= config.limits.maxFailedFixAttempts) return { action: config.mode === "block" ? "block" : "report", reason: `${String(bug.id)} reached ${attempts} failed fix attempts; move it to architecture-review and record a new decision before further code changes` };
  const firstMutation = Math.min(...live.state.receipts.filter((receipt) => receipt.bugId === bug.id && receipt.kind === "mutation").map(receiptSequence));
  const baseline = live.state.receipts.find((receipt) => receipt.bugId === bug.id && receipt.kind === "reproduction" && receipt.outcome === "failure" && receiptSequence(receipt) < firstMutation);
  if (!baseline) return { action: config.mode === "block" ? "block" : "report", reason: `${String(bug.id)} has no pre-mutation failing baseline; run the exact reproduction command verbatim, without pipes, redirections, or an echo suffix, and observe its failure` };
  const affected = isRecord(bug.fix) && Array.isArray(bug.fix.affectedBugIds) ? bug.fix.affectedBugIds : [];
  const affectedIds = affected.length > 0 ? affected : [bug.id];
  for (const affectedId of affectedIds) {
    if (affectedId === bug.id) continue;
    const affectedBaseline = live.state.receipts.find((receipt) => receipt.bugId === affectedId && receipt.kind === "reproduction" && receipt.outcome === "failure" && receiptSequence(receipt) < firstMutation);
    if (!affectedBaseline) return { action: config.mode === "block" ? "block" : "report", reason: `${String(bug.id)} shared fix affected bug ${String(affectedId)} has no attributed failing baseline before the production mutation; switch activeBugId to ${String(affectedId)}, run its exact reproduction verbatim, then switch back` };
  }
  return { action: "allow" };
}
function receiptSequence(receipt) {
  const matched = /^R-([0-9]+)$/u.exec(String(receipt?.id ?? ""));
  const raw = matched?.[1];
  return raw !== void 0 ? Number(raw) : Number.NaN;
}
function completionFindings(live) {
  if (!["active", "inactive"].includes(live.kind)) return live.kind === "idle" ? [] : live.findings ?? ["work order is unavailable"];
  if (live.kind !== "active" && live.kind !== "inactive") return live.findings ?? ["work order is unavailable"];
  const { workOrder, state } = live;
  if (workOrder.status !== "closed") return [];
  const findings = [];
  const mutations = (state.receipts ?? []).filter((receipt) => receipt.kind === "mutation" && receipt.outcome === "success");
  if (mutations.length === 0) return findings;
  const ownersByBug = /* @__PURE__ */ new Map();
  for (const bug of workOrder.bugs) {
    const fix = isRecord(bug.fix) ? bug.fix : void 0;
    const affected = Array.isArray(fix?.affectedBugIds) && fix.affectedBugIds.length > 0 ? fix.affectedBugIds : [bug.id];
    if (!mutations.some((receipt) => receipt.bugId === bug.id)) continue;
    for (const affectedId of affected) {
      const owners = ownersByBug.get(affectedId) ?? [];
      owners.push(bug.id);
      ownersByBug.set(affectedId, owners);
    }
  }
  const bugIds = /* @__PURE__ */ new Set([...ownersByBug.keys(), ...mutations.map((receipt) => receipt.bugId)]);
  for (const bugId of bugIds) {
    const owners = new Set(ownersByBug.get(bugId) ?? [bugId]);
    const relevantMutations = mutations.filter((receipt) => owners.has(receipt.bugId) || receipt.bugId === bugId);
    if (relevantMutations.length === 0) continue;
    const firstMutation = Math.min(...relevantMutations.map(receiptSequence));
    const lastMutation = Math.max(...relevantMutations.map(receiptSequence));
    const baseline = state.receipts.find((receipt) => receipt.bugId === bugId && receipt.kind === "reproduction" && receipt.outcome === "failure" && receiptSequence(receipt) < firstMutation);
    if (!baseline) findings.push(`${String(bugId)}: no failing original reproduction was observed before production mutation`);
    const after = state.receipts.filter((receipt) => receipt.bugId === bugId && receiptSequence(receipt) > lastMutation);
    const repro = after.find((receipt) => receipt.kind === "reproduction" && receipt.outcome === "success");
    if (!repro) findings.push(`${String(bugId)}: original reproduction lacks a successful current-session receipt`);
    const bug = workOrder.bugs.find((item) => item.id === bugId);
    const acceptanceCommand = isRecord(bug?.symptom) ? String(bug.symptom.acceptance ?? "").trim() : "";
    const acceptanceHash = acceptanceCommand ? hash(normalizeCommand(acceptanceCommand)) : null;
    const acceptance = acceptanceHash ? after.find((receipt) => receipt.commandHash === acceptanceHash && receipt.outcome === "success") : void 0;
    if (acceptanceHash && !acceptance) findings.push(`${String(bugId)}: user-visible acceptance command lacks a successful post-mutation receipt`);
    const regression = after.find((receipt) => receipt.id !== repro?.id && receipt.id !== acceptance?.id && receipt.outcome === "success");
    if (!regression) findings.push(`${String(bugId)}: regression verification is missing`);
    const cleanup = after.find((receipt) => receipt.id !== repro?.id && receipt.id !== acceptance?.id && receipt.id !== regression?.id && receipt.outcome !== "failure");
    if (!cleanup) findings.push(`${String(bugId)}: debug-marker cleanup receipt is missing, cross-bug, or failed`);
    if (repro && receiptSequence(repro) <= lastMutation) findings.push(`${String(bugId)}: original reproduction predates the last relevant mutation`);
  }
  return [...new Set(findings)];
}
function bindAfterWriter({ cwd, sessionId, command = "", stdout = "", config = DEFAULT_CONFIG, now = Date.now() }) {
  const printed = parseWriterStdout(stdout);
  const looksLikeWriter = isOfficialWriterCommand(command) || Boolean(printed?.ok && (printed.id || printed.path));
  if (!looksLikeWriter) return { kind: "idle" };
  const action = writerActionFromCommand(command);
  if (action === "status") return refreshBoundWorkOrder({ cwd, sessionId, config });
  const repoRoot2 = gitRoot(cwd);
  const touched = [];
  if (typeof printed?.path === "string") touched.push(printed.path);
  else if (printed?.path) touched.push(String(printed.path));
  const slug = commandFlag(command, "slug");
  if (slug) touched.push(resolve5(repoRoot2, config.ledger.root, slug));
  if (printed?.id) {
    const dir = findLedgerDir(repoRoot2, config, printed.id);
    if (dir) touched.push(dir);
  }
  if (touched.length === 0) {
    const open = scanLedgers(repoRoot2, config).filter((item) => item.store === "events");
    if (open.length === 1) {
      const only = open[0];
      if (only) touched.push(only.path);
    }
  }
  if (touched.length === 0) return { kind: "idle" };
  return bindWorkOrderAfterMutation({ cwd, sessionId, touchedPaths: touched, config, now });
}
function closeBinding({ cwd, sessionId, config = DEFAULT_CONFIG }) {
  const live = refreshBoundWorkOrder({ cwd, sessionId, config });
  if (!["active", "inactive"].includes(live.kind)) return live;
  if (live.kind !== "active" && live.kind !== "inactive") return live;
  if (["closed", "aborted", "paused"].includes(String(live.workOrder.status))) releaseLease({ repoRoot: live.repoRoot, workOrderId: String(live.workOrder.id ?? ""), sessionId });
  return live;
}

// plugins/engineering-workflow/src/domains/debugging/hook.ts
var outputStore = new AsyncLocalStorage();
function writeJson2(output) {
  if (!output) return;
  const outputs = outputStore.getStore();
  if (!outputs) throw new Error("debugging output was emitted outside the owner dispatcher");
  outputs.push(output);
}
function warn(message) {
  process.stderr.write(`[software-debugging] ${String(message)}
`);
}
function repoRoot(cwd) {
  try {
    const top = execFileSync2("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", timeout: 5e3, stdio: ["ignore", "pipe", "ignore"] }).trim();
    return resolve6(cwd, relative2(realpathSync2(cwd), realpathSync2(top)));
  } catch {
    return resolve6(cwd);
  }
}
function shellMutates(command) {
  const withoutNullRedirects = command.replace(/(?:[0-9]*>>?|&>)\s*\/dev\/null\b/gu, "");
  return /(?:^|[;&|]\s*)(?:sed\s+(?:-[^\s]*i)|perl\s+(?:-[^\s]*i)|tee\b|cp\b|mv\b|touch\b|mkdir\b|truncate\b|git\s+(?:apply|am|merge|rebase|cherry-pick)|npm\s+(?:install|uninstall)|pnpm\s+(?:add|remove)|yarn\s+(?:add|remove))|(?:>|>>)[^&]/iu.test(withoutNullRedirects);
}
function conciseResponse(event) {
  const value = event?.tool_response ?? event?.toolResponse ?? event?.tool_result ?? event?.toolResult ?? event?.response ?? event?.error ?? "";
  return (typeof value === "string" ? value : JSON.stringify(value)).replace(/\s+/gu, " ").slice(0, 240);
}
function ensureLocalExclude(root, config) {
  if (config.ledger.persistence !== "local") return;
  try {
    const path = execFileSync2("git", ["rev-parse", "--git-path", "info/exclude"], { cwd: root, encoding: "utf8", timeout: 5e3 }).trim();
    const absolute = resolve6(root, path);
    const entry = `/${config.ledger.root}/`;
    const existing = existsSync(absolute) ? readFileSync3(absolute, "utf8") : "";
    if (!existing.split(/\r?\n/u).includes(entry)) appendFileSync(absolute, `${existing && !existing.endsWith("\n") ? "\n" : ""}${entry}
`, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : error;
    warn(`cannot update .git/info/exclude: ${message ?? error}`);
  }
}
async function context(event) {
  const cwd = eventCwd(event);
  const root = repoRoot(cwd);
  const config = await loadProjectConfig(root, warn);
  return { cwd, root, config, sessionId: extractSessionId(event) };
}
async function runSession(event) {
  const { root, config } = await context(event);
  if (config.mode === "off") return;
  const orders = scanLedgers(root, config);
  if (orders.length === 0) return;
  const lines = ["[Debugging Workflow Guard] Found resumable Debug Work Orders; none was activated."];
  for (const order of orders) lines.push(describeLedger(order, root));
  lines.push("Use the debug-workflow CLI to resume (`resume --id ...`). Hooks activate only after a writer command; do not Edit or Write the ledger.");
  writeJson2(contextOutput("SessionStart", lines.join("\n")));
}
async function runPre(event) {
  const { cwd, root, config, sessionId } = await context(event);
  if (config.mode === "off") return;
  const command = extractShellCommand(event);
  let paths = extractFileTargets2(event);
  if (command && isOfficialWriterCommand(command)) {
    return;
  }
  if (command && (shellMutates(command) || isGenericMutationCommand(command)) && commandMentionsRoot(command, config.ledger.root, resolve6(root, config.ledger.root))) {
    writeJson2(preToolDeny("[Debugging Workflow Guard] Direct ledger mutation is denied; use the debug-workflow CLI writer."));
    return;
  }
  const ledgerWrites = paths.filter((path) => isLedgerManagedPath(path, root, config));
  if (ledgerWrites.length > 0 && isMutationTool(event)) {
    writeJson2(preToolDeny("[Debugging Workflow Guard] Direct file-tool writes to a live ledger are denied; use the debug-workflow CLI writer."));
    return;
  }
  if (command && shellMutates(command)) paths = [resolve6(root, "__unknown_shell_mutation__")];
  if (paths.length === 0) return;
  const decision = preMutationDecision({ cwd, sessionId, paths, config });
  if (decision.action === "block") writeJson2(preToolDeny(`[Debugging Workflow Guard] ${decision.reason}`));
  else if (decision.action === "report") writeJson2(contextOutput("PreToolUse", `[Debugging Workflow Guard] ${decision.reason}`));
}
function responseStdout(event) {
  const response = extractToolResponse(event);
  if (typeof response === "string") return response;
  if (isRecord(response) && typeof response.stdout === "string") return response.stdout;
  return conciseResponse(event);
}
function execStatus(error) {
  return isRecord(error) ? error.status : void 0;
}
async function runPost(event, forceFailure = false) {
  const { cwd, root, config, sessionId } = await context(event);
  if (config.mode === "off") return;
  const postEvent = forceFailure ? "PostToolUseFailure" : "PostToolUse";
  const paths = extractFileTargets2(event);
  const command = extractShellCommand(event);
  if (command) {
    const bound = bindAfterWriter({ cwd, sessionId, command, stdout: responseStdout(event), config });
    if (bound.kind !== "idle") {
      if (bound.kind === "bound") {
        ensureLocalExclude(root, config);
        const boundPath = bound.state.workOrderPath ?? "";
        writeJson2(contextOutput(postEvent, `[Debugging Workflow Guard] Bound ${String(bound.workOrder.id)} at ${relative2(root, boundPath)}; state ${String(bound.workOrder.status)}/${String(bound.workOrder.run?.state)}; active bug ${bound.workOrder.activeBugId ?? "none"}.${bound.active ? " Evidence and mutations are now attributed to that bug." : " No active mutation guard remains."}`));
        closeBinding({ cwd, sessionId, config });
      } else if (bound.kind === "invalid" || bound.kind === "conflict") {
        writeJson2(contextOutput(postEvent, `[Debugging Workflow Guard] Work Order activation rejected: ${(bound.findings ?? []).join("; ")}`));
      } else if (bound.kind === "active" || bound.kind === "inactive") {
        writeJson2(contextOutput(postEvent, `[Debugging Workflow Guard] Work Order ${String(bound.workOrder.id)} refreshed; state ${String(bound.workOrder.status)}/${String(bound.workOrder.run?.state)}; active bug ${bound.workOrder.activeBugId ?? "none"}.`));
        closeBinding({ cwd, sessionId, config });
      }
      return;
    }
  }
  const ledgerTouches = paths.filter((path) => isLedgerManagedPath(path, root, config));
  if (ledgerTouches.length > 0) {
    const before = readState(sessionId, root);
    if (forceFailure && !before.bound && ledgerTouches.every((path) => !existsSync(path))) {
      writeJson2(contextOutput(postEvent, "[Debugging Workflow Guard] Work Order write failed before a file existed; workflow was not activated. Use the debug-workflow CLI writer."));
      return;
    }
    writeJson2(contextOutput(postEvent, "[Debugging Workflow Guard] Direct ledger writes do not activate the workflow; use the debug-workflow CLI writer."));
    return;
  }
  if (command) {
    const outcome = configuredOutcome(command, inferOutcome(event, forceFailure), config);
    const recorded = recordReceipt({ cwd, sessionId, config, kind: shellMutates(command) ? "mutation" : "command", command, outcome, summary: conciseResponse(event) });
    if (recorded.kind === "recorded") writeJson2(contextOutput(postEvent, `[Debugging Workflow Guard] Receipt ${recorded.receipt.id}: ${String(recorded.receipt.kind)} ${String(recorded.receipt.outcome)} for ${String(recorded.receipt.bugId)}. Cite this id only when it supports the stated claim.`));
    if (recorded.kind === "recorded" && recorded.receipt.kind === "reproduction" && outcome === "failure") {
      const count = recorded.state.attempts[String(recorded.receipt.bugId)] ?? 0;
      if (count >= config.limits.maxFailedFixAttempts) writeJson2(contextOutput(postEvent, `[Debugging Workflow Guard] ${String(recorded.receipt.bugId)} reached ${count} failed post-mutation reproductions. Move only this bug to architecture-review before another production edit.`));
    }
    return;
  }
  if (isMutationTool(event) && paths.length > 0) {
    const live = refreshBoundWorkOrder({ cwd, sessionId, config });
    if (live.kind !== "active") return;
    const codePaths = paths.filter((path) => classifyPath(path, root, config) === "code");
    if (codePaths.length > 0) {
      const recorded = recordReceipt({ cwd, sessionId, config, kind: "mutation", paths: codePaths, outcome: "success", summary: `${codePaths.length} production path(s) changed` });
      if (recorded.kind === "recorded") writeJson2(contextOutput(postEvent, `[Debugging Workflow Guard] Receipt ${recorded.receipt.id}: production mutation attributed to ${String(recorded.receipt.bugId)}.`));
    }
  }
}
async function runStop(event) {
  const { cwd, root, config, sessionId } = await context(event);
  if (config.mode === "off") return;
  const live = refreshBoundWorkOrder({ cwd, sessionId, config });
  if (live.kind === "idle") return;
  if (live.kind !== "active" && live.kind !== "inactive") {
    const reason2 = `[Debugging Workflow Guard] Bound Work Order is invalid: ${(live.findings ?? []).join("; ")}`;
    if (config.mode === "block") writeJson2(stopDeny(reason2));
    else writeJson2(contextOutput("Stop", reason2));
    return;
  }
  const message = eventAssistantMessage(event);
  const rel = relative2(root, live.state.workOrderPath ?? "").replaceAll("\\", "/");
  const findings = live.workOrder.status === "closed" ? completionFindings(live) : [];
  if (live.workOrder.status === "closed") {
    const marker = `DBG_${String(live.workOrder.id).replace(/[^A-Za-z0-9]+/gu, "_")}`;
    try {
      const matches3 = execFileSync2("git", ["grep", "--untracked", "-n", "-I", "-e", marker, "--", ".", `:!${config.ledger.root}`], { cwd: root, encoding: "utf8", timeout: 5e3, stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (matches3) findings.push(`debug instrumentation remains under marker prefix ${marker}`);
    } catch (error) {
      if (execStatus(error) !== 1 && execStatus(error) !== "1") findings.push("debug-marker cleanup scan could not complete");
    }
  }
  if (["closed", "paused", "aborted"].includes(String(live.workOrder.status)) && !message.includes(rel) && !message.includes(String(live.workOrder.id))) {
    findings.push(`response must reference ${rel} or ${String(live.workOrder.id)}`);
  }
  if (findings.length === 0) {
    closeBinding({ cwd, sessionId, config });
    return;
  }
  const reason = `[Debugging Workflow Guard] Debug workflow cannot stop:
- ${findings.join("\n- ")}
Use the debug-workflow CLI to update the ledger; do not invent receipt ids.`;
  if (config.mode === "block") writeJson2(stopDeny(reason));
  else writeJson2(contextOutput("Stop", reason));
}
async function handleSoftwareDebugging({ args, event }) {
  const mode = args[0];
  const outputs = [];
  return outputStore.run(outputs, async () => {
    if (mode === "session") await runSession(event);
    else if (mode === "pre") await runPre(event);
    else if (mode === "post") await runPost(event, false);
    else if (mode === "failure") await runPost(event, true);
    else if (mode === "stop") await runStop(event);
    else throw new Error(`unknown debugging mode: ${mode ?? "(missing)"}`);
    return outputs;
  });
}

// plugins/engineering-workflow/src/domains/specification/hook.ts
import { existsSync as existsSync2, realpathSync as realpathSync3 } from "node:fs";
import { basename as basename2, dirname as dirname3, isAbsolute as isAbsolute3, resolve as resolve7 } from "node:path";
var ARTIFACTS = /* @__PURE__ */ new Set(["spec.md", "plan.md", "tasks.md"]);
var TARGET_PATH_CODES = /* @__PURE__ */ new Set(["invalid-change-name", "invalid-spec-root", "symlink-artifact", "artifact-read-error"]);
function isArtifactName(value) {
  return value !== void 0 && ARTIFACTS.has(value);
}
function isErrno(error) {
  return isRecord(error) && typeof error.code === "string";
}
function targets(event) {
  const core = extractFileTargets(event, { includeShellWrites: true });
  if (!isShellTool(eventToolName(event))) return core;
  const cwd = resolve7(eventCwd(event));
  const extras = [];
  const command = extractShellCommand(event) ?? "";
  for (const match of command.matchAll(/\b(?:cp|mv|install)\b(?:\s+-[^\s]+)*\s+[^\s;&|]+\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    const raw = String(match[1] ?? "").trim().replace(/^['"]|['"]$/gu, "");
    if (raw && !raw.startsWith("-")) extras.push(isAbsolute3(raw) ? resolve7(raw) : resolve7(cwd, raw.replace(/^\.\//u, "")));
  }
  return [.../* @__PURE__ */ new Set([...core, ...extras])];
}
function directArtifactTarget(path, workspaceRoot) {
  const absolute = resolve7(path);
  const changeDir = dirname3(absolute);
  if (dirname3(changeDir) !== resolve7(workspaceRoot, ".specs")) return null;
  const artifact = absolute.split("/").at(-1);
  if (!isArtifactName(artifact)) return null;
  return { artifact, changeDir };
}
function canonicalPath(path) {
  let cursor = resolve7(path);
  const suffix = [];
  while (true) {
    try {
      return resolve7(realpathSync3(cursor), ...suffix);
    } catch (error) {
      if (!isErrno(error) || error.code !== "ENOENT" && error.code !== "ENOTDIR") return resolve7(path);
    }
    const parent = dirname3(cursor);
    if (parent === cursor) return resolve7(path);
    suffix.unshift(basename2(cursor));
    cursor = parent;
  }
}
function repositoryRoot(start) {
  let cursor = resolve7(start);
  while (true) {
    if (existsSync2(resolve7(cursor, ".git"))) return cursor;
    const parent = dirname3(cursor);
    if (parent === cursor) return resolve7(start);
    cursor = parent;
  }
}
function artifactTarget(path, workspaceRoot) {
  return directArtifactTarget(path, workspaceRoot) ?? directArtifactTarget(canonicalPath(path), canonicalPath(workspaceRoot));
}
function deny(reason) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `[SDD Workflow] ${reason}` } };
}
function diagnostic(text) {
  return { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: `[SDD Workflow] ${text}` } };
}
function upstreamFindings(target, inspection) {
  const findings = [];
  if (target.artifact === "plan.md") {
    if (!inspection.spec) findings.push({ code: "missing-spec", message: "Create spec.md first.", artifact: null });
    else findings.push(...inspection.spec.findings);
  }
  if (target.artifact === "tasks.md") {
    if (!inspection.spec) findings.push({ code: "missing-spec", message: "Create spec.md first.", artifact: null });
    else findings.push(...inspection.spec.findings);
    if (!inspection.plan) findings.push({ code: "missing-plan", message: "Create plan.md after spec.md.", artifact: null });
    else findings.push(...inspection.plan.findings);
  }
  return findings;
}
function targetPathFindings(target, inspection) {
  return inspection.findings.filter((item) => TARGET_PATH_CODES.has(item.code) && (item.artifact === target.artifact || item.artifact === target.changeDir.split("/").at(-1)));
}
function evaluateHook(mode, event) {
  const rawCwd = event?.cwd;
  const workspaceRoot = repositoryRoot(typeof rawCwd === "string" ? rawCwd : rawCwd == null ? process.cwd() : String(rawCwd));
  const resolvedTargets = targets(event ?? {});
  const artifacts = resolvedTargets.map((path) => artifactTarget(path, workspaceRoot)).filter((target) => target !== null);
  if (artifacts.length === 0) return null;
  if (mode === "pre") {
    const command = isShellTool(eventToolName(event ?? {})) ? String(extractShellCommand(event ?? {}) ?? "") : "";
    if (command && /(?:&&|\|\||;|\n)/u.test(command)) return deny("Compound shell writes that target .specs artifacts are not safe; write one artifact per tool call.");
    for (const target of artifacts) {
      const sameChange = artifacts.filter((candidate) => candidate.changeDir === target.changeDir).map(({ artifact }) => artifact);
      if (target.artifact === "plan.md" && sameChange.includes("spec.md") || target.artifact === "tasks.md" && (sameChange.includes("spec.md") || sameChange.includes("plan.md"))) {
        return deny("A single tool call cannot change an upstream artifact and its downstream artifact together.");
      }
      const inspection = inspectChange(target.changeDir);
      const findings = [...targetPathFindings(target, inspection), ...upstreamFindings(target, inspection)];
      if (findings.length > 0) return deny(`${target.artifact} is blocked: ${formatFindings(findings)}`);
    }
    return null;
  }
  if (mode === "post") {
    const messages = [];
    for (const target of artifacts) {
      const inspection = inspectChange(target.changeDir);
      const result = target.artifact === "spec.md" ? inspection.spec : target.artifact === "plan.md" ? inspection.plan : inspection.tasks;
      if (!result) messages.push(`${target.artifact} is missing after the write.`);
      else if (result.findings.length > 0) messages.push(`${target.artifact} is invalid: ${formatFindings(result.findings)}`);
    }
    return messages.length > 0 ? diagnostic(messages.join(" ")) : null;
  }
  return null;
}
function handleSpecification({ args, event }) {
  return evaluateHook(args[0] ?? "pre", event);
}

// plugins/engineering-workflow/src/domains/testing/hook.ts
import { AsyncLocalStorage as AsyncLocalStorage2 } from "node:async_hooks";
import { readFileSync as readFileSync7 } from "node:fs";
import { isAbsolute as isAbsolute5, relative as relative6, resolve as resolve12, sep } from "node:path";

// plugins/engineering-workflow/src/domains/testing/lib/hook-io.ts
import { basename as basename3, isAbsolute as isAbsolute4, join as join2, relative as relative3, resolve as resolve8 } from "node:path";

// core/src/shell-parse.ts
function decodeAnsiCQuoteEscape(command, slashIndex) {
  const marker = command[slashIndex + 1] ?? "";
  const simple = /* @__PURE__ */ new Map([
    ["a", "\x07"],
    ["b", "\b"],
    ["e", "\x1B"],
    ["E", "\x1B"],
    ["f", "\f"],
    ["n", "\n"],
    ["r", "\r"],
    ["t", "	"],
    ["v", "\v"],
    ["\\", "\\"],
    ["'", "'"],
    ['"', '"']
  ]);
  if (simple.has(marker)) {
    return { value: simple.get(marker) ?? "", endIndex: slashIndex + 1 };
  }
  const numeric = marker === "x" ? command.slice(slashIndex + 2).match(/^[0-9a-f]{1,2}/iu) : marker === "u" ? command.slice(slashIndex + 2).match(/^[0-9a-f]{1,4}/iu) : marker === "U" ? command.slice(slashIndex + 2).match(/^[0-9a-f]{1,8}/iu) : command.slice(slashIndex + 1).match(/^[0-7]{1,3}/u);
  if (numeric?.[0]) {
    const radix = marker === "x" || marker === "u" || marker === "U" ? 16 : 8;
    const codePoint = Number.parseInt(numeric[0], radix);
    if (codePoint <= 1114111) {
      const offset = marker === "x" || marker === "u" || marker === "U" ? 2 : 1;
      return {
        value: String.fromCodePoint(codePoint),
        endIndex: slashIndex + offset + numeric[0].length - 1
      };
    }
  }
  if (marker === "\n") return { value: "", endIndex: slashIndex + 1 };
  return { value: `\\${marker}`, endIndex: slashIndex + 1 };
}
var EMPTY_OPTIONS = /* @__PURE__ */ new Set();
var SIMPLE_COMMAND_WRAPPERS = /* @__PURE__ */ new Set(["command", "exec", "nohup", "busybox", "time"]);
var SUDO_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-C",
  "-D",
  "-g",
  "-h",
  "-p",
  "-R",
  "-T",
  "-u",
  "--chdir",
  "--close-from",
  "--group",
  "--host",
  "--prompt",
  "--role",
  "--type",
  "--user"
]);
var ENV_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-C",
  "-S",
  "-u",
  "--chdir",
  "--split-string",
  "--unset"
]);
var XARGS_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-a",
  "-d",
  "-E",
  "-I",
  "-L",
  "-n",
  "-P",
  "-s",
  "--arg-file",
  "--delimiter",
  "--eof",
  "--max-args",
  "--max-chars",
  "--max-lines",
  "--max-procs",
  "--replace"
]);
var TIMEOUT_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-s",
  "--signal",
  "-k",
  "--kill-after"
]);
var NICE_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set(["-n", "--adjustment"]);
var STDBUF_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-i",
  "--input",
  "-o",
  "--output",
  "-e",
  "--error"
]);
var IONICE_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-c",
  "--class",
  "-n",
  "--classdata",
  "-p",
  "--pid"
]);
var COMMAND_SEPARATORS = /* @__PURE__ */ new Set(["&&", "||", ";", "|", "&"]);
function skipWrapperOptions(tokens, start, optionsWithValue) {
  let index = start;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token?.startsWith("-")) break;
    if (token === "--") return index + 1;
    index += optionsWithValue.has(token) ? 2 : 1;
  }
  return index;
}
function tokenBasename(token) {
  return token.split("/").at(-1) ?? "";
}
function commandInvocation(tokens) {
  let index = 0;
  let stdinDriven = false;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token) break;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(token)) {
      index += 1;
      continue;
    }
    const name = tokenBasename(token);
    if (SIMPLE_COMMAND_WRAPPERS.has(name)) {
      index = skipWrapperOptions(tokens, index + 1, EMPTY_OPTIONS);
      continue;
    }
    if (name === "sudo") {
      index = skipWrapperOptions(tokens, index + 1, SUDO_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "env") {
      index = skipWrapperOptions(tokens, index + 1, ENV_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "xargs") {
      stdinDriven = true;
      index = skipWrapperOptions(tokens, index + 1, XARGS_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "timeout") {
      index = skipWrapperOptions(tokens, index + 1, TIMEOUT_OPTIONS_WITH_VALUE);
      if (index < tokens.length && tokens[index] && !COMMAND_SEPARATORS.has(tokens[index] ?? "")) {
        index += 1;
      }
      continue;
    }
    if (name === "nice") {
      index = skipWrapperOptions(tokens, index + 1, NICE_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "stdbuf") {
      index = skipWrapperOptions(tokens, index + 1, STDBUF_OPTIONS_WITH_VALUE);
      continue;
    }
    if (name === "ionice") {
      index = skipWrapperOptions(tokens, index + 1, IONICE_OPTIONS_WITH_VALUE);
      continue;
    }
    return {
      executable: name || token,
      args: tokens.slice(index + 1),
      stdinDriven
    };
  }
  return null;
}
function tokenizeShell(command) {
  const tokens = [];
  let current = "";
  let tokenStarted = false;
  let quote = null;
  let ansiCQuote = false;
  let escaped = false;
  const pushCurrent = () => {
    if (tokenStarted) {
      tokens.push(current);
      current = "";
      tokenStarted = false;
    }
  };
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index] ?? "";
    const next = command[index + 1];
    if (escaped) {
      current += char;
      tokenStarted = true;
      escaped = false;
      continue;
    }
    if (quote) {
      if (ansiCQuote && char === "\\") {
        const decoded = decodeAnsiCQuoteEscape(command, index);
        current += decoded.value;
        tokenStarted = true;
        index = decoded.endIndex;
        continue;
      }
      if (quote === '"' && char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = null;
        ansiCQuote = false;
        continue;
      }
      current += char;
      tokenStarted = true;
      continue;
    }
    if (char === "$" && (next === '"' || next === "'")) {
      quote = next;
      ansiCQuote = next === "'";
      tokenStarted = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      tokenStarted = true;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      tokenStarted = true;
      continue;
    }
    if (/\s/u.test(char)) {
      pushCurrent();
      continue;
    }
    if (char === "#" && !tokenStarted) break;
    if (char === "&" && next === "&") {
      pushCurrent();
      tokens.push("&&");
      index += 1;
      continue;
    }
    if (char === "&") {
      pushCurrent();
      tokens.push("&");
      continue;
    }
    if (char === "|" && next === "|") {
      pushCurrent();
      tokens.push("||");
      index += 1;
      continue;
    }
    if (char === ";" || char === "|") {
      pushCurrent();
      tokens.push(char);
      continue;
    }
    current += char;
    tokenStarted = true;
  }
  pushCurrent();
  return tokens;
}
function splitShellLogicalLines(command) {
  const lines = [];
  let current = "";
  let quote = null;
  let escaped = false;
  for (const char of command) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === "\n") {
      if (current.trim()) lines.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) lines.push(current);
  return lines;
}
function shellCommandInvocations(command) {
  const invocations2 = [];
  for (const logicalLine of splitShellLogicalLines(command)) {
    const tokens = tokenizeShell(logicalLine);
    let segment = [];
    for (let index = 0; index <= tokens.length; index += 1) {
      const token = tokens[index];
      if (token !== void 0 && !COMMAND_SEPARATORS.has(token)) {
        segment.push(token);
        continue;
      }
      const invocation = commandInvocation(segment);
      if (invocation) invocations2.push(invocation);
      segment = [];
    }
  }
  return invocations2;
}

// plugins/engineering-workflow/src/domains/testing/lib/hook-io.ts
function cwdOf(event) {
  const raw = event.cwd ?? event.working_directory ?? event.workingDirectory;
  if (raw !== void 0 && raw !== null && typeof raw !== "string") return resolve8(raw);
  return resolve8(eventCwd(event));
}
function toolNameOf(event) {
  return canonicalToolName(eventToolName(event));
}
function toolInputOf(event) {
  return eventToolInput(event);
}
function shellCommandOf(event) {
  return extractShellCommand(event);
}
function stripQuotes(value) {
  const text = String(value ?? "").trim();
  if (text.length >= 2 && (text.startsWith('"') && text.endsWith('"') || text.startsWith("'") && text.endsWith("'"))) return text.slice(1, -1);
  return text;
}
function nestedPaths(input) {
  if (!isRecord(input)) return [];
  const paths = [];
  for (const key of ["file_path", "filePath", "path", "target_file", "output_file", "notebook_path"]) {
    const value = input[key];
    if (typeof value === "string" && value) paths.push(value);
  }
  if (Array.isArray(input.edits)) for (const edit of input.edits) paths.push(...nestedPaths(edit));
  return paths;
}
function patchPaths2(input) {
  const text = patchText(input);
  const paths = [];
  for (const line of text.split("\n")) {
    const file = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u);
    if (file?.[1]) paths.push(stripQuotes(file[1]));
    const move = line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (move?.[1]) paths.push(stripQuotes(move[1]));
  }
  return paths;
}
function patchText(input) {
  if (typeof input === "string") return input;
  if (!isRecord(input)) return "";
  return [input.patch, input.input, input.command].filter((value) => typeof value === "string").join("\n");
}
function contentFromPatch(input, target, cwd, currentText) {
  const targetPath = resolve8(target);
  let active = false;
  let targetMode = "";
  const added = [];
  for (const line of patchText(input).split("\n")) {
    const file = line.match(/^\*\*\*\s+(Add|Update|Delete) File:\s+(.+)$/u);
    if (file?.[1] && file[2]) {
      active = resolve8(cwd, stripQuotes(file[2])) === targetPath;
      if (active) targetMode = file[1].toLowerCase();
      continue;
    }
    if (/^\*\*\*\s+/u.test(line)) {
      active = false;
      continue;
    }
    if (active && line.startsWith("+") && !line.startsWith("+++")) added.push(line.slice(1));
  }
  if (targetMode === "add" && added.length > 0) return added.join("\n");
  if (targetMode === "update" && added.length > 0) return `${currentText}
${added.join("\n")}`;
  return currentText;
}
function invocations(command, names) {
  const found = [];
  for (const invocation of shellCommandInvocations(String(command ?? ""))) {
    if (!names.has(invocation.executable)) continue;
    const operands = [];
    let optionsEnded = false;
    for (const token of invocation.args) {
      if (!optionsEnded && token === "--") {
        optionsEnded = true;
        continue;
      }
      if (!optionsEnded && token.startsWith("-")) continue;
      if (token) operands.push(token);
    }
    found.push(operands);
  }
  return found;
}
function sedInPlacePaths(command) {
  const paths = [];
  for (const invocation of shellCommandInvocations(String(command ?? ""))) {
    if (invocation.executable !== "sed") continue;
    const args = invocation.args;
    let inPlace = false;
    let programFromOption = false;
    const positional = [];
    for (let cursor = 0; cursor < args.length; cursor += 1) {
      const argument = args[cursor] ?? "";
      if (argument === "--") {
        positional.push(...args.slice(cursor + 1).filter(Boolean));
        break;
      }
      if (argument === "-i" || /^-[^-]*i/u.test(argument) || argument === "--in-place" || argument.startsWith("--in-place=")) {
        inPlace = true;
        if (argument === "-i" && /^(?:|\.[^/]+)$/u.test(args[cursor + 1] ?? "")) cursor += 1;
        continue;
      }
      if (argument === "-e" || argument === "--expression" || argument === "-f" || argument === "--file") {
        programFromOption = true;
        cursor += 1;
        continue;
      }
      if (/^(?:-e|--expression=|-f|--file=)/u.test(argument)) {
        programFromOption = true;
        continue;
      }
      if (argument.startsWith("-")) continue;
      positional.push(argument);
    }
    if (inPlace) paths.push(...programFromOption ? positional : positional.slice(1));
  }
  return paths;
}
function copyInstallTargets(command) {
  const paths = [];
  for (const invocation of shellCommandInvocations(String(command ?? ""))) {
    if (invocation.executable !== "cp" && invocation.executable !== "install") continue;
    const operands = [];
    let targetDirectory = null;
    for (let cursor = 0; cursor < invocation.args.length; cursor += 1) {
      const argument = invocation.args[cursor] ?? "";
      if (argument === "--") {
        operands.push(...invocation.args.slice(cursor + 1).filter(Boolean));
        break;
      }
      if (argument === "-t" || argument === "--target-directory") {
        targetDirectory = invocation.args[cursor + 1] ?? null;
        cursor += 1;
        continue;
      }
      if (argument.startsWith("--target-directory=")) {
        targetDirectory = argument.slice("--target-directory=".length) || null;
        continue;
      }
      if (/^-t.+/u.test(argument)) {
        targetDirectory = argument.slice(2) || null;
        continue;
      }
      if (argument.startsWith("-")) continue;
      operands.push(argument);
    }
    if (targetDirectory) {
      paths.push(targetDirectory, ...operands.map((source) => join2(targetDirectory, basename3(source))));
      continue;
    }
    if (operands.length < 2) continue;
    const destination = operands.at(-1) ?? "";
    paths.push(destination, ...operands.slice(0, -1).map((source) => join2(destination, basename3(source))));
  }
  return paths;
}
function shellPaths(input) {
  const command = String(input.command ?? input.cmd ?? "");
  const paths = [];
  const push = (raw) => {
    const value = String(raw ?? "").trim().replace(/^['"]|['"]$/gu, "");
    if (value && !value.startsWith("-")) paths.push(value);
  };
  for (const match of command.matchAll(/(?:^|[^0-9>])>{1,2}\s*("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  for (const match of command.matchAll(/\btee\b(?:\s+-[A-Za-z]+)*\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  for (const match of command.matchAll(/\btouch\b(?:\s+--)?\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  for (const match of command.matchAll(/\bwriteFile(?:Sync)?\s*\(\s*["']([^"']+)["']/gu)) push(match[1]);
  for (const match of command.matchAll(/\bopen\s*\(\s*["']([^"']+)["']\s*,\s*(?:mode\s*=\s*)?["']([^"']+)["']/gu)) {
    if (/[wax+]/iu.test(match[2] ?? "")) push(match[1]);
  }
  for (const operands of invocations(command, /* @__PURE__ */ new Set(["rm", "unlink"]))) {
    for (const path of operands) push(path);
  }
  for (const operands of invocations(command, /* @__PURE__ */ new Set(["mv"]))) {
    for (const path of operands) push(path);
  }
  for (const path of copyInstallTargets(command)) push(path);
  for (const path of sedInPlacePaths(command)) push(path);
  return paths;
}
function gitSubcommand(args) {
  let cursor = 0;
  while (cursor < args.length) {
    const token = args[cursor] ?? "";
    if (["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env"].includes(token)) {
      cursor += 2;
      continue;
    }
    if (/^--(?:git-dir|work-tree|namespace|config-env)=/u.test(token)) {
      cursor += 1;
      continue;
    }
    break;
  }
  return { command: args[cursor] ?? "", args: args.slice(cursor + 1) };
}
function opaqueShellMutation(event) {
  const command = shellCommandOf(event);
  if (!command) return null;
  for (const invocation of shellCommandInvocations(command)) {
    if (invocation.executable === "git") {
      const git = gitSubcommand(invocation.args);
      if (git.command === "apply" && !git.args.some((argument) => ["--check", "--stat", "--numstat", "--summary"].includes(argument))) {
        return "git apply can mutate implementation paths that are not visible in the hook event";
      }
    }
    if (invocation.executable === "patch" && !invocation.args.includes("--dry-run")) {
      return "patch can mutate implementation paths that are not visible in the hook event";
    }
  }
  return null;
}
function resolvedEquals(cwd, rawPath, absolutePath) {
  return resolve8(cwd, stripQuotes(rawPath)) === resolve8(absolutePath);
}
function extractTargets(event) {
  const name = toolNameOf(event);
  const input = toolInputOf(event);
  const raw = isFileMutationTool(name) ? [...nestedPaths(input), ...patchPaths2(input)] : isShellTool(name) ? shellPaths(input) : [];
  const cwd = cwdOf(event);
  return [...new Set(raw.map(stripQuotes).filter(Boolean).map((path) => isAbsolute4(path) ? resolve8(path) : resolve8(cwd, path.replace(/^\.\//u, ""))))];
}
function targetOperation(event, absolutePath) {
  const cwd = cwdOf(event);
  const input = toolInputOf(event);
  for (const line of patchText(input).split("\n")) {
    const file = line.match(/^\*\*\*\s+Delete File:\s+(.+)$/u);
    if (file?.[1] && resolvedEquals(cwd, file[1], absolutePath)) return "delete";
  }
  const command = shellCommandOf(event);
  if (command) {
    for (const operands of invocations(command, /* @__PURE__ */ new Set(["rm", "unlink"]))) {
      if (operands.some((path) => resolvedEquals(cwd, path, absolutePath))) return "delete";
    }
    for (const operands of invocations(command, /* @__PURE__ */ new Set(["mv"]))) {
      const sources = operands.length > 1 ? operands.slice(0, -1) : operands;
      if (sources.some((path) => resolvedEquals(cwd, path, absolutePath))) return "delete";
    }
  }
  return "write";
}
function proposedContent(event, target, currentText = "") {
  const input = toolInputOf(event);
  const paths = nestedPaths(input).map((path) => resolve8(cwdOf(event), path));
  if (paths.includes(resolve8(target)) && typeof input.content === "string") return input.content;
  if (paths.includes(resolve8(target)) && typeof input.new_string === "string" && typeof input.old_string === "string" && currentText.includes(input.old_string)) {
    return currentText.replace(input.old_string, input.new_string);
  }
  return contentFromPatch(input, target, cwdOf(event), currentText);
}
function relativePath(root, path) {
  return relative3(root, resolve8(path)).replaceAll("\\", "/") || ".";
}

// plugins/engineering-workflow/src/domains/testing/lib/existing-tests.ts
import { lstatSync, readdirSync, readFileSync as readFileSync5 } from "node:fs";
import { join as join3, relative as relative5, resolve as resolve10 } from "node:path";

// plugins/engineering-workflow/src/domains/testing/lib/patterns.ts
import { existsSync as existsSync3, readFileSync as readFileSync4 } from "node:fs";
import { dirname as dirname4, posix, relative as relative4, resolve as resolve9 } from "node:path";
var SKIPPED = /(?:^|\/)(?:\.git|\.cache|\.next|\.nuxt|\.venv|__generated__|artifacts|build|coverage|dist|generated|node_modules|target|vendor)(?:\/|$)/iu;
var TEST_DIRECTORY = /(?:^|\/)(?:test|tests|spec|specs|__tests__)(?:\/|$)/iu;
var TEST_ROOTS = /* @__PURE__ */ new Set(["test", "tests", "spec", "specs"]);
var SOURCE_ROOTS = /* @__PURE__ */ new Set(["app", "lib", "src"]);
var SUITE_DIRECTORIES = /* @__PURE__ */ new Set(["acceptance", "feature", "functional", "integration", "unit"]);
var EXTENSIONS = [
  ["typescript", /\.(?:cts|mts|ts|tsx)$/iu],
  ["javascript", /\.(?:cjs|js|jsx|mjs)$/iu],
  ["python", /\.(?:py|pyi)$/iu],
  ["php", /\.php$/iu],
  ["rust", /\.rs$/iu],
  ["go", /\.go$/iu]
];
var RESERVED = /* @__PURE__ */ new Set([
  "assert",
  "class",
  "const",
  "def",
  "describe",
  "extends",
  "false",
  "final",
  "from",
  "function",
  "import",
  "interface",
  "namespace",
  "new",
  "null",
  "package",
  "public",
  "require",
  "return",
  "self",
  "static",
  "struct",
  "test",
  "this",
  "trait",
  "true",
  "type",
  "use",
  "void"
]);
function normalize(path) {
  return String(path ?? "").replaceAll("\\", "/").replace(/^\.\//u, "");
}
function isSkippedPath(path) {
  return SKIPPED.test(normalize(path));
}
function insideRoot(root, path) {
  const value = relative4(resolve9(root), resolve9(path));
  return value === "" || !value.startsWith("..") && !value.startsWith("/");
}
function nearestManifest(root, path, name) {
  const workspace = resolve9(root);
  let directory = resolve9(workspace, dirname4(normalize(path)));
  while (insideRoot(workspace, directory)) {
    const candidate = resolve9(directory, name);
    if (existsSync3(candidate)) return candidate;
    if (directory === workspace) break;
    directory = dirname4(directory);
  }
  return null;
}
function relativeDirectory(root, path) {
  const value = normalize(relative4(resolve9(root), dirname4(resolve9(path))));
  return value === "." ? "" : value;
}
function tomlSection(text, name) {
  const header = new RegExp(`^\\[${name}\\]\\s*$`, "mu").exec(text);
  if (!header) return "";
  const remainder = text.slice(header.index + header[0].length);
  const next = /^\s*\[[^\]]+\]\s*$/mu.exec(remainder);
  return next ? remainder.slice(0, next.index) : remainder;
}
function resolveLanguageContext(root, path, language) {
  if (language === "python") {
    const module = sourceModule(path);
    const separator = module.lastIndexOf(".");
    if (separator < 0) return {};
    const packageName = module.slice(0, separator);
    const initializer = resolve9(root, dirname4(normalize(path)), "__init__.py");
    if (!insideRoot(root, initializer) || !existsSync3(initializer)) return {};
    const reexports = [];
    const text = withoutComments("python", readFileSync4(initializer, "utf8"));
    for (const match of text.matchAll(/^\s*from\s+([.A-Za-z_][A-Za-z0-9_.]*)\s+import\s+([^\n#]+)/gmu)) {
      const specifier = match[1] ?? "";
      const dots = specifier.match(/^\.+/u)?.[0].length ?? 0;
      const imported = dots === 0 ? specifier : [
        ...packageName.split(".").slice(0, Math.max(0, packageName.split(".").length - dots + 1)),
        specifier.slice(dots)
      ].filter(Boolean).join(".");
      if (imported !== module) continue;
      for (const item of (match[2] ?? "").replace(/[()]/gu, "").split(",")) {
        const binding = item.trim().match(/^(\*|[A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/u);
        if (binding?.[1]) {
          reexports.push({
            sourceSymbol: binding[1],
            publicTarget: `python:${packageName}#${binding[2] ?? binding[1]}`
          });
        }
      }
    }
    return { pythonReexports: reexports };
  }
  if (language === "rust") {
    const manifest = nearestManifest(root, path, "Cargo.toml");
    if (!manifest) return {};
    const text = readFileSync4(manifest, "utf8");
    const libraryName = tomlSection(text, "lib").match(/^\s*name\s*=\s*["']([^"']+)["']/mu)?.[1];
    const packageName = tomlSection(text, "package").match(/^\s*name\s*=\s*["']([^"']+)["']/mu)?.[1];
    const name = libraryName ?? packageName;
    if (!name) return {};
    return { rustCrateName: name.replaceAll("-", "_"), rustCrateRoot: relativeDirectory(root, manifest) };
  }
  if (language === "go") {
    const manifest = nearestManifest(root, path, "go.mod");
    if (!manifest) return {};
    const modulePath = readFileSync4(manifest, "utf8").match(/^\s*module\s+(\S+)/mu)?.[1];
    if (!modulePath) return {};
    return { goModulePath: modulePath, goModuleRoot: relativeDirectory(root, manifest) };
  }
  return {};
}
function languageFor(path) {
  for (const [language, pattern] of EXTENSIONS) if (pattern.test(path)) return language;
  return null;
}
function isTestPath(path, language) {
  const name = posix.basename(path);
  if (language === "php") return TEST_DIRECTORY.test(path) || /Test\.php$/u.test(name);
  if (language === "python") return TEST_DIRECTORY.test(path) || /^test_.+\.py$/u.test(name) || /_test\.py$/u.test(name);
  if (["javascript", "typescript"].includes(language)) {
    return TEST_DIRECTORY.test(path) || /\.(?:test|spec)\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/iu.test(name);
  }
  if (language === "rust") return TEST_DIRECTORY.test(path);
  if (language === "go") return /_test\.go$/u.test(name);
  return false;
}
function classifyPath2(path) {
  const value = normalize(path);
  if (!value || SKIPPED.test(value) || /(?:^|\/)\.test-driven-development\.mjs$/u.test(value)) {
    return { kind: "ignored", language: null };
  }
  const language = languageFor(value);
  if (!language) return { kind: "ignored", language: null };
  return { kind: isTestPath(value, language) ? "test" : "source", language };
}
function matches2(text, pattern, group = 1) {
  const found = [];
  for (const match of String(text ?? "").matchAll(pattern)) {
    const value = match[group];
    if (value) found.push(value);
  }
  return found;
}
function unique(values) {
  return [...new Set(values.filter((value) => Boolean(value)))];
}
function identifiers(text) {
  return unique(matches2(text, /\b([A-Za-z_$][A-Za-z0-9_$]{2,})\b/gu).filter((value) => !RESERVED.has(value.toLowerCase())));
}
function withoutComments(language, text) {
  let value = String(text ?? "");
  if (["php", "javascript", "typescript", "rust", "go"].includes(language)) {
    value = value.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*$/gmu, "");
  }
  if (language === "python") return value.replace(/#.*$/gmu, "");
  if (language === "php") return value.replace(/#(?!\[).*$/gmu, "");
  return value;
}
function testNames(language, text) {
  if (language === "php") {
    return [
      ...matches2(text, /\bfunction\s+(test[A-Za-z0-9_]*)\s*\(/gu),
      ...matches2(text, /#\s*\[\s*Test\s*\][\s\S]{0,160}?\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/gu),
      ...matches2(text, /\b(?:it|test)\s*\(\s*["']([^"']+)["']/gu)
    ];
  }
  if (language === "python") return matches2(text, /^\s*def\s+(test_[A-Za-z0-9_]*)\s*\(/gmu);
  if (["javascript", "typescript"].includes(language)) {
    return matches2(text, /\b(?:it|test)\s*\(\s*["'`]([^"'`]+)["'`]/gu);
  }
  if (language === "rust") return matches2(text, /#\s*\[\s*test\s*\][\s\S]{0,160}?\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gu);
  if (language === "go") return matches2(text, /\bfunc\s+(Test[A-Za-z0-9_]*)\s*\(/gu);
  return [];
}
function identifierUsed(text, identifier) {
  if (!identifier) return false;
  return new RegExp(`\\b${identifier.replace(/[$]/gu, "\\$")}\\b`, "u").test(text);
}
function phpNamespace(code) {
  return code.match(/\bnamespace\s+([A-Za-z_\\][A-Za-z0-9_\\]*)\s*[;{]/u)?.[1]?.replace(/^\\/u, "") ?? "";
}
function phpImports(code) {
  const imports = /* @__PURE__ */ new Map();
  for (const match of code.matchAll(/^\s*use\s+(?!function\b|const\b)([A-Za-z_\\][A-Za-z0-9_\\]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*;/gmu)) {
    const qualified = (match[1] ?? "").replace(/^\\/u, "");
    imports.set(match[2] ?? qualified.split("\\").at(-1) ?? "", qualified);
  }
  return imports;
}
function resolvePhpName(name, namespace, imports) {
  const value = String(name ?? "").trim();
  if (!value) return "";
  if (value.startsWith("\\")) return value.slice(1);
  const [head, ...tail] = value.split("\\");
  if (head !== void 0 && imports.has(head)) return [imports.get(head), ...tail].join("\\");
  return namespace ? `${namespace}\\${value}` : value;
}
function phpCoverageTargets(raw, code) {
  const namespace = phpNamespace(code);
  const imports = phpImports(code);
  const targets2 = [];
  for (const reference of matches2(code, /\bCoversClass\s*\(\s*([\\A-Za-z_][\\A-Za-z0-9_]*)\s*::class\s*\)/gu)) {
    targets2.push(`php:${resolvePhpName(reference, namespace, imports)}`);
  }
  for (const reference of matches2(raw, /@covers\s+([\\A-Za-z_][\\A-Za-z0-9_]*)(?:::[A-Za-z_][A-Za-z0-9_]*)?/gu)) {
    targets2.push(`php:${resolvePhpName(reference, namespace, imports)}`);
  }
  return unique(targets2);
}
function pythonImportModule(specifier, testPath) {
  const dots = specifier.match(/^\.+/u)?.[0].length ?? 0;
  if (dots === 0) return specifier;
  const packageSegments = stripExtension(testPath).split("/");
  packageSegments.pop();
  const keep = packageSegments.length - dots + 1;
  if (keep < 0) return "";
  return [
    ...packageSegments.slice(0, keep),
    specifier.slice(dots)
  ].filter(Boolean).join(".");
}
function pythonTargets(code, testPath) {
  const body = code.replace(/^\s*(?:from\s+[^\n]+\s+import\s+[^\n]+|import\s+[^\n]+)$/gmu, "");
  const targets2 = [];
  for (const match of code.matchAll(/^\s*from\s+([.A-Za-z_][A-Za-z0-9_.]*)\s+import\s+([^\n#]+)/gmu)) {
    const importedModule = pythonImportModule(match[1] ?? "", testPath);
    if (!importedModule) continue;
    for (const item of (match[2] ?? "").replace(/[()]/gu, "").split(",")) {
      const binding = item.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/u);
      if (binding && identifierUsed(body, binding[2] ?? binding[1])) {
        targets2.push(`python:${importedModule}#${binding[1]}`);
        if (/^[a-z_][a-z0-9_]*$/u.test(binding[1] ?? "")) {
          const namespaceModule = `${importedModule}.${binding[1]}`;
          targets2.push(`python-module:${namespaceModule}`);
          const local = binding[2] ?? binding[1] ?? "";
          for (const member of matches2(body, new RegExp(`\\b${local}\\.([A-Za-z_][A-Za-z0-9_]*)`, "gu"))) {
            targets2.push(`python:${namespaceModule}#${member}`);
          }
        }
      }
    }
  }
  for (const match of code.matchAll(/^\s*import\s+([A-Za-z_][A-Za-z0-9_.]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*$/gmu)) {
    const local = match[2] ?? match[1]?.split(".")[0];
    if (identifierUsed(body, local)) targets2.push(`python-module:${match[1]}`);
  }
  return unique(targets2);
}
function stripExtension(path) {
  return normalize(path).replace(/\.(?:cjs|cts|js|jsx|mjs|mts|php|py|pyi|rs|ts|tsx|go)$/iu, "");
}
function javascriptTargets(code, testPath) {
  const body = code.replace(/\bimport\s+[\s\S]*?\s+from\s+["'][^"']+["']\s*;?/gu, "").replace(/\b(?:const|let|var)\s+[^=]+?=\s*require\s*\(\s*["'][^"']+["']\s*\)\s*;?/gu, "");
  const targets2 = [];
  const addModule = (specifier, bindings) => {
    if (!specifier.startsWith(".")) return;
    if (!bindings.some((binding) => identifierUsed(body, binding))) return;
    const resolved = stripExtension(posix.normalize(posix.join(posix.dirname(normalize(testPath)), specifier)));
    targets2.push(`javascript-module:${resolved}`);
  };
  for (const match of code.matchAll(/\bimport\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/gu)) {
    const clause = (match[1] ?? "").replace(/^type\s+/u, "").trim();
    const bindings = [];
    const namespace = clause.match(/^\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/u);
    if (namespace?.[1]) bindings.push(namespace[1]);
    const named = clause.match(/\{([\s\S]*?)\}/u)?.[1] ?? "";
    for (const item of named.split(",")) {
      const binding = item.trim().replace(/^type\s+/u, "").match(/^([A-Za-z_$][A-Za-z0-9_$]*)(?:\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*))?$/u);
      if (binding) bindings.push(binding[2] ?? binding[1] ?? "");
    }
    const defaultBinding = clause.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:,|$)/u)?.[1];
    if (defaultBinding) bindings.push(defaultBinding);
    addModule(match[2] ?? "", bindings);
  }
  for (const match of code.matchAll(/\b(?:const|let|var)\s+(.+?)\s*=\s*require\s*\(\s*["']([^"']+)["']\s*\)/gu)) {
    const bindings = identifiers(match[1] ?? "");
    addModule(match[2] ?? "", bindings);
  }
  const sourceReaders = /* @__PURE__ */ new Set(["readFileSync"]);
  for (const match of code.matchAll(/\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(\s*([A-Za-z_$][A-Za-z0-9_$]*)(?:\s*:[^,)]*)?[^)]*\)\s*(?::[^{]+)?\{([\s\S]{0,1200}?)\n?\}/gu)) {
    const helper = match[1] ?? "";
    const parameter = match[2] ?? "";
    const helperBody = match[3] ?? "";
    const escapedParameter = parameter.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const readsParameter = new RegExp(`\\breadFileSync\\s*\\([^;\\n]{0,500}\\b${escapedParameter}\\b[^;\\n]{0,500}\\)`, "u").test(helperBody);
    if (readsParameter) sourceReaders.add(helper);
  }
  for (const match of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\(\s*["']([^"']+)["']\s*\)/gu)) {
    const binding = match[1] ?? "";
    const reader = match[2] ?? "";
    const sourcePath = normalize(match[3] ?? "");
    const remainder = code.slice((match.index ?? 0) + match[0].length);
    if (!sourceReaders.has(reader) || !identifierUsed(remainder, binding) || !/^(?:app|lib|src)\//u.test(sourcePath)) continue;
    targets2.push(`javascript-module:${stripExtension(sourcePath)}`);
  }
  return unique(targets2);
}
function rustTargets(code, context2) {
  const body = code.replace(/^\s*use\s+[^;]+;\s*$/gmu, "");
  const crateName = String(context2.rustCrateName ?? "");
  const crateRoot = normalize(context2.rustCrateRoot ?? "");
  if (!crateName) return [];
  const targets2 = [];
  for (const match of code.matchAll(/^\s*use\s+([^;]+)\s*;/gmu)) {
    const expression = (match[1] ?? "").trim();
    const grouped = expression.match(/^(.+?)::\{(.+)\}$/u);
    const paths = grouped ? (grouped[2] ?? "").split(",").map((item) => `${grouped[1]}::${item.trim()}`) : [expression];
    for (const path of paths) {
      const alias = path.match(/\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/u)?.[1];
      const segments = path.replace(/\s+as\s+[A-Za-z_][A-Za-z0-9_]*$/u, "").split("::");
      const item = segments.pop();
      if (!identifierUsed(body, alias ?? item)) continue;
      const importedCrate = segments.shift()?.replaceAll("-", "_");
      if (importedCrate !== crateName.replaceAll("-", "_")) continue;
      targets2.push(`rust:${crateRoot}:${crateName}#${segments.join("::")}#${item}`);
    }
  }
  return unique(targets2);
}
function goPackage(code) {
  return code.match(/^\s*package\s+([A-Za-z_][A-Za-z0-9_]*)/mu)?.[1] ?? "";
}
function goTargets(code) {
  const body = code.replace(/^\s*import\s+(?:\([^)]*\)|[^\n]+)$/gmu, "");
  const targets2 = [];
  for (const match of code.matchAll(/^\s*(?:import\s+)?(?:([A-Za-z_][A-Za-z0-9_]*)\s+)?"([^"]+)"\s*$/gmu)) {
    const local = match[1] ?? match[2]?.split("/").at(-1);
    for (const used of body.matchAll(new RegExp(`\\b${local}\\.([A-Za-z_][A-Za-z0-9_]*)`, "gu"))) {
      targets2.push(`go-import:${match[2]}#${used[1]}`);
    }
  }
  return unique(targets2);
}
function extractTestEvidence(language, text, testPath = "", context2 = {}) {
  const raw = String(text ?? "");
  const code = withoutComments(language, raw);
  const names = unique(testNames(language, code));
  let targets2 = [];
  if (language === "php") targets2 = phpCoverageTargets(raw, code);
  else if (language === "python") targets2 = pythonTargets(code, testPath);
  else if (["javascript", "typescript"].includes(language)) targets2 = javascriptTargets(code, testPath);
  else if (language === "rust") targets2 = rustTargets(code, context2);
  else if (language === "go") targets2 = goTargets(code);
  return {
    valid: names.length > 0,
    testNames: names,
    targets: targets2,
    references: identifiers(code),
    package: language === "go" ? goPackage(code) : ""
  };
}
function sourceModule(path) {
  const segments = stripExtension(path).split("/");
  const sourceIndex = segments.reduce((found, segment, index) => ["lib", "src"].includes(segment.toLowerCase()) ? index : found, -1);
  const moduleSegments = sourceIndex >= 0 ? segments.slice(sourceIndex + 1) : segments;
  if (moduleSegments.at(-1) === "__init__") moduleSegments.pop();
  return moduleSegments.join(".");
}
function javascriptModule(path) {
  return stripExtension(path);
}
function rustModule(path) {
  const segments = stripExtension(path).split("/");
  const index = segments.lastIndexOf("src");
  if (index < 0) return null;
  const scope = segments.slice(0, index).join("/");
  const modules = segments.slice(index + 1);
  const last = modules.at(-1);
  if (last !== void 0 && ["lib", "main", "mod"].includes(last)) modules.pop();
  return { scope, module: modules.join("::") };
}
function extractSourceSymbols(language, text) {
  const value = withoutComments(language, text);
  if (language === "php") {
    const namespace = phpNamespace(value);
    return unique(matches2(value, /\b(?:class|interface|trait|enum|function)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gu).map((symbol) => namespace ? `${namespace}\\${symbol}` : symbol));
  }
  if (language === "python") return unique(matches2(value, /^\s*(?:class|def)\s+([A-Za-z_][A-Za-z0-9_]*)/gmu));
  if (["javascript", "typescript"].includes(language)) {
    return unique(matches2(value, /\b(?:export\s+)?(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gu));
  }
  if (language === "rust") return unique(matches2(value, /\b(?:pub\s+)?(?:fn|struct|enum|trait|type)\s+([A-Za-z_][A-Za-z0-9_]*)/gu));
  if (language === "go") return unique(matches2(value, /\b(?:func|type)\s+(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)/gu));
  return [];
}
function goImportPath(sourcePath, context2) {
  const modulePath = String(context2.goModulePath ?? "").replace(/\/$/u, "");
  if (!modulePath) return "";
  const moduleRoot = normalize(context2.goModuleRoot ?? "");
  const directory = posix.dirname(normalize(sourcePath));
  const relativePackage = moduleRoot ? posix.relative(moduleRoot, directory) : directory;
  if (relativePackage.startsWith("..")) return "";
  return relativePackage === "." || relativePackage === "" ? modulePath : `${modulePath}/${relativePackage}`;
}
function explicitSourceTargets(source, context2) {
  const symbols = extractSourceSymbols(source.language, source.content);
  if (source.language === "php") return symbols.map((symbol) => `php:${symbol}`);
  if (source.language === "python") {
    const module = sourceModule(source.path);
    const reexports = context2.pythonReexports ?? [];
    return [
      `python-module:${module}`,
      ...symbols.map((symbol) => `python:${module}#${symbol}`),
      ...reexports.flatMap(({ sourceSymbol, publicTarget }) => {
        if (sourceSymbol === "*" && publicTarget.endsWith("#*")) {
          const prefix = publicTarget.slice(0, -1);
          return symbols.map((symbol) => `${prefix}${symbol}`);
        }
        return symbols.includes(sourceSymbol) ? [publicTarget] : [];
      })
    ];
  }
  if (["javascript", "typescript"].includes(source.language)) {
    const module = javascriptModule(source.path);
    return [`javascript-module:${module}`, `javascript-module:${module.replace(/\/index$/u, "")}`];
  }
  if (source.language === "rust") {
    const descriptor = rustModule(source.path);
    const crateName = String(context2.rustCrateName ?? "");
    const crateRoot = normalize(context2.rustCrateRoot ?? "");
    if (!descriptor || !crateName || descriptor.scope !== crateRoot) return [];
    return symbols.map((symbol) => `rust:${crateRoot}:${crateName}#${descriptor.module}#${symbol}`);
  }
  if (source.language === "go") {
    const importPath = goImportPath(source.path, context2);
    return importPath ? symbols.map((symbol) => `go-import:${importPath}#${symbol}`) : [];
  }
  return [];
}
function removeTestSuffix(name, language) {
  let value = stripExtension(name);
  if (language === "php") value = value.replace(/Test$/u, "");
  else if (language === "python") value = value.replace(/^test_/u, "").replace(/_test$/u, "");
  else if (["javascript", "typescript"].includes(language)) value = value.replace(/\.(?:test|spec)$/u, "");
  else if (language === "go") value = value.replace(/_test$/u, "");
  return value;
}
function rootDescriptor(path, roots) {
  const segments = normalize(path).split("/");
  const index = segments.findIndex((segment) => roots.has(segment.toLowerCase()));
  if (index < 0) return null;
  return { scope: segments.slice(0, index).join("/"), rest: segments.slice(index + 1) };
}
function mirrorIdentity(path, language, kind) {
  if (["javascript", "typescript"].includes(language) && kind === "test") {
    const segments = normalize(path).split("/").filter((segment) => segment !== "__tests__");
    const name2 = removeTestSuffix(segments.pop(), language);
    if (/\.(?:test|spec)$/u.test(stripExtension(posix.basename(path)))) {
      const colocated = rootDescriptor([...segments, name2].join("/"), SOURCE_ROOTS);
      if (colocated) return `${colocated.scope}#${colocated.rest.join("/")}`;
    }
  }
  if (language === "go") {
    const directory = posix.dirname(normalize(path));
    return `${directory}/${kind === "test" ? removeTestSuffix(posix.basename(path), language) : stripExtension(posix.basename(path))}`;
  }
  const descriptor = rootDescriptor(path, kind === "test" ? TEST_ROOTS : SOURCE_ROOTS);
  if (!descriptor) {
    if (kind !== "source") return null;
    const normalized = normalize(path);
    return `${posix.dirname(normalized)}#${removeTestSuffix(posix.basename(normalized), language)}`;
  }
  const rest = [...descriptor.rest];
  if (kind === "test") {
    while (rest.length > 1 && SUITE_DIRECTORIES.has(rest[0]?.toLowerCase() ?? "")) rest.shift();
  }
  const name = kind === "test" ? removeTestSuffix(rest.pop(), language) : stripExtension(rest.pop());
  return `${descriptor.scope}#${[...rest, name].join("/")}`;
}
function mirrorMatches(source, testRecord2) {
  const sourceIdentity = mirrorIdentity(source.path, source.language, "source");
  const testIdentity = mirrorIdentity(testRecord2.path, source.language, "test");
  return Boolean(sourceIdentity && testIdentity && sourceIdentity === testIdentity);
}
function pythonPackageReexportMatches(source, testRecord2) {
  if (source.language !== "python" || !mirrorMatches(source, testRecord2)) return false;
  const module = sourceModule(source.path);
  const separator = module.lastIndexOf(".");
  if (separator < 0) return false;
  const packageName = module.slice(0, separator);
  const targets2 = new Set(testRecord2.evidence?.targets ?? []);
  return extractSourceSymbols("python", source.content).some((symbol) => targets2.has(`python:${packageName}#${symbol}`));
}
function goPackageMatches(source, testRecord2) {
  if (source.language !== "go") return false;
  const sourceDirectory = posix.dirname(normalize(source.path));
  const testDirectory = posix.dirname(normalize(testRecord2.path));
  const sourcePackage = goPackage(withoutComments("go", source.content));
  const testPackage = String(testRecord2.evidence?.package ?? "").replace(/_test$/u, "");
  const symbols = new Set(extractSourceSymbols("go", source.content));
  const references = testRecord2.evidence?.references ?? [];
  if (sourceDirectory === testDirectory && sourcePackage && sourcePackage === testPackage && references.some((value) => symbols.has(value))) return true;
  return false;
}
function sourceAuthorizedByTest(source, testRecord2, context2 = {}) {
  if (!source || !testRecord2 || source.language !== testRecord2.language || !testRecord2.evidence?.valid) return false;
  const testTargets = new Set(testRecord2.evidence.targets ?? []);
  if (explicitSourceTargets(source, context2).some((target) => testTargets.has(target))) return true;
  if (pythonPackageReexportMatches(source, testRecord2)) return true;
  if (testTargets.size > 0) return false;
  if (goPackageMatches(source, testRecord2)) return true;
  return mirrorMatches(source, testRecord2);
}
function pascal(value) {
  return String(value).split(/[-_]/u).filter(Boolean).map((part) => (part[0]?.toUpperCase() ?? "") + part.slice(1)).join("");
}
function languageTestFileName(stem, language) {
  if (language === "php") return `${pascal(stem)}Test.php`;
  if (language === "python") return `test_${stem}.py`;
  if (language === "javascript") return `${stem}.test.js`;
  if (language === "typescript") return `${stem}.test.ts`;
  if (language === "rust") return `${stem}.rs`;
  if (language === "go") return `${stem}_test.go`;
  return stem;
}
function suiteExampleName(language) {
  return ["python", "javascript", "typescript"].includes(language) ? "unit" : "Unit";
}
function expectedMirrorTestPaths(sourcePath, language) {
  const normalized = normalize(sourcePath);
  if (language === "go") {
    const directory = posix.dirname(normalized);
    const fileName2 = languageTestFileName(stripExtension(posix.basename(normalized)), language);
    return [directory === "." ? fileName2 : `${directory}/${fileName2}`];
  }
  const descriptor = rootDescriptor(normalized, SOURCE_ROOTS);
  const rest = descriptor ? [...descriptor.rest] : normalized.split("/").filter(Boolean);
  const stem = stripExtension(rest.pop() ?? "");
  const relativeDir = rest.join("/");
  const scopePrefix = descriptor?.scope ? `${descriptor.scope}/` : "";
  const fileName = languageTestFileName(stem, language);
  const withDir = relativeDir ? `${relativeDir}/` : "";
  const paths = [
    `${scopePrefix}tests/${withDir}${fileName}`,
    `${scopePrefix}tests/${suiteExampleName(language)}/${withDir}${fileName}`
  ];
  if (["javascript", "typescript"].includes(language)) {
    const sourceDir = posix.dirname(normalized);
    paths.push(sourceDir === "." ? fileName : `${sourceDir}/${fileName}`);
  }
  return paths;
}
function expectedTestExample(sourcePath, language) {
  const listed = expectedMirrorTestPaths(sourcePath, language).join(" or ");
  if (!listed) return "a matching test file";
  if (language === "php") return `${listed} or a test with #[CoversClass(Target::class)]`;
  if (language === "python") return `${listed} or a test importing the exact module`;
  if (language === "javascript" || language === "typescript") return `${listed} or a test with an exact relative import`;
  if (language === "rust") return `${listed} or a test using the exact crate module item`;
  if (language === "go") return `${listed} in the same package referencing a declared symbol`;
  return listed;
}

// plugins/engineering-workflow/src/domains/testing/lib/existing-tests.ts
var MAX_TEST_BYTES = 1048576;
function readLimited(path) {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > MAX_TEST_BYTES) return "";
    return readFileSync5(path, "utf8");
  } catch {
    return "";
  }
}
function listTestFiles(root, language) {
  const workspace = resolve10(root);
  const found = [];
  const stack = [workspace];
  while (stack.length > 0) {
    const directory = stack.pop();
    if (directory === void 0) continue;
    let entries = [];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
      const absolutePath = join3(directory, entry.name);
      const path = relative5(workspace, absolutePath).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        if (isSkippedPath(`${path}/`)) continue;
        stack.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const classified = classifyPath2(path);
      if (classified.kind === "test" && classified.language === language) found.push(path);
    }
  }
  return found.sort();
}
function findCorrespondingTests(root, source, context2 = {}) {
  if (!source?.path || !source.language) return [];
  const found = [];
  for (const path of listTestFiles(root, source.language)) {
    const testContext = resolveLanguageContext(root, path, source.language);
    const evidence = extractTestEvidence(source.language, readLimited(resolve10(root, path)), path, testContext);
    if (sourceAuthorizedByTest(source, { path, language: source.language, evidence }, context2)) {
      found.push(path);
    }
  }
  return found;
}
function formatTestPathList(paths) {
  const values = [...new Set((paths ?? []).filter((value) => Boolean(value)))];
  if (values.length <= 4) return values.join(", ");
  return `${values.slice(0, 4).join(", ")} and ${values.length - 4} more`;
}

// plugins/engineering-workflow/src/domains/testing/lib/git-workspace.ts
import { spawnSync } from "node:child_process";
import { existsSync as existsSync4, readFileSync as readFileSync6, realpathSync as realpathSync4 } from "node:fs";
import { resolve as resolve11 } from "node:path";
function sameDirectory(left, right) {
  try {
    return realpathSync4(left) === realpathSync4(right);
  } catch {
    return resolve11(left) === resolve11(right);
  }
}
function gitEnv() {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_OBJECT_DIRECTORY;
  delete env.GIT_ALTERNATE_OBJECT_DIRECTORIES;
  delete env.GIT_PREFIX;
  return env;
}
function runGit(root, args) {
  try {
    return spawnSync("git", ["-c", "safe.directory=*", "-c", "core.hooksPath=/dev/null", ...args], {
      cwd: root,
      encoding: "utf8",
      timeout: 1e4,
      stdio: ["ignore", "pipe", "pipe"],
      env: gitEnv()
    });
  } catch {
    return { status: 1, stdout: "", stderr: "" };
  }
}
function hasGitHead(root) {
  if (!root) return false;
  const inside = runGit(root, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0 || inside.stdout.trim() !== "true") return false;
  const toplevel = runGit(root, ["rev-parse", "--show-toplevel"]);
  if (toplevel.status !== 0 || !sameDirectory(toplevel.stdout.trim(), root)) return false;
  const head = runGit(root, ["rev-parse", "HEAD"]);
  return head.status === 0 && Boolean(head.stdout.trim());
}
function gitShowHead(root, relativePath2) {
  const path = String(relativePath2 ?? "").replaceAll("\\", "/");
  if (!root || !path || path === ".") return null;
  const shown = runGit(root, ["show", `HEAD:${path}`]);
  if (shown.status !== 0) return null;
  return shown.stdout;
}
function gitPathState(root, relativePath2) {
  try {
    const head = gitShowHead(root, relativePath2);
    const tracked = head !== null;
    const absolutePath = resolve11(root, relativePath2);
    const present = existsSync4(absolutePath);
    if (!tracked && !present) return { tracked: false, present: false, dirty: false };
    if (!tracked) return { tracked: false, present: true, dirty: true };
    if (!present) return { tracked: true, present: false, dirty: true };
    let current = "";
    try {
      current = readFileSync6(absolutePath, "utf8");
    } catch {
      return { tracked: true, present: true, dirty: true };
    }
    return { tracked: true, present: true, dirty: current !== head };
  } catch {
    return { tracked: false, present: false, dirty: false };
  }
}
function listHeadPaths(root) {
  const listed = runGit(root, ["ls-tree", "-r", "--name-only", "HEAD"]);
  if (listed.status !== 0) return [];
  return listed.stdout.split("\n").map((path) => path.trim()).filter(Boolean);
}
function listDirtyPaths(root) {
  if (!hasGitHead(root)) return [];
  const changed = runGit(root, ["diff", "--name-only", "HEAD", "--"]);
  const untracked = runGit(root, ["ls-files", "--others", "--exclude-standard"]);
  const paths = [
    ...changed.status === 0 ? changed.stdout.split("\n") : [],
    ...untracked.status === 0 ? untracked.stdout.split("\n") : []
  ];
  return [...new Set(paths.map((path) => path.trim().replaceAll("\\", "/")).filter(Boolean))];
}
function restoresHeadState(root, relativePath2, { missing = false, content = "" } = {}) {
  const head = gitShowHead(root, relativePath2);
  if (head === null) return missing === true;
  if (missing) return false;
  return head === String(content ?? "");
}

// plugins/engineering-workflow/src/domains/testing/hook.ts
var outputStore2 = new AsyncLocalStorage2();
function writeJson3(output) {
  if (!output) return;
  const outputs = outputStore2.getStore();
  if (!outputs) throw new Error("testing output was emitted outside the owner dispatcher");
  outputs.push(output);
}
function warn2(message) {
  process.stderr.write(`[test-driven-development] ${message}
`);
}
function readText(path) {
  try {
    return readFileSync7(path, "utf8");
  } catch {
    return "";
  }
}
function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && error.message != null) return String(error.message);
  return String(error);
}
function isActiveTarget(target) {
  return target.kind !== "ignored" && target.language !== null;
}
function isInsideRoot(root, path) {
  const value = relative6(resolve12(root), resolve12(path));
  return value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute5(value);
}
function targetsFor(event, root) {
  return extractTargets(event).filter((absolutePath) => isInsideRoot(root, absolutePath)).map((absolutePath) => {
    const path = relativePath(root, absolutePath);
    return { absolutePath, path, ...classifyPath2(path) };
  }).filter(isActiveTarget);
}
function mixedWriteFinding() {
  return "[TDD Guard] A single tool call cannot mix test and implementation files. Use separate tool calls: change the test first, then change the implementation.";
}
function headCorrespondingTests(root, source, context2) {
  if (!hasGitHead(root)) return [];
  const found = /* @__PURE__ */ new Set();
  for (const path of listHeadPaths(root)) {
    const classified = classifyPath2(path);
    if (classified.kind !== "test" || classified.language !== source.language) continue;
    const content = gitShowHead(root, path);
    if (content == null) continue;
    const testContext = resolveLanguageContext(root, path, source.language);
    const evidence = extractTestEvidence(source.language, content, path, testContext);
    if (sourceAuthorizedByTest(source, { path, language: source.language, evidence }, context2)) {
      found.add(path);
    }
  }
  return [...found];
}
function dirtyLiveTests(root, source, context2) {
  return findCorrespondingTests(root, source, context2).filter((path) => {
    const state = gitPathState(root, path);
    return state.present && state.dirty;
  });
}
function restoresBaseline(root, event, target) {
  const deleting = targetOperation(event, target.absolutePath) === "delete";
  if (!deleting && shellCommandOf(event)) return false;
  const current = readText(target.absolutePath);
  return restoresHeadState(root, target.path, {
    missing: deleting,
    content: deleting ? "" : proposedContent(event, target.absolutePath, current)
  });
}
function dirtySourceTargets(root) {
  return listDirtyPaths(root).map((path) => {
    const absolutePath = resolve12(root, path);
    return { absolutePath, path, ...classifyPath2(path) };
  }).filter((target) => isActiveTarget(target) && target.kind === "source" && gitPathState(root, target.path).present);
}
function testRecord(root, event, target, proposed) {
  const deleting = proposed && targetOperation(event, target.absolutePath) === "delete";
  if (deleting) return null;
  const content = proposed ? proposedContent(event, target.absolutePath, readText(target.absolutePath)) : readText(target.absolutePath);
  const context2 = resolveLanguageContext(root, target.path, target.language);
  return {
    path: target.path,
    language: target.language,
    evidence: extractTestEvidence(target.language, content, target.path, context2),
    dirty: gitShowHead(root, target.path) !== content
  };
}
function testChangeBreaksAuthorization(root, event, target, eventTargets) {
  const current = testRecord(root, event, target, false);
  if (!current?.dirty) return null;
  const proposed = testRecord(root, event, target, true);
  for (const dirtySource of dirtySourceTargets(root)) {
    if (dirtySource.language !== target.language) continue;
    const source = sourceForTarget(root, event, dirtySource, false);
    const context2 = resolveLanguageContext(root, dirtySource.path, dirtySource.language);
    if (!sourceAuthorizedByTest(source, current, context2)) continue;
    if (proposed?.dirty && sourceAuthorizedByTest(source, proposed, context2)) continue;
    const candidates = /* @__PURE__ */ new Set([
      ...dirtyLiveTests(root, source, context2),
      ...eventTargets.filter((candidate) => candidate.kind === "test" && candidate.language === target.language).map((candidate) => candidate.path)
    ]);
    candidates.delete(target.path);
    const hasAlternative = [...candidates].some((path) => {
      const changedTarget = eventTargets.find((candidate) => candidate.kind === "test" && candidate.path === path);
      const record = changedTarget ? testRecord(root, event, changedTarget, true) : testRecord(root, event, {
        absolutePath: resolve12(root, path),
        path,
        kind: "test",
        language: target.language
      }, false);
      return record?.dirty === true && sourceAuthorizedByTest(source, record, context2);
    });
    if (!hasAlternative) return dirtySource.path;
  }
  return null;
}
function sourceForTarget(root, event, target, deleting) {
  const current = readText(target.absolutePath);
  return {
    path: target.path,
    language: target.language,
    content: deleting ? current || gitShowHead(root, target.path) || "" : proposedContent(event, target.absolutePath, current)
  };
}
function denySourceChange(target, tests) {
  if (tests.length > 0) {
    writeJson3(preToolDeny(`[TDD Guard] Blocked ${target.path}: matching tests exist (${formatTestPathList(tests)}), but none has changed relative to git HEAD. Change a corresponding test first, then retry the implementation change.`));
    return;
  }
  writeJson3(preToolDeny(`[TDD Guard] Blocked ${target.path}: no changed corresponding test exists. Create or update ${expectedTestExample(target.path, target.language)} with a real test case first, then retry the implementation change.`));
}
function checkSourceTarget(root, event, target) {
  if (restoresBaseline(root, event, target)) return true;
  const deleting = targetOperation(event, target.absolutePath) === "delete";
  const source = sourceForTarget(root, event, target, deleting);
  const context2 = resolveLanguageContext(root, target.path, target.language);
  if (deleting) {
    const historical = headCorrespondingTests(root, source, context2);
    if (historical.length > 0 && historical.every((path) => gitPathState(root, path).dirty)) return true;
    denySourceChange(target, historical);
    return false;
  }
  const current = findCorrespondingTests(root, source, context2);
  if (dirtyLiveTests(root, source, context2).length > 0) return true;
  denySourceChange(target, current);
  return false;
}
function testFirstFileOrderContext() {
  return [
    "[TDD Guard] Test-first file order is enforced against git HEAD.",
    "Change a corresponding test in a separate tool call before changing implementation.",
    "A single patch or tool call cannot mix test and source files. A dirty test may cover later implementation edits.",
    "This hook does not run tests and does not prove RED/GREEN. Optional method: load `tdd-red-green` for the red-green-refactor loop. Skill load is not a hook prerequisite."
  ].join("\n");
}
function runSessionStart() {
  writeJson3(additionalContext("SessionStart", testFirstFileOrderContext()));
}
async function runPre2(event) {
  const root = cwdOf(event);
  const targets2 = targetsFor(event, root);
  if (targets2.length === 0) {
    const opaqueMutation = opaqueShellMutation(event);
    if (opaqueMutation) {
      writeJson3(preToolDeny(`[TDD Guard] Blocked opaque implementation mutation: ${opaqueMutation}. Use file tools or an explicit patch whose target paths can be checked against corresponding tests.`));
    }
    return;
  }
  const kinds = new Set(targets2.map((target) => target.kind));
  if (kinds.has("test") && kinds.has("source")) {
    writeJson3(preToolDeny(mixedWriteFinding()));
    return;
  }
  if (!kinds.has("source")) {
    for (const target of targets2) {
      if (target.kind !== "test") continue;
      const affectedSource = testChangeBreaksAuthorization(root, event, target, targets2);
      if (affectedSource) {
        writeJson3(preToolDeny(`[TDD Guard] Blocked ${target.path}: deleting or weakening this test would leave dirty implementation ${affectedSource} without a changed corresponding test. Restore the implementation first or keep another changed corresponding test.`));
        return;
      }
    }
    return;
  }
  if (!hasGitHead(root)) {
    writeJson3(preToolDeny("[TDD Guard] Blocked implementation change: this workspace has no git HEAD. Initialize a git repository with a commit, then change a corresponding test before retrying."));
    return;
  }
  for (const target of targets2) {
    if (target.kind === "source" && !checkSourceTarget(root, event, target)) return;
  }
}
async function handleTesting({ args, event }) {
  const mode = args[0];
  const outputs = [];
  return outputStore2.run(outputs, async () => {
    if (event.__parseError) {
      warn2("hook input was not valid JSON");
      if (mode === "pre") {
        writeJson3(preToolDeny("[TDD Guard] The hook could not parse this implementation event safely, so it was blocked. Fix the hook input, then retry."));
      } else if (mode === "session-start") {
        warn2("advisory context was skipped");
      }
      return outputs;
    }
    if (mode === "pre") await runPre2(event);
    else if (mode === "session-start") runSessionStart();
    return outputs;
  }).catch((error) => {
    warn2(`hook validation failed: ${errorMessage(error)}`);
    if (mode === "pre") {
      const output = preToolDeny("[TDD Guard] The hook could not validate this implementation change safely, so it was blocked. Fix the hook input or git state, then retry.");
      return output ? [output] : [];
    }
    return [];
  });
}

// plugins/engineering-workflow/src/entries/hooks/dispatcher.ts
var [host, eventName] = process.argv.slice(2);
if (!host || !eventName) throw new Error("dispatcher requires <host> <event>");
await runOwnerDispatcher(host, eventName, {
  debugging: handleSoftwareDebugging,
  specification: handleSpecification,
  testing: handleTesting
});
