import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_CONFIG = Object.freeze({
  entryTokens: Object.freeze([
    "/first-principles",
    "$first-principles",
  ]),
  donePhrases: Object.freeze(["done"]),
  enableEngineeringBypass: true,
  abortToken: "# first-principles-abort",
  writeBlock: Object.freeze({
    mode: "block", // block | report | off
    ledgerAllow: Object.freeze([
      ".first-principles/**",
      "docs/decisions/**",
    ]),
    allowSpecMd: true,
  }),
  stopGate: Object.freeze({
    mode: "block", // block | report | off
    blockImplementWhileOpen: true,
    softReportWhileOpen: true,
  }),
  ledger: Object.freeze({
    primaryRelativePath: ".first-principles/ledger.json",
    searchGlobs: Object.freeze([".first-principles/**/*.json", ".first-principles/**/*.md"]),
    maxBytes: 256 * 1024,
  }),
  sessionTtlHours: 24,
});

const CONFIG_NAMES = [
  ".first-principles-gate.mjs",
  ".first-principles-gate.cjs",
  ".first-principles-gate.js",
];

function cloneDefault() {
  return {
    entryTokens: [...DEFAULT_CONFIG.entryTokens],
    donePhrases: [...DEFAULT_CONFIG.donePhrases],
    enableEngineeringBypass: DEFAULT_CONFIG.enableEngineeringBypass,
    abortToken: DEFAULT_CONFIG.abortToken,
    writeBlock: {
      mode: DEFAULT_CONFIG.writeBlock.mode,
      ledgerAllow: [...DEFAULT_CONFIG.writeBlock.ledgerAllow],
      allowSpecMd: DEFAULT_CONFIG.writeBlock.allowSpecMd,
    },
    stopGate: { ...DEFAULT_CONFIG.stopGate },
    ledger: {
      primaryRelativePath: DEFAULT_CONFIG.ledger.primaryRelativePath,
      searchGlobs: [...DEFAULT_CONFIG.ledger.searchGlobs],
      maxBytes: DEFAULT_CONFIG.ledger.maxBytes,
    },
    sessionTtlHours: DEFAULT_CONFIG.sessionTtlHours,
  };
}

function asMode(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function asPositiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function asStringArray(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  const items = value.filter((item) => typeof item === "string" && item.trim());
  return items.length > 0 ? items.map((item) => item.trim()) : [...fallback];
}

export function resolveConfig(raw, warn = () => {}) {
  const config = cloneDefault();
  if (!raw || typeof raw !== "object") return config;

  if (raw.entryTokens !== undefined) {
    config.entryTokens = asStringArray(raw.entryTokens, config.entryTokens);
  }
  if (raw.donePhrases !== undefined) {
    config.donePhrases = asStringArray(raw.donePhrases, config.donePhrases);
  }
  if (typeof raw.enableEngineeringBypass === "boolean") {
    config.enableEngineeringBypass = raw.enableEngineeringBypass;
  }
  if (typeof raw.abortToken === "string" && raw.abortToken.trim()) {
    config.abortToken = raw.abortToken.trim();
  }
  if (raw.sessionTtlHours !== undefined) {
    config.sessionTtlHours = asPositiveNumber(raw.sessionTtlHours, config.sessionTtlHours);
  }

  if (raw.writeBlock && typeof raw.writeBlock === "object") {
    config.writeBlock.mode = asMode(
      raw.writeBlock.mode,
      ["block", "report", "off"],
      config.writeBlock.mode,
    );
    if (raw.writeBlock.mode && !["block", "report", "off"].includes(raw.writeBlock.mode)) {
      warn(`invalid writeBlock.mode: ${raw.writeBlock.mode}`);
    }
    if (raw.writeBlock.ledgerAllow !== undefined) {
      config.writeBlock.ledgerAllow = asStringArray(
        raw.writeBlock.ledgerAllow,
        config.writeBlock.ledgerAllow,
      );
    }
    if (typeof raw.writeBlock.allowSpecMd === "boolean") {
      config.writeBlock.allowSpecMd = raw.writeBlock.allowSpecMd;
    }
  }

  if (raw.stopGate && typeof raw.stopGate === "object") {
    config.stopGate.mode = asMode(
      raw.stopGate.mode,
      ["block", "report", "off"],
      config.stopGate.mode,
    );
    if (raw.stopGate.mode && !["block", "report", "off"].includes(raw.stopGate.mode)) {
      warn(`invalid stopGate.mode: ${raw.stopGate.mode}`);
    }
    if (typeof raw.stopGate.blockImplementWhileOpen === "boolean") {
      config.stopGate.blockImplementWhileOpen = raw.stopGate.blockImplementWhileOpen;
    }
    if (typeof raw.stopGate.softReportWhileOpen === "boolean") {
      config.stopGate.softReportWhileOpen = raw.stopGate.softReportWhileOpen;
    }
  }

  if (raw.ledger && typeof raw.ledger === "object") {
    if (
      typeof raw.ledger.primaryRelativePath === "string" &&
      raw.ledger.primaryRelativePath.trim()
    ) {
      config.ledger.primaryRelativePath = raw.ledger.primaryRelativePath
        .trim()
        .replaceAll("\\", "/");
    }
    if (raw.ledger.searchGlobs !== undefined) {
      config.ledger.searchGlobs = asStringArray(
        raw.ledger.searchGlobs,
        config.ledger.searchGlobs,
      );
    }
    if (raw.ledger.maxBytes !== undefined) {
      config.ledger.maxBytes = asPositiveNumber(raw.ledger.maxBytes, config.ledger.maxBytes);
    }
  }

  return config;
}

export async function loadProjectConfig(repoRoot, warn = () => {}) {
  if (!repoRoot) return resolveConfig(null, warn);
  for (const name of CONFIG_NAMES) {
    const path = join(repoRoot, name);
    if (!existsSync(path)) continue;
    try {
      const mod = await import(pathToFileURL(path).href);
      const raw = mod?.default ?? mod;
      return resolveConfig(raw, warn);
    } catch (error) {
      warn(`failed to load ${name}: ${error?.message ?? error}`);
      return resolveConfig(null, warn);
    }
  }
  return resolveConfig(null, warn);
}
