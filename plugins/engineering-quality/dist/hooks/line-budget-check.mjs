#!/usr/bin/env node
// harness-source-hash: sha256:8227754133151ebd04a3c2c3aa087c18c57010abf91e1999feb0596bd78e76fa
import {
  eventToolName,
  extractFileTargets,
  isRecord,
  readStdinJson
} from "../chunks/chunk-D7VNZMBN.mjs";

// plugins/engineering-quality/src/entries/hooks/line-budget-check.ts
import { execFileSync } from "node:child_process";
import { existsSync, statSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

// plugins/engineering-quality/src/lib/budget-policy.ts
function classifyBudgetState({
  mode,
  currentLines,
  budget,
  headLines,
  settings
}) {
  if (mode === "report") {
    return currentLines > budget ? { action: "warn", kind: "report-over" } : { action: "allow", kind: "within-budget" };
  }
  if (mode !== "block") return { action: "allow", kind: "not-enforced" };
  if (currentLines <= budget) {
    const warnLines = Math.ceil(budget * settings.nearBudgetWarnRatio);
    return currentLines >= warnLines ? { action: "warn", kind: "near-budget" } : { action: "allow", kind: "within-budget" };
  }
  if (headLines === null) return { action: "block", kind: "new-over" };
  if (headLines <= budget) {
    return { action: "block", kind: "crossed-budget" };
  }
  if (currentLines > headLines) {
    const growth = currentLines - headLines;
    return growth <= settings.oversizeSoftGrowthLimit ? { action: "allow", kind: "historical-soft-growth", growth } : { action: "block", kind: "historical-hard-growth", growth };
  }
  if (currentLines < headLines) {
    return {
      action: "warn",
      kind: "historical-shrink",
      shrink: headLines - currentLines
    };
  }
  return { action: "allow", kind: "historical-unchanged" };
}

// plugins/engineering-quality/src/entries/hooks/line-budget-check.ts
function isBudgetMode(value) {
  return value === "block" || value === "report" || value === "skip";
}
function isSettingsKey(key) {
  return key === "nearBudgetWarnRatio" || key === "warnCooldownMinutes" || key === "oversizeSoftGrowthLimit";
}
var BUILTIN_RULES = [
  // ── skip: tests, fixtures, generated paths ──
  { match: /(^|\/)tests?\//, mode: "skip" },
  { match: /(^|\/)spec\//, mode: "skip" },
  { match: /(^|\/)__tests__\//, mode: "skip" },
  { match: /(^|\/)__mocks__\//, mode: "skip" },
  { match: /(^|\/)fixtures?\//, mode: "skip" },
  { match: /(^|\/)testdata\//, mode: "skip" },
  { match: /(^|\/)e2e\//, mode: "skip" },
  { match: /(^|\/)snapshots?\//, mode: "skip" },
  { match: /\.(test|spec|e2e)\.[^.]+$/, mode: "skip" },
  { match: /Test\.(php|java|kt)$/, mode: "skip" },
  { match: /_test\.(go|py|rb|rs)$/, mode: "skip" },
  { match: /(^|\/)(dist|build|coverage|vendor|node_modules|target|\.next|\.nuxt|__generated__|generated)\//, mode: "skip" },
  // ── report: build recipes (linear files, warn only) ──
  { match: /(^|\/)Dockerfile$/, budget: 500, mode: "report" },
  { match: /(^|\/)Containerfile$/, budget: 500, mode: "report" },
  // ── block: by extension ──
  { match: /\.jsx?$/, budget: 500, mode: "block" },
  { match: /\.cjs$/, budget: 500, mode: "block" },
  { match: /\.mjs$/, budget: 500, mode: "block" },
  { match: /\.tsx?$/, budget: 500, mode: "block" },
  { match: /\.vue$/, budget: 500, mode: "block" },
  { match: /\.svelte$/, budget: 500, mode: "block" },
  { match: /\.py$/, budget: 500, mode: "block" },
  { match: /\.php$/, budget: 500, mode: "block" },
  { match: /\.rb$/, budget: 500, mode: "block" },
  { match: /\.rake$/, budget: 400, mode: "block" },
  { match: /\.gemspec$/, budget: 300, mode: "block" },
  { match: /\.ru$/, budget: 200, mode: "block" },
  { match: /\.erb$/, budget: 300, mode: "block" },
  { match: /\.haml$/, budget: 300, mode: "block" },
  { match: /\.slim$/, budget: 300, mode: "block" },
  { match: /\.builder$/, budget: 300, mode: "block" },
  { match: /\.jbuilder$/, budget: 250, mode: "block" },
  { match: /\.rjs$/, budget: 250, mode: "block" },
  { match: /\.go$/, budget: 800, mode: "block" },
  { match: /\.rs$/, budget: 800, mode: "block" },
  { match: /\.java$/, budget: 800, mode: "block" },
  { match: /\.kt$/, budget: 500, mode: "block" },
  { match: /\.kts$/, budget: 500, mode: "block" },
  { match: /\.swift$/, budget: 500, mode: "block" },
  { match: /\.c$/, budget: 800, mode: "block" },
  { match: /\.(cc|cpp|cxx)$/, budget: 800, mode: "block" },
  { match: /\.h$/, budget: 500, mode: "block" },
  { match: /\.(hh|hpp|hxx)$/, budget: 500, mode: "block" },
  { match: /\.ixx$/, budget: 500, mode: "block" },
  { match: /\.cppm$/, budget: 500, mode: "block" },
  { match: /\.ipp$/, budget: 400, mode: "block" },
  { match: /\.tpp$/, budget: 400, mode: "block" },
  { match: /\.inl$/, budget: 300, mode: "block" },
  { match: /\.cmake$/, budget: 300, mode: "block" },
  { match: /\.cs$/, budget: 800, mode: "block" },
  { match: /\.lua$/, budget: 500, mode: "block" },
  { match: /\.sh$/, budget: 300, mode: "block" },
  { match: /\.bash$/, budget: 300, mode: "block" },
  { match: /\.zsh$/, budget: 300, mode: "block" },
  { match: /\.pl$/, budget: 500, mode: "block" },
  { match: /\.pm$/, budget: 500, mode: "block" },
  { match: /\.t$/, budget: 400, mode: "block" },
  { match: /\.psgi$/, budget: 300, mode: "block" },
  { match: /\.xs$/, budget: 600, mode: "block" },
  { match: /\.gradle$/, budget: 600, mode: "block" },
  // ── block: by file name ──
  { match: /(^|\/)CMakeLists\.txt$/, budget: 300, mode: "block" },
  { match: /(^|\/)Makefile$/, budget: 300, mode: "block" },
  { match: /(^|\/)GNUmakefile$/, budget: 300, mode: "block" },
  { match: /(^|\/)Rakefile$/, budget: 300, mode: "block" },
  { match: /(^|\/)config\.ru$/, budget: 200, mode: "block" },
  { match: /(^|\/)Guardfile$/, budget: 200, mode: "block" },
  { match: /(^|\/)Capfile$/, budget: 200, mode: "block" },
  { match: /(^|\/)Fastfile$/, budget: 400, mode: "block" },
  { match: /(^|\/)Podfile$/, budget: 300, mode: "block" },
  { match: /(^|\/)Appraisals$/, budget: 200, mode: "block" },
  { match: /(^|\/)Makefile\.PL$/, budget: 300, mode: "block" },
  { match: /(^|\/)Build\.PL$/, budget: 300, mode: "block" }
];
var DEFAULT_SETTINGS = {
  nearBudgetWarnRatio: 0.8,
  warnCooldownMinutes: 30,
  // A bounded maintenance change in a legacy oversized file should remain
  // possible. One hundred lines is 20% of the common 500-line source budget;
  // growth still requires a split or an explicit project override.
  oversizeSoftGrowthLimit: 100
};
var WARN_MARKER_DIR = `${tmpdir()}/.ai-experts-file-budget-warned`;
var CONFIG_FILE_NAMES = [
  ".engineering-quality.mjs",
  ".engineering-quality.cjs",
  ".engineering-quality.js"
];
async function loadUserConfig(repoRoot) {
  for (const name of CONFIG_FILE_NAMES) {
    const p = join(repoRoot, name);
    if (!existsSync(p)) continue;
    try {
      const mod = await import(pathToFileURL(p).href);
      return mod.default ?? mod;
    } catch (e) {
      process.stderr.write(`[engineering-quality] Failed to load ${name}: ${e instanceof Error ? e.message : String(e)}
`);
      return null;
    }
  }
  return null;
}
function validateRule(rule, i) {
  if (!isRecord(rule) || Array.isArray(rule)) {
    process.stderr.write(`[engineering-quality] rule[${i}]: must be an object, skipping
`);
    return false;
  }
  if (!(rule.match instanceof RegExp)) {
    process.stderr.write(`[engineering-quality] rule[${i}]: "match" must be a RegExp, skipping
`);
    return false;
  }
  const mode = rule.mode ?? "block";
  if (!isBudgetMode(mode)) {
    process.stderr.write(`[engineering-quality] rule[${i}]: "mode" must be block|report|skip, skipping
`);
    return false;
  }
  if (mode !== "skip") {
    if (typeof rule.budget !== "number" || !Number.isFinite(rule.budget) || rule.budget <= 0) {
      process.stderr.write(`[engineering-quality] rule[${i}]: "budget" must be a positive number (mode != "skip"), skipping
`);
      return false;
    }
  }
  return true;
}
function resolveSettings(rawSettings) {
  if (rawSettings === void 0) return { ...DEFAULT_SETTINGS };
  if (!isRecord(rawSettings) || Array.isArray(rawSettings)) {
    process.stderr.write('[engineering-quality] config "settings" must be an object, using defaults\n');
    return { ...DEFAULT_SETTINGS };
  }
  const validators = {
    nearBudgetWarnRatio: (value) => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1,
    warnCooldownMinutes: (value) => typeof value === "number" && Number.isFinite(value) && value >= 0,
    oversizeSoftGrowthLimit: (value) => typeof value === "number" && Number.isFinite(value) && value >= 0
  };
  const settings = { ...DEFAULT_SETTINGS };
  for (const [key, value] of Object.entries(rawSettings)) {
    if (!isSettingsKey(key)) {
      process.stderr.write(`[engineering-quality] settings.${key}: unknown setting, ignoring
`);
      continue;
    }
    const validate = validators[key];
    if (!validate(value) || typeof value !== "number") {
      process.stderr.write(`[engineering-quality] settings.${key}: invalid value, using default
`);
      continue;
    }
    settings[key] = value;
  }
  return settings;
}
function resolveRules(userConfig) {
  const record = isRecord(userConfig) ? userConfig : void 0;
  const rawRules = Array.isArray(record?.rules) ? record.rules : [];
  if (record?.rules !== void 0 && !Array.isArray(record.rules)) {
    process.stderr.write('[engineering-quality] config "rules" must be an array, using built-ins\n');
  }
  const userRules = rawRules.map((rule, i) => ({ rule, i })).filter(({ rule, i }) => validateRule(rule, i)).map(({ rule }) => rule.mode == null ? { ...rule, mode: "block" } : rule);
  const rules = [...userRules, ...BUILTIN_RULES];
  const settings = resolveSettings(record?.settings);
  return { rules, settings };
}
function matchRule(relPath, rules) {
  for (const rule of rules) {
    try {
      const match = new RegExp(rule.match.source, rule.match.flags);
      if (match.test(relPath)) return rule;
    } catch {
      continue;
    }
  }
  return null;
}
function countLines(text) {
  if (!text) return 0;
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines.length;
}
function readGitHeadContent(filePath, repoRoot) {
  if (!repoRoot) return null;
  try {
    const relPath = relative(repoRoot, filePath).replaceAll("\\", "/");
    if (relPath === ".." || relPath.startsWith("../")) return null;
    return execFileSync("git", ["show", `HEAD:${relPath}`], {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5e3
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
  }
}
function extractFilePaths(event) {
  return extractFileTargets(event, {
    tools: eventToolName(event) ? "mutation" : "any",
    includeShellWrites: true
  });
}
function block(message) {
  process.stderr.write(`${message}
`);
  process.exit(2);
}
function warn(message) {
  process.stderr.write(`${message}
`);
  process.exit(0);
}
async function main() {
  const event = await readStdinJson();
  if (event.__parseError) process.exit(0);
  const filePaths = extractFilePaths(event).filter((p) => existsSync(p));
  const firstPath = filePaths[0];
  if (!firstPath) {
    process.exit(0);
  }
  let repoRoot;
  try {
    repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5e3,
      cwd: dirname(firstPath)
    }).trim();
  } catch {
    try {
      repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5e3
      }).trim();
    } catch {
      repoRoot = null;
    }
  }
  const userConfig = repoRoot ? await loadUserConfig(repoRoot) : null;
  const { rules, settings } = resolveRules(userConfig);
  let filePath = null;
  let rule = null;
  let currentLines = 0;
  let budget = 0;
  for (const candidate of filePaths) {
    let relPath = candidate;
    if (repoRoot) {
      relPath = candidate.replace(repoRoot.replaceAll("\\", "/") + "/", "").replaceAll("\\", "/");
    }
    const matched = matchRule(relPath, rules);
    if (!matched || matched.mode === "skip") continue;
    const content = readTextFileCapped(candidate);
    if (content === null) continue;
    const lines = countLines(content);
    if ((matched.mode === "report" || matched.mode === "block") && typeof matched.budget === "number") {
      filePath = candidate;
      rule = matched;
      currentLines = lines;
      budget = matched.budget;
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
    settings
  });
  if (decision.kind === "report-over") {
    warn([
      `[File Budget] ${filePath} exceeds the build-recipe reference budget (${currentLines}/${budget} lines)`,
      "",
      "Build recipes are linear files and cannot simply be split; when they keep growing, move install lists and checks into bin/ helper scripts.",
      "Do not reduce the count by deleting blank lines, comments, or other formatting."
    ].join("\n"));
  }
  if (decision.kind === "near-budget") {
    const warnCooldownMs = settings.warnCooldownMinutes * 60 * 1e3;
    if (hasRecentWarnMarker(filePath, warnCooldownMs)) {
      process.exit(0);
    }
    writeWarnMarker(filePath);
    warn([
      `[File Budget] ${filePath} is near its line budget (${currentLines}/${budget} lines, ${Math.round(settings.nearBudgetWarnRatio * 100)}%)`,
      "",
      "Plan a split into single-responsibility files before adding more; new content is blocked once the budget is exceeded.",
      "Do not reduce the count by deleting blank lines, comments, or other formatting."
    ].join("\n"));
  }
  if (decision.kind === "new-over") {
    block([
      `[File Budget] ${filePath} exceeds its file line budget`,
      `  Current: ${currentLines} lines | Budget: ${budget} lines`,
      "",
      "New files must remain within budget. Split this into single-responsibility files."
    ].join("\n"));
  }
  if (decision.kind === "crossed-budget") {
    block([
      `[File Budget] ${filePath} exceeds its file line budget`,
      `  Before: ${headLines} lines | After: ${currentLines} lines | Budget: ${budget} lines`,
      "",
      "Move logic into separate files so each file remains within budget."
    ].join("\n"));
  }
  if (decision.kind === "historical-hard-growth") {
    block([
      `[File Budget] ${filePath} was already oversized; the ratchet prevents further growth`,
      `  Before: ${headLines} lines | After: ${currentLines} lines | Budget: ${budget} lines`,
      `  Added ${decision.growth} lines (above the ${settings.oversizeSoftGrowthLimit}-line soft threshold)`,
      "",
      "Oversized files may shrink but not grow. Split existing logic while adding the new content."
    ].join("\n"));
  }
  if (decision.kind === "historical-shrink") {
    warn([
      `[File Budget] ${filePath} shrank by ${decision.shrink} lines (${headLines} \u2192 ${currentLines})`,
      `  Budget: ${budget} lines | Still over by: ${currentLines - budget} lines`
    ].join("\n"));
  }
  process.exit(0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
export {
  BUILTIN_RULES,
  countLines,
  extractFilePaths,
  matchRule,
  resolveRules
};
