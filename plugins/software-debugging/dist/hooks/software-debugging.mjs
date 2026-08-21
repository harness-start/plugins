#!/usr/bin/env node
// harness-source-hash: sha256:38a4e418e6ddb62195a4c01166319d849879f64370d47fb90829cac8a469e100
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
  isLedgerManagedPath,
  isOfficialWriterCommand,
  isRecord,
  isWorkOrderPath,
  loadLedger,
  loadProjectConfig,
  parseWriterStdout,
  readStdinJson,
  scanLedgers,
  writerActionFromCommand
} from "../chunks/chunk-XOBPUQZ7.mjs";

// plugins/software-debugging/src/entries/hooks/software-debugging.ts
import { appendFileSync, existsSync, readFileSync as readFileSync2 } from "node:fs";
import { execFileSync as execFileSync2 } from "node:child_process";
import { relative as relative2, resolve as resolve5 } from "node:path";
import { fileURLToPath } from "node:url";

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

// plugins/software-debugging/src/lib/hook-io.ts
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

// plugins/software-debugging/src/lib/hook-io.ts
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
  const cwd = resolve2(eventCwd(event));
  const core = extractFileTargets(event);
  const extras = responsePaths(extractToolResponse(event)).map((value) => isAbsolute2(value) ? resolve2(value) : resolve2(cwd, stripMatchingQuotes2(value).replace(/^\.\//u, "")));
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
function contextOutput(eventName, text) {
  return additionalContext(eventName, text);
}
function stopDeny(reason) {
  return stopBlock(reason);
}

// plugins/software-debugging/src/lib/state-store.ts
import { createHash, randomBytes } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve as resolve3 } from "node:path";
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
  return join(resolve3(cwd), STATE_DIR_RELATIVE, "sessions", `${digest(session)}.json`);
}
function atomicWrite(path, value) {
  if (!path) return false;
  const directory = dirname(path);
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
    const parsed = JSON.parse(readFileSync(path, "utf8"));
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
  return join(resolve3(repoRoot2), STATE_DIR_RELATIVE, "leases", `${digest(workOrderId)}.json`);
}
function acquireLease({ repoRoot: repoRoot2, workOrderId, epoch, sessionId, leaseMinutes, now = Date.now() }) {
  const path = registryPath(repoRoot2, workOrderId);
  if (!path) return { ok: true, persisted: false };
  const lock = `${path}.lock`;
  const createLock = () => {
    mkdirSync(dirname(path), { recursive: true, mode: 448 });
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

// plugins/software-debugging/src/lib/workflow.ts
import { createHash as createHash2 } from "node:crypto";
import { execFileSync } from "node:child_process";
import { relative, resolve as resolve4 } from "node:path";
function gitRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", timeout: 5e3, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return resolve4(cwd);
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
  const rel = relative(repoRoot2, resolve4(path)).replaceAll("\\", "/");
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
  const existing = readState(sessionId, repoRoot2);
  if (existing.bound && existing.workOrderPath && !sameLedgerPath(existing.workOrderPath, candidate)) {
    return { kind: "conflict", path: candidate, findings: [`this session is already bound to ${relative(repoRoot2, existing.workOrderPath)}`] };
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
    paths: paths.map((path) => relative(live.repoRoot, resolve4(path)).replaceAll("\\", "/")).slice(0, 20),
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
  if (live.kind === "invalid" && boundPath && paths.length > 0 && paths.every((path) => resolve4(path) === resolve4(boundPath))) {
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
    const regression = after.find((receipt) => receipt.id !== repro?.id && receipt.outcome === "success");
    if (!regression) findings.push(`${String(bugId)}: regression verification is missing`);
    const cleanup = after.find((receipt) => receipt.id !== repro?.id && receipt.id !== regression?.id && receipt.outcome !== "failure");
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
  if (slug) touched.push(resolve4(repoRoot2, config.ledger.root, slug));
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

// plugins/software-debugging/src/entries/hooks/software-debugging.ts
function warn(message) {
  process.stderr.write(`[software-debugging] ${String(message)}
`);
}
function repoRoot(cwd) {
  try {
    return execFileSync2("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", timeout: 5e3, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return resolve5(cwd);
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
    const absolute = resolve5(root, path);
    const entry = `/${config.ledger.root}/`;
    const existing = existsSync(absolute) ? readFileSync2(absolute, "utf8") : "";
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
  writeJson(contextOutput("SessionStart", lines.join("\n")));
}
async function runPre(event) {
  const { cwd, root, config, sessionId } = await context(event);
  if (config.mode === "off") return;
  const command = extractShellCommand(event);
  let paths = extractFileTargets2(event);
  if (command && isOfficialWriterCommand(command)) {
    return;
  }
  if (command && (shellMutates(command) || isGenericMutationCommand(command)) && commandMentionsRoot(command, config.ledger.root, resolve5(root, config.ledger.root))) {
    writeJson(preToolDeny("[Debugging Workflow Guard] Direct ledger mutation is denied; use the debug-workflow CLI writer."));
    return;
  }
  const ledgerWrites = paths.filter((path) => isLedgerManagedPath(path, root, config));
  if (ledgerWrites.length > 0 && isMutationTool(event)) {
    writeJson(preToolDeny("[Debugging Workflow Guard] Direct file-tool writes to a live ledger are denied; use the debug-workflow CLI writer."));
    return;
  }
  if (command && shellMutates(command)) paths = [resolve5(root, "__unknown_shell_mutation__")];
  if (paths.length === 0) return;
  const decision = preMutationDecision({ cwd, sessionId, paths, config });
  if (decision.action === "block") writeJson(preToolDeny(`[Debugging Workflow Guard] ${decision.reason}`));
  else if (decision.action === "report") writeJson(contextOutput("PreToolUse", `[Debugging Workflow Guard] ${decision.reason}`));
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
        writeJson(contextOutput(postEvent, `[Debugging Workflow Guard] Bound ${String(bound.workOrder.id)} at ${relative2(root, boundPath)}; state ${String(bound.workOrder.status)}/${String(bound.workOrder.run?.state)}; active bug ${bound.workOrder.activeBugId ?? "none"}.${bound.active ? " Evidence and mutations are now attributed to that bug." : " No active mutation guard remains."}`));
        closeBinding({ cwd, sessionId, config });
      } else if (bound.kind === "invalid" || bound.kind === "conflict") {
        writeJson(contextOutput(postEvent, `[Debugging Workflow Guard] Work Order activation rejected: ${(bound.findings ?? []).join("; ")}`));
      } else if (bound.kind === "active" || bound.kind === "inactive") {
        writeJson(contextOutput(postEvent, `[Debugging Workflow Guard] Work Order ${String(bound.workOrder.id)} refreshed; state ${String(bound.workOrder.status)}/${String(bound.workOrder.run?.state)}; active bug ${bound.workOrder.activeBugId ?? "none"}.`));
        closeBinding({ cwd, sessionId, config });
      }
      return;
    }
  }
  const ledgerTouches = paths.filter((path) => isLedgerManagedPath(path, root, config));
  if (ledgerTouches.length > 0) {
    const before = readState(sessionId, root);
    if (forceFailure && !before.bound && ledgerTouches.every((path) => !existsSync(path))) {
      writeJson(contextOutput(postEvent, "[Debugging Workflow Guard] Work Order write failed before a file existed; workflow was not activated. Use the debug-workflow CLI writer."));
      return;
    }
    writeJson(contextOutput(postEvent, "[Debugging Workflow Guard] Direct ledger writes do not activate the workflow; use the debug-workflow CLI writer."));
    return;
  }
  if (command) {
    const outcome = configuredOutcome(command, inferOutcome(event, forceFailure), config);
    const recorded = recordReceipt({ cwd, sessionId, config, kind: shellMutates(command) ? "mutation" : "command", command, outcome, summary: conciseResponse(event) });
    if (recorded.kind === "recorded") writeJson(contextOutput(postEvent, `[Debugging Workflow Guard] Receipt ${recorded.receipt.id}: ${String(recorded.receipt.kind)} ${String(recorded.receipt.outcome)} for ${String(recorded.receipt.bugId)}. Cite this id only when it supports the stated claim.`));
    if (recorded.kind === "recorded" && recorded.receipt.kind === "reproduction" && outcome === "failure") {
      const count = recorded.state.attempts[String(recorded.receipt.bugId)] ?? 0;
      if (count >= config.limits.maxFailedFixAttempts) writeJson(contextOutput(postEvent, `[Debugging Workflow Guard] ${String(recorded.receipt.bugId)} reached ${count} failed post-mutation reproductions. Move only this bug to architecture-review before another production edit.`));
    }
    return;
  }
  if (isMutationTool(event) && paths.length > 0) {
    const live = refreshBoundWorkOrder({ cwd, sessionId, config });
    if (live.kind !== "active") return;
    const codePaths = paths.filter((path) => classifyPath(path, root, config) === "code");
    if (codePaths.length > 0) {
      const recorded = recordReceipt({ cwd, sessionId, config, kind: "mutation", paths: codePaths, outcome: "success", summary: `${codePaths.length} production path(s) changed` });
      if (recorded.kind === "recorded") writeJson(contextOutput(postEvent, `[Debugging Workflow Guard] Receipt ${recorded.receipt.id}: production mutation attributed to ${String(recorded.receipt.bugId)}.`));
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
    if (config.mode === "block") writeJson(stopDeny(reason2));
    else writeJson(contextOutput("Stop", reason2));
    return;
  }
  const message = eventAssistantMessage(event);
  const rel = relative2(root, live.state.workOrderPath ?? "").replaceAll("\\", "/");
  const findings = live.workOrder.status === "closed" ? completionFindings(live) : [];
  if (live.workOrder.status === "closed") {
    const marker = `DBG_${String(live.workOrder.id).replace(/[^A-Za-z0-9]+/gu, "_")}`;
    try {
      const matches = execFileSync2("git", ["grep", "--untracked", "-n", "-I", "-e", marker, "--", ".", `:!${config.ledger.root}`], { cwd: root, encoding: "utf8", timeout: 5e3, stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (matches) findings.push(`debug instrumentation remains under marker prefix ${marker}`);
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
    warn(error instanceof Error ? error.stack ?? error : error);
    process.exitCode = 1;
  }
}
var isMain = process.argv[1] && resolve5(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main();
}
export {
  main
};
