export const CHECK_NAMES = [
  "backupArtifact",
  "garbledText",
  "mergeConflict",
];

export const DEFAULT_CHECKS = Object.freeze({
  backupArtifact: "block",
  garbledText: "block",
  mergeConflict: "block",
});

const VALID_MODES = new Set(["block", "report", "off"]);

const SKIP_PATH =
  /(?:^|\/)(?:\.git|\.cache|\.next|\.nuxt|__generated__|build|coverage|dist|generated|node_modules|target|vendor)(?:\/|$)/iu;

const SOURCE_PATH =
  /(?:^|\/)(?:app|client|cmd|components|include|internal|lib|packages|pkg|server|src|tests?)(?:\/|$)/iu;

const BACKUP_SUFFIX =
  /(?:\.bak|\.backup|\.old|\.orig|\.rej|\.swp|\.temp|\.tmp|~)$/iu;

const TEXT_PATH =
  /\.(?:bash|c|cc|cfg|cjs|cpp|css|cts|cxx|go|graphql|h|hh|hpp|html|ini|java|js|json|jsx|kt|kts|less|md|mjs|mts|php|py|rb|rs|sass|scss|sh|sql|svelte|swift|toml|ts|tsx|txt|vue|xml|yaml|yml|zsh)$/iu;

function warnDefault(message) {
  process.stderr.write(`[source-sanity-guard] ${message}\n`);
}

function normalizeMode(value, fallback, label, warn) {
  if (value === undefined) return fallback;
  if (VALID_MODES.has(value)) return value;
  warn(`${label} must be "block", "report", or "off"; using ${fallback}`);
  return fallback;
}

export function resolveConfig(userConfig, warn = warnDefault) {
  const checks = { ...DEFAULT_CHECKS };
  if (userConfig?.checks !== undefined && (
    !userConfig.checks ||
    typeof userConfig.checks !== "object" ||
    Array.isArray(userConfig.checks)
  )) {
    warn('config "checks" must be an object; using defaults');
  } else {
    for (const name of CHECK_NAMES) {
      checks[name] = normalizeMode(
        userConfig?.checks?.[name],
        checks[name],
        `checks.${name}`,
        warn,
      );
    }
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
      const normalizedChecks = {};
      for (const name of CHECK_NAMES) {
        if (override.checks[name] === undefined) continue;
        const mode = normalizeMode(
          override.checks[name],
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

function regexMatches(pattern, value) {
  try {
    return new RegExp(pattern.source, pattern.flags).test(value);
  } catch {
    return false;
  }
}

export function modeFor(checkName, relativePath, config) {
  for (const override of config.overrides) {
    if (
      override.checks[checkName] !== undefined &&
      regexMatches(override.match, relativePath)
    ) {
      return override.checks[checkName];
    }
  }
  return config.checks[checkName] ?? "off";
}

export function isBuiltInSkippedPath(relativePath) {
  return SKIP_PATH.test(relativePath);
}

export function isBackupArtifactPath(relativePath) {
  return SOURCE_PATH.test(relativePath) && BACKUP_SUFFIX.test(relativePath);
}

export function isTextPath(relativePath) {
  return TEXT_PATH.test(relativePath);
}

export function analyzeGarbledText(text) {
  if (typeof text !== "string" || !text.includes("\uFFFD")) return null;
  const total = [...text].filter((character) => character === "\uFFFD").length;
  if (/\uFFFD{2,}/u.test(text) || total >= 3) {
    return { replacementCharacters: total };
  }
  return null;
}

export function findMergeConflictMarkers(text) {
  if (typeof text !== "string") return [];
  const lines = text.split(/\r?\n/u);
  const findings = [];
  for (const [index, line] of lines.entries()) {
    if (/^(?:<<<<<<<|=======|>>>>>>>)(?:\s|$)/u.test(line)) {
      findings.push({ line: index + 1, marker: line.slice(0, 7) });
      if (findings.length >= 10) break;
    }
  }
  return findings;
}
