import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const CONFIG_FILE_NAME = ".git-delivery-guards.mjs";
const VALID_MODES = new Set(["block", "report", "off"]);
const SKIP_PATH = /(?:^|\/)(?:\.git|\.cache|\.next|\.nuxt|__generated__|build|coverage|dist|generated|node_modules|target|vendor)(?:\/|$)/iu;
const TEXT_PATH = /\.(?:bash|c|cc|cfg|cjs|cpp|css|cts|cxx|go|graphql|h|hh|hpp|html|ini|java|js|json|jsx|kt|kts|less|md|mjs|mts|php|py|rb|rs|sass|scss|sh|sql|svelte|swift|toml|ts|tsx|txt|vue|xml|yaml|yml|zsh)$/iu;

export const DEFAULT_CONFIG = Object.freeze({
  checks: Object.freeze({ mergeConflict: "block" }),
  overrides: Object.freeze([]),
});

function warnDefault(message) {
  process.stderr.write(`[git-delivery-guards] ${message}\n`);
}

function normalizeMode(value, fallback, label, warn) {
  if (value === undefined) return fallback;
  if (VALID_MODES.has(value)) return value;
  warn(`${label} must be "block", "report", or "off"; using ${fallback}`);
  return fallback;
}

export function resolveConflictConfig(userConfig, warn = warnDefault) {
  const checks = { mergeConflict: "block" };
  if (userConfig?.checks !== undefined && (
    !userConfig.checks || typeof userConfig.checks !== "object" || Array.isArray(userConfig.checks)
  )) {
    warn('config "checks" must be an object; using defaults');
  } else {
    checks.mergeConflict = normalizeMode(
      userConfig?.checks?.mergeConflict,
      checks.mergeConflict,
      "checks.mergeConflict",
      warn,
    );
  }

  const overrides = [];
  if (userConfig?.overrides !== undefined && !Array.isArray(userConfig.overrides)) {
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
      if (override.checks.mergeConflict === undefined) {
        warn(`override[${index}] does not declare checks.mergeConflict; skipping`);
        continue;
      }
      const mode = normalizeMode(
        override.checks.mergeConflict,
        null,
        `override[${index}].checks.mergeConflict`,
        warn,
      );
      if (mode) overrides.push({ match: override.match, mode });
    }
  }
  return { checks, overrides };
}

export function modeForConflict(relativePath, config) {
  for (const override of config.overrides) {
    try {
      if (new RegExp(override.match.source, override.match.flags).test(relativePath)) return override.mode;
    } catch {}
  }
  return config.checks.mergeConflict;
}

export function findMergeConflictMarkers(text) {
  if (typeof text !== "string") return [];
  const findings = [];
  let hasBoundaryMarker = false;
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    if (/^(?:<<<<<<<|=======|>>>>>>>)(?:\s|$)/u.test(line)) {
      const finding = { line: index + 1, marker: line.slice(0, 7) };
      const isBoundary = finding.marker !== "=======";
      if (isBoundary) {
        hasBoundaryMarker = true;
      }
      if (findings.length < 10) {
        findings.push(finding);
      } else if (isBoundary && findings.every(({ marker }) => marker === "=======")) {
        // Keep the bounded report useful when document separators precede the
        // first real conflict boundary.
        findings[findings.length - 1] = finding;
      }
    }
  }
  // A bare `=======` line is also valid document syntax (for example, an RST
  // table border). Treat separators as conflict evidence only when the file
  // also contains a high-specificity conflict boundary marker.
  return hasBoundaryMarker ? findings : [];
}

export function resolveRepoRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    }).trim();
  } catch {
    return null;
  }
}

export async function loadConflictConfig(repoRoot, warn = warnDefault) {
  if (!repoRoot) return resolveConflictConfig(null, warn);
  const configPath = join(repoRoot, CONFIG_FILE_NAME);
  if (!existsSync(configPath)) return resolveConflictConfig(null, warn);
  try {
    const loaded = await import(pathToFileURL(configPath).href);
    return resolveConflictConfig(loaded.default ?? loaded, warn);
  } catch (error) {
    warn(`failed to load ${CONFIG_FILE_NAME}: ${error?.message ?? error}; using strict defaults`);
    return resolveConflictConfig(null, warn);
  }
}

function repositoryRelativePath(filePath, repoRoot, cwd) {
  const base = repoRoot ?? cwd;
  const candidate = relative(base, filePath).replaceAll("\\", "/");
  return candidate.startsWith("../") ? filePath.replaceAll("\\", "/") : candidate;
}

export function conflictFileFindings(filePaths, repoRoot, cwd, config) {
  const findings = [];
  for (const filePath of filePaths) {
    if (!existsSync(filePath)) continue;
    const path = repositoryRelativePath(filePath, repoRoot, cwd);
    if (SKIP_PATH.test(path) || !TEXT_PATH.test(path)) continue;
    const mode = modeForConflict(path, config);
    if (mode === "off") continue;
    let stat;
    try {
      stat = lstatSync(filePath);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE_BYTES) continue;
    let text;
    try {
      text = readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
    for (const marker of findMergeConflictMarkers(text)) {
      findings.push({ path, mode, ...marker });
      if (findings.length >= 10) return findings;
    }
  }
  return findings;
}

export function formatConflictFindings(findings) {
  return [
    "[Git Delivery Guards] Unresolved merge conflict detected",
    "",
    ...findings.map((finding) => `- ${finding.path}:${finding.line} (${finding.marker})`),
    "",
    "The file has already been written; the hook will not roll it back automatically.",
    "",
    "blockingContract:",
    "  observedFacts: The final text file still contains standard merge-conflict markers after the write.",
    "  harm: Unresolved conflicts can break builds, runtime behavior, and commit semantics.",
    "  unblockWhen: Resolve both sides of the change and remove every conflict marker.",
    "  recovery: Reread the complete file, preserve the correct semantics, remove the markers, and run relevant verification.",
  ].join("\n");
}
