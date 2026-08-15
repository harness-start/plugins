#!/usr/bin/env node
// harness-source-hash: sha256:a05b1d74ea0c59a5ebe73e4f1ebb8ac8e3cde56d4086a651f32b0dfbf9c59f23

// plugins/file-access-audit/src/entries/hooks/file-access-audit.ts
import { resolve as resolve5 } from "node:path";
import { fileURLToPath } from "node:url";

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
function eventToolUseId(event) {
  const tool = nestedRecord(event, "tool");
  const toolUse = nestedRecord(event, "tool_use");
  return firstString(
    event.tool_use_id,
    event.toolUseId,
    event.tool_call_id,
    event.toolCallId,
    toolUse?.id,
    tool?.id
  );
}

// plugins/file-access-audit/src/lib/config.ts
import { isAbsolute } from "node:path";

// core/src/project-config.ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
async function loadExecutableConfig(options) {
  const warn2 = options.warn ?? (() => {
  });
  if (!options.repoRoot) return options.resolve(null, warn2);
  for (const name of options.names) {
    const path = join(options.repoRoot, name);
    if (!existsSync(path)) continue;
    try {
      const loaded = await import(pathToFileURL(path).href);
      return options.resolve(loaded.default ?? loaded, warn2);
    } catch (error) {
      warn2(`failed to load ${name}: ${error instanceof Error ? error.message : String(error)}`);
      return options.resolve(null, warn2);
    }
  }
  return options.resolve(null, warn2);
}

// plugins/file-access-audit/src/lib/config.ts
var DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  auditRoot: ".file-access-audit"
});
var CONFIG_NAMES = [
  ".file-access-audit.mjs",
  ".file-access-audit.cjs",
  ".file-access-audit.js"
];
var RESERVED_ROOTS = /* @__PURE__ */ new Set([
  "src",
  "lib",
  "app",
  "apps",
  "packages",
  "tmp",
  "temp",
  "logs",
  "log",
  "out",
  "dist",
  "build",
  "node_modules",
  "vendor",
  "test",
  "tests"
]);
function resolveConfig(raw, warn2 = () => {
}) {
  const config = {
    enabled: DEFAULT_CONFIG.enabled,
    auditRoot: DEFAULT_CONFIG.auditRoot
  };
  if (!isRecord(raw)) {
    if (raw != null) warn2("config must be an object; using defaults");
    return config;
  }
  if (typeof raw.enabled === "boolean") config.enabled = raw.enabled;
  else if (raw.enabled !== void 0) warn2("enabled must be boolean");
  if (typeof raw.auditRoot === "string" && raw.auditRoot.trim()) {
    const root = raw.auditRoot.trim().replaceAll("\\", "/").replace(/\/+$/u, "");
    const base = root.split("/").filter(Boolean)[0] ?? "";
    if (!root || root.includes("..") || isAbsolute(root) || /^[A-Za-z]:\//u.test(root) || RESERVED_ROOTS.has(base.toLowerCase())) {
      warn2("auditRoot must be a relative non-reserved path without ..; using default");
    } else {
      config.auditRoot = root;
    }
  } else if (raw.auditRoot !== void 0) {
    warn2("auditRoot must be a non-empty string");
  }
  return config;
}
async function loadProjectConfig(repoRoot, warn2 = () => {
}) {
  return loadExecutableConfig({
    repoRoot,
    names: CONFIG_NAMES,
    resolve: resolveConfig,
    warn: warn2
  });
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
function writeJson(value) {
  if (value !== null && value !== void 0) {
    process.stdout.write(`${JSON.stringify(value)}
`);
  }
}

// core/src/hook-targets.ts
import { isAbsolute as isAbsolute2, resolve } from "node:path";
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
    raw.map(stripMatchingQuotes).filter(Boolean).map((path) => isAbsolute2(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, "")))
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

// plugins/file-access-audit/src/lib/hook-io.ts
function extractSessionId(event) {
  return eventSessionId(event) || null;
}
function extractToolUseId(event) {
  return eventToolUseId(event) || null;
}
function inferFileOp(toolName) {
  const name = String(toolName ?? "").replaceAll("_", "").toLowerCase();
  if (name === "read") return "read";
  if (name === "write" || name === "createfile") return "write";
  if (name === "edit" || name === "multiedit" || name === "notebookedit" || name === "searchreplace") return "update";
  if (name === "applypatch") return "update";
  return "update";
}
function extractStructuredFileAccess(event) {
  const toolName = String(eventToolName(event));
  if (!isFileTool(toolName)) return null;
  const paths = extractFileTargets(event, { tools: "read-or-mutation" });
  if (paths.length === 0) return null;
  return { toolName, op: inferFileOp(toolName), paths };
}
function extractFileTargets2(event) {
  return extractStructuredFileAccess(event)?.paths ?? [];
}
function isShellTool2(toolName) {
  return isShellTool(toolName);
}
function isFileTool(toolName) {
  return isFileMutationTool(toolName) || isReadTool(toolName);
}

