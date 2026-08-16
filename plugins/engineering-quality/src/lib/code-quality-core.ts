import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { delimiter, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { eventSessionId, isRecord, type HookEvent } from "@harness/core/hook-event";
import { ensurePluginWorkdirGitignore } from "@harness/core/plugin-workdir";

export const CHECK_NAMES = [
  "javascriptSyntax",
  "typescriptSyntax",
  "eslint",
  "pythonSyntax",
  "ruff",
  "phpSyntax",
  "composerValidate",
  "phpstan",
] as const;

export type CheckName = (typeof CHECK_NAMES)[number];
export type CheckMode = "block" | "report" | "off";
export type MissingToolsMode = "report-once" | "silent";
export type WarnFn = (message: string) => void;

export type QualityLimits = {
  maxImmediateFiles: number;
  maxPhpstanFiles: number;
  immediateTimeoutMs: number;
  phpstanTimeoutMs: number;
  maxOutputLines: number;
};

export type QualityOverride = {
  match: RegExp;
  checks: Partial<Record<CheckName, CheckMode>>;
};

export type QualityConfig = {
  checks: Record<CheckName, CheckMode>;
  overrides: QualityOverride[];
  limits: QualityLimits;
  missingTools: MissingToolsMode;
};

export type CommandResult = {
  code: number | null;
  signal?: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error: { message: string } | null;
  timedOut: boolean;
};

export type QualityState = {
  path: string | null;
  missing: string[];
  phpFiles: string[];
};

export const DEFAULT_CONFIG = Object.freeze({
  checks: Object.freeze({
    javascriptSyntax: "block",
    typescriptSyntax: "block",
    eslint: "report",
    pythonSyntax: "block",
    ruff: "report",
    phpSyntax: "block",
    composerValidate: "block",
    phpstan: "report",
  }),
  limits: Object.freeze({
    maxImmediateFiles: 12,
    maxPhpstanFiles: 24,
    immediateTimeoutMs: 10000,
    phpstanTimeoutMs: 55000,
    maxOutputLines: 80,
  }),
  missingTools: "report-once",
});

const CONFIG_FILE_NAME = ".engineering-quality.mjs";
const VALID_MODES = new Set<CheckMode>(["block", "report", "off"]);
const SKIP_PATH =
  /(?:^|\/)(?:\.git|\.cache|\.next|\.nuxt|__generated__|build|coverage|dist|generated|node_modules|target|vendor)(?:\/|$)/iu;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

function warnDefault(message: string): void {
  process.stderr.write(`[engineering-quality] ${message}\n`);
}

function isCheckMode(value: unknown): value is CheckMode {
  return value === "block" || value === "report" || value === "off";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return String(error);
}

function normalizeMode(value: unknown, fallback: CheckMode, label: string, warn: WarnFn): CheckMode;
function normalizeMode(value: unknown, fallback: CheckMode | null, label: string, warn: WarnFn): CheckMode | null;
function normalizeMode(value: unknown, fallback: CheckMode | null, label: string, warn: WarnFn): CheckMode | null {
  if (value === undefined) return fallback;
  if (isCheckMode(value) && VALID_MODES.has(value)) return value;
  warn(`${label} must be "block", "report", or "off"; using ${fallback}`);
  return fallback;
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
  warn: WarnFn,
): number {
  if (value === undefined) return fallback;
  if (typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum) return value;
  warn(`${label} must be an integer in [${minimum}, ${maximum}]; using ${fallback}`);
  return fallback;
}

export function resolveConfig(userConfig: unknown, warn: WarnFn = warnDefault): QualityConfig {
  const raw = isRecord(userConfig) ? userConfig : null;
  const checks: Record<CheckName, CheckMode> = { ...DEFAULT_CONFIG.checks };
  if (raw?.checks !== undefined && (
    !raw.checks ||
    typeof raw.checks !== "object" ||
    Array.isArray(raw.checks)
  )) {
    warn('config "checks" must be an object; using defaults');
  } else {
    const checksSource = raw && isRecord(raw.checks) ? raw.checks : {};
    for (const name of CHECK_NAMES) {
      checks[name] = normalizeMode(
        checksSource[name],
        checks[name],
        `checks.${name}`,
        warn,
      );
    }
  }

  const overrides: QualityOverride[] = [];
  if (raw?.overrides !== undefined && !Array.isArray(raw.overrides)) {
    warn('config "overrides" must be an array; ignoring overrides');
  } else {
    for (const [index, override] of (Array.isArray(raw?.overrides) ? raw.overrides : []).entries()) {
      if (!isRecord(override) || !(override.match instanceof RegExp)) {
        warn(`override[${index}].match must be a RegExp; skipping`);
        continue;
      }
      if (!override.checks || typeof override.checks !== "object" || Array.isArray(override.checks)) {
        warn(`override[${index}].checks must be an object; skipping`);
        continue;
      }
      const overrideChecks = isRecord(override.checks) ? override.checks : {};
      const normalizedChecks: Partial<Record<CheckName, CheckMode>> = {};
      for (const name of CHECK_NAMES) {
        if (overrideChecks[name] === undefined) continue;
        const mode = normalizeMode(
          overrideChecks[name],
          null,
          `override[${index}].checks.${name}`,
          warn,
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

  const limitsSource = raw && isRecord(raw.limits) ? raw.limits : {};
  const limits: QualityLimits = {
    maxImmediateFiles: boundedInteger(
      limitsSource.maxImmediateFiles,
      DEFAULT_CONFIG.limits.maxImmediateFiles,
      1,
      100,
      "limits.maxImmediateFiles",
      warn,
    ),
    maxPhpstanFiles: boundedInteger(
      limitsSource.maxPhpstanFiles,
      DEFAULT_CONFIG.limits.maxPhpstanFiles,
      1,
      200,
      "limits.maxPhpstanFiles",
      warn,
    ),
    immediateTimeoutMs: boundedInteger(
      limitsSource.immediateTimeoutMs,
      DEFAULT_CONFIG.limits.immediateTimeoutMs,
      1000,
      60000,
      "limits.immediateTimeoutMs",
      warn,
    ),
    phpstanTimeoutMs: boundedInteger(
      limitsSource.phpstanTimeoutMs,
      DEFAULT_CONFIG.limits.phpstanTimeoutMs,
      1000,
      120000,
      "limits.phpstanTimeoutMs",
      warn,
    ),
    maxOutputLines: boundedInteger(
      limitsSource.maxOutputLines,
      DEFAULT_CONFIG.limits.maxOutputLines,
      5,
      500,
      "limits.maxOutputLines",
      warn,
    ),
  };

  let missingTools: MissingToolsMode = raw && (raw.missingTools === "report-once" || raw.missingTools === "silent")
    ? raw.missingTools
    : raw?.missingTools === undefined
      ? DEFAULT_CONFIG.missingTools
      : DEFAULT_CONFIG.missingTools;
  if (raw?.missingTools !== undefined && missingTools !== raw.missingTools) {
    warn('missingTools must be "report-once" or "silent"; using report-once');
    missingTools = DEFAULT_CONFIG.missingTools;
  }
  return { checks, overrides, limits, missingTools };
}

function regexMatches(pattern: RegExp, value: string): boolean {
  try {
    return new RegExp(pattern.source, pattern.flags).test(value);
  } catch {
    return false;
  }
}

export function modeFor(checkName: CheckName, relativePath: string, config: QualityConfig): CheckMode {
  for (const override of config.overrides) {
    const overrideMode = override.checks[checkName];
    if (
      overrideMode !== undefined &&
      regexMatches(override.match, relativePath)
    ) {
      return overrideMode;
    }
  }
  return config.checks[checkName] ?? "off";
}

export function isSkippedPath(relativePath: string): boolean {
  return SKIP_PATH.test(relativePath);
}

export function isSourceFileWithinLimit(filePath: string): boolean {
  try {
    const stat = statSync(filePath);
    return stat.isFile() && stat.size <= MAX_SOURCE_BYTES;
  } catch {
    return false;
  }
}

export function resolveRepoRoot(cwd: string): string | null {
  try {
    const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });
    return result.status === 0 ? result.stdout.trim() : null;
  } catch {
    return null;
  }
}

export function repoRelativePath(filePath: string, repoRoot: string | null | undefined, cwd: string): string {
  const base = repoRoot ?? cwd;
  const candidate = relative(base, filePath).replaceAll("\\", "/");
  return candidate.startsWith("../") ? filePath.replaceAll("\\", "/") : candidate;
}

export async function loadUserConfig(repoRoot: string | null | undefined, warn: WarnFn = warnDefault): Promise<unknown> {
  if (!repoRoot) return null;
  const configPath = join(repoRoot, CONFIG_FILE_NAME);
  if (!existsSync(configPath)) return null;
  try {
    const loaded: unknown = await import(pathToFileURL(configPath).href);
    return isRecord(loaded) ? loaded.default ?? loaded : loaded;
  } catch (error: unknown) {
    warn(`failed to load ${CONFIG_FILE_NAME}: ${errorMessage(error)}`);
    return null;
  }
}

function executableCandidate(path: string): string | null {
  if (!existsSync(path)) return null;
  if (process.platform === "win32") return path;
  try {
    accessSync(path, constants.X_OK);
    return path;
  } catch {
    return null;
  }
}

function executableNames(name: string): string[] {
  if (process.platform !== "win32") return [name];
  if (/\.(?:bat|cmd|com|exe)$/iu.test(name)) return [name];
  return [name, `${name}.cmd`, `${name}.exe`, `${name}.bat`];
}

export function findExecutable(
  name: string,
  repoRoot: string,
  localRelativePaths: readonly string[] = [],
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  for (const relativePath of localRelativePaths) {
    for (const candidateName of executableNames(relativePath)) {
      const candidate = executableCandidate(resolve(repoRoot, candidateName));
      if (candidate) return candidate;
    }
  }
  for (const directory of String(env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const candidateName of executableNames(name)) {
      const candidate = executableCandidate(join(directory, candidateName));
      if (candidate) return candidate;
    }
  }
  return null;
}

export function hasEslintConfig(repoRoot: string | null | undefined): boolean {
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
    ".eslintrc.yml",
  ]) {
    if (existsSync(join(repoRoot, name))) return true;
  }
  try {
    const pkg: unknown = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
    return isRecord(pkg) && pkg.eslintConfig !== undefined;
  } catch {
    return false;
  }
}

export function hasPhpstanConfig(repoRoot: string | null | undefined): boolean {
  if (!repoRoot) return false;
  return ["phpstan.neon", "phpstan.neon.dist", "phpstan.dist.neon"].some((name) =>
    existsSync(join(repoRoot, name)),
  );
}

export function runCommand(
  command: string,
  args: readonly string[],
  { cwd, timeoutMs, maxBytes = 128 * 1024 }: { cwd: string; timeoutMs: number; maxBytes?: number },
): Promise<CommandResult> {
  return new Promise((resolvePromise) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error: unknown) {
      resolvePromise({ code: null, stdout: "", stderr: "", error: { message: errorMessage(error) }, timedOut: false });
      return;
    }
    let stdout = "";
    let stderr = "";
    const append = (current: string, chunk: string | Buffer) => {
      if (Buffer.byteLength(current) >= maxBytes) return current;
      return `${current}${chunk}`.slice(0, maxBytes);
    };
    child.stdout?.on("data", (chunk: string | Buffer) => { stdout = append(stdout, chunk); });
    child.stderr?.on("data", (chunk: string | Buffer) => { stderr = append(stderr, chunk); });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.on("error", (error: Error) => {
      clearTimeout(timer);
      resolvePromise({ code: null, stdout, stderr, error, timedOut });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal, stdout, stderr, error: null, timedOut });
    });
  });
}

