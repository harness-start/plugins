#!/usr/bin/env node
// harness-source-hash: sha256:f6cabdfd8eb2989acd10981f992c2b256029e5612715d71f53c0888a85045fcc
import {
  additionalContextOutput,
  eventCwd,
  extractWriteTargets,
  isRecord,
  readStdinJson,
  writeJson
} from "../chunks/chunk-YETAT45W.mjs";

// plugins/git-delivery/src/entries/hooks/git-delivery-hook-post-tool.ts
import { resolve } from "node:path";

// plugins/git-delivery/src/checks/file-checks.ts
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
var MAX_FILE_BYTES = 2 * 1024 * 1024;
var CONFIG_FILE_NAME = ".git-delivery.mjs";
var SKIP_PATH = /(?:^|\/)(?:\.git|\.cache|\.next|\.nuxt|__generated__|build|coverage|dist|generated|node_modules|target|vendor)(?:\/|$)/iu;
var TEXT_PATH = /\.(?:bash|c|cc|cfg|cjs|cpp|css|cts|cxx|go|graphql|h|hh|hpp|html|ini|java|js|json|jsx|kt|kts|less|md|mjs|mts|php|py|rb|rs|sass|scss|sh|sql|svelte|swift|toml|ts|tsx|txt|vue|xml|yaml|yml|zsh)$/iu;
var EMPTY_OVERRIDES = [];
var DEFAULT_CONFIG = Object.freeze({
  checks: Object.freeze({ mergeConflict: "block" }),
  overrides: Object.freeze(EMPTY_OVERRIDES)
});
function warnDefault(message) {
  process.stderr.write(`[git-delivery] ${message}
`);
}
function errorText(error) {
  if (isRecord(error) && error.message != null) return String(error.message);
  return String(error);
}
function isCheckMode(value) {
  return value === "block" || value === "report" || value === "off";
}
function normalizeMode(value, fallback, label, warn) {
  if (value === void 0) return fallback;
  if (isCheckMode(value)) return value;
  warn(`${label} must be "block", "report", or "off"; using ${fallback}`);
  return fallback;
}
function resolveConflictConfig(userConfig, warn = warnDefault) {
  const checks = { mergeConflict: "block" };
  const record = isRecord(userConfig) ? userConfig : null;
  if (record?.checks !== void 0 && (!record.checks || typeof record.checks !== "object" || Array.isArray(record.checks))) {
    warn('config "checks" must be an object; using defaults');
  } else {
    const checksSource = record && isRecord(record.checks) ? record.checks : null;
    checks.mergeConflict = normalizeMode(
      checksSource?.mergeConflict,
      checks.mergeConflict,
      "checks.mergeConflict",
      warn
    );
  }
  const overrides = [];
  if (record?.overrides !== void 0 && !Array.isArray(record.overrides)) {
    warn('config "overrides" must be an array; ignoring overrides');
  } else {
    const rawOverrides = record && Array.isArray(record.overrides) ? record.overrides : [];
    for (const [index, override] of rawOverrides.entries()) {
      if (!isRecord(override) || !(override.match instanceof RegExp)) {
        warn(`override[${index}].match must be a RegExp; skipping`);
        continue;
      }
      if (!override.checks || typeof override.checks !== "object" || Array.isArray(override.checks)) {
        warn(`override[${index}].checks must be an object; skipping`);
        continue;
      }
      if (!isRecord(override.checks) || override.checks.mergeConflict === void 0) {
        warn(`override[${index}] does not declare checks.mergeConflict; skipping`);
        continue;
      }
      const mode = normalizeMode(
        override.checks.mergeConflict,
        null,
        `override[${index}].checks.mergeConflict`,
        warn
      );
      if (mode) overrides.push({ match: override.match, mode });
    }
  }
  return { checks, overrides };
}
function modeForConflict(relativePath, config) {
  for (const override of config.overrides) {
    try {
      if (new RegExp(override.match.source, override.match.flags).test(relativePath)) return override.mode;
    } catch {
    }
  }
  return config.checks.mergeConflict;
}
function findMergeConflictMarkers(text) {
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
        findings[findings.length - 1] = finding;
      }
    }
  }
  return hasBoundaryMarker ? findings : [];
}
function resolveRepoRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5e3,
      maxBuffer: 1024 * 1024
    }).trim();
  } catch {
    return null;
  }
}
async function loadConflictConfig(repoRoot, warn = warnDefault) {
  if (!repoRoot) return resolveConflictConfig(null, warn);
  const configPath = join(repoRoot, CONFIG_FILE_NAME);
  if (!existsSync(configPath)) return resolveConflictConfig(null, warn);
  try {
    const loaded = await import(pathToFileURL(configPath).href);
    const config = isRecord(loaded) ? loaded.default ?? loaded : loaded;
    return resolveConflictConfig(config, warn);
  } catch (error) {
    warn(`failed to load ${CONFIG_FILE_NAME}: ${errorText(error)}; using strict defaults`);
    return resolveConflictConfig(null, warn);
  }
}
function repositoryRelativePath(filePath, repoRoot, cwd) {
  const base = repoRoot ?? cwd;
  const candidate = relative(base, filePath).replaceAll("\\", "/");
  return candidate.startsWith("../") ? filePath.replaceAll("\\", "/") : candidate;
}
function conflictFileFindings(filePaths, repoRoot, cwd, config) {
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
function formatConflictFindings(findings) {
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
    "  recovery: Reread the complete file, preserve the correct semantics, remove the markers, and run relevant verification."
  ].join("\n");
}

// plugins/git-delivery/src/entries/hooks/git-delivery-hook-post-tool.ts
async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const targets = extractWriteTargets(event);
  if (!targets.length) return;
  const cwd = resolve(eventCwd(event));
  const repoRoot = resolveRepoRoot(cwd);
  const config = await loadConflictConfig(repoRoot);
  const findings = conflictFileFindings(targets, repoRoot, cwd, config);
  if (!findings.length) return;
  const message = formatConflictFindings(findings);
  if (findings.some((finding) => finding.mode === "block")) {
    process.stderr.write(`${message}
`);
    process.exitCode = 2;
  } else {
    writeJson(additionalContextOutput("PostToolUse", message));
  }
}
main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[git-delivery] post hook failed open: ${message}
`);
  process.exit(0);
});