// core/src/jsonl-trail.ts
import { createHash, randomBytes } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  existsSync as existsSync2,
  mkdirSync as mkdirSync2,
  openSync,
  readFileSync as readFileSync2,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync as writeFileSync2,
  writeSync
} from "node:fs";
import { dirname, join as join3, resolve as resolve2 } from "node:path";

// core/src/plugin-workdir.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join as join2 } from "node:path";
var PLUGIN_WORKDIR_GITIGNORE = "*\n";
function normalizeGitignore(text) {
  return String(text ?? "").replace(/\r\n/gu, "\n").trim();
}
function isStalePluginWorkdirGitignore(text) {
  const value = normalizeGitignore(text);
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

// core/src/jsonl-trail.ts
var LOCK_STALE_MS = 1e4;
var LOCK_RETRIES = 40;
var LOCK_WAIT_MS = 25;
function sanitizeSessionKey(sessionId, cwd) {
  const raw = String(sessionId ?? "").trim();
  if (raw) {
    return raw.replace(/[^A-Za-z0-9._-]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 120) || "session";
  }
  return `cwd-${createHash("sha256").update(String(cwd ?? "")).digest("hex").slice(0, 16)}`;
}
function trailPaths(repoRoot, auditRoot, sessionKey) {
  const root = join3(resolve2(repoRoot), auditRoot);
  return {
    root,
    sessionsDir: join3(root, "sessions"),
    gitignorePath: join3(root, ".gitignore"),
    readmePath: join3(root, "README.md"),
    sessionPath: join3(root, "sessions", `${sessionKey}.jsonl`)
  };
}
function sleepMs(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
  }
}
function acquireLock(sessionPath) {
  const lockPath = `${sessionPath}.lock`;
  mkdirSync2(dirname(sessionPath), { recursive: true, mode: 448 });
  for (let attempt = 0; attempt < LOCK_RETRIES; attempt += 1) {
    try {
      const fd = openSync(lockPath, "wx", 384);
      writeSync(fd, `${process.pid}
${Date.now()}
`);
      return { fd, lockPath };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        const raw = readFileSync2(lockPath, "utf8");
        const ts = Number(raw.split("\n")[1] ?? 0);
        if (Number.isFinite(ts) && Date.now() - ts > LOCK_STALE_MS) {
          unlinkSync(lockPath);
          continue;
        }
      } catch {
      }
      sleepMs(LOCK_WAIT_MS);
    }
  }
  return null;
}
function releaseLock(lock) {
  if (!lock) return;
  try {
    closeSync(lock.fd);
  } catch {
  }
  try {
    unlinkSync(lock.lockPath);
  } catch {
  }
}
function appendRecord(sessionPath, record) {
  mkdirSync2(dirname(sessionPath), { recursive: true, mode: 448 });
  const line = `${JSON.stringify(record)}
`;
  const lock = acquireLock(sessionPath);
  try {
    const flag = existsSync2(sessionPath) ? "a" : "ax";
    try {
      appendFileSync(sessionPath, line, { encoding: "utf8", mode: 384, flag });
    } catch {
      appendFileSync(sessionPath, line, { encoding: "utf8", mode: 384 });
    }
  } finally {
    releaseLock(lock);
  }
  return sessionPath;
}
function prepareTrail(repoRoot, auditRoot, sessionKey, layout) {
  const paths = trailPaths(repoRoot, auditRoot, sessionKey);
  mkdirSync2(paths.sessionsDir, { recursive: true, mode: 448 });
  ensurePluginWorkdirGitignore(paths.root);
  if (!existsSync2(paths.readmePath)) writeFileSync2(paths.readmePath, layout.readme, { encoding: "utf8", mode: 384 });
  return paths;
}

// plugins/file-access-audit/src/lib/jsonl-trail.ts
var README_TEXT = `# File access audit

Append-only JSONL trail of structured agent file reads/writes (one file per session).

Write policy:
- The audit plugin may append new lines.
- The audit plugin may rewrite only the last line.
- Earlier lines must not be modified by agents or humans' automation tools.
`;
function prepareTrail2(repoRoot, auditRoot, sessionKey) {
  return prepareTrail(repoRoot, auditRoot, sessionKey, { readme: README_TEXT });
}

// plugins/file-access-audit/src/lib/paths.ts
import { execFileSync } from "node:child_process";
import { isAbsolute as isAbsolute3, relative, resolve as resolve3 } from "node:path";
function resolveRepoRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5e3
    }).trim();
  } catch {
    return null;
  }
}
function toDisplayPath(filePath, base) {
  const abs = resolve3(filePath);
  if (!base) return abs.replaceAll("\\", "/");
  const candidate = relative(base, abs).replaceAll("\\", "/");
  if (candidate && candidate !== ".." && !candidate.startsWith("../") && !isAbsolute3(candidate)) {
    return candidate;
  }
  return abs.replaceAll("\\", "/");
}
function inferHost(event) {
  if (process.env.PLUGIN_ROOT && !process.env.CLAUDE_PLUGIN_ROOT) return "codex";
  if (process.env.CLAUDE_PLUGIN_ROOT) return "claude";
  if (event?.hook_event_name || event?.hookEventName) {
  }
  return "unknown";
}

