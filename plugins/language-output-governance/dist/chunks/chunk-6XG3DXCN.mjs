// harness-source-hash: sha256:43c7b70ada066962018a5e669c0d465c150544f2552f0164bc66b6b6f8600cae

// plugins/language-output-governance/src/lib/config.ts
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// plugins/language-output-governance/src/lib/profiles.ts
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
var PROFILES = Object.freeze(
  Object.fromEntries(
    Object.entries(PROFILE_DEFINITIONS).map(([id, profile]) => [
      id,
      Object.freeze({ id, ...profile, allowedScripts: Object.freeze(profile.allowedScripts) })
    ])
  )
);
function isProfileId(value) {
  return typeof value === "string" && Object.hasOwn(PROFILES, value);
}
function profileFor(value) {
  return PROFILES[isProfileId(value) ? value : "zh-CN"];
}

// plugins/language-output-governance/src/lib/config.ts
var CONFIG_NAME = ".language-output-governance.mjs";
var USER_CONFIG_RELATIVE_PATH = "harness-start/language-output-governance.json";
var TOP_LEVEL_KEYS = /* @__PURE__ */ new Set(["defaultProfile", "toolFeedback", "stop", "detection"]);
var DETECTION_KEYS = /* @__PURE__ */ new Set(["minScriptCharacters", "minLetterRatio"]);
var DEFAULT_CONFIG = Object.freeze({
  defaultProfile: "zh-CN",
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
function resolveConfig(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("default export must be an object");
  }
  if (Object.keys(source).some((key) => !TOP_LEVEL_KEYS.has(key))) {
    throw new Error("unsupported top-level field");
  }
  if (source.defaultProfile !== void 0 && !isProfileId(source.defaultProfile)) {
    throw new Error("defaultProfile must be zh-CN, zh-TW, en-US, ja-JP, ko-KR, or th-TH");
  }
  if (source.toolFeedback !== void 0 && !["report", "off"].includes(source.toolFeedback)) {
    throw new Error("toolFeedback must be report or off");
  }
  if (source.stop !== void 0 && !["block", "off"].includes(source.stop)) {
    throw new Error("stop must be block or off");
  }
  const detection = source.detection ?? {};
  if (!detection || typeof detection !== "object" || Array.isArray(detection)) {
    throw new Error("detection must be an object");
  }
  if (Object.keys(detection).some((key) => !DETECTION_KEYS.has(key))) {
    throw new Error("unsupported detection field");
  }
  const minScriptCharacters = detection.minScriptCharacters ?? DEFAULT_CONFIG.detection.minScriptCharacters;
  const minLetterRatio = detection.minLetterRatio ?? DEFAULT_CONFIG.detection.minLetterRatio;
  if (!Number.isInteger(minScriptCharacters) || minScriptCharacters < 1 || minScriptCharacters > 100) {
    throw new Error("minScriptCharacters must be an integer from 1 to 100");
  }
  if (typeof minLetterRatio !== "number" || minLetterRatio < 0.01 || minLetterRatio > 1) {
    throw new Error("minLetterRatio must be a number from 0.01 to 1");
  }
  return {
    defaultProfile: source.defaultProfile ?? DEFAULT_CONFIG.defaultProfile,
    toolFeedback: source.toolFeedback ?? DEFAULT_CONFIG.toolFeedback,
    stop: source.stop ?? DEFAULT_CONFIG.stop,
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

// plugins/language-output-governance/src/lib/hook-io.ts
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
  const value = event?.session_id ?? event?.sessionId;
  return typeof value === "string" && value ? value : null;
}
function extractCwd(event) {
  return event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd();
}
function extractSource(event) {
  return typeof event?.source === "string" ? event.source : "startup";
}
function extractPrompt(event) {
  return typeof event?.prompt === "string" ? event.prompt : "";
}
function extractAssistantMessage(event) {
  const message = event?.last_assistant_message ?? event?.lastAssistantMessage ?? "";
  return typeof message === "string" ? message : "";
}
function extractToolName(event) {
  return event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? "";
}
function extractToolInput(event) {
  return event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {};
}
function canonicalToolName(value) {
  return String(value ?? "").replaceAll("_", "").toLowerCase();
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
  const input = extractToolInput(event);
  const tool = canonicalToolName(extractToolName(event));
  if (tool === "bash" || tool === "execcommand" || tool === "shellcommand") {
    const command = typeof input.command === "string" ? input.command : typeof input.cmd === "string" ? input.cmd : "";
    const quoted = quotedShellText(command);
    return quoted ? `${command}
${quoted}` : command;
  }
  if (tool === "write") return typeof input.content === "string" ? input.content : "";
  if (tool === "edit") return typeof (input.new_string ?? input.newString) === "string" ? input.new_string ?? input.newString : "";
  if (tool === "multiedit") {
    return Array.isArray(input.edits) ? input.edits.map((edit) => edit?.new_string ?? edit?.newString ?? "").filter(Boolean).join("\n") : "";
  }
  if (tool === "applypatch") {
    return [input.command, input.input, input.patch].filter((value) => typeof value === "string").map(patchAddedText).filter(Boolean).join("\n");
  }
  return "";
}
function extractFileTargets(event) {
  const input = extractToolInput(event);
  const values = [input.file_path, input.filePath, input.path].filter((value) => typeof value === "string" && value);
  if (Array.isArray(input.edits)) {
    for (const edit of input.edits) {
      const value = edit?.file_path ?? edit?.filePath;
      if (typeof value === "string" && value) values.push(value);
    }
  }
  return [...new Set(values)];
}
function writeJson(value) {
  if (value === null) return;
  process.stdout.write(`${JSON.stringify(value)}
`);
}
function additionalContextOutput(hookEventName, text) {
  return { hookSpecificOutput: { hookEventName, additionalContext: text } };
}
function supportsPostToolFeedback() {
  return !(process.env.PLUGIN_ROOT && process.env.DEEPSEEK_MODEL);
}
function postToolFeedbackOutput(text) {
  return additionalContextOutput("PostToolUse", text);
}
function stopBlock(reason) {
  return { decision: "block", reason };
}
function warn(message) {
  process.stderr.write(`[language-output-governance] ${message}
`);
}

// plugins/language-output-governance/src/lib/state-store.ts
import { createHash, randomBytes } from "node:crypto";
import {
  existsSync as existsSync2,
  mkdirSync,
  readFileSync as readFileSync2,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, join as join2, resolve as resolve2 } from "node:path";
var VERSION = 1;
var TTL_MS = 24 * 60 * 60 * 1e3;
var LOCK_STALE_MS = 3e4;
var LOCK_ATTEMPTS = 100;
var LOCK_WAIT_MS = 10;
var WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));
var STATE_DIR_RELATIVE = ".language-output-governance/state";
function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
function ensureStateDir(directory) {
  mkdirSync(directory, { recursive: true, mode: 448 });
  const ignore = join2(dirname(directory), ".gitignore");
  if (!existsSync2(ignore)) {
    writeFileSync(ignore, "state/\n", { encoding: "utf8", mode: 384 });
  }
}
function statePath(event) {
  const session = extractSessionId(event) ?? "default";
  return join2(resolve2(extractCwd(event)), STATE_DIR_RELATIVE, `${digest(session)}.json`);
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
  if (!value || typeof value !== "object" || value.version !== VERSION) {
    return emptyState(defaultProfile);
  }
  if (Date.now() - Number(value.updatedAt || 0) > TTL_MS) {
    return emptyState(defaultProfile);
  }
  return {
    version: VERSION,
    preferredProfile: isProfileId(value.preferredProfile) ? value.preferredProfile : defaultProfile,
    authorizedProfiles: Array.isArray(value.authorizedProfiles) ? [...new Set(value.authorizedProfiles.filter(isProfileId))] : [],
    toolFeedbackDelivered: value.toolFeedbackDelivered === true,
    updatedAt: Number(value.updatedAt) || 0
  };
}
function read(path, defaultProfile) {
  if (!path) return emptyState(defaultProfile);
  try {
    return sanitize(JSON.parse(readFileSync2(path, "utf8")), defaultProfile);
  } catch {
    return emptyState(defaultProfile);
  }
}
function write(path, state) {
  if (!path) return false;
  const directory = dirname(path);
  const temporary = join2(directory, `.${digest(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    ensureStateDir(directory);
    writeFileSync(temporary, `${JSON.stringify(state)}
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
      mkdirSync(lock, { mode: 448 });
      try {
        return operation();
      } finally {
        rmSync(lock, { recursive: true, force: true });
      }
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) {
          rmSync(lock, { recursive: true, force: true });
          continue;
        }
      } catch (cause) {
        if (cause?.code !== "ENOENT") throw cause;
        continue;
      }
      Atomics.wait(WAIT_BUFFER, 0, 0, LOCK_WAIT_MS);
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
  PROFILE_IDS,
  PROFILES,
  profileFor,
  loadConfig,
  readStdinJson,
  extractCwd,
  extractSource,
  extractPrompt,
  extractAssistantMessage,
  generatedToolText,
  extractFileTargets,
  writeJson,
  additionalContextOutput,
  supportsPostToolFeedback,
  postToolFeedbackOutput,
  stopBlock,
  warn,
  readState,
  initializeState,
  recordLanguageIntent,
  claimToolFeedback
};
