#!/usr/bin/env node

// plugins/file-access-audit/src/entries/hooks/file-access-audit.ts
import { resolve as resolve5 } from "node:path";
import { fileURLToPath } from "node:url";

// plugins/file-access-audit/src/lib/config.ts
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
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
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
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
  if (!repoRoot) return resolveConfig(null, warn2);
  for (const name of CONFIG_NAMES) {
    const path = join(repoRoot, name);
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

// plugins/file-access-audit/src/lib/hook-io.ts
import { isAbsolute as isAbsolute2, resolve } from "node:path";
var SHELL_TOOLS = /^(?:Bash|bash|Shell|shell|shell_command|exec_command|exec|local_shell)$/iu;
var FILE_TOOLS = /^(?:apply_patch|ApplyPatch|Edit|MultiEdit|NotebookEdit|Write|Read)$/iu;
async function readStdinJson() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { __parseError: true };
  }
}
function extractSessionId(event) {
  return event?.session_id ?? event?.sessionId ?? event?.context?.session_id ?? null;
}
function extractCwd(event) {
  return event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd();
}
function extractToolName(event) {
  return event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? "";
}
function extractToolInput(event) {
  return event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {};
}
function extractToolUseId(event) {
  return event?.tool_use_id ?? event?.toolUseId ?? event?.tool_call_id ?? event?.toolCallId ?? event?.tool_use?.id ?? event?.tool?.id ?? null;
}
function extractShellCommand(event) {
  const name = String(extractToolName(event));
  if (!SHELL_TOOLS.test(name)) return null;
  const input = extractToolInput(event);
  const command = input?.command ?? input?.cmd ?? input?.script;
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
  const paths = [];
  for (const key of [
    "file_path",
    "filePath",
    "path",
    "target_file",
    "notebook_path",
    "notebookPath"
  ]) {
    if (typeof input[key] === "string" && input[key]) paths.push(input[key]);
  }
  if (Array.isArray(input.edits)) {
    for (const edit of input.edits) paths.push(...objectPaths(edit));
  }
  return paths;
}
function patchOps(payload) {
  if (typeof payload !== "string") return [];
  const ops = [];
  for (const line of payload.split("\n")) {
    const file = line.match(/^\*\*\*\s+(Add|Update|Delete) File:\s+(.+)$/u);
    if (file) {
      ops.push({
        op: file[1].toLowerCase() === "add" ? "write" : file[1].toLowerCase() === "delete" ? "delete" : "update",
        path: stripMatchingQuotes(file[2])
      });
      continue;
    }
    const move = line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (move) {
      ops.push({ op: "move", path: stripMatchingQuotes(move[1]) });
    }
  }
  return ops;
}
function inferFileOp(toolName) {
  const name = String(toolName ?? "").replaceAll("_", "").toLowerCase();
  if (name === "read") return "read";
  if (name === "write") return "write";
  if (name === "edit" || name === "multiedit" || name === "notebookedit") return "update";
  if (name === "applypatch") return "update";
  return "update";
}
function extractStructuredFileAccess(event) {
  const toolName = String(extractToolName(event));
  if (!FILE_TOOLS.test(toolName)) return null;
  const input = extractToolInput(event);
  const cwd = resolve(extractCwd(event));
  const canonical = toolName.replaceAll("_", "").toLowerCase();
  if (canonical === "applypatch") {
    const patch = typeof input === "string" ? input : [input?.patch, input?.input, input?.command].filter((value) => typeof value === "string").join("\n");
    const ops = patchOps(patch);
    if (ops.length === 0) return null;
    return {
      toolName,
      op: ops.length === 1 ? ops[0].op : "update",
      paths: [
        ...new Set(
          ops.map((entry) => entry.path).filter(Boolean).map(
            (path) => isAbsolute2(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, ""))
          )
        )
      ]
    };
  }
  const paths = objectPaths(input).map(
    (path) => isAbsolute2(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, ""))
  );
  if (paths.length === 0) return null;
  return {
    toolName,
    op: inferFileOp(toolName),
    paths: [...new Set(paths)]
  };
}
function extractFileTargets(event) {
  const access = extractStructuredFileAccess(event);
  return access?.paths ?? [];
}
function isShellTool(toolName) {
  return SHELL_TOOLS.test(String(toolName ?? ""));
}
function isFileTool(toolName) {
  return FILE_TOOLS.test(String(toolName ?? ""));
}
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
  if (value) process.stdout.write(`${JSON.stringify(value)}
`);
}

