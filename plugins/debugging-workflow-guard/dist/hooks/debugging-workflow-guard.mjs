#!/usr/bin/env node
// harness-source-hash: sha256:114ce998494b0ac701f6443fb7459aab377a414ce1d41330c544872dc79292f8

// plugins/debugging-workflow-guard/src/entries/hooks/debugging-workflow-guard.ts
import { appendFileSync, existsSync as existsSync3, readFileSync as readFileSync4 } from "node:fs";
import { execFileSync as execFileSync2 } from "node:child_process";
import { relative as relative3, resolve as resolve6 } from "node:path";
import { fileURLToPath } from "node:url";

// plugins/debugging-workflow-guard/src/lib/config.ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
var DEFAULT_CONFIG = Object.freeze({
  mode: "block",
  ledger: Object.freeze({
    root: ".debug-workflow",
    persistence: "local",
    maxFiles: 40,
    maxBytes: 256 * 1024
  }),
  limits: Object.freeze({
    maxBugs: 50,
    maxHypothesesPerBug: 20,
    maxFailedFixAttempts: 3,
    leaseMinutes: 120,
    maxReceipts: 200
  }),
  commands: Object.freeze({
    reproductionPatterns: Object.freeze([]),
    verificationPatterns: Object.freeze([]),
    expectedFailurePatterns: Object.freeze([]),
    expectedSuccessPatterns: Object.freeze([])
  }),
  paths: Object.freeze({
    codePatterns: Object.freeze([]),
    testPatterns: Object.freeze([]),
    diagnosticPatterns: Object.freeze([]),
    nonCodePatterns: Object.freeze([])
  })
});
function cloneDefaults() {
  return {
    mode: DEFAULT_CONFIG.mode,
    ledger: { ...DEFAULT_CONFIG.ledger },
    limits: { ...DEFAULT_CONFIG.limits },
    commands: Object.fromEntries(
      Object.entries(DEFAULT_CONFIG.commands).map(([key, value]) => [key, [...value]])
    ),
    paths: Object.fromEntries(
      Object.entries(DEFAULT_CONFIG.paths).map(([key, value]) => [key, [...value]])
    )
  };
}
function positiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= max ? number : fallback;
}
function strings(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  return value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
}
function resolveConfig(raw, warn2 = () => {
}) {
  const config = cloneDefaults();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return config;
  if (["block", "report", "off"].includes(raw.mode)) config.mode = raw.mode;
  else if (raw.mode !== void 0) warn2(`invalid mode: ${raw.mode}`);
  if (raw.ledger && typeof raw.ledger === "object") {
    if (typeof raw.ledger.root === "string" && raw.ledger.root.trim()) {
      const root = raw.ledger.root.trim().replaceAll("\\", "/").replace(/^\.\//u, "");
      if (!root.startsWith("../") && !root.startsWith("/") && !root.split("/").includes("..")) config.ledger.root = root.replace(/\/$/u, "");
      else warn2("ledger.root must stay inside the repository");
    }
    if (["local", "tracked"].includes(raw.ledger.persistence)) config.ledger.persistence = raw.ledger.persistence;
    config.ledger.maxFiles = positiveInt(raw.ledger.maxFiles, config.ledger.maxFiles, 200);
    config.ledger.maxBytes = positiveInt(raw.ledger.maxBytes, config.ledger.maxBytes, 1024 * 1024);
  }
  if (raw.limits && typeof raw.limits === "object") {
    config.limits.maxBugs = positiveInt(raw.limits.maxBugs, config.limits.maxBugs, 200);
    config.limits.maxHypothesesPerBug = positiveInt(raw.limits.maxHypothesesPerBug, config.limits.maxHypothesesPerBug, 100);
    config.limits.maxFailedFixAttempts = positiveInt(raw.limits.maxFailedFixAttempts, config.limits.maxFailedFixAttempts, 20);
    config.limits.leaseMinutes = positiveInt(raw.limits.leaseMinutes, config.limits.leaseMinutes, 1440);
    config.limits.maxReceipts = positiveInt(raw.limits.maxReceipts, config.limits.maxReceipts, 1e3);
  }
  for (const group of ["commands", "paths"]) {
    if (!raw[group] || typeof raw[group] !== "object") continue;
    for (const [key, fallback] of Object.entries(config[group])) {
      if (raw[group][key] !== void 0) config[group][key] = strings(raw[group][key], fallback);
    }
  }
  return config;
}
async function loadProjectConfig(repoRoot2, warn2 = () => {
}) {
  if (!repoRoot2) return resolveConfig(null, warn2);
  for (const name of [".debugging-workflow-guard.mjs", ".debugging-workflow-guard.js", ".debugging-workflow-guard.cjs"]) {
    const path = join(repoRoot2, name);
    if (!existsSync(path)) continue;
    try {
      const loaded = await import(pathToFileURL(path).href);
      return resolveConfig(loaded.default ?? loaded, warn2);
    } catch (error) {
      warn2(`failed to load ${name}: ${error?.message ?? error}`);
      return resolveConfig(null, warn2);
    }
  }
  return resolveConfig(null, warn2);
}

// plugins/debugging-workflow-guard/src/lib/hook-io.ts
import { isAbsolute as isAbsolute2, resolve as resolve2 } from "node:path";

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
function eventToolResponse(event) {
  const tool = nestedRecord(event, "tool");
  return event.tool_response ?? event.toolResponse ?? event.tool_result ?? event.toolResult ?? event.response ?? tool?.response ?? null;
}
function eventAssistantMessage(event) {
  return firstString(
    event.last_assistant_message,
    event.lastAssistantMessage,
    event.assistant_message,
    event.assistant_text,
    event.assistantText
  );
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
  const text2 = String(value ?? "").trim();
  if (text2.length >= 2 && (text2.startsWith('"') && text2.endsWith('"') || text2.startsWith("'") && text2.endsWith("'"))) {
    return text2.slice(1, -1);
  }
  return text2;
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

// plugins/debugging-workflow-guard/src/lib/hook-io.ts
function extractSessionId(event) {
  return eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || null;
}
function extractCwd(event) {
  return eventCwd(event);
}
function extractToolName(event) {
  return eventToolName(event);
}
function extractToolResponse(event) {
  return eventToolResponse(event) ?? event?.error ?? null;
}
function extractAssistantMessage(event) {
  return eventAssistantMessage(event);
}
function stripMatchingQuotes2(value) {
  const text2 = String(value ?? "").trim();
  if (text2.length >= 2 && (text2.startsWith('"') && text2.endsWith('"') || text2.startsWith("'") && text2.endsWith("'"))) {
    return text2.slice(1, -1);
  }
  return text2;
}
function objectPaths2(input) {
  if (!input || typeof input !== "object") return [];
  const paths = [];
  for (const key of ["file_path", "filePath", "path", "target_file", "targetFile", "output_file", "outputFile", "notebook_path", "notebookPath"]) {
    if (typeof input[key] === "string" && input[key]) paths.push(input[key]);
  }
  if (Array.isArray(input.paths)) paths.push(...input.paths);
  if (Array.isArray(input.edits)) for (const edit of input.edits) paths.push(...objectPaths2(edit));
  return paths;
}
function responsePaths(response) {
  const paths = [];
  if (response && typeof response === "object") {
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
    if (status) paths.push(stripMatchingQuotes2(status[1]));
    if (changed) paths.push(stripMatchingQuotes2(changed[1]));
  }
  return paths;
}
function extractFileTargets2(event) {
  const cwd = resolve2(extractCwd(event));
  const core = extractFileTargets(event);
  const extras = responsePaths(extractToolResponse(event)).map((value) => isAbsolute2(value) ? resolve2(value) : resolve2(cwd, stripMatchingQuotes2(value).replace(/^\.\//u, "")));
  return [.../* @__PURE__ */ new Set([...core, ...extras])];
}
function isMutationTool(event) {
  return isFileMutationTool(extractToolName(event));
}
function responseText(response) {
  if (typeof response === "string") return response;
  if (response && typeof response === "object" && !Array.isArray(response)) {
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
  if (response && typeof response === "object") {
    if (response.is_error === true || response.isError === true || response.error || response.interrupted === true) return "failure";
    const code = response.exit_code ?? response.exitCode ?? response.code;
    if (Number.isFinite(Number(code))) return Number(code) === 0 ? "success" : "failure";
    if (response.success === false) return "failure";
    if (response.success === true) return "success";
  }
  const text2 = responseText(response);
  const codes = [...text2.matchAll(/(?:Process exited with code|Exit code:?|exited with code)\s+(-?[0-9]+)/giu)];
  if (codes.length > 0) return Number(codes.at(-1)[1]) === 0 ? "success" : "failure";
  const failed = text2.match(/(?:^|\n)#\s*fail\s+([0-9]+)/iu);
  if (failed && Number(failed[1]) > 0) return "failure";
  const passed = text2.match(/(?:^|\n)#\s*pass\s+([0-9]+)/iu);
  if (passed && Number(passed[1]) > 0 && (!failed || Number(failed[1]) === 0)) return "success";
  if (/(?:^|\n)not ok\s+[0-9]+\b|command failed|is_error["']?\s*:\s*true/iu.test(text2)) return "failure";
  if (!process.env.PLUGIN_ROOT && response && typeof response === "object" && !Array.isArray(response)) return "success";
  return "unknown";
}
function contextOutput(eventName, text2) {
  if (process.env.PLUGIN_ROOT && process.env.DEEPSEEK_MODEL && eventName === "PostToolUse") {
    process.stderr.write(`${text2}
`);
    process.exitCode = 2;
    return null;
  }
  return additionalContext(eventName, text2);
}
function stopDeny(reason) {
  return stopBlock(reason);
}

// plugins/debugging-workflow-guard/src/lib/state-store.ts
import { createHash, randomBytes } from "node:crypto";
import { closeSync, mkdirSync as mkdirSync2, openSync, readFileSync as readFileSync2, renameSync, rmSync, rmdirSync, statSync, writeFileSync as writeFileSync2 } from "node:fs";
import { basename, dirname, join as join3, resolve as resolve3 } from "node:path";

// core/src/plugin-workdir.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join as join2 } from "node:path";
var PLUGIN_WORKDIR_GITIGNORE = "*\n";
function normalizeGitignore(text2) {
  return String(text2 ?? "").replace(/\r\n/gu, "\n").trim();
}
function isStalePluginWorkdirGitignore(text2) {
  const value = normalizeGitignore(text2);
  return value === "" || value === "state/" || value === "sessions/";
}
function ensurePluginWorkdirGitignore(pluginRoot) {
  mkdirSync(pluginRoot, { recursive: true, mode: 448 });
  const ignore = join2(pluginRoot, ".gitignore");
  let current = null;
  try {
    current = readFileSync(ignore, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (current !== null && normalizeGitignore(current) === "*") return;
  if (current !== null && !isStalePluginWorkdirGitignore(current)) return;
  writeFileSync(ignore, PLUGIN_WORKDIR_GITIGNORE, { encoding: "utf8", mode: 384 });
}

// plugins/debugging-workflow-guard/src/lib/state-store.ts
var VERSION = 1;
var TTL_MS = 24 * 60 * 60 * 1e3;
var STATE_DIR_RELATIVE = ".debug-workflow/.state";
function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
function debugWorkdir(from) {
  let cursor = resolve3(from);
  while (basename(cursor) !== ".debug-workflow") {
    const parent = dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
  return cursor;
}
function ensureStateDir(directory) {
  mkdirSync2(directory, { recursive: true, mode: 448 });
  const workdir = debugWorkdir(directory);
  if (workdir) ensurePluginWorkdirGitignore(workdir);
}
function emptyState() {
  return { version: VERSION, bound: false, workOrderPath: null, workOrderId: null, epoch: 0, activeBugId: null, revision: 0, eventSeq: 0, mutationSeq: 0, receipts: [], attempts: {}, invalid: false, updatedAt: 0 };
}
function sanitize(value) {
  if (!value || value.version !== VERSION || Date.now() - Number(value.updatedAt || 0) > TTL_MS) return emptyState();
  return {
    ...emptyState(),
    ...value,
    receipts: Array.isArray(value.receipts) ? value.receipts.slice(-1e3) : [],
    attempts: value.attempts && typeof value.attempts === "object" ? value.attempts : {}
  };
}
function statePath(sessionId, cwd) {
  const session = sessionId || "default";
  return join3(resolve3(cwd), STATE_DIR_RELATIVE, "sessions", `${digest(session)}.json`);
}
function atomicWrite(path, value) {
  if (!path) return false;
  const directory = dirname(path);
  const temp = join3(directory, `.${digest(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    ensureStateDir(directory);
    writeFileSync2(temp, `${JSON.stringify(value)}
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
    return JSON.parse(readFileSync2(path, "utf8"));
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
  return join3(resolve3(repoRoot2), STATE_DIR_RELATIVE, "leases", `${digest(workOrderId)}.json`);
}
function acquireLease({ repoRoot: repoRoot2, workOrderId, epoch, sessionId, leaseMinutes, now = Date.now() }) {
  const path = registryPath(repoRoot2, workOrderId);
  if (!path) return { ok: true, persisted: false };
  const lock = `${path}.lock`;
  const createLock = () => {
    mkdirSync2(dirname(path), { recursive: true, mode: 448 });
    mkdirSync2(lock, { mode: 448 });
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
    const live = current && Number(current.expiresAt) > now;
    if (live && current.sessionId !== sessionId) return { ok: false, reason: `work order is leased by another session until ${new Date(current.expiresAt).toISOString()}` };
    if (current && current.sessionId !== sessionId && Number(epoch) <= Number(current.maxEpoch || 0)) return { ok: false, reason: `run.epoch must exceed ${current.maxEpoch} when another session resumes this work order` };
    const next = { workOrderId, maxEpoch: Math.max(Number(epoch), Number(current?.maxEpoch || 0)), sessionId, expiresAt: now + leaseMinutes * 6e4, updatedAt: now };
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
  if (!current || current.sessionId !== sessionId) return false;
  current.expiresAt = 0;
  return atomicWrite(path, current);
}

// plugins/debugging-workflow-guard/src/lib/workflow.ts
import { createHash as createHash2 } from "node:crypto";
import { execFileSync } from "node:child_process";
import { relative as relative2, resolve as resolve5 } from "node:path";

// plugins/debugging-workflow-guard/src/lib/work-order.ts
import { existsSync as existsSync2, lstatSync, readdirSync, readFileSync as readFileSync3 } from "node:fs";
import { join as join4, relative, resolve as resolve4 } from "node:path";
var SCHEMA = "debug-work-order/v1";
var WORK_STATUSES = /* @__PURE__ */ new Set(["open", "paused", "closed", "aborted"]);
var RUN_STATES = /* @__PURE__ */ new Set(["active", "paused", "closed"]);
var RUN_MODES = /* @__PURE__ */ new Set(["investigate-only", "investigate-and-fix"]);
var BUG_STATUSES = /* @__PURE__ */ new Set(["queued", "investigating", "fixing", "verifying", "resolved", "blocked", "deferred", "duplicate", "architecture-review"]);
var ACTIVE_BUG_STATUSES = /* @__PURE__ */ new Set(["investigating", "fixing", "verifying"]);
var TERMINAL_BUG_STATUSES = /* @__PURE__ */ new Set(["resolved", "blocked", "deferred", "duplicate", "architecture-review"]);
var HYPOTHESIS_STATUSES = /* @__PURE__ */ new Set(["open", "supported", "falsified"]);
var ROOT_STATUSES = /* @__PURE__ */ new Set(["unknown", "inferred", "supported"]);
var FIX_STATUSES = /* @__PURE__ */ new Set(["not-started", "in-progress", "applied", "reverted"]);
var FENCE = /```json[ \t]+debug-work-order\/v1[ \t]*\r?\n([\s\S]*?)\r?\n```/gu;
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}
function text(value, max = 8e3) {
  return typeof value === "string" && value.trim().length > 0 && Buffer.byteLength(value, "utf8") <= max;
}
function nullableText(value, max = 8e3) {
  return value === null || value === "" || text(value, max);
}
function accepted(values) {
  return [...values].join(", ");
}
function exactKeys(value, allowed, at, findings) {
  if (!object(value)) return;
  for (const key of Object.keys(value)) if (!allowed.includes(key)) findings.push(`${at} contains unknown field: ${key}`);
}
function stringArray(value, at, findings) {
  if (!Array.isArray(value) || value.some((item) => !text(item, 500))) findings.push(`${at} must be an array of non-empty strings`);
}
function receiptIdArray(value, at, findings) {
  if (!Array.isArray(value) || value.some((item) => !/^R-[0-9]+$/u.test(String(item)))) findings.push(`${at} must be an array of R-N receipt ids`);
}
function receiptReference(value, at, findings) {
  if (!object(value)) {
    findings.push(`${at} must be a receipt-reference object`);
    return;
  }
  exactKeys(value, ["receiptId"], at, findings);
  if (!/^R-[0-9]+$/u.test(String(value.receiptId ?? ""))) findings.push(`${at}.receiptId must match R-N`);
}
function extractWorkOrder(rawText) {
  const textValue = String(rawText ?? "");
  const matches = [...textValue.matchAll(FENCE)];
  if (matches.length !== 1) return { ok: false, error: `expected exactly one json debug-work-order/v1 block; found ${matches.length}` };
  try {
    const value = JSON.parse(matches[0][1]);
    return object(value) ? { ok: true, value } : { ok: false, error: "work order root must be an object" };
  } catch (error) {
    return { ok: false, error: `work order JSON parse failed: ${error?.message ?? error}` };
  }
}
function validateWorkOrder(raw, config) {
  const findings = [];
  if (!object(raw)) return { valid: false, findings: ["work order root must be an object"], workOrder: null };
  exactKeys(raw, ["schema", "id", "status", "run", "activeBugId", "bugs", "resume"], "work order", findings);
  if (raw.schema !== SCHEMA) findings.push(`schema must be ${SCHEMA}`);
  if (!/^DWO-[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u.test(String(raw.id ?? ""))) findings.push("id must match DWO-<stable-id>");
  if (!WORK_STATUSES.has(raw.status)) findings.push("status is invalid");
  if (!object(raw.run)) findings.push("run must be an object");
  else {
    exactKeys(raw.run, ["epoch", "state", "mode"], "run", findings);
    if (!Number.isSafeInteger(raw.run.epoch) || raw.run.epoch < 1) findings.push("run.epoch must be a positive integer");
    if (!RUN_STATES.has(raw.run.state)) findings.push(`run.state must be one of: ${accepted(RUN_STATES)}`);
    if (!RUN_MODES.has(raw.run.mode)) findings.push(`run.mode must be one of: ${accepted(RUN_MODES)}`);
  }
  const alignedRunState = { open: "active", paused: "paused", closed: "closed", aborted: "closed" }[raw.status];
  if (alignedRunState && raw.run?.state !== alignedRunState) findings.push(`status ${raw.status} requires run.state ${alignedRunState}`);
  const maxBugs = config?.limits?.maxBugs ?? 50;
  const maxHypotheses = config?.limits?.maxHypothesesPerBug ?? 20;
  if (!Array.isArray(raw.bugs) || raw.bugs.length < 1 || raw.bugs.length > maxBugs) findings.push(`bugs must contain 1..${maxBugs} items`);
  const bugIds = /* @__PURE__ */ new Set();
  const bugs = Array.isArray(raw.bugs) ? raw.bugs : [];
  for (const [index, bug] of bugs.entries()) {
    const at = `bugs[${index}]`;
    if (!object(bug)) {
      findings.push(`${at} must be an object`);
      continue;
    }
    exactKeys(bug, ["id", "summary", "goal", "status", "priority", "dependsOn", "duplicateOf", "rootCauseGroup", "symptom", "hypotheses", "rootCause", "fix", "verification", "attempts", "residualRisks"], at, findings);
    if (!/^BUG-[0-9]{3,6}$/u.test(String(bug.id ?? ""))) findings.push(`${at}.id must match BUG-NNN`);
    else if (bugIds.has(bug.id)) findings.push(`duplicate bug id: ${bug.id}`);
    else bugIds.add(bug.id);
    if (!text(bug.summary, 500)) findings.push(`${at}.summary is required`);
    if (!["diagnose", "fix"].includes(bug.goal)) findings.push(`${at}.goal must be diagnose or fix`);
    if (!BUG_STATUSES.has(bug.status)) findings.push(`${at}.status must be one of: ${accepted(BUG_STATUSES)}`);
    if (!["critical", "high", "medium", "low"].includes(bug.priority)) findings.push(`${at}.priority is invalid`);
    stringArray(bug.dependsOn, `${at}.dependsOn`, findings);
    if (!nullableText(bug.duplicateOf, 64)) findings.push(`${at}.duplicateOf must be null or an id`);
    if (!nullableText(bug.rootCauseGroup, 64)) findings.push(`${at}.rootCauseGroup must be null or a string`);
    if (bug.status === "duplicate" && !text(bug.duplicateOf, 64)) findings.push(`${at}.duplicateOf is required for duplicate status`);
    if (!object(bug.symptom)) findings.push(`${at}.symptom must be an object`);
    else {
      exactKeys(bug.symptom, ["expected", "actual", "reproduction", "environment"], `${at}.symptom`, findings);
      for (const key of ["expected", "actual", "reproduction", "environment"]) if (!text(bug.symptom[key])) findings.push(`${at}.symptom.${key} is required`);
    }
    if (!Array.isArray(bug.hypotheses) || bug.hypotheses.length < 2 || bug.hypotheses.length > maxHypotheses) findings.push(`${at}.hypotheses must contain 2..${maxHypotheses} items`);
    const hypothesisIds = /* @__PURE__ */ new Set();
    for (const [hIndex, hypothesis] of (Array.isArray(bug.hypotheses) ? bug.hypotheses : []).entries()) {
      const hat = `${at}.hypotheses[${hIndex}]`;
      if (!object(hypothesis)) {
        findings.push(`${hat} must be an object`);
        continue;
      }
      exactKeys(hypothesis, ["id", "statement", "falsifier", "status", "evidenceRefs"], hat, findings);
      if (!/^H[0-9]+$/u.test(String(hypothesis.id ?? ""))) findings.push(`${hat}.id must match HN`);
      else if (hypothesisIds.has(hypothesis.id)) findings.push(`${at} duplicate hypothesis id: ${hypothesis.id}`);
      else hypothesisIds.add(hypothesis.id);
      if (!text(hypothesis.statement)) findings.push(`${hat}.statement is required`);
      if (!text(hypothesis.falsifier)) findings.push(`${hat}.falsifier is required`);
      if (!HYPOTHESIS_STATUSES.has(hypothesis.status)) findings.push(`${hat}.status must be one of: ${accepted(HYPOTHESIS_STATUSES)}`);
      receiptIdArray(hypothesis.evidenceRefs, `${hat}.evidenceRefs`, findings);
    }
    if (!object(bug.rootCause)) findings.push(`${at}.rootCause must be an object`);
    else {
      exactKeys(bug.rootCause, ["status", "statement", "causalChain", "evidenceRefs"], `${at}.rootCause`, findings);
      if (!ROOT_STATUSES.has(bug.rootCause.status)) findings.push(`${at}.rootCause.status must be one of: ${accepted(ROOT_STATUSES)}`);
      if (!nullableText(bug.rootCause.statement)) findings.push(`${at}.rootCause.statement must be a string`);
      stringArray(bug.rootCause.causalChain, `${at}.rootCause.causalChain`, findings);
      receiptIdArray(bug.rootCause.evidenceRefs, `${at}.rootCause.evidenceRefs`, findings);
      if (bug.rootCause.status === "supported" && (!text(bug.rootCause.statement) || bug.rootCause.causalChain.length < 1 || bug.rootCause.evidenceRefs.length < 1)) findings.push(`${at}.rootCause supported requires statement, causalChain, and evidenceRefs`);
    }
    if (!object(bug.fix)) findings.push(`${at}.fix must be an object`);
    else {
      exactKeys(bug.fix, ["status", "firstRevision", "affectedBugIds", "summary"], `${at}.fix`, findings);
      if (!FIX_STATUSES.has(bug.fix.status)) findings.push(`${at}.fix.status must be one of: ${accepted(FIX_STATUSES)}`);
      if (bug.fix.firstRevision !== null && !/^R-[0-9]+$/u.test(String(bug.fix.firstRevision))) findings.push(`${at}.fix.firstRevision must be null or match R-N`);
      stringArray(bug.fix.affectedBugIds, `${at}.fix.affectedBugIds`, findings);
      if (!nullableText(bug.fix.summary)) findings.push(`${at}.fix.summary must be a string`);
    }
    if (!object(bug.verification)) findings.push(`${at}.verification must be an object`);
    else {
      exactKeys(bug.verification, ["originalReproduction", "regression", "debugCleanup"], `${at}.verification`, findings);
      if (bug.verification.originalReproduction !== null) receiptReference(bug.verification.originalReproduction, `${at}.verification.originalReproduction`, findings);
      if (!Array.isArray(bug.verification.regression)) findings.push(`${at}.verification.regression must be an array`);
      else bug.verification.regression.forEach((reference, rIndex) => receiptReference(reference, `${at}.verification.regression[${rIndex}]`, findings));
      if (bug.verification.debugCleanup !== null) receiptReference(bug.verification.debugCleanup, `${at}.verification.debugCleanup`, findings);
    }
    if (!Array.isArray(bug.attempts)) findings.push(`${at}.attempts must be an array`);
    else for (const [aIndex, attempt] of bug.attempts.entries()) {
      const aat = `${at}.attempts[${aIndex}]`;
      if (!object(attempt)) {
        findings.push(`${aat} must be an object`);
        continue;
      }
      exactKeys(attempt, ["id", "revision", "hypothesisId", "changeSummary", "outcome", "evidenceRefs"], aat, findings);
      if (!text(attempt.id, 64)) findings.push(`${aat}.id is required`);
      if (!text(attempt.revision, 128)) findings.push(`${aat}.revision is required`);
      if (!hypothesisIds.has(attempt.hypothesisId)) findings.push(`${aat}.hypothesisId references unknown hypothesis`);
      if (!text(attempt.changeSummary)) findings.push(`${aat}.changeSummary is required`);
      if (!["failed", "succeeded", "reverted"].includes(attempt.outcome)) findings.push(`${aat}.outcome is invalid`);
      receiptIdArray(attempt.evidenceRefs, `${aat}.evidenceRefs`, findings);
    }
    stringArray(bug.residualRisks, `${at}.residualRisks`, findings);
  }
  for (const [index, bug] of bugs.entries()) {
    for (const id of Array.isArray(bug.dependsOn) ? bug.dependsOn : []) if (!bugIds.has(id)) findings.push(`bugs[${index}].dependsOn references unknown bug: ${id}`);
    if (bug.duplicateOf && !bugIds.has(bug.duplicateOf)) findings.push(`bugs[${index}].duplicateOf references unknown bug: ${bug.duplicateOf}`);
    for (const id of Array.isArray(bug.fix?.affectedBugIds) ? bug.fix.affectedBugIds : []) if (!bugIds.has(id)) findings.push(`bugs[${index}].fix.affectedBugIds references unknown bug: ${id}`);
  }
  if (raw.activeBugId !== null && !bugIds.has(raw.activeBugId)) findings.push("activeBugId references unknown bug");
  const active = bugs.filter((bug) => ACTIVE_BUG_STATUSES.has(bug.status));
  if (raw.status === "open" && raw.run?.state === "active") {
    if (active.length !== 1 || active[0]?.id !== raw.activeBugId) findings.push("an active work order must have exactly one active bug matching activeBugId");
  } else if (active.length > 0) findings.push("paused, closed, or aborted work orders cannot contain an active bug");
  if (raw.status === "closed" && bugs.some((bug) => !TERMINAL_BUG_STATUSES.has(bug.status))) findings.push("closed work order contains a non-terminal bug");
  if (!object(raw.resume)) findings.push("resume must be an object");
  else {
    exactKeys(raw.resume, ["nextBugId", "nextAction", "recoveryCommands"], "resume", findings);
    if (raw.resume.nextBugId !== null && !bugIds.has(raw.resume.nextBugId)) findings.push("resume.nextBugId references unknown bug");
    if (!text(raw.resume.nextAction)) findings.push("resume.nextAction is required");
    stringArray(raw.resume.recoveryCommands, "resume.recoveryCommands", findings);
  }
  for (const [index, bug] of bugs.entries()) if (["blocked", "deferred", "architecture-review"].includes(bug.status) && raw.resume?.nextBugId === bug.id && !text(raw.resume?.nextAction)) findings.push(`bugs[${index}] requires a resume action`);
  return { valid: findings.length === 0, findings, workOrder: raw };
}
function loadWorkOrder(path, config) {
  try {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink()) return { present: true, valid: false, findings: ["work order must be a regular non-symlink file"], path };
    if (info.size > config.ledger.maxBytes) return { present: true, valid: false, findings: [`work order exceeds ${config.ledger.maxBytes} bytes`], path };
    const extracted = extractWorkOrder(readFileSync3(path, "utf8"));
    if (!extracted.ok) return { present: true, valid: false, findings: [extracted.error], path };
    return { present: true, path, ...validateWorkOrder(extracted.value, config) };
  } catch (error) {
    return { present: existsSync2(path), valid: false, findings: [`cannot read work order: ${error?.message ?? error}`], path };
  }
}
function isWorkOrderPath(path, repoRoot2, config) {
  const rel = relative(resolve4(repoRoot2), resolve4(path)).replaceAll("\\", "/");
  return !rel.startsWith("../") && rel.startsWith(`${config.ledger.root}/`) && rel.endsWith(".md");
}
function scanWorkOrders(repoRoot2, config) {
  const root = join4(repoRoot2, config.ledger.root);
  let names = [];
  try {
    names = readdirSync(root).filter((name) => name.endsWith(".md")).sort().slice(0, config.ledger.maxFiles);
  } catch {
    return [];
  }
  return names.map((name) => loadWorkOrder(join4(root, name), config)).filter((item) => item.valid && ["open", "paused"].includes(item.workOrder.status));
}

// plugins/debugging-workflow-guard/src/lib/workflow.ts
function gitRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", timeout: 5e3, stdio: ["ignore", "pipe", "ignore"] }).trim();
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
  return patterns.some((pattern) => safeRegex(pattern)?.test(value));
}
function configuredOutcome(command, observed, config) {
  const normalized = normalizeCommand(command);
  if (matchesAny(normalized, config.commands.expectedFailurePatterns)) return "failure";
  if (matchesAny(normalized, config.commands.expectedSuccessPatterns)) return "success";
  return observed;
}
function classifyCommand(command, bug, config) {
  const normalized = normalizeCommand(command);
  if (normalizeCommand(bug?.symptom?.reproduction) === normalized || matchesAny(normalized, config.commands.reproductionPatterns)) return "reproduction";
  if (matchesAny(normalized, config.commands.verificationPatterns) || /(?:^|\s)(?:test|tests|pytest|phpunit|rspec|cargo test|go test|npm test|pnpm test|yarn test|mvn test|gradle test)(?:\s|$)/iu.test(normalized)) return "verification";
  return "command";
}
function classifyPath(path, repoRoot2, config) {
  const rel = relative2(repoRoot2, resolve5(path)).replaceAll("\\", "/");
  const groups = config.paths;
  if (matchesAny(rel, groups.nonCodePatterns)) return "non-code";
  if (matchesAny(rel, groups.diagnosticPatterns) || /(?:^|\/)(?:tmp|temp|debug|diagnostics?)(?:\/|$)/iu.test(rel)) return "diagnostic";
  if (matchesAny(rel, groups.testPatterns) || /(?:^|\/)(?:test|tests|spec|specs|__tests__)(?:\/|$)|(?:\.test|\.spec)\.[^.]+$/iu.test(rel)) return "test";
  if (matchesAny(rel, groups.codePatterns)) return "code";
  if (/\.(?:md|txt|rst|adoc|png|jpe?g|gif|svg|pdf)$/iu.test(rel)) return "non-code";
  return "code";
}
function bindWorkOrderAfterMutation({ cwd, sessionId, touchedPaths, config = DEFAULT_CONFIG, now = Date.now() }) {
  const repoRoot2 = gitRoot(cwd);
  const candidates = [...new Set(touchedPaths)].filter((path) => isWorkOrderPath(path, repoRoot2, config));
  if (candidates.length === 0) return { kind: "idle" };
  if (candidates.length > 1) return { kind: "invalid", findings: ["one hook event cannot bind multiple work orders"] };
  const existing = readState(sessionId, repoRoot2);
  if (existing.bound && existing.workOrderPath !== candidates[0]) return { kind: "conflict", path: candidates[0], findings: [`this session is already bound to ${relative2(repoRoot2, existing.workOrderPath)}`] };
  const checked = loadWorkOrder(candidates[0], config);
  if (!checked.valid) {
    const state2 = {
      ...existing.bound ? existing : emptyState(),
      bound: true,
      workOrderPath: candidates[0],
      invalid: true,
      eventSeq: existing.bound ? existing.eventSeq + 1 : 1,
      updatedAt: now
    };
    writeState(sessionId, repoRoot2, state2);
    return { kind: "invalid", repoRoot: repoRoot2, state: state2, path: candidates[0], findings: checked.findings };
  }
  const workOrder = checked.workOrder;
  if (existing.bound && existing.workOrderId && (existing.workOrderId !== workOrder.id || existing.epoch !== workOrder.run.epoch)) {
    existing.invalid = true;
    existing.eventSeq += 1;
    writeState(sessionId, repoRoot2, existing);
    return { kind: "invalid", repoRoot: repoRoot2, state: existing, path: candidates[0], findings: ["a corrected bound work order must preserve its id and run.epoch"] };
  }
  const active = workOrder.status === "open" && workOrder.run.state === "active";
  if (active) {
    const lease = acquireLease({ repoRoot: repoRoot2, workOrderId: workOrder.id, epoch: workOrder.run.epoch, sessionId, leaseMinutes: config.limits.leaseMinutes, now });
    if (!lease.ok) return { kind: "conflict", path: candidates[0], findings: [lease.reason] };
  }
  const state = {
    ...existing.bound ? existing : emptyState(),
    bound: true,
    workOrderPath: candidates[0],
    workOrderId: workOrder.id,
    epoch: workOrder.run.epoch,
    activeBugId: workOrder.activeBugId,
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
  const checked = loadWorkOrder(state.workOrderPath, config);
  if (!checked.valid) {
    state.invalid = true;
    writeState(sessionId, repoRoot2, state);
    return { kind: "invalid", repoRoot: repoRoot2, state, findings: checked.findings };
  }
  if (checked.workOrder.id !== state.workOrderId || checked.workOrder.run.epoch !== state.epoch) return { kind: "invalid", repoRoot: repoRoot2, state, findings: ["bound work-order id or run.epoch changed unexpectedly"] };
  state.invalid = false;
  state.activeBugId = checked.workOrder.activeBugId;
  if (checked.workOrder.status !== "open" || checked.workOrder.run.state !== "active") {
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
    paths: paths.map((path) => relative2(live.repoRoot, resolve5(path)).replaceAll("\\", "/")).slice(0, 20),
    outcome,
    summary: String(summary).replace(/\s+/gu, " ").slice(0, 240),
    mutationSeq: live.state.mutationSeq,
    revision: live.state.revision,
    at: now
  };
  live.state.receipts.push(receipt);
  if (receipt.kind === "reproduction" && outcome === "failure" && receipt.mutationSeq > 0) {
    live.state.attempts[bug.id] = Number(live.state.attempts[bug.id] || 0) + 1;
  }
  live.state.receipts = live.state.receipts.slice(-config.limits.maxReceipts);
  writeState(sessionId, live.repoRoot, live.state);
  return { ...live, kind: "recorded", receipt };
}
function preMutationDecision({ cwd, sessionId, paths, config = DEFAULT_CONFIG }) {
  const live = refreshBoundWorkOrder({ cwd, sessionId, config });
  if (["idle", "inactive"].includes(live.kind)) return { action: "allow", reason: "no active bound work order" };
  if (live.kind === "invalid" && live.state?.workOrderPath && paths.length > 0 && paths.every((path) => resolve5(path) === resolve5(live.state.workOrderPath))) {
    return { action: "allow", reason: "allowing correction of the invalid bound work order" };
  }
  if (live.kind !== "active") return { action: config.mode === "block" ? "block" : "report", reason: `bound work order is invalid: ${(live.findings ?? []).join("; ")}` };
  const bug = live.workOrder.bugs.find((item) => item.id === live.workOrder.activeBugId);
  const codePaths = paths.filter((path) => classifyPath(path, live.repoRoot, config) === "code" && !isWorkOrderPath(path, live.repoRoot, config));
  if (codePaths.length === 0) return { action: "allow" };
  const attempts = Number(live.state.attempts[bug.id] || 0);
  if (attempts >= config.limits.maxFailedFixAttempts) return { action: config.mode === "block" ? "block" : "report", reason: `${bug.id} reached ${attempts} failed fix attempts; move it to architecture-review and record a new decision before further code changes` };
  const firstMutation = Math.min(...live.state.receipts.filter((receipt) => receipt.bugId === bug.id && receipt.kind === "mutation").map(receiptSequence));
  const baseline = live.state.receipts.find((receipt) => receipt.bugId === bug.id && receipt.kind === "reproduction" && receipt.outcome === "failure" && receiptSequence(receipt) < firstMutation);
  if (!baseline) return { action: config.mode === "block" ? "block" : "report", reason: `${bug.id} has no pre-mutation failing baseline; run the exact reproduction command verbatim, without pipes, redirections, or an echo suffix, and observe its failure` };
  const supported = bug.hypotheses.find((hypothesis) => hypothesis.status === "supported" && hypothesis.evidenceRefs.length > 0 && hypothesis.evidenceRefs.every((reference) => receiptById(live.state, reference)?.bugId === bug.id));
  const rooted = bug.rootCause.status === "supported" && bug.rootCause.evidenceRefs.length > 0 && bug.rootCause.evidenceRefs.every((reference) => receiptById(live.state, reference)?.bugId === bug.id);
  if (!supported || !rooted) return { action: config.mode === "block" ? "block" : "report", reason: `${bug.id} needs a supported hypothesis and root cause backed by current-session receipts for this bug before production-code writes` };
  if (bug.status !== "fixing" || bug.fix.status !== "in-progress") return { action: config.mode === "block" ? "block" : "report", reason: `${bug.id} must be bug status fixing with fix.status in-progress before production-code writes` };
  if (!bug.fix.affectedBugIds.includes(bug.id)) return { action: config.mode === "block" ? "block" : "report", reason: `${bug.id} must include itself in fix.affectedBugIds before production-code writes` };
  for (const affectedId of bug.fix.affectedBugIds) {
    const affectedBaseline = live.state.receipts.find((receipt) => receipt.bugId === affectedId && receipt.kind === "reproduction" && receipt.outcome === "failure" && receiptSequence(receipt) < firstMutation);
    if (!affectedBaseline) return { action: config.mode === "block" ? "block" : "report", reason: `${bug.id} shared fix affected bug ${affectedId} has no attributed failing baseline before the production mutation; switch activeBugId to ${affectedId}, run its exact reproduction verbatim, then switch back` };
  }
  return { action: "allow" };
}
function receiptById(state, reference) {
  const id = typeof reference === "string" ? reference : reference?.receiptId;
  return state.receipts.find((receipt) => receipt.id === id);
}
function receiptSequence(receipt) {
  const matched = /^R-([0-9]+)$/u.exec(String(receipt?.id ?? ""));
  return matched ? Number(matched[1]) : Number.NaN;
}
function completionFindings(live) {
  const findings = [];
  if (!["active", "inactive"].includes(live.kind)) return live.kind === "idle" ? [] : live.findings ?? ["work order is unavailable"];
  const { workOrder, state } = live;
  const byId = new Map(workOrder.bugs.map((bug) => [bug.id, bug]));
  for (const owner of workOrder.bugs) {
    for (const affectedId of owner.fix.affectedBugIds) {
      if (byId.get(affectedId)?.status !== "resolved") findings.push(`${owner.id}: affected bug ${affectedId} is not resolved with its own verification`);
    }
  }
  for (const bug of workOrder.bugs) {
    if (bug.status !== "resolved") continue;
    const repro = receiptById(state, bug.verification.originalReproduction);
    const owners = workOrder.bugs.filter((owner) => owner.fix.affectedBugIds.includes(bug.id));
    const validOwners = owners.filter((owner) => {
      const mutation = receiptById(state, owner.fix.firstRevision);
      return owner.fix.status === "applied" && mutation?.kind === "mutation" && mutation.outcome === "success" && mutation.bugId === owner.id;
    });
    if (validOwners.length === 0) findings.push(`${bug.id}: no applied fix mutation receipt affects this bug`);
    const ownerIds = new Set(validOwners.map((owner) => owner.id));
    const relevantMutations = state.receipts.filter((receipt) => receipt.kind === "mutation" && receipt.outcome === "success" && ownerIds.has(receipt.bugId));
    const firstMutation = Math.min(...relevantMutations.map(receiptSequence));
    const lastMutation = Math.max(...relevantMutations.map(receiptSequence));
    const baseline = state.receipts.find((receipt) => receipt.bugId === bug.id && receipt.kind === "reproduction" && receipt.outcome === "failure" && receiptSequence(receipt) < firstMutation);
    if (!baseline) findings.push(`${bug.id}: no failing original reproduction was observed before production mutation`);
    if (!repro || repro.bugId !== bug.id || repro.kind !== "reproduction" || repro.outcome !== "success") findings.push(`${bug.id}: original reproduction lacks a successful current-session receipt`);
    const supported = bug.hypotheses.find((item) => item.status === "supported" && item.evidenceRefs.length > 0);
    if (!supported) findings.push(`${bug.id}: no supported hypothesis with evidence`);
    else if (supported.evidenceRefs.some((reference) => !receiptById(state, reference) || receiptById(state, reference).bugId !== bug.id)) findings.push(`${bug.id}: supported hypothesis cites stale, forged, or cross-bug evidence`);
    if (bug.rootCause.status !== "supported") findings.push(`${bug.id}: root cause is not supported`);
    else if (bug.rootCause.evidenceRefs.some((reference) => !receiptById(state, reference) || receiptById(state, reference).bugId !== bug.id)) findings.push(`${bug.id}: root cause cites stale, forged, or cross-bug evidence`);
    if (!Array.isArray(bug.verification.regression) || bug.verification.regression.length < 1) findings.push(`${bug.id}: regression verification is missing`);
    else for (const reference of bug.verification.regression) {
      const receipt = receiptById(state, reference);
      if (!receipt || receipt.bugId !== bug.id || receipt.outcome !== "success") findings.push(`${bug.id}: regression receipt is missing, stale, or belongs to another bug`);
    }
    const cleanup = receiptById(state, bug.verification.debugCleanup);
    if (!cleanup || cleanup.bugId !== bug.id || cleanup.outcome === "failure") findings.push(`${bug.id}: debug-marker cleanup receipt is missing, cross-bug, or failed`);
    if (repro && relevantMutations.length > 0 && receiptSequence(repro) < lastMutation) findings.push(`${bug.id}: original reproduction predates the last relevant mutation`);
  }
  if (workOrder.status === "closed" && workOrder.bugs.some((bug) => !["resolved", "blocked", "deferred", "duplicate", "architecture-review"].includes(bug.status))) findings.push("closed work order still has non-terminal bugs");
  return [...new Set(findings)];
}
function closeBinding({ cwd, sessionId, config = DEFAULT_CONFIG }) {
  const live = refreshBoundWorkOrder({ cwd, sessionId, config });
  if (!["active", "inactive"].includes(live.kind)) return live;
  if (["closed", "aborted", "paused"].includes(live.workOrder.status)) releaseLease({ repoRoot: live.repoRoot, workOrderId: live.workOrder.id, sessionId });
  return live;
}

// plugins/debugging-workflow-guard/src/entries/hooks/debugging-workflow-guard.ts
function warn(message) {
  process.stderr.write(`[debugging-workflow-guard] ${message}
`);
}
function repoRoot(cwd) {
  try {
    return execFileSync2("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", timeout: 5e3, stdio: ["ignore", "pipe", "ignore"] }).trim();
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
    const existing = existsSync3(absolute) ? readFileSync4(absolute, "utf8") : "";
    if (!existing.split(/\r?\n/u).includes(entry)) appendFileSync(absolute, `${existing && !existing.endsWith("\n") ? "\n" : ""}${entry}
`, "utf8");
  } catch (error) {
    warn(`cannot update .git/info/exclude: ${error?.message ?? error}`);
  }
}
async function context(event) {
  const cwd = extractCwd(event);
  const root = repoRoot(cwd);
  const config = await loadProjectConfig(root, warn);
  return { cwd, root, config, sessionId: extractSessionId(event) };
}
async function runSession(event) {
  const { root, config } = await context(event);
  if (config.mode === "off") return;
  const orders = scanWorkOrders(root, config);
  if (orders.length === 0) return;
  const lines = ["[Debugging Workflow Guard] Found resumable Debug Work Orders; none was activated."];
  for (const order of orders) lines.push(`- ${relative3(root, order.path)} \u2014 ${order.workOrder.id} (${order.workOrder.status}, epoch ${order.workOrder.run.epoch})`);
  lines.push("Use the debug-workflow Skill to choose one, increment run.epoch when resuming, and edit that work-order file. Hooks activate only after that valid mutation.");
  writeJson(contextOutput("SessionStart", lines.join("\n")));
}
async function runPre(event) {
  const { cwd, root, config, sessionId } = await context(event);
  if (config.mode === "off") return;
  const command = extractShellCommand(event);
  let paths = extractFileTargets2(event);
  if (command && shellMutates(command)) paths = [resolve6(root, "__unknown_shell_mutation__")];
  if (paths.length === 0) return;
  const decision = preMutationDecision({ cwd, sessionId, paths, config });
  if (decision.action === "block") writeJson(preToolDeny(`[Debugging Workflow Guard] ${decision.reason}`));
  else if (decision.action === "report") writeJson(contextOutput("PreToolUse", `[Debugging Workflow Guard] ${decision.reason}`));
}
async function runPost(event, forceFailure = false) {
  const { cwd, root, config, sessionId } = await context(event);
  if (config.mode === "off") return;
  const postEvent = forceFailure ? "PostToolUseFailure" : "PostToolUse";
  const paths = extractFileTargets2(event);
  const workOrderTouches = paths.filter((path) => isWorkOrderPath(path, root, config));
  if (workOrderTouches.length > 0) {
    const before = readState(sessionId, root);
    if (forceFailure && !before.bound && workOrderTouches.every((path) => !existsSync3(path))) {
      writeJson(contextOutput(postEvent, "[Debugging Workflow Guard] Work Order write failed before a file existed; workflow was not activated. Create the ledger directory if needed and retry the same file write."));
      return;
    }
    if (before.bound && workOrderTouches.includes(before.workOrderPath)) {
      const live = refreshBoundWorkOrder({ cwd, sessionId, config });
      if (["active", "inactive"].includes(live.kind)) {
        live.state.revision += 1;
        live.state.activeBugId = live.workOrder.activeBugId;
        writeState(sessionId, root, live.state);
        writeJson(contextOutput(postEvent, `[Debugging Workflow Guard] Work Order ${live.workOrder.id} refreshed; state ${live.workOrder.status}/${live.workOrder.run.state}; active bug ${live.workOrder.activeBugId ?? "none"}.`));
      } else if (live.kind === "invalid") {
        const rebound = bindWorkOrderAfterMutation({ cwd, sessionId, touchedPaths: workOrderTouches, config });
        if (rebound.kind === "bound") {
          ensureLocalExclude(root, config);
          writeJson(contextOutput(postEvent, `[Debugging Workflow Guard] Corrected and bound ${rebound.workOrder.id}; state ${rebound.workOrder.status}/${rebound.workOrder.run.state}.`));
        } else writeJson(contextOutput(postEvent, `[Debugging Workflow Guard] Invalid bound Work Order: ${(rebound.findings ?? live.findings).join("; ")}`));
      }
      closeBinding({ cwd, sessionId, config });
      return;
    }
    const bound = bindWorkOrderAfterMutation({ cwd, sessionId, touchedPaths: workOrderTouches, config });
    if (bound.kind === "bound") {
      ensureLocalExclude(root, config);
      writeJson(contextOutput(postEvent, `[Debugging Workflow Guard] Bound ${bound.workOrder.id} at ${relative3(root, bound.path ?? workOrderTouches[0])}; state ${bound.workOrder.status}/${bound.workOrder.run.state}; active bug ${bound.workOrder.activeBugId ?? "none"}.${bound.active ? " Evidence and mutations are now attributed to that bug." : " No active mutation guard remains."}`));
      closeBinding({ cwd, sessionId, config });
    } else if (["invalid", "conflict"].includes(bound.kind)) writeJson(contextOutput(postEvent, `[Debugging Workflow Guard] Work Order activation rejected: ${(bound.findings ?? []).join("; ")}`));
    return;
  }
  const command = extractShellCommand(event);
  if (command) {
    const outcome = configuredOutcome(command, inferOutcome(event, forceFailure), config);
    const recorded = recordReceipt({ cwd, sessionId, config, kind: shellMutates(command) ? "mutation" : "command", command, outcome, summary: conciseResponse(event) });
    if (recorded.kind === "recorded") writeJson(contextOutput(postEvent, `[Debugging Workflow Guard] Receipt ${recorded.receipt.id}: ${recorded.receipt.kind} ${recorded.receipt.outcome} for ${recorded.receipt.bugId}. Cite this id in the Work Order only when it supports the stated claim.`));
    if (recorded.kind === "recorded" && recorded.receipt.kind === "reproduction" && outcome === "failure") {
      const count = recorded.state.attempts[recorded.receipt.bugId] ?? 0;
      if (count >= config.limits.maxFailedFixAttempts) writeJson(contextOutput(postEvent, `[Debugging Workflow Guard] ${recorded.receipt.bugId} reached ${count} failed post-mutation reproductions. Move only this bug to architecture-review before another production edit.`));
    }
    return;
  }
  if (isMutationTool(event) && paths.length > 0) {
    const live = refreshBoundWorkOrder({ cwd, sessionId, config });
    if (live.kind !== "active") return;
    const codePaths = paths.filter((path) => classifyPath(path, root, config) === "code");
    if (codePaths.length > 0) {
      const recorded = recordReceipt({ cwd, sessionId, config, kind: "mutation", paths: codePaths, outcome: "success", summary: `${codePaths.length} production path(s) changed` });
      if (recorded.kind === "recorded") writeJson(contextOutput(postEvent, `[Debugging Workflow Guard] Receipt ${recorded.receipt.id}: production mutation attributed to ${recorded.receipt.bugId}.`));
    }
  }
}
async function runStop(event) {
  const { cwd, root, config, sessionId } = await context(event);
  if (config.mode === "off") return;
  const live = refreshBoundWorkOrder({ cwd, sessionId, config });
  if (live.kind === "idle") return;
  if (!["active", "inactive"].includes(live.kind)) {
    const reason2 = `[Debugging Workflow Guard] Bound Work Order is invalid: ${(live.findings ?? []).join("; ")}`;
    if (config.mode === "block") writeJson(stopDeny(reason2));
    else writeJson(contextOutput("Stop", reason2));
    return;
  }
  const message = extractAssistantMessage(event);
  const rel = relative3(root, live.state.workOrderPath).replaceAll("\\", "/");
  const findings = live.workOrder.status === "closed" ? completionFindings(live) : [];
  if (live.workOrder.status === "closed") {
    const marker = `DBG_${live.workOrder.id.replace(/[^A-Za-z0-9]+/gu, "_")}`;
    try {
      const matches = execFileSync2("git", ["grep", "--untracked", "-n", "-I", "-e", marker, "--", ".", `:!${config.ledger.root}`], { cwd: root, encoding: "utf8", timeout: 5e3, stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (matches) findings.push(`debug instrumentation remains under marker prefix ${marker}`);
    } catch (error) {
      if (![1, "1"].includes(error?.status)) findings.push("debug-marker cleanup scan could not complete");
    }
  }
  if (!message.includes(rel) && !message.includes(live.workOrder.id)) findings.push(`response must reference ${rel} or ${live.workOrder.id}`);
  if (live.workOrder.status === "open" && live.workOrder.run.state === "active") findings.push("turn cannot stop while the work order remains active; pause it with a concrete resume action or close it");
  if (findings.length === 0) {
    closeBinding({ cwd, sessionId, config });
    return;
  }
  const reason = `[Debugging Workflow Guard] Debug workflow cannot stop:
- ${findings.join("\n- ")}
Update ${rel}; do not invent receipt ids.`;
  if (config.mode === "block") writeJson(stopDeny(reason));
  else writeJson(contextOutput("Stop", reason));
}
async function main(mode = process.argv[2]) {
  const event = await readStdinJson();
  try {
    if (mode === "session") await runSession(event);
    else if (mode === "pre") await runPre(event);
    else if (mode === "post") await runPost(event, false);
    else if (mode === "failure") await runPost(event, true);
    else if (mode === "stop") await runStop(event);
    else {
      warn(`unknown mode: ${mode}`);
      process.exitCode = 2;
    }
  } catch (error) {
    warn(error?.stack ?? error);
    process.exitCode = 1;
  }
}
var isMain = process.argv[1] && resolve6(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main();
}
export {
  main
};
