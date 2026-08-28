import { isRecord } from "@harness/core/hook-event";

export const CHECK_NAMES = [
  "backupArtifact",
  "garbledText",
] as const;

export type CheckName = (typeof CHECK_NAMES)[number];
export type CheckMode = "block" | "report" | "off";
export type SanityChecks = Record<CheckName, CheckMode>;
export type SanityOverride = {
  match: RegExp;
  checks: Partial<SanityChecks>;
};
export type SanityConfig = {
  checks: SanityChecks;
  overrides: SanityOverride[];
};

export const DEFAULT_CHECKS: Readonly<SanityChecks> = Object.freeze({
  backupArtifact: "block",
  garbledText: "block",
});

function isCheckMode(value: unknown): value is CheckMode {
  return value === "block" || value === "report" || value === "off";
}

const SKIP_PATH =
  /(?:^|\/)(?:\.git|\.cache|\.next|\.nuxt|__generated__|build|coverage|dist|generated|node_modules|target|vendor)(?:\/|$)/iu;

const SOURCE_PATH =
  /(?:^|\/)(?:app|client|cmd|components|include|internal|lib|packages|pkg|server|src|tests?)(?:\/|$)/iu;

const BACKUP_SUFFIX =
  /(?:\.bak|\.backup|\.old|\.orig|\.rej|\.swp|\.temp|\.tmp|~)$/iu;

const TEXT_PATH =
  /\.(?:bash|c|cc|cfg|cjs|cpp|css|cts|cxx|go|graphql|h|hh|hpp|html|ini|java|js|json|jsx|kt|kts|less|md|mjs|mts|php|py|rb|rs|sass|scss|sh|sql|svelte|swift|toml|ts|tsx|txt|vue|xml|yaml|yml|zsh)$/iu;

function warnDefault(message: string): void {
  process.stderr.write(`[source-integrity] ${message}\n`);
}

function normalizeMode<T extends CheckMode | null>(
  value: unknown,
  fallback: T,
  label: string,
  warn: (message: string) => void,
): CheckMode | T {
  if (value === undefined) return fallback;
  if (isCheckMode(value)) return value;
  warn(`${label} must be "block", "report", or "off"; using ${fallback}`);
  return fallback;
}

export function resolveConfig(
  userConfig: unknown,
  warn: (message: string) => void = warnDefault,
): SanityConfig {
  const record = isRecord(userConfig) ? userConfig : undefined;
  const checks: SanityChecks = { ...DEFAULT_CHECKS };
  if (record?.checks !== undefined && (
    !record.checks ||
    typeof record.checks !== "object" ||
    Array.isArray(record.checks)
  )) {
    warn('config "checks" must be an object; using defaults');
  } else {
    const checksSource = isRecord(record?.checks) ? record.checks : undefined;
    for (const name of CHECK_NAMES) {
      checks[name] = normalizeMode(
        checksSource?.[name],
        checks[name],
        `checks.${name}`,
        warn,
      );
    }
  }

  const overrides: SanityOverride[] = [];
  if (record?.overrides !== undefined && !Array.isArray(record.overrides)) {
    warn('config "overrides" must be an array; ignoring overrides');
  } else {
    const rawOverrides = Array.isArray(record?.overrides) ? record.overrides : [];
    for (const [index, override] of rawOverrides.entries()) {
      if (!isRecord(override) || !(override.match instanceof RegExp)) {
        warn(`override[${index}].match must be a RegExp; skipping`);
        continue;
      }
      if (!override.checks || typeof override.checks !== "object" || Array.isArray(override.checks)) {
        warn(`override[${index}].checks must be an object; skipping`);
        continue;
      }
      const overrideChecks = isRecord(override.checks) ? override.checks : {};
      const normalizedChecks: Partial<SanityChecks> = {};
      for (const name of CHECK_NAMES) {
        if (overrideChecks[name] === undefined) continue;
        const mode = normalizeMode(
          overrideChecks[name],
          null,
          `override[${index}].checks.${name}`,
          warn,
        );
        if (mode) normalizedChecks[name] = mode;
      }
      if (Object.keys(normalizedChecks).length === 0) {
        warn(`override[${index}] has no valid checks; skipping`);
        continue;
      }
      overrides.push({ match: override.match, checks: normalizedChecks });
    }
  }
  return { checks, overrides };
}

function regexMatches(pattern: RegExp, value: string): boolean {
  try {
    return new RegExp(pattern.source, pattern.flags).test(value);
  } catch {
    return false;
  }
}

export function modeFor(checkName: CheckName, relativePath: string, config: SanityConfig): CheckMode {
  for (const override of config.overrides) {
    const mode = override.checks[checkName];
    if (
      mode !== undefined &&
      regexMatches(override.match, relativePath)
    ) {
      return mode;
    }
  }
  return config.checks[checkName] ?? "off";
}

export function isBuiltInSkippedPath(relativePath: string): boolean {
  return SKIP_PATH.test(relativePath);
}

export function isBackupArtifactPath(relativePath: string): boolean {
  return SOURCE_PATH.test(relativePath) && BACKUP_SUFFIX.test(relativePath);
}

export function isTextPath(relativePath: string): boolean {
  return TEXT_PATH.test(relativePath);
}

export function analyzeGarbledText(text: unknown): { replacementCharacters: number } | null {
  if (typeof text !== "string" || !text.includes("\uFFFD")) return null;
  const total = [...text].filter((character) => character === "\uFFFD").length;
  if (/\uFFFD{2,}/u.test(text) || total >= 3) {
    return { replacementCharacters: total };
  }
  return null;
}
