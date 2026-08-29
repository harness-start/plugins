#!/usr/bin/env node

/**
 * engineering-quality — PreToolUse enforcement and PostToolUse reporting
 *
 * Ratchet-enforced file line budget mechanism.
 *
 * Rules are declared as { match: RegExp, budget?: number, mode: "block"|"report"|"skip" }.
 * User config (.engineering-quality.mjs) rules are prepended to built-in rules.
 * First match wins; unmatched files pass silently.
 *
 * Predictable file-tool writes are projected before mutation. PostToolUse is
 * report-only because it cannot undo an operation that already completed.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, statSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { classifyBudgetState } from "../../lib/budget-policy.js";
import { eventToolName, isRecord, readStdinJson, type HookEvent } from "@harness/core/hook-event";
import { extractFileTargets } from "@harness/core/hook-targets";

export type BudgetMode = "block" | "report" | "skip";

export type BudgetRule = {
  match: RegExp;
  mode: BudgetMode;
  budget?: number;
};

export type BudgetSettings = {
  nearBudgetWarnRatio: number;
  warnCooldownMinutes: number;
  oversizeSoftGrowthLimit: number;
};

type SettingsKey = keyof BudgetSettings;

function isBudgetMode(value: unknown): value is BudgetMode {
  return value === "block" || value === "report" || value === "skip";
}

function isSettingsKey(key: string): key is SettingsKey {
  return key === "nearBudgetWarnRatio" || key === "warnCooldownMinutes" || key === "oversizeSoftGrowthLimit";
}

// ── Built-in rules ───────────────────────────────────────────
// These are the default rules when no user config is present.
// Each rule has: match (RegExp), mode ("block"|"report"|"skip"), budget (number, except skip).

export const BUILTIN_RULES: BudgetRule[] = [
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

const DEFAULT_SETTINGS: BudgetSettings = {
  nearBudgetWarnRatio: 0.8,
  warnCooldownMinutes: 30,
  // A bounded maintenance change in a legacy oversized file should remain
  // possible. One hundred lines is 20% of the common 500-line source budget;
  // growth still requires a split or an explicit project override.
  oversizeSoftGrowthLimit: 100,
};
const BUDGET_DEBT_DIR = join(tmpdir(), "harness-file-budget-debt");

// ── Ratchet constants (not user-configurable) ─────────────────

const WARN_MARKER_DIR = `${tmpdir()}/.ai-experts-file-budget-warned`;

// ── Config discovery ─────────────────────────────────────────

const CONFIG_FILE_NAMES = [
  ".engineering-quality.mjs",
  ".engineering-quality.cjs",
  ".engineering-quality.js",
];

/**
 * Try to load user config from project root.
 * Returns the imported module's default export, or null.
 */
async function loadUserConfig(repoRoot: string): Promise<unknown> {
  for (const name of CONFIG_FILE_NAMES) {
    const p = join(repoRoot, name);
    if (!existsSync(p)) continue;
    try {
      const mod = await import(pathToFileURL(p).href);
      return mod.default ?? mod;
    } catch (e) {
      process.stderr.write(`[engineering-quality] Failed to load ${name}: ${e instanceof Error ? e.message : String(e)}\n`);
      return null;
    }
  }
  return null;
}

/**
 * Validate a single rule. Returns true if the rule is usable.
 */
function validateRule(rule: unknown, i: number): rule is BudgetRule {
  if (!isRecord(rule) || Array.isArray(rule)) {
    process.stderr.write(`[engineering-quality] rule[${i}]: must be an object, skipping\n`);
    return false;
  }
  if (!(rule.match instanceof RegExp)) {
    process.stderr.write(`[engineering-quality] rule[${i}]: "match" must be a RegExp, skipping\n`);
    return false;
  }
  const mode = rule.mode ?? "block";
  if (!isBudgetMode(mode)) {
    process.stderr.write(`[engineering-quality] rule[${i}]: "mode" must be block|report|skip, skipping\n`);
    return false;
  }
  if (mode !== "skip") {
    if (typeof rule.budget !== "number" || !Number.isFinite(rule.budget) || rule.budget <= 0) {
      process.stderr.write(`[engineering-quality] rule[${i}]: "budget" must be a positive number (mode != "skip"), skipping\n`);
      return false;
    }
  }
  return true;
}

