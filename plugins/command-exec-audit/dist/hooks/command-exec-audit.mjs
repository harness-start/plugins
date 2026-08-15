#!/usr/bin/env node
// harness-source-hash: sha256:f65147a7fa6ddc46862f512f667aa1915212dd3040d1e06af6f45ac2fb24813f

// plugins/command-exec-audit/src/entries/hooks/command-exec-audit.ts
import { resolve as resolve4 } from "node:path";
import { fileURLToPath } from "node:url";

// plugins/command-exec-audit/src/lib/hook-io.ts
import { isAbsolute, resolve } from "node:path";
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
function extractToolResponse(event) {
  return event?.tool_response ?? event?.toolResponse ?? event?.tool_result ?? event?.toolResult ?? event?.response ?? event?.tool?.response ?? null;
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
function patchPaths(payload) {
  if (typeof payload !== "string") return [];
  const paths = [];
  for (const line of payload.split("\n")) {
    const file = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u);
    const move = line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (file) paths.push(stripMatchingQuotes(file[1]));
    if (move) paths.push(stripMatchingQuotes(move[1]));
  }
  return paths;
}
function extractFileTargets(event) {
  const toolName = String(extractToolName(event));
  if (!FILE_TOOLS.test(toolName)) return [];
  const input = extractToolInput(event);
  const cwd = resolve(extractCwd(event));
  const targets = objectPaths(input);
  const patch = typeof input === "string" ? input : [input?.patch, input?.input, input?.command].filter((value) => typeof value === "string").join("\n");
  targets.push(...patchPaths(patch));
  return [
    ...new Set(
      targets.map(stripMatchingQuotes).filter(Boolean).map(
        (path) => isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, ""))
      )
    )
  ];
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

// plugins/command-exec-audit/src/lib/command-policy.ts
function sameToolUseId(left, right) {
  const a = left == null ? "" : String(left).trim();
  const b = right == null ? "" : String(right).trim();
  if (!a || !b) return false;
  return a === b;
}
function redactCommand(command, { maxCommandChars = 2e3, redactSecrets = true } = {}) {
  let text = String(command ?? "");
  if (redactSecrets) {
    text = text.replace(/\b(Bearer)\s+[A-Za-z0-9._\-+/=]+/giu, "$1 ***").replace(
      /\b((?:MYSQL_PWD|PGPASSWORD|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|GITHUB_TOKEN|GH_TOKEN|NPM_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY)[A-Za-z0-9_]*)\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/giu,
      "$1=***"
    ).replace(
      /\b([A-Za-z_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY|ACCESS[_-]?KEY)[A-Za-z_]*)\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/giu,
      "$1=***"
    ).replace(
      /\b([A-Za-z_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY)[A-Za-z_]*)\s*:\s*(?:"[^"]*"|'[^']*'|\S+)/giu,
      "$1:***"
    ).replace(/(?:^|\s)(-u|--user)\s+\S+:\S+/giu, " $1 ***:****").replace(/(?:^|\s)(--password|--passwd|-p)\s+(?:"[^"]*"|'[^']*'|\S+)/giu, " $1 ***");
  }
  if (text.length > maxCommandChars) {
    return `${text.slice(0, maxCommandChars)}\u2026`;
  }
  return text;
}
function inferCommandStatus(event, forceFailure = false) {
  if (forceFailure) {
    return { status: "failure", exit_code: extractExitCode(event) };
  }
  const response = extractToolResponse(event);
  if (typeof response === "string") {
    const matches = [
      ...response.matchAll(
        /(?:^|\r?\n)(?:Process exited with code|Exit code:?)\s+(-?\d+)(?=\r?\n|$)/giu
      )
    ];
    const codeText = matches.at(-1)?.[1];
    if (codeText !== void 0) {
      const code = Number.parseInt(codeText, 10);
      return { status: code === 0 ? "success" : "failure", exit_code: code };
    }
    if (response.trim()) {
      return { status: "unknown", exit_code: null };
    }
  }
  if (response && typeof response === "object" && !Array.isArray(response)) {
    const code = response.exit_code ?? response.exitCode ?? response.code;
    if (typeof code === "number" && Number.isFinite(code)) {
      return { status: code === 0 ? "success" : "failure", exit_code: code };
    }
    if (typeof response.status === "number" && Number.isFinite(response.status)) {
      if (response.status >= 0 && response.status <= 255) {
        return {
          status: response.status === 0 ? "success" : "failure",
          exit_code: response.status
        };
      }
    }
    if (response.success === false || response.is_error === true || response.isError === true) {
      return { status: "failure", exit_code: null };
    }
    if (response.success === true) {
      return { status: "success", exit_code: 0 };
    }
  }
  return { status: "unknown", exit_code: null };
}
function extractExitCode(event) {
  const response = extractToolResponse(event);
  if (typeof response === "string") {
    const matches = [
      ...response.matchAll(
        /(?:^|\r?\n)(?:Process exited with code|Exit code:?)\s+(-?\d+)(?=\r?\n|$)/giu
      )
    ];
    const codeText = matches.at(-1)?.[1];
    if (codeText !== void 0) return Number.parseInt(codeText, 10);
  }
  if (response && typeof response === "object" && !Array.isArray(response)) {
    const code = response.exit_code ?? response.exitCode ?? response.code;
    if (typeof code === "number" && Number.isFinite(code)) return code;
  }
  return null;
}
function durationMs(startedAt, endedAt = /* @__PURE__ */ new Date()) {
  const start = Date.parse(startedAt);
  const end = endedAt instanceof Date ? endedAt.getTime() : Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, end - start);
}

