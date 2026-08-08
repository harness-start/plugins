import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const CONFIG_NAMES = [".verification-provenance-guard.mjs", ".verification-provenance-guard.cjs", ".verification-provenance-guard.js"];
const MODES = new Set(["block", "report", "off"]);
const TRIGGERS = new Set(["mutation-or-claim", "claim-only", "always"]);

export const DEFAULT_CONFIG = Object.freeze({
  mode: "block",
  trigger: "mutation-or-claim",
  manifest: Object.freeze({ maxBytes: 32 * 1024, maxDepth: 8, maxItems: 20 }),
  artifact: Object.freeze({ maxBytes: 64 * 1024 * 1024 }),
  stop: Object.freeze({ maxBlocks: 2 }),
  claims: Object.freeze({ additionalPatterns: Object.freeze([]) }),
  commands: Object.freeze({ testPatterns: Object.freeze([]), verificationPatterns: Object.freeze([]), expectedFailurePatterns: Object.freeze([]) }),
  paths: Object.freeze({ testPatterns: Object.freeze([]), codePatterns: Object.freeze([]), nonCodePatterns: Object.freeze([]) }),
});

function warnDefault(message) {
  process.stderr.write(`[verification-provenance-guard] ${message}\n`);
}

function integer(value, fallback, min, max, label, warn) {
  if (value === undefined) return fallback;
  if (Number.isSafeInteger(value) && value >= min && value <= max) return value;
  warn(`${label} must be an integer in ${min}..${max}; using ${fallback}`);
  return fallback;
}

function patterns(value, label, warn) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) { warn(`${label} must be an array of RegExp values; using []`); return []; }
  return value.flatMap((pattern, index) => {
    if (pattern instanceof RegExp) return [new RegExp(pattern.source, pattern.flags)];
    warn(`${label}[${index}] must be a RegExp; skipping`);
    return [];
  });
}

export function resolveConfig(value, warn = warnDefault) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const mode = MODES.has(source.mode) ? source.mode : DEFAULT_CONFIG.mode;
  if (source.mode !== undefined && !MODES.has(source.mode)) warn(`mode must be block, report, or off; using ${mode}`);
  const trigger = TRIGGERS.has(source.trigger) ? source.trigger : DEFAULT_CONFIG.trigger;
  if (source.trigger !== undefined && !TRIGGERS.has(source.trigger)) warn(`trigger must be mutation-or-claim, claim-only, or always; using ${trigger}`);
  return {
    mode,
    trigger,
    manifest: {
      maxBytes: integer(source.manifest?.maxBytes, DEFAULT_CONFIG.manifest.maxBytes, 1024, 256 * 1024, "manifest.maxBytes", warn),
      maxDepth: integer(source.manifest?.maxDepth, DEFAULT_CONFIG.manifest.maxDepth, 2, 16, "manifest.maxDepth", warn),
      maxItems: integer(source.manifest?.maxItems, DEFAULT_CONFIG.manifest.maxItems, 1, 100, "manifest.maxItems", warn),
    },
    artifact: { maxBytes: integer(source.artifact?.maxBytes, DEFAULT_CONFIG.artifact.maxBytes, 1024, 1024 * 1024 * 1024, "artifact.maxBytes", warn) },
    stop: { maxBlocks: integer(source.stop?.maxBlocks, DEFAULT_CONFIG.stop.maxBlocks, 1, 3, "stop.maxBlocks", warn) },
    claims: {
      additionalPatterns: patterns(source.claims?.additionalPatterns, "claims.additionalPatterns", warn),
    },
    commands: {
      testPatterns: patterns(source.commands?.testPatterns, "commands.testPatterns", warn),
      verificationPatterns: patterns(source.commands?.verificationPatterns, "commands.verificationPatterns", warn),
      expectedFailurePatterns: patterns(source.commands?.expectedFailurePatterns, "commands.expectedFailurePatterns", warn),
    },
    paths: {
      testPatterns: patterns(source.paths?.testPatterns, "paths.testPatterns", warn),
      codePatterns: patterns(source.paths?.codePatterns, "paths.codePatterns", warn),
      nonCodePatterns: patterns(source.paths?.nonCodePatterns, "paths.nonCodePatterns", warn),
    },
  };
}

export function resolveRepoRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { return null; }
}

export async function loadConfig(cwd, warn = warnDefault) {
  const repoRoot = resolveRepoRoot(cwd);
  if (!repoRoot) return { config: resolveConfig(null, warn), repoRoot: cwd };
  for (const name of CONFIG_NAMES) {
    const path = join(repoRoot, name);
    if (!existsSync(path)) continue;
    try {
      const loaded = await import(`${pathToFileURL(path).href}?mtime=${Date.now()}`);
      return { config: resolveConfig(loaded.default ?? loaded, warn), repoRoot };
    } catch (error) {
      warn(`failed to load ${name}: ${error instanceof Error ? error.message : String(error)}; using defaults`);
      return { config: resolveConfig(null, warn), repoRoot };
    }
  }
  return { config: resolveConfig(null, warn), repoRoot };
}
