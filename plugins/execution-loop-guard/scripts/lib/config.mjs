import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const CONFIG_NAMES = [
  ".execution-loop-guard.mjs",
  ".execution-loop-guard.cjs",
  ".execution-loop-guard.js",
];

const VALID_MODES = new Set(["block", "report", "off"]);

export const DEFAULT_CONFIG = Object.freeze({
  checks: Object.freeze({
    editLoop: "block",
    failedCommandRetry: "block",
    successfulCommandRepeat: "block",
    remotePolling: "report",
  }),
  editLoop: Object.freeze({
    reportAt: 5,
    blockAt: 20,
    windowMinutes: 30,
    exemptPaths: Object.freeze([/\.mdx?$/iu]),
  }),
  commandRepeat: Object.freeze({
    failureReportAt: 2,
    failureBlockAt: 3,
    successReportAt: 6,
    successBlockAt: 12,
    windowMinutes: 10,
    retryBypass: /(?:^|\s)#\s*retry-ok\b/iu,
  }),
  polling: Object.freeze({
    sleepBudgetSeconds: 600,
    queryBudgetCount: 20,
    windowMinutes: 30,
    cooldownMinutes: 5,
    maxSleepPerCommandSeconds: 3600,
    whileLoopAssumedIterations: 10,
    pollBypass: /(?:^|\s)#\s*poll-ok\b/iu,
  }),
});

function defaultWarn(message) {
  process.stderr.write(`[execution-loop-guard] ${message}\n`);
}

function cloneRegex(pattern) {
  return new RegExp(pattern.source, pattern.flags);
}

function mode(value, fallback, label, warn) {
  if (value === undefined) return fallback;
  if (VALID_MODES.has(value)) return value;
  warn(`${label} must be "block", "report", or "off"; using ${fallback}`);
  return fallback;
}

function positiveInteger(value, fallback, label, warn, { allowZero = false } = {}) {
  const minimum = allowZero ? 0 : 1;
  if (value === undefined) return fallback;
  if (Number.isInteger(value) && value >= minimum) return value;
  warn(`${label} must be an integer >= ${minimum}; using ${fallback}`);
  return fallback;
}

function thresholdPair(source, reportKey, blockKey, defaults, label, warn) {
  const reportAt = positiveInteger(source?.[reportKey], defaults[reportKey], `${label}.${reportKey}`, warn);
  const blockAt = positiveInteger(source?.[blockKey], defaults[blockKey], `${label}.${blockKey}`, warn);
  if (reportAt < blockAt) return { [reportKey]: reportAt, [blockKey]: blockAt };
  warn(`${label}.${reportKey} must be lower than ${label}.${blockKey}; using defaults`);
  return { [reportKey]: defaults[reportKey], [blockKey]: defaults[blockKey] };
}

function regex(value, fallback, label, warn) {
  if (value === undefined) return cloneRegex(fallback);
  if (value instanceof RegExp) return cloneRegex(value);
  warn(`${label} must be a RegExp; using the default`);
  return cloneRegex(fallback);
}

function exemptPaths(value, warn) {
  const builtIns = DEFAULT_CONFIG.editLoop.exemptPaths.map(cloneRegex);
  if (value === undefined) return builtIns;
  if (!Array.isArray(value)) {
    warn("editLoop.exemptPaths must be an array of RegExp values; using built-ins");
    return builtIns;
  }
  const custom = [];
  for (const [index, pattern] of value.entries()) {
    if (pattern instanceof RegExp) custom.push(cloneRegex(pattern));
    else warn(`editLoop.exemptPaths[${index}] must be a RegExp; skipping`);
  }
  return [...builtIns, ...custom];
}