export function capOutput(text: unknown, maxLines: number): string {
  const lines = String(text ?? "").trim().split(/\r?\n/u).filter(Boolean);
  if (lines.length <= maxLines) return lines.join("\n");
  return [...lines.slice(0, maxLines), `… ${lines.length - maxLines} additional line(s) omitted`].join("\n");
}

export function extractSessionId(event: HookEvent): string {
  return eventSessionId(event) || "session";
}

export const STATE_DIR_RELATIVE = ".engineering-quality/state";

function stateFile(event: HookEvent, repoRoot: string | null | undefined): string {
  const root = resolve(repoRoot ?? process.cwd());
  const key = createHash("sha256")
    .update(extractSessionId(event))
    .digest("hex")
    .slice(0, 24);
  return join(root, STATE_DIR_RELATIVE, `${key}.json`);
}

export function readState(event: HookEvent, repoRoot: string | null | undefined): QualityState {
  const path = stateFile(event, repoRoot);
  if (!path) return { path: null, missing: [], phpFiles: [] };
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    const record = isRecord(parsed) ? parsed : {};
    return {
      path,
      missing: Array.isArray(record.missing) ? record.missing.filter((item): item is string => typeof item === "string") : [],
      phpFiles: Array.isArray(record.phpFiles) ? record.phpFiles.filter((item): item is string => typeof item === "string") : [],
    };
  } catch {
    return { path, missing: [], phpFiles: [] };
  }
}

export function writeState(state: QualityState): boolean {
  if (!state.path) return false;
  try {
    const stateDir = dirname(state.path);
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    ensurePluginWorkdirGitignore(dirname(stateDir));
    const temporary = `${state.path}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({
      missing: [...new Set(state.missing)].sort(),
      phpFiles: [...new Set(state.phpFiles)].sort(),
    })}\n`, "utf8");
    renameSync(temporary, state.path);
    return true;
  } catch {
    return false;
  }
}

export function markMissingOnce(state: QualityState, key: string): boolean {
  if (state.missing.includes(key)) return false;
  state.missing.push(key);
  writeState(state);
  return true;
}

export function recordPhpFiles(state: QualityState, paths: string[]): void {
  state.phpFiles.push(...paths.map((path) => resolve(path)));
  state.phpFiles = [...new Set(state.phpFiles)].slice(-500);
  writeState(state);
}
