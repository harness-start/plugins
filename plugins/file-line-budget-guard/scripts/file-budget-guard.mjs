#!/usr/bin/env node

/**
 * file-line-budget-guard — PostToolUse hook
 *
 * Ratchet-enforced file line budget mechanism:
 *   Normal files  → deny when exceeding the budget
 *   Oversize files → frozen at git HEAD line count, only shrinking allowed
 *   New files      → must stay within budget
 *   Test files     → excluded from line budgets
 *
 * PostToolUse runs after Edit | Write | MultiEdit | ApplyPatch.
 * When a file exceeds its budget, the block message is emitted to
 * stderr and the hook exits with code 2 so the agent can retry
 * with a split or reduction strategy.
 */

import { execFileSync } from "node:child_process";
import { existsSync, statSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { tmpdir } from "node:os";

// ── Budgets ──────────────────────────────────────────────────

const BUDGETS_BY_EXTENSION = {
  ".gradle": 600,
  ".js": 500,
  ".jsx": 500,
  ".cjs": 500,
  ".ts": 500,
  ".tsx": 500,
  ".vue": 500,
  ".svelte": 500,
  ".py": 500,
  ".php": 500,
  ".rb": 500,
  ".rake": 400,
  ".gemspec": 300,
  ".ru": 200,
  ".erb": 300,
  ".haml": 300,
  ".slim": 300,
  ".builder": 300,
  ".jbuilder": 250,
  ".rjs": 250,
  ".go": 800,
  ".rs": 800,
  ".java": 800,
  ".kt": 500,
  ".kts": 500,
  ".swift": 500,
  ".c": 800,
  ".cc": 800,
  ".cpp": 800,
  ".cxx": 800,
  ".h": 500,
  ".hh": 500,
  ".hpp": 500,
  ".hxx": 500,
  ".ixx": 500,
  ".cppm": 500,
  ".ipp": 400,
  ".tpp": 400,
  ".inl": 300,
  ".cmake": 300,
  ".cs": 800,
  ".lua": 500,
  ".sh": 300,
  ".bash": 300,
  ".zsh": 300,
  ".pl": 500,
  ".pm": 500,
  ".t": 400,
  ".psgi": 300,
  ".xs": 600,
};

// Build recipes are linear files that cannot be split;
// exceeding the budget is downgraded to a warning (report only).
const REPORT_ONLY_BUDGETS_BY_FILE_NAME = {
  dockerfile: 500,
  containerfile: 500,
};

const BUDGETS_BY_FILE_NAME = {
  "cmakelists.txt": 300,
  "makefile": 300,
  "gnumakefile": 300,
  "rakefile": 300,
  "config.ru": 200,
  "guardfile": 200,
  "capfile": 200,
  "fastfile": 400,
  "podfile": 300,
  "appraisals": 200,
  "makefile.pl": 300,
  "build.pl": 300,
};

// ── Ratchet constants ─────────────────────────────────────────

const HISTORICAL_OVERSIZE_SOFT_GROWTH_LINES = 20;

// Near-budget warning at 80% with 30-minute cooldown per file
const NEAR_BUDGET_WARN_RATIO = 0.8;
const WARN_MARKER_DIR = `${tmpdir()}/.ai-experts-file-budget-warned`;
const WARN_MARKER_EXPIRY_MS = 30 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────────────

function getLowerBaseName(filePath) {
  return basename(filePath.replaceAll("\\", "/")).toLowerCase();
}

function countLines(text) {
  if (!text) return 0;
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines.length;
}

/** Pattern-based exclusion: tests, fixtures, specs, generated code */
const TEST_PATH_RE = /(?:^|\/)(?:tests?|spec|__tests__|__mocks__|fixtures|fixture|testdata|e2e|snapshots?)\//i;
const TEST_FILE_RE = /(?:\.|_)(?:test|spec|e2e)\.[^.]+$|Test\.(?:php|java|kt)$|_test\.(?:go|py|rb|rs)$/i;
const GENERATED_PATH_RE = /(?:^|\/)(?:dist|build|coverage|vendor|node_modules|target|\.next|\.nuxt|__generated__|generated)\//i;

function isLikelyTestOrFixture(filePath) {
  const p = filePath.replaceAll("\\", "/");
  return TEST_PATH_RE.test(p) || TEST_FILE_RE.test(basename(p));
}

function isLikelyGeneratedPath(filePath) {
  return GENERATED_PATH_RE.test(filePath.replaceAll("\\", "/"));
}

function getBudget(filePath) {
  if (isLikelyTestOrFixture(filePath)) return null;
  if (isLikelyGeneratedPath(filePath)) return null;
  const baseName = getLowerBaseName(filePath);
  return (
    BUDGETS_BY_FILE_NAME[baseName] ??
    BUDGETS_BY_EXTENSION[extname(baseName)] ??
    null
  );
}

function getReportOnlyBudget(filePath) {
  const baseName = getLowerBaseName(filePath);
  for (const [name, budget] of Object.entries(REPORT_ONLY_BUDGETS_BY_FILE_NAME)) {
    if (baseName === name || baseName.startsWith(`${name}.`)) return budget;
  }
  return null;
}

/** Read git HEAD content for the given file path; returns null on failure */
function readGitHeadContent(filePath) {
  try {
    const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: filePath,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
    const relPath = filePath.replace(repoRoot + "/", "").replaceAll("\\", "/");
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

function hasRecentWarnMarker(filePath) {
  try {
    const st = statSync(warnMarkerPath(filePath));
    return Date.now() - st.mtimeMs < WARN_MARKER_EXPIRY_MS;
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

function extractFilePath(event) {
  return (
    event?.tool_input?.file_path ??
    event?.toolInput?.file_path ??
    null
  );
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

  const filePath = extractFilePath(event);
  if (!filePath || !existsSync(filePath)) {
    process.exit(0);
  }

  // ── Build recipe: report-only ──
  const reportOnlyBudget = getReportOnlyBudget(filePath);
  if (reportOnlyBudget) {
    const content = readTextFileCapped(filePath);
    if (content === null) { process.exit(0); }
    const lines = countLines(content);
    if (lines <= reportOnlyBudget) { process.exit(0); }
    warn([
      `[File Budget] ${filePath} 超出构建配方参考预算（${lines}/${reportOnlyBudget} 行）`,
      "",
      "构建配方是线性文件，不适用「拆分为多个文件」；持续增长时优先把安装清单、检查脚本外提到 bin/ 辅助脚本。",
      "禁止用删空行、删注释等格式化手段压行数。",
    ].join("\n"));
    // unreachable — warn() calls exit(0)
  }

  const budget = getBudget(filePath);
  if (!budget) {
    process.exit(0);
  }

  const content = readTextFileCapped(filePath);
  if (content === null) { process.exit(0); }
  const currentLines = countLines(content);

  // ── Within budget ──
  if (currentLines <= budget) {
    const warnLines = Math.ceil(budget * NEAR_BUDGET_WARN_RATIO);
    if (currentLines < warnLines) { process.exit(0); }
    if (hasRecentWarnMarker(filePath)) { process.exit(0); }
    writeWarnMarker(filePath);
    warn([
      `[File Budget] ${filePath} 接近行数预算（${currentLines}/${budget} 行，已达 80%）`,
      "",
      "继续新增内容前先规划拆分到职责单一的文件；超过预算后新增内容会被整块阻断。",
      "禁止用删空行、删注释等格式化手段压行数。",
    ].join("\n"));
    // unreachable
  }

  // ── Exceeded budget: ratchet branches ──
  const headContent = readGitHeadContent(filePath);
  const headLines = headContent !== null ? countLines(headContent) : null;

  if (headLines === null) {
    // New file (never committed) → must be within budget
    block([
      `[File Budget] ${filePath} 超出文件行数预算`,
      `  当前: ${currentLines} 行 | 预算: ${budget} 行`,
      "",
      "新文件必须在预算内。请拆分为多个职责单一的文件。",
    ].join("\n"));
    // unreachable
  }

  if (headLines <= budget) {
    // Was within budget, now exceeds → deny
    block([
      `[File Budget] ${filePath} 超出文件行数预算`,
      `  修改前: ${headLines} 行 | 修改后: ${currentLines} 行 | 预算: ${budget} 行`,
      "",
      "请拆分逻辑到独立文件，保持单文件在预算内。",
    ].join("\n"));
    // unreachable
  }

  // ── Historically oversize (headLines > budget) ──

  if (currentLines > headLines) {
    const growth = currentLines - headLines;
    if (growth <= HISTORICAL_OVERSIZE_SOFT_GROWTH_LINES) {
      // Small growth → warn but allow
      warn([
        `[File Budget] ${filePath} 是历史超标文件，本次仅小幅增长`,
        `  修改前: ${headLines} 行 | 修改后: ${currentLines} 行 | 预算: ${budget} 行`,
        `  增加了 ${growth} 行（<= ${HISTORICAL_OVERSIZE_SOFT_GROWTH_LINES} 行软阈值）`,
        "",
        "建议后续拆分该文件并回收到预算内。",
      ].join("\n"));
      // unreachable
    }

    // Significant growth → ratchet deny
    block([
      `[File Budget] ${filePath} 是历史超标文件，棘轮机制禁止继续膨胀`,
      `  修改前: ${headLines} 行 | 修改后: ${currentLines} 行 | 预算: ${budget} 行`,
      `  增加了 ${growth} 行（超过 ${HISTORICAL_OVERSIZE_SOFT_GROWTH_LINES} 行软阈值）`,
      "",
      "超标文件只许缩小不许增长。请在添加新内容的同时拆分已有逻辑。"
    ].join("\n"));
    // unreachable
  }

  if (currentLines < headLines) {
    // Shrinking → positive feedback
    warn([
      `[File Budget] ${filePath} 缩减了 ${headLines - currentLines} 行（${headLines} → ${currentLines}）`,
      `  预算: ${budget} 行 | 还需缩减: ${currentLines - budget} 行`,
    ].join("\n"));
    // unreachable
  }

  // Unchanged, still oversize → silent pass
  process.exit(0);
}

main();