export function resolveConfig(userConfig, warn = defaultWarn) {
  const user = userConfig && typeof userConfig === "object" && !Array.isArray(userConfig)
    ? userConfig
    : {};
  if (userConfig != null && user !== userConfig) warn("config default export must be an object; using defaults");

  const checksSource = user.checks && typeof user.checks === "object" && !Array.isArray(user.checks)
    ? user.checks
    : {};
  if (user.checks !== undefined && checksSource !== user.checks) {
    warn("checks must be an object; using defaults");
  }
  const checks = Object.fromEntries(
    Object.entries(DEFAULT_CONFIG.checks).map(([name, fallback]) => [
      name,
      mode(checksSource[name], fallback, `checks.${name}`, warn),
    ]),
  );

  const editSource = user.editLoop && typeof user.editLoop === "object" && !Array.isArray(user.editLoop)
    ? user.editLoop
    : {};
  const editThresholds = thresholdPair(
    editSource,
    "reportAt",
    "blockAt",
    DEFAULT_CONFIG.editLoop,
    "editLoop",
    warn,
  );
  const editLoop = {
    ...editThresholds,
    windowMinutes: positiveInteger(
      editSource.windowMinutes,
      DEFAULT_CONFIG.editLoop.windowMinutes,
      "editLoop.windowMinutes",
      warn,
    ),
    exemptPaths: exemptPaths(editSource.exemptPaths, warn),
  };

  const repeatSource = user.commandRepeat && typeof user.commandRepeat === "object" && !Array.isArray(user.commandRepeat)
    ? user.commandRepeat
    : {};
  const commandRepeat = {
    ...thresholdPair(
      repeatSource,
      "failureReportAt",
      "failureBlockAt",
      DEFAULT_CONFIG.commandRepeat,
      "commandRepeat",
      warn,
    ),
    ...thresholdPair(
      repeatSource,
      "successReportAt",
      "successBlockAt",
      DEFAULT_CONFIG.commandRepeat,
      "commandRepeat",
      warn,
    ),
    windowMinutes: positiveInteger(
      repeatSource.windowMinutes,
      DEFAULT_CONFIG.commandRepeat.windowMinutes,
      "commandRepeat.windowMinutes",
      warn,
    ),
    retryBypass: regex(
      repeatSource.retryBypass,
      DEFAULT_CONFIG.commandRepeat.retryBypass,
      "commandRepeat.retryBypass",
      warn,
    ),
  };

  const pollingSource = user.polling && typeof user.polling === "object" && !Array.isArray(user.polling)
    ? user.polling
    : {};
  const polling = {
    sleepBudgetSeconds: positiveInteger(
      pollingSource.sleepBudgetSeconds,
      DEFAULT_CONFIG.polling.sleepBudgetSeconds,
      "polling.sleepBudgetSeconds",
      warn,
    ),
    queryBudgetCount: positiveInteger(
      pollingSource.queryBudgetCount,
      DEFAULT_CONFIG.polling.queryBudgetCount,
      "polling.queryBudgetCount",
      warn,
    ),
    windowMinutes: positiveInteger(
      pollingSource.windowMinutes,
      DEFAULT_CONFIG.polling.windowMinutes,
      "polling.windowMinutes",
      warn,
    ),
    cooldownMinutes: positiveInteger(
      pollingSource.cooldownMinutes,
      DEFAULT_CONFIG.polling.cooldownMinutes,
      "polling.cooldownMinutes",
      warn,
      { allowZero: true },
    ),
    maxSleepPerCommandSeconds: positiveInteger(
      pollingSource.maxSleepPerCommandSeconds,
      DEFAULT_CONFIG.polling.maxSleepPerCommandSeconds,
      "polling.maxSleepPerCommandSeconds",
      warn,
    ),
    whileLoopAssumedIterations: positiveInteger(
      pollingSource.whileLoopAssumedIterations,
      DEFAULT_CONFIG.polling.whileLoopAssumedIterations,
      "polling.whileLoopAssumedIterations",
      warn,
    ),
    pollBypass: regex(
      pollingSource.pollBypass,
      DEFAULT_CONFIG.polling.pollBypass,
      "polling.pollBypass",
      warn,
    ),
  };

  return { checks, editLoop, commandRepeat, polling };
}

export function resolveRepoRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
}

export async function loadProjectConfig(cwd, warn = defaultWarn) {
  const repoRoot = resolveRepoRoot(cwd);
  if (!repoRoot) return { config: resolveConfig(null, warn), repoRoot: null };
  for (const name of CONFIG_NAMES) {
    const path = join(repoRoot, name);
    if (!existsSync(path)) continue;
    try {
      const loaded = await import(pathToFileURL(path).href);
      return { config: resolveConfig(loaded.default ?? loaded, warn), repoRoot };
    } catch (error) {
      warn(`failed to load ${name}: ${error instanceof Error ? error.message : String(error)}; using defaults`);
      return { config: resolveConfig(null, warn), repoRoot };
    }
  }
  return { config: resolveConfig(null, warn), repoRoot };
}