// plugins/command-exec-audit/src/lib/config.ts
import { existsSync } from "node:fs";
import { isAbsolute as isAbsolute2, join } from "node:path";
import { pathToFileURL } from "node:url";
var DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  auditRoot: ".command-exec-audit",
  maxCommandChars: 2e3,
  redactSecrets: true
});
var CONFIG_NAMES = [
  ".command-exec-audit.mjs",
  ".command-exec-audit.cjs",
  ".command-exec-audit.js"
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
    auditRoot: DEFAULT_CONFIG.auditRoot,
    maxCommandChars: DEFAULT_CONFIG.maxCommandChars,
    redactSecrets: DEFAULT_CONFIG.redactSecrets
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
    if (!root || root.includes("..") || isAbsolute2(root) || /^[A-Za-z]:\//u.test(root) || RESERVED_ROOTS.has(base.toLowerCase())) {
      warn2("auditRoot must be a relative non-reserved path without ..; using default");
    } else {
      config.auditRoot = root;
    }
  } else if (raw.auditRoot !== void 0) {
    warn2("auditRoot must be a non-empty string");
  }
  if (typeof raw.maxCommandChars === "number" && Number.isFinite(raw.maxCommandChars)) {
    const value = Math.floor(raw.maxCommandChars);
    if (value < 64 || value > 2e4) warn2("maxCommandChars must be 64..20000; using default");
    else config.maxCommandChars = value;
  } else if (raw.maxCommandChars !== void 0) {
    warn2("maxCommandChars must be a number");
  }
  if (typeof raw.redactSecrets === "boolean") config.redactSecrets = raw.redactSecrets;
  else if (raw.redactSecrets !== void 0) warn2("redactSecrets must be boolean");
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