function resolveSettings(rawSettings: unknown): BudgetSettings {
  if (rawSettings === undefined) return { ...DEFAULT_SETTINGS };
  if (!isRecord(rawSettings) || Array.isArray(rawSettings)) {
    process.stderr.write('[engineering-quality] config "settings" must be an object, using defaults\n');
    return { ...DEFAULT_SETTINGS };
  }

  const validators: Record<SettingsKey, (value: unknown) => boolean> = {
    nearBudgetWarnRatio: (value) =>
      typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1,
    warnCooldownMinutes: (value) =>
      typeof value === "number" && Number.isFinite(value) && value >= 0,
    oversizeSoftGrowthLimit: (value) =>
      typeof value === "number" && Number.isFinite(value) && value >= 0,
  };
  const settings: BudgetSettings = { ...DEFAULT_SETTINGS };
  for (const [key, value] of Object.entries(rawSettings)) {
    if (!isSettingsKey(key)) {
      process.stderr.write(`[engineering-quality] settings.${key}: unknown setting, ignoring\n`);
      continue;
    }
    const validate = validators[key];
    if (!validate(value) || typeof value !== "number") {
      process.stderr.write(`[engineering-quality] settings.${key}: invalid value, using default\n`);
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
export function resolveRules(userConfig: unknown): { rules: BudgetRule[]; settings: BudgetSettings } {
  const record = isRecord(userConfig) ? userConfig : undefined;
  const rawRules = Array.isArray(record?.rules) ? record.rules : [];
  if (record?.rules !== undefined && !Array.isArray(record.rules)) {
    process.stderr.write('[engineering-quality] config "rules" must be an array, using built-ins\n');
  }
  const userRules = rawRules
    .map((rule, i) => ({ rule, i }))
    .filter(({ rule, i }) => validateRule(rule, i))
    .map(({ rule }) => (rule.mode == null ? { ...rule, mode: "block" } : rule));
  const rules = [...userRules, ...BUILTIN_RULES];
  const settings = resolveSettings(record?.settings);
  return { rules, settings };
}

/**
 * Find the first rule whose match.test(relPath) succeeds.
 * Returns the rule object or null if no match.
 */
export function matchRule(relPath: string, rules: readonly BudgetRule[]): BudgetRule | null {
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

export function countLines(text: string): number {
  if (!text) return 0;
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines.length;
}

/** Read git HEAD content for the given file path; returns null on failure. */
function readGitHeadContent(filePath: string, repoRoot: string | null): string | null {
  if (!repoRoot) return null;
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

function readTextFileCapped(filePath: string, maxBytes = 8 * 1024 * 1024): string | null {
  try {
    if (statSync(filePath).size > maxBytes) return null;
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function warnMarkerPath(filePath: string): string {
  const safeName = filePath.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${WARN_MARKER_DIR}/${safeName}`;
}

function hasRecentWarnMarker(filePath: string, cooldownMs: number): boolean {
  try {
    const st = statSync(warnMarkerPath(filePath));
    return Date.now() - st.mtimeMs < cooldownMs;
  } catch {
    return false;
  }
}

function writeWarnMarker(filePath: string): void {
  try {
    if (!existsSync(WARN_MARKER_DIR)) mkdirSync(WARN_MARKER_DIR, { recursive: true });
    writeFileSync(warnMarkerPath(filePath), "", "utf-8");
  } catch {
    // Marker write failure only affects cooldown; do not block workflow
  }
}

export function extractFilePaths(event: HookEvent): string[] {
  return extractFileTargets(event, {
    tools: eventToolName(event) ? "mutation" : "any",
    includeShellWrites: true,
  });
}

type LineProjection = { beforeLines: number; afterLines: number };

function sameTarget(rawPath: unknown, filePath: string, cwd: string): boolean {
  if (typeof rawPath !== "string" || !rawPath.trim()) return false;
  return resolve(cwd, rawPath) === resolve(filePath);
}

function projectDirectEdit(event: HookEvent, filePath: string): LineProjection | null {
  const input = isRecord(event.tool_input) ? event.tool_input : isRecord(event.toolInput) ? event.toolInput : {};
  const cwd = typeof event.cwd === "string" ? event.cwd : process.cwd();
  const current = readTextFileCapped(filePath) ?? "";
  let proposed = current;
  let matched = false;
  const operations = [input, ...(Array.isArray(input.edits) ? input.edits.filter(isRecord) : [])];
  for (const operation of operations) {
    const rawPath = operation.file_path ?? operation.filePath ?? operation.path;
    if (!sameTarget(rawPath, filePath, cwd)) continue;
    if (typeof operation.content === "string") {
      proposed = operation.content;
      matched = true;
      continue;
    }
    const oldText = operation.old_string ?? operation.oldString;
    const newText = operation.new_string ?? operation.newString;
    if (typeof oldText !== "string" || typeof newText !== "string" || !oldText || !proposed.includes(oldText)) continue;
    proposed = operation.replace_all === true || operation.replaceAll === true
      ? proposed.split(oldText).join(newText)
      : proposed.replace(oldText, newText);
    matched = true;
  }
  return matched ? { beforeLines: countLines(current), afterLines: countLines(proposed) } : null;
}

function projectPatch(event: HookEvent, filePath: string): LineProjection | null {
  const input = isRecord(event.tool_input) ? event.tool_input : isRecord(event.toolInput) ? event.toolInput : {};
  const patch = typeof input.patch === "string" ? input.patch : typeof input.patch_text === "string" ? input.patch_text : null;
  if (!patch) return null;
  const cwd = typeof event.cwd === "string" ? event.cwd : process.cwd();
  let active = false;
  let kind = "";
  let added = 0;
  let removed = 0;
  let found = false;
  for (const line of patch.split(/\r?\n/u)) {
    const header = /^\*\*\* (Add|Update|Delete) File: (.+)$/u.exec(line);
    if (header) {
      kind = header[1] ?? "";
      active = sameTarget(header[2], filePath, cwd);
      if (active) found = true;
      continue;
    }
    if (!active || line.startsWith("*** ")) continue;
    if (line.startsWith("+")) added += 1;
    else if (line.startsWith("-")) removed += 1;
  }
  if (!found || kind === "Delete") return null;
  const beforeLines = countLines(readTextFileCapped(filePath) ?? "");
  return { beforeLines, afterLines: kind === "Add" ? added : Math.max(0, beforeLines + added - removed) };
}

export function projectLineCount(event: HookEvent, filePath: string): LineProjection | null {
  return projectDirectEdit(event, filePath) ?? projectPatch(event, filePath);
}

type BudgetDebt = { filePath: string; budget: number };

function debtPath(event: HookEvent): string {
  const cwd = typeof event.cwd === "string" ? resolve(event.cwd) : process.cwd();
  const sessionId = String(event.session_id ?? event.sessionId ?? process.env.AI_EXPERTS_SESSION_ID ?? "hook");
  const key = createHash("sha256").update(`${sessionId}\0${cwd}`).digest("hex");
  return join(BUDGET_DEBT_DIR, `${key}.json`);
}

function readDebts(event: HookEvent): BudgetDebt[] {
  try {
    const value: unknown = JSON.parse(readFileSync(debtPath(event), "utf8"));
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is BudgetDebt => isRecord(item) && typeof item.filePath === "string" && typeof item.budget === "number");
  } catch {
    return [];
  }
}

function writeDebts(event: HookEvent, debts: BudgetDebt[]): void {
  const path = debtPath(event);
  if (debts.length === 0) {
    rmSync(path, { force: true });
    return;
  }
  mkdirSync(BUDGET_DEBT_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(debts)}\n`, { encoding: "utf8", mode: 0o600 });
}

function recordDebt(event: HookEvent, debt: BudgetDebt): void {
  const debts = readDebts(event).filter((item) => resolve(item.filePath) !== resolve(debt.filePath));
  debts.push(debt);
  writeDebts(event, debts);
}

function enforceDebtsAtStop(event: HookEvent): void {
  const remaining = readDebts(event).filter(({ filePath, budget }) => {
    const content = readTextFileCapped(filePath);
    return content !== null && countLines(content) > budget;
  });
  writeDebts(event, remaining);
  if (remaining.length === 0) return;
  process.stderr.write([
    "[File Budget] Cannot stop while post-write file line budget debt remains:",
    ...remaining.map(({ filePath, budget }) => `- ${filePath}: exceeds ${budget} lines`),
    "Reduce or split each file, then retry completion.",
  ].join("\n") + "\n");
  process.exitCode = 2;
}

function block(message: string): void {
  process.stderr.write(`${message}\n`);
  process.exitCode = 2;
}

function warn(message: string): void {
  process.stderr.write(`${message}\n`);
}

// ── Main ──────────────────────────────────────────────────────

export async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const phase = process.argv[2] === "pre" ? "pre" : process.argv[2] === "stop" ? "stop" : "post";
  if (phase === "stop") return enforceDebtsAtStop(event);

  const filePaths = extractFilePaths(event).filter((path) => phase === "pre" || existsSync(path));
  const firstPath = filePaths[0];
  if (!firstPath) {
    return;
  }

  // ── Locate repo root and load config ──
  let repoRoot: string | null;
  try {
    repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
      cwd: dirname(firstPath),
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
  let filePath: string | null = null;
  let rule: BudgetRule | null = null;
  let currentLines = 0;
  let beforeLines = 0;
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
    const projection = phase === "pre" ? projectLineCount(event, candidate) : null;
    const content = phase === "post" ? readTextFileCapped(candidate) : null;
    if (phase === "pre" && projection === null) continue;
    if (phase === "post" && content === null) continue;
    const lines = projection?.afterLines ?? countLines(content ?? "");
    if ((matched.mode === "report" || matched.mode === "block") && typeof matched.budget === "number") {
      filePath = candidate;
      rule = matched;
      currentLines = lines;
      beforeLines = projection?.beforeLines ?? lines;
      budget = matched.budget;
      // Prefer the first over-budget file; otherwise keep scanning.
      if (lines > matched.budget) break;
    }
  }
  if (!filePath || !rule) {
    return;
  }

  let headLines = null;
  if (rule.mode === "block" && currentLines > budget) {
    const headContent = readGitHeadContent(filePath, repoRoot);
    headLines = headContent !== null ? countLines(headContent) : phase === "pre" && existsSync(filePath) ? beforeLines : null;
  }
  const decision = classifyBudgetState({
    mode: rule.mode,
    currentLines,
    budget,
    headLines,
    settings,
  });

  if (phase === "post" && currentLines > budget && rule.mode === "block" && (headLines === null || decision.action === "block")) {
    recordDebt(event, { filePath, budget });
    const baseline = headLines === null
      ? "The pre-edit baseline is unavailable, so this file is not classified as new."
      : `Recorded baseline: ${headLines} lines.`;
    return warn([
      `[File Budget] ${filePath} exceeds its file line budget after the tool completed`,
      `  Current: ${currentLines} lines | Budget: ${budget} lines`,
      "",
      `${baseline} The write already happened; PostToolUse cannot undo it.`,
      "Reduce or split the file before completion.",
    ].join("\n"));
  }

  if (decision.kind === "report-over") {
    return warn([
      `[File Budget] ${filePath} exceeds the build-recipe reference budget (${currentLines}/${budget} lines)`,
      "",
      "Build recipes are linear files and cannot simply be split; when they keep growing, move install lists and checks into bin/ helper scripts.",
      "Do not reduce the count by deleting blank lines, comments, or other formatting.",
    ].join("\n"));
  }
  if (decision.kind === "near-budget") {
    const warnCooldownMs = settings.warnCooldownMinutes * 60 * 1000;
    if (hasRecentWarnMarker(filePath, warnCooldownMs)) return;
    writeWarnMarker(filePath);
    return warn([
      `[File Budget] ${filePath} is near its line budget (${currentLines}/${budget} lines, ${Math.round(settings.nearBudgetWarnRatio * 100)}%)`,
      "",
      "Plan a split into single-responsibility files before adding more; new content is blocked once the budget is exceeded.",
      "Do not reduce the count by deleting blank lines, comments, or other formatting.",
    ].join("\n"));
  }
  if (decision.kind === "new-over") {
    return block([
      `[File Budget] ${filePath} proposed write exceeds its file line budget`,
      `  Before: ${beforeLines} lines | After: ${currentLines} lines | Budget: ${budget} lines`,
      "",
      "New files must remain within budget. Split this into single-responsibility files.",
    ].join("\n"));
  }
  if (decision.kind === "crossed-budget") {
    return block([
      `[File Budget] ${filePath} proposed write exceeds its file line budget`,
      `  Before: ${beforeLines} lines | After: ${currentLines} lines | Budget: ${budget} lines`,
      "",
      "Move logic into separate files so each file remains within budget.",
    ].join("\n"));
  }
  if (decision.kind === "historical-hard-growth") {
    return block([
      `[File Budget] ${filePath} was already oversized; the ratchet prevents further growth`,
      `  Before: ${headLines} lines | After: ${currentLines} lines | Budget: ${budget} lines`,
      `  Added ${decision.growth} lines (above the ${settings.oversizeSoftGrowthLimit}-line soft threshold)`,
      "",
      "Oversized files may shrink but not grow. Split existing logic while adding the new content.",
    ].join("\n"));
  }
  if (decision.kind === "historical-shrink") {
    return warn([
      `[File Budget] ${filePath} shrank by ${decision.shrink} lines (${headLines} → ${currentLines})`,
      `  Budget: ${budget} lines | Still over by: ${currentLines - budget} lines`,
    ].join("\n"));
  }
}
