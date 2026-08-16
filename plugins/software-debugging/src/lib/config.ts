import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { isRecord } from "@harness/core/hook-event";

export type ConfigMode = "block" | "report" | "off";
export type LedgerPersistence = "local" | "tracked";
export type ConfigWarn = (message: string) => void;

export type PluginConfig = {
  mode: ConfigMode;
  ledger: {
    root: string;
    persistence: LedgerPersistence;
    maxFiles: number;
    maxBytes: number;
  };
  limits: {
    maxBugs: number;
    maxHypothesesPerBug: number;
    maxFailedFixAttempts: number;
    leaseMinutes: number;
    maxReceipts: number;
  };
  commands: {
    reproductionPatterns: string[];
    verificationPatterns: string[];
    expectedFailurePatterns: string[];
    expectedSuccessPatterns: string[];
  };
  paths: {
    codePatterns: string[];
    testPatterns: string[];
    diagnosticPatterns: string[];
    nonCodePatterns: string[];
  };
};

const defaultConfig: PluginConfig = {
  mode: "block",
  ledger: {
    root: ".debug-workflow",
    persistence: "local",
    maxFiles: 40,
    maxBytes: 256 * 1024,
  },
  limits: {
    maxBugs: 50,
    maxHypothesesPerBug: 20,
    maxFailedFixAttempts: 3,
    leaseMinutes: 120,
    maxReceipts: 200,
  },
  commands: {
    reproductionPatterns: [],
    verificationPatterns: [],
    expectedFailurePatterns: [],
    expectedSuccessPatterns: [],
  },
  paths: {
    codePatterns: [],
    testPatterns: [],
    diagnosticPatterns: [],
    nonCodePatterns: [],
  },
};
Object.freeze(defaultConfig);
Object.freeze(defaultConfig.ledger);
Object.freeze(defaultConfig.limits);
Object.freeze(defaultConfig.commands);
Object.freeze(defaultConfig.paths);
Object.freeze(defaultConfig.commands.reproductionPatterns);
Object.freeze(defaultConfig.commands.verificationPatterns);
Object.freeze(defaultConfig.commands.expectedFailurePatterns);
Object.freeze(defaultConfig.commands.expectedSuccessPatterns);
Object.freeze(defaultConfig.paths.codePatterns);
Object.freeze(defaultConfig.paths.testPatterns);
Object.freeze(defaultConfig.paths.diagnosticPatterns);
Object.freeze(defaultConfig.paths.nonCodePatterns);
export const DEFAULT_CONFIG: PluginConfig = defaultConfig;

function cloneDefaults(): PluginConfig {
  return {
    mode: DEFAULT_CONFIG.mode,
    ledger: { ...DEFAULT_CONFIG.ledger },
    limits: { ...DEFAULT_CONFIG.limits },
    commands: {
      reproductionPatterns: [...DEFAULT_CONFIG.commands.reproductionPatterns],
      verificationPatterns: [...DEFAULT_CONFIG.commands.verificationPatterns],
      expectedFailurePatterns: [...DEFAULT_CONFIG.commands.expectedFailurePatterns],
      expectedSuccessPatterns: [...DEFAULT_CONFIG.commands.expectedSuccessPatterns],
    },
    paths: {
      codePatterns: [...DEFAULT_CONFIG.paths.codePatterns],
      testPatterns: [...DEFAULT_CONFIG.paths.testPatterns],
      diagnosticPatterns: [...DEFAULT_CONFIG.paths.diagnosticPatterns],
      nonCodePatterns: [...DEFAULT_CONFIG.paths.nonCodePatterns],
    },
  };
}

function positiveInt(value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= max ? number : fallback;
}

function strings(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
}

function isConfigMode(value: unknown): value is ConfigMode {
  return value === "block" || value === "report" || value === "off";
}

function isLedgerPersistence(value: unknown): value is LedgerPersistence {
  return value === "local" || value === "tracked";
}

function applyPatternGroup(target: Record<string, string[]>, source: unknown): void {
  if (!isRecord(source)) return;
  for (const [key, fallback] of Object.entries(target)) {
    if (source[key] !== undefined) target[key] = strings(source[key], fallback);
  }
}

export function resolveConfig(raw: unknown, warn: ConfigWarn = () => {}): PluginConfig {
  const config = cloneDefaults();
  if (!isRecord(raw)) return config;
  if (isConfigMode(raw.mode)) config.mode = raw.mode;
  else if (raw.mode !== undefined) warn(`invalid mode: ${String(raw.mode)}`);

  if (isRecord(raw.ledger)) {
    if (typeof raw.ledger.root === "string" && raw.ledger.root.trim()) {
      const root = raw.ledger.root.trim().replaceAll("\\", "/").replace(/^\.\//u, "");
      if (!root.startsWith("../") && !root.startsWith("/") && !root.split("/").includes("..")) config.ledger.root = root.replace(/\/$/u, "");
      else warn("ledger.root must stay inside the repository");
    }
    if (isLedgerPersistence(raw.ledger.persistence)) config.ledger.persistence = raw.ledger.persistence;
    config.ledger.maxFiles = positiveInt(raw.ledger.maxFiles, config.ledger.maxFiles, 200);
    config.ledger.maxBytes = positiveInt(raw.ledger.maxBytes, config.ledger.maxBytes, 1024 * 1024);
  }
  if (isRecord(raw.limits)) {
    config.limits.maxBugs = positiveInt(raw.limits.maxBugs, config.limits.maxBugs, 200);
    config.limits.maxHypothesesPerBug = positiveInt(raw.limits.maxHypothesesPerBug, config.limits.maxHypothesesPerBug, 100);
    config.limits.maxFailedFixAttempts = positiveInt(raw.limits.maxFailedFixAttempts, config.limits.maxFailedFixAttempts, 20);
    config.limits.leaseMinutes = positiveInt(raw.limits.leaseMinutes, config.limits.leaseMinutes, 1440);
    config.limits.maxReceipts = positiveInt(raw.limits.maxReceipts, config.limits.maxReceipts, 1000);
  }
  applyPatternGroup(config.commands, raw.commands);
  applyPatternGroup(config.paths, raw.paths);
  return config;
}

export async function loadProjectConfig(repoRoot: string | null | undefined, warn: ConfigWarn = () => {}): Promise<PluginConfig> {
  if (!repoRoot) return resolveConfig(null, warn);
  for (const name of [".software-debugging.mjs", ".software-debugging.js", ".software-debugging.cjs"]) {
    const path = join(repoRoot, name);
    if (!existsSync(path)) continue;
    try {
      const loaded: unknown = await import(pathToFileURL(path).href);
      const moduleRecord = isRecord(loaded) ? loaded : null;
      return resolveConfig(moduleRecord?.default ?? loaded, warn);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : error;
      warn(`failed to load ${name}: ${message ?? error}`);
      return resolveConfig(null, warn);
    }
  }
  return resolveConfig(null, warn);
}