// plugins/file-access-audit/src/lib/jsonl-trail.ts
import { createHash, randomBytes } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  existsSync as existsSync2,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  writeSync
} from "node:fs";
import { dirname, join as join2, resolve as resolve2 } from "node:path";
var README_TEXT = `# File access audit

Append-only JSONL trail of structured agent file reads/writes (one file per session).

Write policy:
- The audit plugin may append new lines.
- The audit plugin may rewrite only the last line.
- Earlier lines must not be modified by agents or humans' automation tools.
`;
var GITIGNORE_TEXT = "sessions/\n";
var LOCK_STALE_MS = 1e4;
var LOCK_RETRIES = 40;
var LOCK_WAIT_MS = 25;
function sanitizeSessionKey(sessionId, cwd) {
  const raw = String(sessionId ?? "").trim();
  if (raw) {
    return raw.replace(/[^A-Za-z0-9._-]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 120) || "session";
  }
  const digest = createHash("sha256").update(String(cwd ?? "")).digest("hex").slice(0, 16);
  return `cwd-${digest}`;
}
function trailPaths(repoRoot, auditRoot, sessionKey) {
  const root = join2(resolve2(repoRoot), auditRoot);
  return {
    root,
    sessionsDir: join2(root, "sessions"),
    gitignorePath: join2(root, ".gitignore"),
    readmePath: join2(root, "README.md"),
    sessionPath: join2(root, "sessions", `${sessionKey}.jsonl`)
  };
}
function ensureLayout(paths) {
  mkdirSync(paths.sessionsDir, { recursive: true, mode: 448 });
  if (!existsSync2(paths.gitignorePath)) {
    writeFileSync(paths.gitignorePath, GITIGNORE_TEXT, { encoding: "utf8", mode: 384 });
  }
  if (!existsSync2(paths.readmePath)) {
    writeFileSync(paths.readmePath, README_TEXT, { encoding: "utf8", mode: 384 });
  }
}
function sleepMs(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
  }
}
function acquireLock(sessionPath) {
  const lockPath = `${sessionPath}.lock`;
  mkdirSync(dirname(sessionPath), { recursive: true, mode: 448 });
  for (let attempt = 0; attempt < LOCK_RETRIES; attempt += 1) {
    try {
      const fd = openSync(lockPath, "wx", 384);
      writeSync(fd, `${process.pid}
${Date.now()}
`);
      return { fd, lockPath };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        const raw = readFileSync(lockPath, "utf8");
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
  const directory = dirname(sessionPath);
  mkdirSync(directory, { recursive: true, mode: 448 });
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
function prepareTrail(repoRoot, auditRoot, sessionKey) {
  const paths = trailPaths(repoRoot, auditRoot, sessionKey);
  ensureLayout(paths);
  return paths;
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
import { isAbsolute as isAbsolute4, relative as relative2, resolve as resolve4 } from "node:path";
function underAuditRoot(filePath, auditRootAbs) {
  const abs = resolve4(filePath);
  const root = resolve4(auditRootAbs);
  const rel = relative2(root, abs).replaceAll("\\", "/");
  return rel === "" || !rel.startsWith("../") && !isAbsolute4(rel);
}
function targetsHitAuditRoot(event, auditRootAbs) {
  const hits = [];
  for (const target of extractFileTargets(event)) {
    if (underAuditRoot(target, auditRootAbs)) hits.push(target);
  }
  return hits;
}
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
function auditRootMarkers(auditRootRel, auditRootAbs) {
  const normalized = String(auditRootRel ?? "").replace(/^\.\//u, "").replace(/\/+$/u, "");
  return [
    auditRootRel,
    normalized,
    auditRootAbs,
    normalized ? `${normalized}/` : null,
    normalized ? `./${normalized}` : null,
    normalized ? `./${normalized}/` : null
  ].filter(Boolean);
}
function commandMentionsAuditRoot(command, auditRootRel, auditRootAbs) {
  const text = String(command ?? "");
  if (!text.trim()) return false;
  for (const marker of auditRootMarkers(auditRootRel, auditRootAbs)) {
    const escaped = escapeRegExp(marker);
    const re = new RegExp(
      `(?:^|[\\s;|&\`"'(){}\\[\\]])${escaped}(?:$|[\\s;|&\`"'(){}\\[\\]//])`,
      "u"
    );
    if (re.test(text)) return true;
  }
  return false;
}
function isAuditMutationCommand(command) {
  const text = String(command ?? "");
  if (!text.trim()) return false;
  if (/(?:^|[^0-9])>{1,2}\s*(?:"[^"]*"|'[^']*'|\S+)/u.test(text)) return true;
  if (/<<\s*['"]?\w+/u.test(text)) return true;
  if (/(?:^|[\s;|&`(])(?:\/(?:usr\/)?bin\/)?(?:rm|mv|cp|tee|truncate|shred|unlink|chmod|chown|rsync|dd|install)\b/iu.test(text)) {
    return true;
  }
  if (/(?:^|[\s;|&`(])find\b[\s\S]*\s-delete\b/iu.test(text)) return true;
  if (/(?:^|[\s;|&`(])git\s+clean\b/iu.test(text)) return true;
  if (/(?:^|[\s;|&`(])sed\s+(?:-i\b|\S*i\S*\b)/iu.test(text)) return true;
  if (/(?:^|[\s;|&`(])(?:perl|ruby|python3?)\s+[^\n]*\s-i\b/iu.test(text)) return true;
  if (/(?:^|[\s;|&`(])(?:node(?:js)?|deno|bun|perl|ruby|php|lua|python3?)\b/iu.test(text)) return true;
  return false;
}
function shellMutatesAuditRoot(command, auditRootRel, auditRootAbs) {
  if (!commandMentionsAuditRoot(command, auditRootRel, auditRootAbs)) return false;
  return isAuditMutationCommand(command);
}
function protectDecision(event, auditRootRel, auditRootAbs) {
  const toolName = extractToolName(event);
  if (isFileTool(toolName)) {
    const hits = targetsHitAuditRoot(event, auditRootAbs);
    if (hits.length > 0) {
      return {
        deny: true,
        reason: [
          "[File Access Audit] Audit trail is protected",
          "",
          `Blocked path(s): ${hits.map((path) => relative2(process.cwd(), path) || path).join(", ")}`,
          `Root: ${auditRootRel}/`,
          "",
          "Write policy: only the audit plugin may append lines or rewrite the last line.",
          "Do not Read/Edit/Write session JSONL files or other files under the audit root."
        ].join("\n")
      };
    }
  }
  if (isShellTool(toolName)) {
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
function modeFromArgv() {
  const mode = process.argv[2] ?? "post";
  if (mode === "pre" || mode === "post") return mode;
  return "post";
}
function extractCwd2(event) {
  return event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd();
}
async function main() {
  const mode = modeFromArgv();
  const event = await readStdinJson();
  if (event?.__parseError) return;
  const cwd = resolve5(extractCwd2(event));
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
    const paths = prepareTrail(repoRoot, config.auditRoot, sessionKey);
    const record = {
      schema: "file-access/v1",
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      session_id: extractSessionId(event),
      cwd,
      tool_name: access.toolName || extractToolName(event),
      tool_use_id: extractToolUseId(event),
      op: access.op,
      paths: access.paths.map((path) => toDisplayPath(path, repoRoot)),
      host: inferHost(event)
    };
    appendRecord(paths.sessionPath, record);
  } catch (error) {
    warn(`failed to record file access: ${error?.message ?? error}`);
  }
}
var isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve5(process.argv[1]);
if (isMain) {
  main().catch((error) => {
    warn(error?.message ?? String(error));
    process.exitCode = 0;
  });
}
