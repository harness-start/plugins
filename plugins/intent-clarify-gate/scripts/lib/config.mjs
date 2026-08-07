import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_CONFIG = Object.freeze({
  entryTokens: Object.freeze(["/grill-me", "$grill-me", "/grilling", "$grilling"]),
  donePhrases: Object.freeze(["done"]),
  enableEngineeringBypass: true,
  writeBlock: Object.freeze({
    mode: "block", // block | report | off
    ledgerAllow: Object.freeze([".grill-ledgers/**", "docs/decisions/**"]),
    allowSpecMd: true,
  }),
  stopGate: Object.freeze({
    blockImplementWhileOpen: true,
    remindCompleteOptionAfterRounds: 5,
  }),
  skillInstall: Object.freeze({
    mode: "off", // npx | local-copy | off — default off for CI safety
    source: "https://github.com/mattpocock/skills",
    skills: Object.freeze(["grill-me"]),
    requireGrillingPrimitive: false,
    timeoutMs: 120_000,
  }),
  sessionTtlHours: 24,
  constraintInject: true,
});

const CONFIG_NAMES = [
  ".intent-clarify-gate.mjs",
  ".intent-clarify-gate.cjs",
  ".intent-clarify-gate.js",
];

function cloneDefault() {
  return {
    entryTokens: [...DEFAULT_CONFIG.entryTokens],
    donePhrases: [...DEFAULT_CONFIG.donePhrases],
    enableEngineeringBypass: DEFAULT_CONFIG.enableEngineeringBypass,
    writeBlock: {
      mode: DEFAULT_CONFIG.writeBlock.mode,
      ledgerAllow: [...DEFAULT_CONFIG.writeBlock.ledgerAllow],
      allowSpecMd: DEFAULT_CONFIG.writeBlock.allowSpecMd,
    },
    stopGate: { ...DEFAULT_CONFIG.stopGate },
    skillInstall: {
      ...DEFAULT_CONFIG.skillInstall,
      skills: [...DEFAULT_CONFIG.skillInstall.skills],
    },
    sessionTtlHours: DEFAULT_CONFIG.sessionTtlHours,
    constraintInject: DEFAULT_CONFIG.constraintInject,
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
  if (typeof raw.constraintInject === "boolean") {
    config.constraintInject = raw.constraintInject;
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
    if (typeof raw.stopGate.blockImplementWhileOpen === "boolean") {
      config.stopGate.blockImplementWhileOpen = raw.stopGate.blockImplementWhileOpen;
    }
    if (raw.stopGate.remindCompleteOptionAfterRounds !== undefined) {
      config.stopGate.remindCompleteOptionAfterRounds = asPositiveNumber(
        raw.stopGate.remindCompleteOptionAfterRounds,
        config.stopGate.remindCompleteOptionAfterRounds,
      );
    }
  }

  if (raw.skillInstall && typeof raw.skillInstall === "object") {
    config.skillInstall.mode = asMode(
      raw.skillInstall.mode,
      ["npx", "local-copy", "off"],
      config.skillInstall.mode,
    );
    if (typeof raw.skillInstall.source === "string" && raw.skillInstall.source.trim()) {
      config.skillInstall.source = raw.skillInstall.source.trim();
    }
    if (raw.skillInstall.skills !== undefined) {
      config.skillInstall.skills = asStringArray(
        raw.skillInstall.skills,
        config.skillInstall.skills,
      );
    }
    if (typeof raw.skillInstall.requireGrillingPrimitive === "boolean") {
      config.skillInstall.requireGrillingPrimitive = raw.skillInstall.requireGrillingPrimitive;
    }
    if (raw.skillInstall.timeoutMs !== undefined) {
      config.skillInstall.timeoutMs = asPositiveNumber(
        raw.skillInstall.timeoutMs,
        config.skillInstall.timeoutMs,
      );
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
