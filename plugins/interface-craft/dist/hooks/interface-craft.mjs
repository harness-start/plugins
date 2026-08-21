#!/usr/bin/env node
// harness-source-hash: sha256:da5d605a3245ffcd58e1c3fb930256306449554fb639430e274077ced140f78f

// plugins/interface-craft/src/entries/hooks/interface-craft.ts
import { chmodSync, mkdirSync as mkdirSync2, readFileSync } from "node:fs";
import { join as join2, resolve as resolve2 } from "node:path";
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

// core/src/hook-output.ts
var TOOL_LIFECYCLE_EVENTS = /* @__PURE__ */ new Set([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure"
]);
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
function writeJson(value) {
  if (value !== null && value !== void 0) {
    process.stdout.write(`${JSON.stringify(value)}
`);
  }
}

// core/src/hook-targets.ts
import { isAbsolute, resolve } from "node:path";

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

// plugins/interface-craft/src/lib/detect.ts
import { extname } from "node:path";
var UI_EXTENSIONS = /* @__PURE__ */ new Set([
  ".css",
  ".scss",
  ".html",
  ".htm",
  ".tsx",
  ".jsx",
  ".vue",
  ".svelte",
  ".astro"
]);
var IGNORED_SEGMENTS = /* @__PURE__ */ new Set(["node_modules", "dist", ".git", "vendor-skills", "coverage"]);
var IGNORED_BASENAMES = /* @__PURE__ */ new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "Cargo.lock"]);
function maskBlockComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/gu, (comment) => comment.replace(/[^\r\n]/gu, " "));
}
var RULES = [
  {
    code: "HARD_OFFSET_SHADOW",
    message: "hard offset shadow with zero blur is a costume unless the world is neobrutalist",
    pattern: /box-shadow\s*:\s*-?\d+(?:px)?\s+-?\d+(?:px)?\s+0(?:px)?(?:\s|$|,)/iu
  },
  {
    code: "GRADIENT_TEXT",
    message: "gradient or clipped text is decoration; use weight or size for emphasis",
    pattern: /(?:-webkit-)?background-clip\s*:\s*text/iu
  },
  {
    code: "EYEBROW_KICKER",
    message: "eyebrow/kicker labels above a heading are banned; let the heading speak",
    pattern: /\b(?:class|className)\s*=\s*(["'`])[^"'`]*\b(?:eyebrow|kicker)\b/iu
  },
  {
    code: "SECTION_NUMBER_DECORATION",
    message: "decorative section numbers are banned unless the sequence itself is information",
    pattern: /<(?:h[1-3]|Heading)\b[^>]*>\s*0[1-9]\b/iu
  },
  {
    code: "REPEATING_GRID_BACKGROUND",
    message: "repeating-linear-gradient grids need a real canvas, map, or measuring tool",
    pattern: /background(?:-image)?\s*:\s*repeating-linear-gradient/iu
  },
  {
    code: "TRANSITION_ALL",
    message: "transition-all is present; enumerate the properties that are intended to animate",
    pattern: /(?:\btransition(?:-property)?\s*:\s*all(?:\s|;|$)|\btransition-all\b)/iu
  },
  {
    code: "FOCUS_OUTLINE_REMOVED",
    message: "a native focus outline is removed; verify an equally visible focus-visible replacement",
    pattern: /(?:\boutline\s*:\s*(?:none|0(?:px)?)(?:\s|;|$)|\boutline-none\b)/iu
  }
];
function isUiPath(filePath) {
  return UI_EXTENSIONS.has(extname(filePath).toLowerCase());
}
function isIgnoredPath(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (parts.some((part) => IGNORED_SEGMENTS.has(part))) return true;
  const base = parts.at(-1) ?? "";
  return IGNORED_BASENAMES.has(base);
}
function detectUiSource(filePath, source) {
  if (!isUiPath(filePath) || isIgnoredPath(filePath)) return [];
  if (typeof source !== "string") return [];
  const findings = [];
  const lines = maskBlockComments(source).split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        findings.push({ code: rule.code, path: filePath, line: index + 1, message: rule.message });
      }
    }
  }
  return findings;
}
function findingKey(finding) {
  return `${finding.path}:${finding.code}:${finding.line}`;
}

