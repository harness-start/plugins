import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { isRecord } from "@harness/core/hook-event";

export const CONFIG_NAMES = [
  ".execution-discipline.mjs",
  ".execution-discipline.cjs",
  ".execution-discipline.js",
];

export type CheckMode = "block" | "report" | "off";
export type CheckName = "editLoop" | "failedCommandRetry" | "successfulCommandRepeat" | "remotePolling";
export type WarnFn = (message: string) => void;

export type LoopConfig = {
  checks: Record<CheckName, CheckMode>;
  editLoop: {
    reportAt: number;
    blockAt: number;
    windowMinutes: number;
    exemptPaths: RegExp[];
  };
  commandRepeat: {
    failureReportAt: number;
    failureBlockAt: number;
    successReportAt: number;
    successBlockAt: number;
    windowMinutes: number;
    retryBypass: RegExp;
  };
  polling: {
    sleepBudgetSeconds: number;
    queryBudgetCount: number;
    windowMinutes: number;
    cooldownMinutes: number;
    maxSleepPerCommandSeconds: number;
    whileLoopAssumedIterations: number;
    pollBypass: RegExp;
  };
};

const VALID_MODES = new Set<CheckMode>(["block", "report", "off"]);

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

function defaultWarn(message: string): void {
  process.stderr.write(`[execution-discipline] ${message}\n`);
}

function cloneRegex(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, pattern.flags);
}

function isCheckMode(value: unknown): value is CheckMode {
  return value === "block" || value === "report" || value === "off";
}

function mode(value: unknown, fallback: CheckMode, label: string, warn: WarnFn): CheckMode {
  if (value === undefined) return fallback;
  if (isCheckMode(value) && VALID_MODES.has(value)) return value;
  warn(`${label} must be "block", "report", or "off"; using ${fallback}`);
  return fallback;
}

function positiveInteger(
  value: unknown,
  fallback: number,
  label: string,
  warn: WarnFn,
  { allowZero = false }: { allowZero?: boolean } = {},
): number {
  const minimum = allowZero ? 0 : 1;
  if (value === undefined) return fallback;
  if (typeof value === "number" && Number.isInteger(value) && value >= minimum) return value;
  warn(`${label} must be an integer >= ${minimum}; using ${fallback}`);
  return fallback;
}

function thresholdPair<KReport extends string, KBlock extends string>(
  source: Record<string, unknown>,
  reportKey: KReport,
  blockKey: KBlock,
  defaults: Record<KReport | KBlock, number>,
  label: string,
  warn: WarnFn,
): Record<KReport | KBlock, number> {
  const reportAt = positiveInteger(source[reportKey], defaults[reportKey], `${label}.${reportKey}`, warn);
  const blockAt = positiveInteger(source[blockKey], defaults[blockKey], `${label}.${blockKey}`, warn);
  if (reportAt < blockAt) {
    return { [reportKey]: reportAt, [blockKey]: blockAt } as Record<KReport | KBlock, number>;
  }
  warn(`${label}.${reportKey} must be lower than ${label}.${blockKey}; using defaults`);
  return { [reportKey]: defaults[reportKey], [blockKey]: defaults[blockKey] } as Record<KReport | KBlock, number>;
}

function regex(value: unknown, fallback: RegExp, label: string, warn: WarnFn): RegExp {
  if (value === undefined) return cloneRegex(fallback);
  if (value instanceof RegExp) return cloneRegex(value);
  warn(`${label} must be a RegExp; using the default`);
  return cloneRegex(fallback);
}

function exemptPaths(value: unknown, warn: WarnFn): RegExp[] {
  const builtIns = DEFAULT_CONFIG.editLoop.exemptPaths.map(cloneRegex);
  if (value === undefined) return builtIns;
  if (!Array.isArray(value)) {
    warn("editLoop.exemptPaths must be an array of RegExp values; using built-ins");
    return builtIns;
  }
  const custom: RegExp[] = [];
  for (const [index, pattern] of value.entries()) {
    if (pattern instanceof RegExp) custom.push(cloneRegex(pattern));
    else warn(`editLoop.exemptPaths[${index}] must be a RegExp; skipping`);
  }
  return [...builtIns, ...custom];
}

export function resolveConfig(userConfig: unknown, warn: WarnFn = defaultWarn): LoopConfig {
  const user = userConfig && isRecord(userConfig) ? userConfig : {};
  if (userConfig != null && user !== userConfig) warn("config default export must be an object; using defaults");

  const checksSource = user.checks && isRecord(user.checks) ? user.checks : {};
  if (user.checks !== undefined && checksSource !== user.checks) {
    warn("checks must be an object; using defaults");
  }
  const checks: LoopConfig["checks"] = {
    editLoop: mode(checksSource.editLoop, DEFAULT_CONFIG.checks.editLoop, "checks.editLoop", warn),
    failedCommandRetry: mode(checksSource.failedCommandRetry, DEFAULT_CONFIG.checks.failedCommandRetry, "checks.failedCommandRetry", warn),
    successfulCommandRepeat: mode(checksSource.successfulCommandRepeat, DEFAULT_CONFIG.checks.successfulCommandRepeat, "checks.successfulCommandRepeat", warn),
    remotePolling: mode(checksSource.remotePolling, DEFAULT_CONFIG.checks.remotePolling, "checks.remotePolling", warn),
  };

  const editSource = user.editLoop && isRecord(user.editLoop) ? user.editLoop : {};
  const editThresholds = thresholdPair(
    editSource,
    "reportAt",
    "blockAt",
    DEFAULT_CONFIG.editLoop,
    "editLoop",
    warn,
  );
  const editLoop: LoopConfig["editLoop"] = {
    ...editThresholds,
    windowMinutes: positiveInteger(
      editSource.windowMinutes,
      DEFAULT_CONFIG.editLoop.windowMinutes,
      "editLoop.windowMinutes",
      warn,
    ),
    exemptPaths: exemptPaths(editSource.exemptPaths, warn),
  };

  const repeatSource = user.commandRepeat && isRecord(user.commandRepeat) ? user.commandRepeat : {};
  const commandRepeat: LoopConfig["commandRepeat"] = {
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

  const pollingSource = user.polling && isRecord(user.polling) ? user.polling : {};
  const polling: LoopConfig["polling"] = {
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

export function resolveRepoRoot(cwd: string): string | null {
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

export async function loadProjectConfig(cwd: string, warn: WarnFn = defaultWarn): Promise<{ config: LoopConfig; repoRoot: string | null }> {
  const repoRoot = resolveRepoRoot(cwd);
  if (!repoRoot) return { config: resolveConfig(null, warn), repoRoot: null };
  for (const name of CONFIG_NAMES) {
    const path = join(repoRoot, name);
    if (!existsSync(path)) continue;
    try {
      const loaded: unknown = await import(pathToFileURL(path).href);
      const exported = isRecord(loaded) ? loaded.default ?? loaded : loaded;
      return { config: resolveConfig(exported, warn), repoRoot };
    } catch (error: unknown) {
      warn(`failed to load ${name}: ${error instanceof Error ? error.message : String(error)}; using defaults`);
      return { config: resolveConfig(null, warn), repoRoot };
    }
  }
  return { config: resolveConfig(null, warn), repoRoot };
}
