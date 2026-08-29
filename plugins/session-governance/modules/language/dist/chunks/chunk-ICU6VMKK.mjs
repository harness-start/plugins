// harness-source-hash: sha256:a63eb2957901c0b015da825fded911a6bab61876bf372d66f153d94db7035396

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
function eventPrompt(event) {
  return firstString(event.prompt, event.user_prompt, event.userPrompt, event.message);
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
function isStopHookActive(event) {
  return event.stop_hook_active === true || event.stopHookActive === true;
}

// plugins/session-governance/modules/language/src/lib/config.ts
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// plugins/session-governance/modules/language/src/lib/profiles.ts
var PROFILE_IDS = Object.freeze([
  "zh-CN",
  "zh-TW",
  "en-US",
  "ja-JP",
  "ko-KR",
  "th-TH"
]);
var PROFILE_DEFINITIONS = {
  "zh-CN": {
    label: "Simplified Chinese",
    allowedScripts: ["han"],
    aliases: /简体中文|簡體中文|简体|簡體|简中|汉语|\bSimplified Chinese\b/iu,
    sessionInstruction: "Use Simplified Chinese for natural-language explanations. Do not use Traditional Chinese characters.",
    rewriteInstruction: "Rewrite the complete previous response in Simplified Chinese."
  },
  "zh-TW": {
    label: "Traditional Chinese",
    allowedScripts: ["han"],
    aliases: /繁體中文|繁体中文|繁體|繁体|正體中文|正体中文|漢語|\bTraditional Chinese\b/iu,
    sessionInstruction: "Use Traditional Chinese for natural-language explanations. Do not use Simplified Chinese characters.",
    rewriteInstruction: "Rewrite the complete previous response in Traditional Chinese."
  },
  "en-US": {
    label: "English",
    allowedScripts: [],
    aliases: /英文|英语|\bEnglish\b/iu,
    sessionInstruction: "Use English for natural-language explanations.",
    rewriteInstruction: "Rewrite the complete previous response in English."
  },
  "ja-JP": {
    label: "Japanese",
    allowedScripts: ["han", "kana"],
    aliases: /日文|日语|日本語|\bJapanese\b/iu,
    sessionInstruction: "Use Japanese for natural-language explanations. Do not write Chinese-only Han without kana.",
    rewriteInstruction: "Rewrite the complete previous response in Japanese."
  },
  "ko-KR": {
    label: "Korean",
    allowedScripts: ["hangul"],
    aliases: /韩文|韩语|朝鲜语|한국어|\bKorean\b/iu,
    sessionInstruction: "Use Korean for natural-language explanations.",
    rewriteInstruction: "Rewrite the complete previous response in Korean."
  },
  "th-TH": {
    label: "Thai",
    allowedScripts: ["thai"],
    aliases: /泰文|泰语|ภาษาไทย|\bThai\b/iu,
    sessionInstruction: "Use Thai for natural-language explanations.",
    rewriteInstruction: "Rewrite the complete previous response in Thai."
  }
};
function freezeProfile(id, profile) {
  return Object.freeze({
    id,
    ...profile,
    allowedScripts: Object.freeze(profile.allowedScripts)
  });
}
var PROFILES = Object.freeze({
  "zh-CN": freezeProfile("zh-CN", PROFILE_DEFINITIONS["zh-CN"]),
  "zh-TW": freezeProfile("zh-TW", PROFILE_DEFINITIONS["zh-TW"]),
  "en-US": freezeProfile("en-US", PROFILE_DEFINITIONS["en-US"]),
  "ja-JP": freezeProfile("ja-JP", PROFILE_DEFINITIONS["ja-JP"]),
  "ko-KR": freezeProfile("ko-KR", PROFILE_DEFINITIONS["ko-KR"]),
  "th-TH": freezeProfile("th-TH", PROFILE_DEFINITIONS["th-TH"])
});
function isProfileId(value) {
  return typeof value === "string" && PROFILE_IDS.includes(value);
}
function profileFor(value) {
  return PROFILES[isProfileId(value) ? value : "zh-CN"];
}

// plugins/session-governance/modules/language/src/lib/config.ts
var CONFIG_NAME = ".language-output.mjs";
var USER_CONFIG_RELATIVE_PATH = "harness-start/language-output.json";
var TOP_LEVEL_KEYS = /* @__PURE__ */ new Set(["defaultProfile", "artifactProfile", "toolFeedback", "stop", "detection"]);
var DETECTION_KEYS = /* @__PURE__ */ new Set(["minScriptCharacters", "minLetterRatio"]);
var DEFAULT_CONFIG = Object.freeze({
  defaultProfile: "zh-CN",
  artifactProfile: null,
  toolFeedback: "report",
  stop: "block",
  detection: Object.freeze({
    minScriptCharacters: 12,
    minLetterRatio: 0.25
  })
});
function strictDefault() {
  return { ...DEFAULT_CONFIG, detection: { ...DEFAULT_CONFIG.detection } };
}
function isToolFeedbackMode(value) {
  return value === "report" || value === "off";
}
function isStopMode(value) {
  return value === "block" || value === "off";
}
function resolveConfig(source) {
  if (!isRecord(source)) {
    throw new Error("default export must be an object");
  }
  if (Object.keys(source).some((key) => !TOP_LEVEL_KEYS.has(key))) {
    throw new Error("unsupported top-level field");
  }
  if (source.defaultProfile !== void 0 && !isProfileId(source.defaultProfile)) {
    throw new Error("defaultProfile must be zh-CN, zh-TW, en-US, ja-JP, ko-KR, or th-TH");
  }
  if (source.artifactProfile !== void 0 && source.artifactProfile !== null && !isProfileId(source.artifactProfile)) {
    throw new Error("artifactProfile must be null, zh-CN, zh-TW, en-US, ja-JP, ko-KR, or th-TH");
  }
  if (source.toolFeedback !== void 0 && !isToolFeedbackMode(source.toolFeedback)) {
    throw new Error("toolFeedback must be report or off");
  }
  if (source.stop !== void 0 && !isStopMode(source.stop)) {
    throw new Error("stop must be block or off");
  }
  const detection = source.detection ?? {};
  if (!isRecord(detection)) {
    throw new Error("detection must be an object");
  }
  if (Object.keys(detection).some((key) => !DETECTION_KEYS.has(key))) {
    throw new Error("unsupported detection field");
  }
  const minScriptCharacters = detection.minScriptCharacters ?? DEFAULT_CONFIG.detection.minScriptCharacters;
  const minLetterRatio = detection.minLetterRatio ?? DEFAULT_CONFIG.detection.minLetterRatio;
  if (typeof minScriptCharacters !== "number" || !Number.isInteger(minScriptCharacters) || minScriptCharacters < 1 || minScriptCharacters > 100) {
    throw new Error("minScriptCharacters must be an integer from 1 to 100");
  }
  if (typeof minLetterRatio !== "number" || minLetterRatio < 0.01 || minLetterRatio > 1) {
    throw new Error("minLetterRatio must be a number from 0.01 to 1");
  }
  return {
    defaultProfile: isProfileId(source.defaultProfile) ? source.defaultProfile : DEFAULT_CONFIG.defaultProfile,
    artifactProfile: isProfileId(source.artifactProfile) ? source.artifactProfile : null,
    toolFeedback: isToolFeedbackMode(source.toolFeedback) ? source.toolFeedback : DEFAULT_CONFIG.toolFeedback,
    stop: isStopMode(source.stop) ? source.stop : DEFAULT_CONFIG.stop,
    detection: { minScriptCharacters, minLetterRatio }
  };
}
function repoRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5e3
    }).trim();
  } catch {
    return resolve(cwd);
  }
}
function userConfigPath(env = process.env) {
  if (env.HARNESS_HOST === "claude") {
    return join(env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), USER_CONFIG_RELATIVE_PATH);
  }
  if (env.HARNESS_HOST === "codex") {
    return join(env.CODEX_HOME || join(homedir(), ".codex"), USER_CONFIG_RELATIVE_PATH);
  }
  return null;
}
function loadUserConfig(path) {
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}
async function loadConfig(cwd, warn2 = () => {
}) {
  const root = repoRoot(isAbsolute(cwd) ? cwd : resolve(cwd));
  const path = join(root, CONFIG_NAME);
  const globalPath = userConfigPath();
  if (!existsSync(path)) {
    if (!globalPath || !existsSync(globalPath)) {
      return { config: strictDefault(), path: null };
    }
    try {
      return { config: resolveConfig(loadUserConfig(globalPath)), path: globalPath };
    } catch (error) {
      warn2(`invalid ${globalPath}; using strict defaults: ${error instanceof Error ? error.message : String(error)}`);
      return { config: strictDefault(), path: globalPath };
    }
  }
  try {
    const imported = await import(`${pathToFileURL(path).href}?language-output=${Date.now()}`);
    return { config: resolveConfig(imported.default ?? imported), path };
  } catch (error) {
    warn2(`invalid ${path}; using strict defaults: ${error instanceof Error ? error.message : String(error)}`);
    return { config: strictDefault(), path };
  }
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
import { isAbsolute as isAbsolute2, resolve as resolve2 } from "node:path";

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
    raw.map(stripMatchingQuotes).filter(Boolean).map((path) => isAbsolute2(path) ? resolve2(path) : resolve2(cwd, path.replace(/^\.\//u, "")))
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

// plugins/session-governance/modules/language/src/lib/hook-io.ts
function extractSessionId(event) {
  const value = eventSessionId(event);
  return value || null;
}
function extractSource(event) {
  return typeof event.source === "string" ? event.source : "startup";
}
function patchAddedText(command) {
  return String(command ?? "").split(/\r?\n/u).filter((line) => line.startsWith("+") && !line.startsWith("+++")).map((line) => line.slice(1)).join("\n");
}
function quotedShellText(command) {
  const values = [];
  const pattern = /'([^']*)'|"((?:\\.|[^"\\])*)"/gu;
  for (const match of String(command ?? "").matchAll(pattern)) {
    const value = match[1] ?? match[2] ?? "";
    if (value) values.push(value);
  }
  return values.join("\n");
}
function generatedToolText(event) {
  const input = eventToolInput(event);
  const tool = canonicalToolName(eventToolName(event));
  if (tool === "bash" || tool === "execcommand" || tool === "shellcommand") {
    const command = typeof input.command === "string" ? input.command : typeof input.cmd === "string" ? input.cmd : "";
    const quoted = quotedShellText(command);
    return quoted ? `${command}
${quoted}` : command;
  }
  if (tool === "write") return typeof input.content === "string" ? input.content : "";
  if (tool === "edit") {
    const next = input.new_string ?? input.newString;
    return typeof next === "string" ? next : "";
  }
  if (tool === "multiedit") {
    return Array.isArray(input.edits) ? input.edits.map((edit) => {
      if (!isRecord(edit)) return "";
      const next = edit.new_string ?? edit.newString;
      return typeof next === "string" ? next : "";
    }).filter(Boolean).join("\n") : "";
  }
  if (tool === "applypatch") {
    return [input.command, input.input, input.patch].filter((value) => typeof value === "string").map(patchAddedText).filter(Boolean).join("\n");
  }
  return "";
}
function extractFileTargets2(event) {
  return extractFileTargets(event, { tools: "any" });
}
function additionalContextOutput(hookEventName, text) {
  return additionalContext(hookEventName, text);
}
function supportsPostToolFeedback() {
  return true;
}
function postToolFeedbackOutput(text) {
  return additionalContextOutput("PostToolUse", text);
}
function warn(message) {
  process.stderr.write(`[language-output] ${message}
`);
}

// plugins/session-governance/modules/language/src/lib/state-store.ts
import { createHash, randomBytes } from "node:crypto";
import {
  mkdirSync as mkdirSync2,
  readFileSync as readFileSync3,
  renameSync,
  rmSync,
  statSync,
  writeFileSync as writeFileSync2
} from "node:fs";
import { dirname, join as join3, resolve as resolve3 } from "node:path";

// core/src/plugin-workdir.ts
import { mkdirSync, readFileSync as readFileSync2, writeFileSync } from "node:fs";
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
    current = readFileSync2(ignore, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (current !== null && normalizeGitignore(current) === "*") return;
  if (current !== null && !isStalePluginWorkdirGitignore(current)) return;
  writeFileSync(ignore, PLUGIN_WORKDIR_GITIGNORE, { encoding: "utf8", mode: 384 });
}

// plugins/session-governance/modules/language/src/lib/state-store.ts
var VERSION = 1;
var TTL_MS = 24 * 60 * 60 * 1e3;
var LOCK_STALE_MS = 3e4;
var LOCK_ATTEMPTS = 100;
var LOCK_WAIT_MS = 10;
var WAIT_BUFFER2 = new Int32Array(new SharedArrayBuffer(4));
var STATE_DIR_RELATIVE = ".language-output/state";
function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
function errorCode(error) {
  return isRecord(error) ? error.code : void 0;
}
function ensureStateDir(directory) {
  mkdirSync2(directory, { recursive: true, mode: 448 });
  ensurePluginWorkdirGitignore(dirname(directory));
}
function statePath(event) {
  const session = extractSessionId(event);
  if (!session || session === "hook" || session === "unknown") return null;
  const platform = process.env.HARNESS_HOST === "claude" || Boolean(process.env.CLAUDE_PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_DATA) ? "claude" : process.env.HARNESS_HOST === "codex" || Boolean(process.env.PLUGIN_ROOT || process.env.PLUGIN_DATA) ? "codex" : "standalone";
  return join3(resolve3(eventCwd(event)), STATE_DIR_RELATIVE, `${platform}-${digest(session)}.json`);
}
function emptyState(defaultProfile = "zh-CN") {
  return {
    version: VERSION,
    preferredProfile: isProfileId(defaultProfile) ? defaultProfile : "zh-CN",
    authorizedProfiles: [],
    toolFeedbackDelivered: false,
    updatedAt: 0
  };
}
function sanitize(value, defaultProfile) {
  if (!isRecord(value) || value.version !== VERSION) {
    return emptyState(defaultProfile);
  }
  if (Date.now() - Number(value.updatedAt || 0) > TTL_MS) {
    return emptyState(defaultProfile);
  }
  return {
    version: VERSION,
    preferredProfile: isProfileId(value.preferredProfile) ? value.preferredProfile : isProfileId(defaultProfile) ? defaultProfile : "zh-CN",
    authorizedProfiles: Array.isArray(value.authorizedProfiles) ? [...new Set(value.authorizedProfiles.filter(isProfileId))] : [],
    toolFeedbackDelivered: value.toolFeedbackDelivered === true,
    updatedAt: Number(value.updatedAt) || 0
  };
}
function read(path, defaultProfile) {
  if (!path) return emptyState(defaultProfile);
  try {
    return sanitize(JSON.parse(readFileSync3(path, "utf8")), defaultProfile);
  } catch {
    return emptyState(defaultProfile);
  }
}
function write(path, state) {
  if (!path) return false;
  const directory = dirname(path);
  const temporary = join3(directory, `.${digest(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    ensureStateDir(directory);
    writeFileSync2(temporary, `${JSON.stringify(state)}
`, {
      encoding: "utf8",
      mode: 384,
      flag: "wx"
    });
    renameSync(temporary, path);
    return true;
  } catch {
    rmSync(temporary, { force: true });
    return false;
  }
}
function withLock(path, operation) {
  if (!path) return operation();
  const lock = `${path}.lock`;
  ensureStateDir(dirname(path));
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    try {
      mkdirSync2(lock, { mode: 448 });
      try {
        return operation();
      } finally {
        rmSync(lock, { recursive: true, force: true });
      }
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) {
          rmSync(lock, { recursive: true, force: true });
          continue;
        }
      } catch (cause) {
        if (errorCode(cause) !== "ENOENT") throw cause;
        continue;
      }
      Atomics.wait(WAIT_BUFFER2, 0, 0, LOCK_WAIT_MS);
    }
  }
  throw new Error("timed out waiting for language-output state lock");
}
function readState(event, defaultProfile = "zh-CN") {
  return read(statePath(event), defaultProfile);
}
function updateState(event, defaultProfile, updater) {
  const path = statePath(event);
  if (!path) return { state: emptyState(defaultProfile), result: null, persisted: false };
  return withLock(path, () => {
    const state = read(path, defaultProfile);
    const result = updater(state);
    state.updatedAt = Date.now();
    return { state, result, persisted: write(path, state) };
  });
}
function initializeState(event, defaultProfile, reset = false) {
  return updateState(event, defaultProfile, (state) => {
    if (!reset) return false;
    Object.assign(state, emptyState(defaultProfile));
    return true;
  }).state;
}
function recordLanguageIntent(event, defaultProfile, intent) {
  return updateState(event, defaultProfile, (state) => {
    if (isProfileId(intent.preferredProfile)) {
      state.preferredProfile = intent.preferredProfile;
    }
    state.authorizedProfiles = [
      .../* @__PURE__ */ new Set([
        ...state.authorizedProfiles,
        ...intent.authorizedProfiles.filter(isProfileId)
      ])
    ];
    return true;
  }).state;
}
function claimToolFeedback(event, defaultProfile) {
  return updateState(event, defaultProfile, (state) => {
    if (state.toolFeedbackDelivered) return false;
    state.toolFeedbackDelivered = true;
    return true;
  }).result === true;
}

export {
  readStdinJson,
  eventCwd,
  eventPrompt,
  eventAssistantMessage,
  isStopHookActive,
  PROFILE_IDS,
  PROFILES,
  profileFor,
  loadConfig,
  stopBlock,
  writeJson,
  extractSource,
  generatedToolText,
  extractFileTargets2 as extractFileTargets,
  additionalContextOutput,
  supportsPostToolFeedback,
  postToolFeedbackOutput,
  warn,
  readState,
  initializeState,
  recordLanguageIntent,
  claimToolFeedback
};