// plugins/interface-craft/src/entries/hooks/interface-craft.ts
var SESSION_CONTEXT = [
  "[Interface Craft] For interface, layout, typography, contrast, or UI anti-pattern work, invoke interface-craft and load interface-craft-floor before editing UI.",
  "This plugin does not write posters, decks, Remotion, or logos, and it does not replace web-frontend syntax or lockfile gates."
].join("\n");
function warn(message) {
  process.stderr.write(`[interface-craft] ${message}
`);
}
function ledgerPath(sessionId) {
  const validSessionId = sessionId || process.env.AI_EXPERTS_SESSION_ID || "";
  if (!validSessionId || validSessionId === "hook" || validSessionId === "unknown") return null;
  const dataRoot = process.env.HARNESS_HOST === "codex" ? process.env.PLUGIN_DATA : process.env.CLAUDE_PLUGIN_DATA || process.env.PLUGIN_DATA;
  if (!dataRoot) return null;
  return join2(dataRoot, "interface-craft", "sessions", `${digestKey(validSessionId)}.json`);
}
function readLedger(sessionId) {
  const path = ledgerPath(sessionId);
  if (!path) return { files: [], keys: [] };
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (!value || typeof value !== "object") return { files: [], keys: [] };
    const record = value;
    return {
      files: Array.isArray(record.files) ? record.files.filter((item) => typeof item === "string") : [],
      keys: Array.isArray(record.keys) ? record.keys.filter((item) => typeof item === "string") : []
    };
  } catch {
    return { files: [], keys: [] };
  }
}
function writeLedger(sessionId, ledger) {
  const path = ledgerPath(sessionId);
  if (!path) return;
  const directory = join2(path, "..");
  mkdirSync2(directory, { recursive: true, mode: 448 });
  chmodSync(directory, 448);
  atomicWriteJson(path, ledger);
}
function scanFile(filePath) {
  try {
    return detectUiSource(filePath, readFileSync(filePath, "utf8"));
  } catch {
    return [];
  }
}
function formatFindings(findings) {
  return [
    "[Interface Craft] Mechanical findings on UI files:",
    ...findings.map((finding) => `- ${finding.code} ${finding.path}:${finding.line} ${finding.message}`)
  ].join("\n");
}
function runSession() {
  writeJson(additionalContext("SessionStart", SESSION_CONTEXT));
}
async function runPost(event) {
  const current = event ?? await readStdinJson();
  if (current.__parseError) return warn("invalid hook input; UI scan skipped");
  const sessionId = eventSessionId(current);
  const cwd = eventCwd(current);
  const targets = extractFileTargets(current, { tools: "mutation" }).map((target) => resolve2(cwd, target)).filter((filePath) => isUiPath(filePath) && !isIgnoredPath(filePath));
  const ledger = readLedger(sessionId);
  const findings = [];
  for (const filePath of targets) {
    if (!ledger.files.includes(filePath)) ledger.files.push(filePath);
    for (const finding of scanFile(filePath)) {
      const key = findingKey(finding);
      if (ledger.keys.includes(key)) continue;
      ledger.keys.push(key);
      findings.push(finding);
    }
  }
  writeLedger(sessionId, ledger);
  if (findings.length > 0) writeJson(additionalContext("PostToolUse", formatFindings(findings)));
}
async function runStop(event) {
  const current = event ?? await readStdinJson();
  if (current.__parseError) return warn("invalid hook input; UI scan skipped");
  const sessionId = eventSessionId(current);
  const ledger = readLedger(sessionId);
  const findings = [];
  for (const filePath of ledger.files) {
    for (const finding of scanFile(filePath)) {
      const key = findingKey(finding);
      if (ledger.keys.includes(key)) continue;
      ledger.keys.push(key);
      findings.push(finding);
    }
  }
  writeLedger(sessionId, ledger);
  if (findings.length > 0) writeJson(additionalContext("Stop", formatFindings(findings)));
}
var mode = process.argv[2] ?? "session";
if (process.argv[1] && resolve2(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = mode === "post" ? runPost : mode === "stop" ? runStop : async () => runSession();
  run().catch((error) => {
    warn(error instanceof Error ? error.message : String(error));
    process.exit(0);
  });
}
export {
  runPost,
  runSession,
  runStop
};
