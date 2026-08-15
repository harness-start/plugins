import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_CONFIG = Object.freeze({
  mode: "block",
  ledger: Object.freeze({
    root: ".debug-workflow",
    persistence: "local",
    maxFiles: 40,
    maxBytes: 256 * 1024,
  }),
  limits: Object.freeze({
    maxBugs: 50,
    maxHypothesesPerBug: 20,
    maxFailedFixAttempts: 3,
    leaseMinutes: 120,
    maxReceipts: 200,
  }),
  commands: Object.freeze({
    reproductionPatterns: Object.freeze([]),
    verificationPatterns: Object.freeze([]),
    expectedFailurePatterns: Object.freeze([]),
    expectedSuccessPatterns: Object.freeze([]),
  }),
  paths: Object.freeze({
    codePatterns: Object.freeze([]),
    testPatterns: Object.freeze([]),
    diagnosticPatterns: Object.freeze([]),
    nonCodePatterns: Object.freeze([]),
  }),
});

function cloneDefaults() {
  return {
    mode: DEFAULT_CONFIG.mode,
    ledger: { ...DEFAULT_CONFIG.ledger },
    limits: { ...DEFAULT_CONFIG.limits },
    commands: Object.fromEntries(
      Object.entries(DEFAULT_CONFIG.commands).map(([key, value]) => [key, [...value]]),
    ),
    paths: Object.fromEntries(
      Object.entries(DEFAULT_CONFIG.paths).map(([key, value]) => [key, [...value]]),
    ),
  };
}

function positiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= max ? number : fallback;
}

function strings(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  return value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
}

export function resolveConfig(raw, warn = () => {}) {
  const config = cloneDefaults();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return config;
  if (["block", "report", "off"].includes(raw.mode)) config.mode = raw.mode;
  else if (raw.mode !== undefined) warn(`invalid mode: ${raw.mode}`);

  if (raw.ledger && typeof raw.ledger === "object") {
    if (typeof raw.ledger.root === "string" && raw.ledger.root.trim()) {
      const root = raw.ledger.root.trim().replaceAll("\\", "/").replace(/^\.\//u, "");
      if (!root.startsWith("../") && !root.startsWith("/") && !root.split("/").includes("..")) config.ledger.root = root.replace(/\/$/u, "");
      else warn("ledger.root must stay inside the repository");
    }
    if (["local", "tracked"].includes(raw.ledger.persistence)) config.ledger.persistence = raw.ledger.persistence;
    config.ledger.maxFiles = positiveInt(raw.ledger.maxFiles, config.ledger.maxFiles, 200);
    config.ledger.maxBytes = positiveInt(raw.ledger.maxBytes, config.ledger.maxBytes, 1024 * 1024);
  }
  if (raw.limits && typeof raw.limits === "object") {
    config.limits.maxBugs = positiveInt(raw.limits.maxBugs, config.limits.maxBugs, 200);
    config.limits.maxHypothesesPerBug = positiveInt(raw.limits.maxHypothesesPerBug, config.limits.maxHypothesesPerBug, 100);
    config.limits.maxFailedFixAttempts = positiveInt(raw.limits.maxFailedFixAttempts, config.limits.maxFailedFixAttempts, 20);
    config.limits.leaseMinutes = positiveInt(raw.limits.leaseMinutes, config.limits.leaseMinutes, 1440);
    config.limits.maxReceipts = positiveInt(raw.limits.maxReceipts, config.limits.maxReceipts, 1000);
  }
  for (const group of ["commands", "paths"]) {
    if (!raw[group] || typeof raw[group] !== "object") continue;
    for (const [key, fallback] of Object.entries(config[group])) {
      if (raw[group][key] !== undefined) config[group][key] = strings(raw[group][key], fallback);
    }
  }
  return config;
}

export async function loadProjectConfig(repoRoot, warn = () => {}) {
  if (!repoRoot) return resolveConfig(null, warn);
  for (const name of [".debugging-workflow-guard.mjs", ".debugging-workflow-guard.js", ".debugging-workflow-guard.cjs"]) {
    const path = join(repoRoot, name);
    if (!existsSync(path)) continue;
    try {
      const loaded = await import(pathToFileURL(path).href);
      return resolveConfig(loaded.default ?? loaded, warn);
    } catch (error) {
      warn(`failed to load ${name}: ${error?.message ?? error}`);
      return resolveConfig(null, warn);
    }
  }
  return resolveConfig(null, warn);
}
