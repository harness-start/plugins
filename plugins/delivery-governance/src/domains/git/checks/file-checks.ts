import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { isRecord } from "@harness/core/hook-event";
import type { WorktreeCreateMode } from "../lib/worktree-intent.js";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const CONFIG_FILE_NAME = ".git-delivery.mjs";
const SKIP_PATH = /(?:^|\/)(?:\.git|\.cache|\.next|\.nuxt|__generated__|build|coverage|dist|generated|node_modules|target|vendor)(?:\/|$)/iu;
const TEXT_PATH = /\.(?:bash|c|cc|cfg|cjs|cpp|css|cts|cxx|go|graphql|h|hh|hpp|html|ini|java|js|json|jsx|kt|kts|less|md|mjs|mts|php|py|rb|rs|sass|scss|sh|sql|svelte|swift|toml|ts|tsx|txt|vue|xml|yaml|yml|zsh)$/iu;

export type CheckMode = "block" | "report" | "off";

export type ConflictOverride = {
  match: RegExp;
  mode: CheckMode;
};

export type ConflictConfig = {
  checks: { mergeConflict: CheckMode; worktreeCreate: WorktreeCreateMode };
  overrides: readonly ConflictOverride[];
};

export type ConflictMarker = {
  line: number;
  marker: string;
};

export type ConflictFinding = {
  path: string;
  mode: CheckMode;
  line: number;
  marker: string;
};

type WarnFn = (message: string) => void;

const EMPTY_OVERRIDES: ConflictOverride[] = [];

export const DEFAULT_CONFIG: ConflictConfig = Object.freeze({
  checks: Object.freeze({ mergeConflict: "block", worktreeCreate: "block" }),
  overrides: Object.freeze(EMPTY_OVERRIDES),
});

function warnDefault(message: string): void {
  process.stderr.write(`[git-delivery] ${message}\n`);
}

function errorText(error: unknown): string {
  if (isRecord(error) && error.message != null) return String(error.message);
  return String(error);
}

function isCheckMode(value: unknown): value is CheckMode {
  return value === "block" || value === "report" || value === "off";
}

function isWorktreeCreateMode(value: unknown): value is WorktreeCreateMode {
  return value === "block" || value === "report" || value === "allow";
}

function normalizeMode<T extends CheckMode | null>(
  value: unknown,
  fallback: T,
  label: string,
  warn: WarnFn,
): CheckMode | T {
  if (value === undefined) return fallback;
  if (isCheckMode(value)) return value;
  warn(`${label} must be "block", "report", or "off"; using ${fallback}`);
  return fallback;
}

export function resolveConflictConfig(userConfig: unknown, warn: WarnFn = warnDefault): ConflictConfig {
  const checks: { mergeConflict: CheckMode; worktreeCreate: WorktreeCreateMode } = {
    mergeConflict: "block",
    worktreeCreate: "block",
  };
  const record = isRecord(userConfig) ? userConfig : null;
  if (record?.checks !== undefined && (
    !record.checks || typeof record.checks !== "object" || Array.isArray(record.checks)
  )) {
    warn('config "checks" must be an object; using defaults');
  } else {
    const checksSource = record && isRecord(record.checks) ? record.checks : null;
    checks.mergeConflict = normalizeMode(
      checksSource?.mergeConflict,
      checks.mergeConflict,
      "checks.mergeConflict",
      warn,
    );
    if (checksSource?.worktreeCreate !== undefined) {
      if (isWorktreeCreateMode(checksSource.worktreeCreate)) {
        checks.worktreeCreate = checksSource.worktreeCreate;
      } else {
        warn('checks.worktreeCreate must be "block", "report", or "allow"; using block');
      }
    }
  }

  const overrides: ConflictOverride[] = [];
  if (record?.overrides !== undefined && !Array.isArray(record.overrides)) {
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
      if (!isRecord(override.checks) || override.checks.mergeConflict === undefined) {
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

export function modeForConflict(relativePath: string, config: ConflictConfig): CheckMode {
  for (const override of config.overrides) {
    try {
      if (new RegExp(override.match.source, override.match.flags).test(relativePath)) return override.mode;
    } catch {
      // ignore invalid override flags
    }
  }
  return config.checks.mergeConflict;
}

export function findMergeConflictMarkers(text: unknown): ConflictMarker[] {
  if (typeof text !== "string") return [];
  const findings: ConflictMarker[] = [];
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

export function resolveRepoRoot(cwd: string): string | null {
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

export async function loadConflictConfig(repoRoot: string | null, warn: WarnFn = warnDefault): Promise<ConflictConfig> {
  if (!repoRoot) return resolveConflictConfig(null, warn);
  const configPath = join(repoRoot, CONFIG_FILE_NAME);
  if (!existsSync(configPath)) return resolveConflictConfig(null, warn);
  try {
    const loaded: unknown = await import(pathToFileURL(configPath).href);
    const config = isRecord(loaded) ? loaded.default ?? loaded : loaded;
    return resolveConflictConfig(config, warn);
  } catch (error: unknown) {
    warn(`failed to load ${CONFIG_FILE_NAME}: ${errorText(error)}; using strict defaults`);
    return resolveConflictConfig(null, warn);
  }
}

function repositoryRelativePath(filePath: string, repoRoot: string | null, cwd: string): string {
  const base = repoRoot ?? cwd;
  const candidate = relative(base, filePath).replaceAll("\\", "/");
  return candidate.startsWith("../") ? filePath.replaceAll("\\", "/") : candidate;
}

export function conflictFileFindings(
  filePaths: readonly string[],
  repoRoot: string | null,
  cwd: string,
  config: ConflictConfig,
): ConflictFinding[] {
  const findings: ConflictFinding[] = [];
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

export function formatConflictFindings(findings: readonly ConflictFinding[]): string {
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