// plugins/command-exec-audit/src/lib/jsonl-trail.ts
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
var README_TEXT = `# Command exec audit

Append-only JSONL trail of agent shell commands (status + duration only; one file per session).

Write policy:
- The audit plugin may append new lines.
- The audit plugin may rewrite only the last line (pending \u2192 terminal).
- Earlier lines must not be modified by agents or automation tools.
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
function readLastNonEmptyLine(sessionPath) {
  if (!existsSync2(sessionPath)) return null;
  const content = readFileSync(sessionPath, "utf8");
  const lines = content.split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line && line.trim()) return { line, index: i, lines, content };
  }
  return null;
}
function findPendingByToolUseId(sessionPath, toolUseId) {
  const id = String(toolUseId ?? "").trim();
  if (!id || !existsSync2(sessionPath)) return null;
  const content = readFileSync(sessionPath, "utf8");
  let found = null;
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed?.schema === "command-exec/v1" && parsed.status === "pending" && String(parsed.tool_use_id ?? "") === id) {
        found = parsed;
      }
    } catch {
    }
  }
  return found;
}
function rewriteTip(sessionPath, predicate, nextRecord) {
  const lock = acquireLock(sessionPath);
  if (!lock) return "busy";
  const temporary = `${sessionPath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    const tip = readLastNonEmptyLine(sessionPath);
    if (!tip) return "miss";
    let parsed;
    try {
      parsed = JSON.parse(tip.line);
    } catch {
      return "miss";
    }
    if (!predicate(parsed)) return "miss";
    const nextLine = JSON.stringify(nextRecord);
    const nextLines = tip.lines.slice();
    nextLines[tip.index] = nextLine;
    while (nextLines.length > 0 && nextLines[nextLines.length - 1] === "") {
      nextLines.pop();
    }
    const body = `${nextLines.join("\n")}
`;
    const recheck = readLastNonEmptyLine(sessionPath);
    if (!recheck || recheck.line !== tip.line || recheck.index !== tip.index) {
      return "miss";
    }
    writeFileSync(temporary, body, { encoding: "utf8", mode: 384, flag: "wx" });
    renameSync(temporary, sessionPath);
    return "rewritten";
  } catch {
    try {
      rmSync(temporary, { force: true });
    } catch {
    }
    return "error";
  } finally {
    releaseLock(lock);
  }
}
function prepareTrail(repoRoot, auditRoot, sessionKey) {
  const paths = trailPaths(repoRoot, auditRoot, sessionKey);
  ensureLayout(paths);
  return paths;
}

// plugins/command-exec-audit/src/lib/paths.ts
import { execFileSync } from "node:child_process";
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
function inferHost() {
  if (process.env.PLUGIN_ROOT && !process.env.CLAUDE_PLUGIN_ROOT) return "codex";
  if (process.env.CLAUDE_PLUGIN_ROOT) return "claude";
  return "unknown";
}

// plugins/command-exec-audit/src/lib/protect.ts
import { isAbsolute as isAbsolute3, relative, resolve as resolve3 } from "node:path";
function underAuditRoot(filePath, auditRootAbs) {
  const abs = resolve3(filePath);
  const root = resolve3(auditRootAbs);
  const rel = relative(root, abs).replaceAll("\\", "/");
  return rel === "" || !rel.startsWith("../") && !isAbsolute3(rel);
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
          "[Command Exec Audit] Audit trail is protected",
          "",
          `Blocked path(s): ${hits.join(", ")}`,
          `Root: ${auditRootRel}/`,
          "",
          "Write policy: only the audit plugin may append lines or rewrite the last line.",
          "Do not Read/Edit/Write session JSONL files under the audit root."
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
          "[Command Exec Audit] Audit trail is protected",
          "",
          `Root: ${auditRootRel}/`,
          "Shell mutation of the audit trail is denied."
        ].join("\n")
      };
    }
  }
  return { deny: false };
}

