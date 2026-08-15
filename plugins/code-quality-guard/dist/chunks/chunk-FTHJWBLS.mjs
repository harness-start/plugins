// harness-source-hash: sha256:acd8d96ea4591b1c7cadc51352e1500df1c0d0ef0d1dce43bd449d3c8748a09b

// plugins/code-quality-guard/src/lib/code-quality-core.ts
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync as mkdirSync2,
  readFileSync as readFileSync2,
  renameSync,
  statSync,
  writeFileSync as writeFileSync2
} from "node:fs";
import { delimiter, dirname, join as join2, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// core/src/plugin-workdir.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
  const ignore = join(pluginRoot, ".gitignore");
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

// plugins/code-quality-guard/src/lib/code-quality-core.ts
var CHECK_NAMES = [
  "javascriptSyntax",
  "typescriptSyntax",
  "eslint",
  "pythonSyntax",
  "ruff",
  "phpSyntax",
  "composerValidate",
  "phpstan"
];
var DEFAULT_CONFIG = Object.freeze({
  checks: Object.freeze({
    javascriptSyntax: "block",
    typescriptSyntax: "block",
    eslint: "report",
    pythonSyntax: "block",
    ruff: "report",
    phpSyntax: "block",
    composerValidate: "block",
    phpstan: "report"
  }),
  limits: Object.freeze({
    maxImmediateFiles: 12,
    maxPhpstanFiles: 24,
    immediateTimeoutMs: 1e4,
    phpstanTimeoutMs: 55e3,
    maxOutputLines: 80
  }),
  missingTools: "report-once"
});
var CONFIG_FILE_NAME = ".code-quality-guard.mjs";
var VALID_MODES = /* @__PURE__ */ new Set(["block", "report", "off"]);
var SKIP_PATH = /(?:^|\/)(?:\.git|\.cache|\.next|\.nuxt|__generated__|build|coverage|dist|generated|node_modules|target|vendor)(?:\/|$)/iu;
var MAX_SOURCE_BYTES = 2 * 1024 * 1024;
function warnDefault(message) {
  process.stderr.write(`[code-quality-guard] ${message}
`);
}
function normalizeMode(value, fallback, label, warn) {
  if (value === void 0) return fallback;
  if (VALID_MODES.has(value)) return value;
  warn(`${label} must be "block", "report", or "off"; using ${fallback}`);
  return fallback;
}
function boundedInteger(value, fallback, minimum, maximum, label, warn) {
  if (value === void 0) return fallback;
  if (Number.isInteger(value) && value >= minimum && value <= maximum) return value;
  warn(`${label} must be an integer in [${minimum}, ${maximum}]; using ${fallback}`);
  return fallback;
}
function resolveConfig(userConfig, warn = warnDefault) {
  const checks = { ...DEFAULT_CONFIG.checks };
  if (userConfig?.checks !== void 0 && (!userConfig.checks || typeof userConfig.checks !== "object" || Array.isArray(userConfig.checks))) {
    warn('config "checks" must be an object; using defaults');
  } else {
    for (const name of CHECK_NAMES) {
      checks[name] = normalizeMode(
        userConfig?.checks?.[name],
        checks[name],
        `checks.${name}`,
        warn
      );
    }
  }
  const overrides = [];
  if (userConfig?.overrides !== void 0 && !Array.isArray(userConfig.overrides)) {
    warn('config "overrides" must be an array; ignoring overrides');
  } else {
    for (const [index, override] of (userConfig?.overrides ?? []).entries()) {
      if (!override || !(override.match instanceof RegExp)) {
        warn(`override[${index}].match must be a RegExp; skipping`);
        continue;
      }
      if (!override.checks || typeof override.checks !== "object" || Array.isArray(override.checks)) {
        warn(`override[${index}].checks must be an object; skipping`);
        continue;
      }
      const normalizedChecks = {};
      for (const name of CHECK_NAMES) {
        if (override.checks[name] === void 0) continue;
        const mode = normalizeMode(
          override.checks[name],
          null,
          `override[${index}].checks.${name}`,
          warn
        );
        if (mode) normalizedChecks[name] = mode;
      }
      if (Object.keys(normalizedChecks).length > 0) {
        overrides.push({ match: override.match, checks: normalizedChecks });
      } else {
        warn(`override[${index}] has no valid checks; skipping`);
      }
    }
  }
  const limits = {
    maxImmediateFiles: boundedInteger(
      userConfig?.limits?.maxImmediateFiles,
      DEFAULT_CONFIG.limits.maxImmediateFiles,
      1,
      100,
      "limits.maxImmediateFiles",
      warn
    ),
    maxPhpstanFiles: boundedInteger(
      userConfig?.limits?.maxPhpstanFiles,
      DEFAULT_CONFIG.limits.maxPhpstanFiles,
      1,
      200,
      "limits.maxPhpstanFiles",
      warn
    ),
    immediateTimeoutMs: boundedInteger(
      userConfig?.limits?.immediateTimeoutMs,
      DEFAULT_CONFIG.limits.immediateTimeoutMs,
      1e3,
      6e4,
      "limits.immediateTimeoutMs",
      warn
    ),
    phpstanTimeoutMs: boundedInteger(
      userConfig?.limits?.phpstanTimeoutMs,
      DEFAULT_CONFIG.limits.phpstanTimeoutMs,
      1e3,
      12e4,
      "limits.phpstanTimeoutMs",
      warn
    ),
    maxOutputLines: boundedInteger(
      userConfig?.limits?.maxOutputLines,
      DEFAULT_CONFIG.limits.maxOutputLines,
      5,
      500,
      "limits.maxOutputLines",
      warn
    )
  };
  let missingTools = userConfig?.missingTools ?? DEFAULT_CONFIG.missingTools;
  if (missingTools !== "report-once" && missingTools !== "silent") {
    warn('missingTools must be "report-once" or "silent"; using report-once');
    missingTools = DEFAULT_CONFIG.missingTools;
  }
  return { checks, overrides, limits, missingTools };
}
function regexMatches(pattern, value) {
  try {
    return new RegExp(pattern.source, pattern.flags).test(value);
  } catch {
    return false;
  }
}
function modeFor(checkName, relativePath, config) {
  for (const override of config.overrides) {
    if (override.checks[checkName] !== void 0 && regexMatches(override.match, relativePath)) {
      return override.checks[checkName];
    }
  }
  return config.checks[checkName] ?? "off";
}
function isSkippedPath(relativePath) {
  return SKIP_PATH.test(relativePath);
}
function isSourceFileWithinLimit(filePath) {
  try {
    const stat = statSync(filePath);
    return stat.isFile() && stat.size <= MAX_SOURCE_BYTES;
  } catch {
    return false;
  }
}
function resolveRepoRoot(cwd) {
  try {
    const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5e3
    });
    return result.status === 0 ? result.stdout.trim() : null;
  } catch {
    return null;
  }
}
function repoRelativePath(filePath, repoRoot, cwd) {
  const base = repoRoot ?? cwd;
  const candidate = relative(base, filePath).replaceAll("\\", "/");
  return candidate.startsWith("../") ? filePath.replaceAll("\\", "/") : candidate;
}
async function loadUserConfig(repoRoot, warn = warnDefault) {
  if (!repoRoot) return null;
  const configPath = join2(repoRoot, CONFIG_FILE_NAME);
  if (!existsSync(configPath)) return null;
  try {
    const loaded = await import(pathToFileURL(configPath).href);
    return loaded.default ?? loaded;
  } catch (error) {
    warn(`failed to load ${CONFIG_FILE_NAME}: ${error.message}`);
    return null;
  }
}
function executableCandidate(path) {
  if (!existsSync(path)) return null;
  if (process.platform === "win32") return path;
  try {
    accessSync(path, constants.X_OK);
    return path;
  } catch {
    return null;
  }
}
function executableNames(name) {
  if (process.platform !== "win32") return [name];
  if (/\.(?:bat|cmd|com|exe)$/iu.test(name)) return [name];
  return [name, `${name}.cmd`, `${name}.exe`, `${name}.bat`];
}
function findExecutable(name, repoRoot, localRelativePaths = [], env = process.env) {
  for (const relativePath of localRelativePaths) {
    for (const candidateName of executableNames(relativePath)) {
      const candidate = executableCandidate(resolve(repoRoot, candidateName));
      if (candidate) return candidate;
    }
  }
  for (const directory of String(env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const candidateName of executableNames(name)) {
      const candidate = executableCandidate(join2(directory, candidateName));
      if (candidate) return candidate;
    }
  }
  return null;
}
function hasEslintConfig(repoRoot) {
  if (!repoRoot) return false;
  for (const name of [
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
    "eslint.config.ts",
    ".eslintrc",
    ".eslintrc.json",
    ".eslintrc.js",
    ".eslintrc.cjs",
    ".eslintrc.yaml",
    ".eslintrc.yml"
  ]) {
    if (existsSync(join2(repoRoot, name))) return true;
  }
  try {
    const pkg = JSON.parse(readFileSync2(join2(repoRoot, "package.json"), "utf8"));
    return pkg.eslintConfig !== void 0;
  } catch {
    return false;
  }
}
function hasPhpstanConfig(repoRoot) {
  if (!repoRoot) return false;
  return ["phpstan.neon", "phpstan.neon.dist", "phpstan.dist.neon"].some(
    (name) => existsSync(join2(repoRoot, name))
  );
}
function runCommand(command, args, { cwd, timeoutMs, maxBytes = 128 * 1024 }) {
  return new Promise((resolvePromise) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });
    } catch (error) {
      resolvePromise({ code: null, stdout: "", stderr: "", error, timedOut: false });
      return;
    }
    let stdout = "";
    let stderr = "";
    const append = (current, chunk) => {
      if (Buffer.byteLength(current) >= maxBytes) return current;
      return `${current}${chunk}`.slice(0, maxBytes);
    };
    child.stdout.on("data", (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = append(stderr, chunk);
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolvePromise({ code: null, stdout, stderr, error, timedOut });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal, stdout, stderr, error: null, timedOut });
    });
  });
}
function capOutput(text, maxLines) {
  const lines = String(text ?? "").trim().split(/\r?\n/u).filter(Boolean);
  if (lines.length <= maxLines) return lines.join("\n");
  return [...lines.slice(0, maxLines), `\u2026 ${lines.length - maxLines} additional line(s) omitted`].join("\n");
}
function extractSessionId(event) {
  return event?.session_id ?? event?.sessionId ?? event?.sessionID ?? event?.context?.session_id ?? "session";
}
var STATE_DIR_RELATIVE = ".code-quality-guard/state";
function stateFile(event, repoRoot) {
  const root = resolve(repoRoot ?? process.cwd());
  const key = createHash("sha256").update(extractSessionId(event)).digest("hex").slice(0, 24);
  return join2(root, STATE_DIR_RELATIVE, `${key}.json`);
}
function readState(event, repoRoot) {
  const path = stateFile(event, repoRoot);
  if (!path) return { path: null, missing: [], phpFiles: [] };
  try {
    const parsed = JSON.parse(readFileSync2(path, "utf8"));
    return {
      path,
      missing: Array.isArray(parsed.missing) ? parsed.missing.filter((item) => typeof item === "string") : [],
      phpFiles: Array.isArray(parsed.phpFiles) ? parsed.phpFiles.filter((item) => typeof item === "string") : []
    };
  } catch {
    return { path, missing: [], phpFiles: [] };
  }
}
function writeState(state) {
  if (!state.path) return false;
  try {
    const stateDir = dirname(state.path);
    mkdirSync2(stateDir, { recursive: true, mode: 448 });
    ensurePluginWorkdirGitignore(dirname(stateDir));
    const temporary = `${state.path}.${process.pid}.tmp`;
    writeFileSync2(temporary, `${JSON.stringify({
      missing: [...new Set(state.missing)].sort(),
      phpFiles: [...new Set(state.phpFiles)].sort()
    })}
`, "utf8");
    renameSync(temporary, state.path);
    return true;
  } catch {
    return false;
  }
}
function markMissingOnce(state, key) {
  if (state.missing.includes(key)) return false;
  state.missing.push(key);
  writeState(state);
  return true;
}
function recordPhpFiles(state, paths) {
  state.phpFiles.push(...paths.map((path) => resolve(path)));
  state.phpFiles = [...new Set(state.phpFiles)].slice(-500);
  writeState(state);
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

export {
  resolveConfig,
  modeFor,
  isSkippedPath,
  isSourceFileWithinLimit,
  resolveRepoRoot,
  repoRelativePath,
  loadUserConfig,
  findExecutable,
  hasEslintConfig,
  hasPhpstanConfig,
  runCommand,
  capOutput,
  readState,
  writeState,
  markMissingOnce,
  recordPhpFiles,
  readStdinJson,
  eventCwd,
  eventToolName,
  eventToolInput,
  isStopHookActive
};
