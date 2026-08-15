#!/usr/bin/env node

/**
 * file-line-budget-guard — PostToolUse hook
 *
 * Ratchet-enforced file line budget mechanism.
 *
 * Rules are declared as { match: RegExp, budget?: number, mode: "block"|"report"|"skip" }.
 * User config (.file-line-budget-guard.mjs) rules are prepended to built-in rules.
 * First match wins; unmatched files pass silently.
 *
 * PostToolUse runs after Edit | Write | MultiEdit | ApplyPatch.
 */

import { execFileSync } from "node:child_process";
import { existsSync, statSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { classifyBudgetState } from "../../lib/budget-policy.js";

// ── Built-in rules ───────────────────────────────────────────
// These are the default rules when no user config is present.
// Each rule has: match (RegExp), mode ("block"|"report"|"skip"), budget (number, except skip).

export const BUILTIN_RULES = [
  // ── skip: tests, fixtures, generated paths ──
  { match: /(^|\/)tests?\//,                            mode: "skip" },
  { match: /(^|\/)spec\//,                              mode: "skip" },
  { match: /(^|\/)__tests__\//,                         mode: "skip" },
  { match: /(^|\/)__mocks__\//,                         mode: "skip" },
  { match: /(^|\/)fixtures?\//,                         mode: "skip" },
  { match: /(^|\/)testdata\//,                          mode: "skip" },
  { match: /(^|\/)e2e\//,                               mode: "skip" },
  { match: /(^|\/)snapshots?\//,                        mode: "skip" },
  { match: /\.(test|spec|e2e)\.[^.]+$/,                 mode: "skip" },
  { match: /Test\.(php|java|kt)$/,                      mode: "skip" },
  { match: /_test\.(go|py|rb|rs)$/,                     mode: "skip" },
  { match: /(^|\/)(dist|build|coverage|vendor|node_modules|target|\.next|\.nuxt|__generated__|generated)\//, mode: "skip" },

  // ── report: build recipes (linear files, warn only) ──
  { match: /(^|\/)Dockerfile$/,          budget: 500, mode: "report" },
  { match: /(^|\/)Containerfile$/,       budget: 500, mode: "report" },

  // ── block: by extension ──
  { match: /\.jsx?$/,                    budget: 500,  mode: "block" },
  { match: /\.cjs$/,                     budget: 500,  mode: "block" },
  { match: /\.mjs$/,                     budget: 500,  mode: "block" },
  { match: /\.tsx?$/,                    budget: 500,  mode: "block" },
  { match: /\.vue$/,                     budget: 500,  mode: "block" },
  { match: /\.svelte$/,                  budget: 500,  mode: "block" },
  { match: /\.py$/,                      budget: 500,  mode: "block" },
  { match: /\.php$/,                     budget: 500,  mode: "block" },
  { match: /\.rb$/,                      budget: 500,  mode: "block" },
  { match: /\.rake$/,                    budget: 400,  mode: "block" },
  { match: /\.gemspec$/,                 budget: 300,  mode: "block" },
  { match: /\.ru$/,                      budget: 200,  mode: "block" },
  { match: /\.erb$/,                     budget: 300,  mode: "block" },
  { match: /\.haml$/,                    budget: 300,  mode: "block" },
  { match: /\.slim$/,                    budget: 300,  mode: "block" },
  { match: /\.builder$/,                 budget: 300,  mode: "block" },
  { match: /\.jbuilder$/,                budget: 250,  mode: "block" },
  { match: /\.rjs$/,                     budget: 250,  mode: "block" },
  { match: /\.go$/,                      budget: 800,  mode: "block" },
  { match: /\.rs$/,                      budget: 800,  mode: "block" },
  { match: /\.java$/,                    budget: 800,  mode: "block" },
  { match: /\.kt$/,                      budget: 500,  mode: "block" },
  { match: /\.kts$/,                     budget: 500,  mode: "block" },
  { match: /\.swift$/,                   budget: 500,  mode: "block" },
  { match: /\.c$/,                       budget: 800,  mode: "block" },
  { match: /\.(cc|cpp|cxx)$/,            budget: 800,  mode: "block" },
  { match: /\.h$/,                       budget: 500,  mode: "block" },
  { match: /\.(hh|hpp|hxx)$/,            budget: 500,  mode: "block" },
  { match: /\.ixx$/,                     budget: 500,  mode: "block" },
  { match: /\.cppm$/,                    budget: 500,  mode: "block" },
  { match: /\.ipp$/,                     budget: 400,  mode: "block" },
  { match: /\.tpp$/,                     budget: 400,  mode: "block" },
  { match: /\.inl$/,                     budget: 300,  mode: "block" },
  { match: /\.cmake$/,                   budget: 300,  mode: "block" },
  { match: /\.cs$/,                      budget: 800,  mode: "block" },
  { match: /\.lua$/,                     budget: 500,  mode: "block" },
  { match: /\.sh$/,                      budget: 300,  mode: "block" },
  { match: /\.bash$/,                    budget: 300,  mode: "block" },
  { match: /\.zsh$/,                     budget: 300,  mode: "block" },
  { match: /\.pl$/,                      budget: 500,  mode: "block" },
  { match: /\.pm$/,                      budget: 500,  mode: "block" },
  { match: /\.t$/,                       budget: 400,  mode: "block" },
  { match: /\.psgi$/,                    budget: 300,  mode: "block" },
  { match: /\.xs$/,                      budget: 600,  mode: "block" },
  { match: /\.gradle$/,                  budget: 600,  mode: "block" },

  // ── block: by file name ──
  { match: /(^|\/)CMakeLists\.txt$/,     budget: 300,  mode: "block" },
  { match: /(^|\/)Makefile$/,            budget: 300,  mode: "block" },
  { match: /(^|\/)GNUmakefile$/,         budget: 300,  mode: "block" },
  { match: /(^|\/)Rakefile$/,            budget: 300,  mode: "block" },
  { match: /(^|\/)config\.ru$/,          budget: 200,  mode: "block" },
  { match: /(^|\/)Guardfile$/,           budget: 200,  mode: "block" },
  { match: /(^|\/)Capfile$/,             budget: 200,  mode: "block" },
  { match: /(^|\/)Fastfile$/,            budget: 400,  mode: "block" },
  { match: /(^|\/)Podfile$/,             budget: 300,  mode: "block" },
  { match: /(^|\/)Appraisals$/,          budget: 200,  mode: "block" },
  { match: /(^|\/)Makefile\.PL$/,        budget: 300,  mode: "block" },
  { match: /(^|\/)Build\.PL$/,           budget: 300,  mode: "block" },
];

// ── Default settings ─────────────────────────────────────────

const DEFAULT_SETTINGS = {
  nearBudgetWarnRatio: 0.8,
  warnCooldownMinutes: 30,
  // A bounded maintenance change in a legacy oversized file should remain
  // possible. One hundred lines is 20% of the common 500-line source budget;
  // growth still requires a split or an explicit project override.
  oversizeSoftGrowthLimit: 100,
};

// ── Ratchet constants (not user-configurable) ─────────────────

const WARN_MARKER_DIR = `${tmpdir()}/.ai-experts-file-budget-warned`;

// ── Config discovery ─────────────────────────────────────────

const CONFIG_FILE_NAMES = [
  ".file-line-budget-guard.mjs",
  ".file-line-budget-guard.cjs",
  ".file-line-budget-guard.js",
];

/**
 * Try to load user config from project root.
 * Returns the imported module's default export, or null.
 */
async function loadUserConfig(repoRoot) {
  for (const name of CONFIG_FILE_NAMES) {
    const p = join(repoRoot, name);
    if (!existsSync(p)) continue;
    try {
      const mod = await import(pathToFileURL(p).href);
      return mod.default ?? mod;
    } catch (e) {
      process.stderr.write(`[file-line-budget-guard] Failed to load ${name}: ${e.message}\n`);
      return null;
    }
  }
  return null;
}

/**
 * Validate a single rule. Returns true if the rule is usable.
 */
function validateRule(rule, i) {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
    process.stderr.write(`[file-line-budget-guard] rule[${i}]: must be an object, skipping\n`);
    return false;
  }
  if (!(rule.match instanceof RegExp)) {
    process.stderr.write(`[file-line-budget-guard] rule[${i}]: "match" must be a RegExp, skipping\n`);
    return false;
  }
  const mode = rule.mode ?? "block";
  if (!["block", "report", "skip"].includes(mode)) {
    process.stderr.write(`[file-line-budget-guard] rule[${i}]: "mode" must be block|report|skip, skipping\n`);
    return false;
  }
  if (mode !== "skip") {
    if (typeof rule.budget !== "number" || !Number.isFinite(rule.budget) || rule.budget <= 0) {
      process.stderr.write(`[file-line-budget-guard] rule[${i}]: "budget" must be a positive number (mode != "skip"), skipping\n`);
      return false;
    }
  }
  return true;
}

function resolveSettings(rawSettings) {
  if (rawSettings === undefined) return { ...DEFAULT_SETTINGS };
  if (!rawSettings || typeof rawSettings !== "object" || Array.isArray(rawSettings)) {
    process.stderr.write('[file-line-budget-guard] config "settings" must be an object, using defaults\n');
    return { ...DEFAULT_SETTINGS };
  }

  const validators = {
    nearBudgetWarnRatio: (value) =>
      typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1,
    warnCooldownMinutes: (value) =>
      typeof value === "number" && Number.isFinite(value) && value >= 0,
    oversizeSoftGrowthLimit: (value) =>
      typeof value === "number" && Number.isFinite(value) && value >= 0,
  };
  const settings = { ...DEFAULT_SETTINGS };
  for (const [key, value] of Object.entries(rawSettings)) {
    const validate = validators[key];
    if (!validate) {
      process.stderr.write(`[file-line-budget-guard] settings.${key}: unknown setting, ignoring\n`);
      continue;
    }
    if (!validate(value)) {
      process.stderr.write(`[file-line-budget-guard] settings.${key}: invalid value, using default\n`);
      continue;
    }
    settings[key] = value;
  }
  return settings;
}

/**
 * Merge user config rules (prepended) with built-in rules.
 * Returns { rules, settings }.
 */
export function resolveRules(userConfig) {
  const rawRules = Array.isArray(userConfig?.rules) ? userConfig.rules : [];
  if (userConfig?.rules !== undefined && !Array.isArray(userConfig.rules)) {
    process.stderr.write('[file-line-budget-guard] config "rules" must be an array, using built-ins\n');
  }
  const userRules = rawRules
    .map((rule, i) => ({ rule, i }))
    .filter(({ rule, i }) => validateRule(rule, i))
    .map(({ rule }) => rule.mode == null ? { ...rule, mode: "block" } : rule);
  const rules = [...userRules, ...BUILTIN_RULES];
  const settings = resolveSettings(userConfig?.settings);
  return { rules, settings };
}

/**
 * Find the first rule whose match.test(relPath) succeeds.
 * Returns the rule object or null if no match.
 */
export function matchRule(relPath, rules) {
  for (const rule of rules) {
    try {
      const match = new RegExp(rule.match.source, rule.match.flags);
      if (match.test(relPath)) return rule;
    } catch {
      // Broken regex → skip this rule
      continue;
    }
  }
  return null;
}

// ── Helpers ───────────────────────────────────────────────────

export function countLines(text) {
  if (!text) return 0;
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines.length;
}

/** Read git HEAD content for the given file path; returns null on failure. */
function readGitHeadContent(filePath, repoRoot) {
  try {
    const relPath = relative(repoRoot, filePath).replaceAll("\\", "/");
    if (relPath === ".." || relPath.startsWith("../")) return null;
    return execFileSync("git", ["show", `HEAD:${relPath}`], {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });
  } catch {
    return null;
  }
}

function readTextFileCapped(filePath, maxBytes = 8 * 1024 * 1024) {
  try {
    if (statSync(filePath).size > maxBytes) return null;
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function warnMarkerPath(filePath) {
  const safeName = filePath.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${WARN_MARKER_DIR}/${safeName}`;
}

function hasRecentWarnMarker(filePath, cooldownMs) {
  try {
    const st = statSync(warnMarkerPath(filePath));
    return Date.now() - st.mtimeMs < cooldownMs;
  } catch {
    return false;
  }
}

function writeWarnMarker(filePath) {
  try {
    if (!existsSync(WARN_MARKER_DIR)) mkdirSync(WARN_MARKER_DIR, { recursive: true });
    writeFileSync(warnMarkerPath(filePath), "", "utf-8");
  } catch {
    // Marker write failure only affects cooldown; do not block workflow
  }
}

export function extractFilePaths(event) {
  const toolInput =
    event?.tool_input ??
    event?.toolInput ??
    event?.tool?.input ??
    event?.input ??
    {};
  const cwd =
    event?.cwd ??
    event?.working_directory ??
    event?.workingDirectory ??
    process.cwd();
  const paths = [];
  for (const key of ["file_path", "filePath", "path", "target_file"]) {
    if (typeof toolInput?.[key] === "string" && toolInput[key]) {
      paths.push(toolInput[key]);
    }
  }
  // Codex apply_patch: paths live inside the freeform patch payload.
  const patchBlob = [toolInput?.patch, toolInput?.input, toolInput?.command]
    .filter((v) => typeof v === "string")
    .join("\n");
  if (patchBlob) {
    for (const line of patchBlob.split("\n")) {
      const m = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/);
      if (m) paths.push(m[1].trim().replace(/\\n$/, ""));
    }
  }
  // Codex/Claude shell tools: extract redirect targets (`> file`, `>> file`).
  const command =
    (typeof toolInput?.command === "string" && toolInput.command) ||
    (typeof toolInput?.cmd === "string" && toolInput.cmd) ||
    "";
  if (command) {
    for (const m of command.matchAll(/(?:>|>>)\s*([^\s;&|'"]+)/g)) {
      paths.push(m[1]);
    }
    // Also catch paths that appear after heredoc terminators: `EOF\n} > path`
    for (const m of command.matchAll(
      /(?:^|[\s;|&])((?:\.\/)?src\/[^\s;&|'"]+\.(?:php|js|ts|tsx|jsx|py|go|rs|java|kt|vue|svelte))\b/g,
    )) {
      // Only keep when the command also has a redirect near the path.
      if (command.includes(`> ${m[1]}`) || command.includes(`>${m[1]}`)) {
        paths.push(m[1]);
      }
    }
  }
  // Resolve relative paths against event cwd so PostToolUse can stat the file.
  return [
    ...new Set(
      paths
        .filter(Boolean)
        .map((p) => (p.startsWith("/") ? p : join(cwd, p.replace(/^\.\//, "")))),
    ),
  ];
}

function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function warn(message) {
  process.stderr.write(`${message}\n`);
  process.exit(0);
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  let rawInput = "";
  for await (const chunk of process.stdin) {
    rawInput += chunk;
  }

  let event;
  try {
    event = JSON.parse(rawInput || "{}");
  } catch {
    // Invalid input → pass (fail-open)
    process.exit(0);
  }

  const filePaths = extractFilePaths(event).filter((p) => existsSync(p));
  if (filePaths.length === 0) {
    process.exit(0);
  }

  // ── Locate repo root and load config ──
  let repoRoot;
  try {
    repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
      cwd: dirname(filePaths[0]),
    }).trim();
  } catch {
    try {
      repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      }).trim();
    } catch {
      // Not a git repo → fall back to built-in rules
      repoRoot = null;
    }
  }

  const userConfig = repoRoot ? await loadUserConfig(repoRoot) : null;
  const { rules, settings } = resolveRules(userConfig);

  // Evaluate every written path; first violation wins (fail-closed).
  let filePath = null;
  let rule = null;
  let currentLines = 0;
  let budget = 0;
  for (const candidate of filePaths) {
    let relPath = candidate;
    if (repoRoot) {
      relPath = candidate
        .replace(repoRoot.replaceAll("\\", "/") + "/", "")
        .replaceAll("\\", "/");
    }
    const matched = matchRule(relPath, rules);
    if (!matched || matched.mode === "skip") continue;
    const content = readTextFileCapped(candidate);
    if (content === null) continue;
    const lines = countLines(content);
    if (matched.mode === "report" || matched.mode === "block") {
      filePath = candidate;
      rule = matched;
      currentLines = lines;
      budget = matched.budget;
      // Prefer the first over-budget file; otherwise keep scanning.
      if (lines > matched.budget) break;
    }
  }
  if (!filePath || !rule) {
    process.exit(0);
  }

  let headLines = null;
  if (rule.mode === "block" && currentLines > budget) {
    const headContent = readGitHeadContent(filePath, repoRoot);
    headLines = headContent !== null ? countLines(headContent) : null;
  }
  const decision = classifyBudgetState({
    mode: rule.mode,
    currentLines,
    budget,
    headLines,
    settings,
  });

  if (decision.kind === "report-over") {
    warn([
      `[File Budget] ${filePath} exceeds the build-recipe reference budget (${currentLines}/${budget} lines)`,
      "",
      "Build recipes are linear files and cannot simply be split; when they keep growing, move install lists and checks into bin/ helper scripts.",
      "Do not reduce the count by deleting blank lines, comments, or other formatting.",
    ].join("\n"));
  }
  if (decision.kind === "near-budget") {
    const warnCooldownMs = settings.warnCooldownMinutes * 60 * 1000;
    if (hasRecentWarnMarker(filePath, warnCooldownMs)) { process.exit(0); }
    writeWarnMarker(filePath);
    warn([
      `[File Budget] ${filePath} is near its line budget (${currentLines}/${budget} lines, ${Math.round(settings.nearBudgetWarnRatio * 100)}%)`,
      "",
      "Plan a split into single-responsibility files before adding more; new content is blocked once the budget is exceeded.",
      "Do not reduce the count by deleting blank lines, comments, or other formatting.",
    ].join("\n"));
  }
  if (decision.kind === "new-over") {
    block([
      `[File Budget] ${filePath} exceeds its file line budget`,
      `  Current: ${currentLines} lines | Budget: ${budget} lines`,
      "",
      "New files must remain within budget. Split this into single-responsibility files.",
    ].join("\n"));
  }
  if (decision.kind === "crossed-budget") {
    block([
      `[File Budget] ${filePath} exceeds its file line budget`,
      `  Before: ${headLines} lines | After: ${currentLines} lines | Budget: ${budget} lines`,
      "",
      "Move logic into separate files so each file remains within budget.",
    ].join("\n"));
  }
  if (decision.kind === "historical-hard-growth") {
    block([
      `[File Budget] ${filePath} was already oversized; the ratchet prevents further growth`,
      `  Before: ${headLines} lines | After: ${currentLines} lines | Budget: ${budget} lines`,
      `  Added ${decision.growth} lines (above the ${settings.oversizeSoftGrowthLimit}-line soft threshold)`,
      "",
      "Oversized files may shrink but not grow. Split existing logic while adding the new content.",
    ].join("\n"));
  }
  if (decision.kind === "historical-shrink") {
    warn([
      `[File Budget] ${filePath} shrank by ${decision.shrink} lines (${headLines} → ${currentLines})`,
      `  Budget: ${budget} lines | Still over by: ${currentLines - budget} lines`,
    ].join("\n"));
  }
  process.exit(0);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main();
}