// plugins/command-exec-audit/src/entries/hooks/command-exec-audit.ts
function warn(message) {
  process.stderr.write(`[command-exec-audit] ${message}
`);
}
function modeFromArgv() {
  const mode = process.argv[2] ?? "post";
  if (mode === "pre" || mode === "post" || mode === "failure") return mode;
  return "post";
}
function buildPendingRecord(event, command, config, now = /* @__PURE__ */ new Date()) {
  const started = now.toISOString();
  return {
    schema: "command-exec/v1",
    ts: started,
    session_id: extractSessionId(event),
    cwd: resolve4(extractCwd(event)),
    tool_name: extractToolName(event),
    tool_use_id: extractToolUseId(event),
    command: redactCommand(command, config),
    status: "pending",
    started_at: started,
    ended_at: null,
    duration_ms: null,
    exit_code: null,
    host: inferHost()
  };
}
function finalizeRecord(base, event, forceFailure, config, now = /* @__PURE__ */ new Date()) {
  const ended = now.toISOString();
  const { status, exit_code } = inferCommandStatus(event, forceFailure);
  const startedAt = base?.started_at ?? base?.ts ?? ended;
  const command = base?.command ?? redactCommand(extractShellCommand(event) ?? "", config);
  return {
    schema: "command-exec/v1",
    ts: ended,
    session_id: base?.session_id ?? extractSessionId(event),
    cwd: base?.cwd ?? resolve4(extractCwd(event)),
    tool_name: base?.tool_name ?? extractToolName(event),
    tool_use_id: base?.tool_use_id ?? extractToolUseId(event),
    command,
    status,
    started_at: startedAt,
    ended_at: ended,
    duration_ms: durationMs(startedAt, ended),
    exit_code,
    host: base?.host ?? inferHost()
  };
}
function matchingPendingTip(sessionPath, toolUseId) {
  const id = String(toolUseId ?? "").trim();
  if (!id) return null;
  const tip = readLastNonEmptyLine(sessionPath);
  if (!tip) return null;
  try {
    const parsed = JSON.parse(tip.line);
    if (parsed?.schema === "command-exec/v1" && parsed.status === "pending" && sameToolUseId(parsed.tool_use_id, id)) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}
async function main() {
  const mode = modeFromArgv();
  const event = await readStdinJson();
  if (event?.__parseError) return;
  const cwd = resolve4(extractCwd(event));
  const repoRoot = resolveRepoRoot(cwd) ?? cwd;
  const config = await loadProjectConfig(repoRoot, warn);
  if (!config.enabled) return;
  const auditRootAbs = resolve4(repoRoot, config.auditRoot);
  const toolName = extractToolName(event);
  if (mode === "pre") {
    const decision = protectDecision(event, config.auditRoot, auditRootAbs);
    if (decision.deny) {
      writeJson(preToolDeny(decision.reason));
      return;
    }
    if (!isShellTool(toolName)) return;
    const command = extractShellCommand(event);
    if (!command) return;
    try {
      const sessionKey = sanitizeSessionKey(extractSessionId(event), cwd);
      const paths = prepareTrail(repoRoot, config.auditRoot, sessionKey);
      appendRecord(paths.sessionPath, buildPendingRecord(event, command, config));
    } catch (error) {
      warn(`failed to record command start: ${error?.message ?? error}`);
    }
    return;
  }
  if (!isShellTool(toolName)) return;
  const forceFailure = mode === "failure";
  try {
    const sessionKey = sanitizeSessionKey(extractSessionId(event), cwd);
    const paths = prepareTrail(repoRoot, config.auditRoot, sessionKey);
    const toolUseId = extractToolUseId(event);
    const tipBase = matchingPendingTip(paths.sessionPath, toolUseId);
    if (tipBase) {
      const finalRecord2 = finalizeRecord(tipBase, event, forceFailure, config);
      const result = rewriteTip(
        paths.sessionPath,
        (parsed) => parsed?.schema === "command-exec/v1" && parsed.status === "pending" && sameToolUseId(parsed.tool_use_id, tipBase.tool_use_id),
        finalRecord2
      );
      if (result === "rewritten") return;
    }
    const scanned = findPendingByToolUseId(paths.sessionPath, toolUseId);
    const finalRecord = finalizeRecord(scanned, event, forceFailure, config);
    appendRecord(paths.sessionPath, finalRecord);
  } catch (error) {
    warn(`failed to record command finish: ${error?.message ?? error}`);
  }
}
var isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve4(process.argv[1]);
if (isMain) {
  main().catch((error) => {
    warn(error?.message ?? String(error));
    process.exitCode = 0;
  });
}