// plugins/file-access-audit/src/lib/protect.ts
import { relative as relative3 } from "node:path";

// core/src/path-protect.ts
import { isAbsolute as isAbsolute4, relative as relative2, resolve as resolve4 } from "node:path";
function pathUnderRoot(filePath, rootAbs) {
  const rel = relative2(resolve4(rootAbs), resolve4(filePath)).replaceAll("\\", "/");
  return rel === "" || !rel.startsWith("../") && !isAbsolute4(rel);
}
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

// plugins/file-access-audit/src/lib/protect.ts
function targetsHitAuditRoot(event, auditRootAbs) {
  return extractFileTargets2(event).filter((target) => pathUnderRoot(target, auditRootAbs));
}
function commandMentionsAuditRoot(command, auditRootRel, auditRootAbs) {
  return commandMentionsRoot(command, auditRootRel, auditRootAbs);
}
function isAuditMutationCommand(command) {
  return isGenericMutationCommand(command);
}
function shellMutatesAuditRoot(command, auditRootRel, auditRootAbs) {
  return commandMentionsAuditRoot(command, auditRootRel, auditRootAbs) && isAuditMutationCommand(command);
}
function protectDecision(event, auditRootRel, auditRootAbs) {
  const toolName = eventToolName(event);
  if (isFileTool(toolName)) {
    const hits = targetsHitAuditRoot(event, auditRootAbs);
    if (hits.length > 0) {
      return {
        deny: true,
        reason: [
          "[File Access Audit] Audit trail is protected",
          "",
          `Blocked path(s): ${hits.map((path) => relative3(process.cwd(), path) || path).join(", ")}`,
          `Root: ${auditRootRel}/`,
          "",
          "Write policy: only the audit plugin may append lines or rewrite the last line.",
          "Do not Read/Edit/Write session JSONL files or other files under the audit root."
        ].join("\n")
      };
    }
  }
  if (isShellTool2(toolName)) {
    const command = extractShellCommand(event);
    if (command && shellMutatesAuditRoot(command, auditRootRel, auditRootAbs)) {
      return {
        deny: true,
        reason: [
          "[File Access Audit] Audit trail is protected",
          "",
          `Root: ${auditRootRel}/`,
          "Shell mutation of the audit trail is denied.",
          "Let the audit plugin own append / last-line updates."
        ].join("\n")
      };
    }
  }
  return { deny: false };
}

// plugins/file-access-audit/src/entries/hooks/file-access-audit.ts
function warn(message) {
  process.stderr.write(`[file-access-audit] ${message}
`);
}
function errorText(error) {
  if (isRecord(error) && error.message != null) return String(error.message);
  return String(error);
}
function modeFromArgv() {
  const mode = process.argv[2] ?? "post";
  if (mode === "pre" || mode === "post") return mode;
  return "post";
}
function extractCwd(event) {
  const value = event.cwd ?? event.working_directory ?? event.workingDirectory;
  return typeof value === "string" ? value : process.cwd();
}
async function main() {
  const mode = modeFromArgv();
  const event = await readStdinJson();
  if (event.__parseError) return;
  const cwd = resolve5(extractCwd(event));
  const repoRoot = resolveRepoRoot(cwd) ?? cwd;
  const config = await loadProjectConfig(repoRoot, warn);
  if (!config.enabled) return;
  const auditRootAbs = resolve5(repoRoot, config.auditRoot);
  if (mode === "pre") {
    const decision = protectDecision(event, config.auditRoot, auditRootAbs);
    if (decision.deny) {
      writeJson(preToolDeny(decision.reason));
    }
    return;
  }
  const access = extractStructuredFileAccess(event);
  if (!access || access.paths.length === 0) return;
  try {
    const sessionKey = sanitizeSessionKey(extractSessionId(event), cwd);
    const paths = prepareTrail2(repoRoot, config.auditRoot, sessionKey);
    const record = {
      schema: "file-access/v1",
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      session_id: extractSessionId(event),
      cwd,
      tool_name: access.toolName || eventToolName(event),
      tool_use_id: extractToolUseId(event),
      op: access.op,
      paths: access.paths.map((path) => toDisplayPath(path, repoRoot)),
      host: inferHost(event)
    };
    appendRecord(paths.sessionPath, record);
  } catch (error) {
    warn(`failed to record file access: ${errorText(error)}`);
  }
}
var entryPath = process.argv[1];
var isMain = Boolean(entryPath) && fileURLToPath(import.meta.url) === resolve5(entryPath ?? "");
if (isMain) {
  main().catch((error) => {
    warn(errorText(error));
    process.exitCode = 0;
  });
}
