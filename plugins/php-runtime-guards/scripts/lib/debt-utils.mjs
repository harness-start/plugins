/**
 * Plugin-local net-new text analysis helpers shared by the debt and
 * debug-statement checks.
 *
 * "Net-new" means the proposed change introduces signals that are not present
 * in the baseline (edit old_string, Write content vs git HEAD, or working file
 * vs git HEAD).
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import { readGitHeadContent } from "./git-utils.mjs";

export const MAX_HOOK_READ_BYTES = 2 * 1024 * 1024;

const TEST_PATH_RE =
  /(?:^|\/)(?:tests?|spec|__tests__|__mocks__|fixtures|fixture|testdata|e2e|snapshots?)\//i;
const TEST_FILE_RE =
  /(?:\.|_)(?:test|spec|e2e)\.[^.]+$|Test\.(?:php|java|kt)$|_test\.(?:go|py|rb|rs)$/i;
const GENERATED_PATH_RE =
  /(?:^|\/)(?:dist|build|coverage|vendor|node_modules|target|\.next|\.nuxt|__generated__|generated)\//i;

export function isLikelyTestOrFixture(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  return TEST_PATH_RE.test(normalized) || TEST_FILE_RE.test(basename(normalized));
}

export function isLikelyGeneratedPath(filePath) {
  return GENERATED_PATH_RE.test(filePath.replaceAll("\\", "/"));
}

export function readTextFileCapped(filePath, maxBytes = MAX_HOOK_READ_BYTES) {
  try {
    if (statSync(filePath).size > maxBytes) return null;
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Build the (newText, baselineText) pair for a tool input, mirroring the
 * source harness semantics:
 *  - Edit carries old_string/new_string → direct pair comparison.
 *  - Write carries content → content vs git HEAD.
 *  - Everything else → working file vs git HEAD.
 */
export function readDebtTextPair(eventToolInput, filePath) {
  const input = eventToolInput ?? {};
  const hasEditPair =
    typeof input.old_string === "string" || typeof input.new_string === "string";
  if (hasEditPair) {
    return {
      newText: typeof input.new_string === "string" ? input.new_string : "",
      baselineText: typeof input.old_string === "string" ? input.old_string : "",
    };
  }
  if (typeof input.content === "string") {
    return {
      newText: input.content,
      baselineText: readGitHeadContent(filePath) ?? "",
    };
  }
  if (!existsSync(filePath)) return null;
  const newText = readTextFileCapped(filePath);
  if (newText === null) return null;
  return {
    newText,
    baselineText: readGitHeadContent(filePath) ?? "",
  };
}

export function shouldScanFile(filePath, { extensions = [], skipTests = true, skipGenerated = true } = {}) {
  const normalized = filePath.replaceAll("\\", "/");
  const lowerBase = basename(normalized).toLowerCase();
  const lowerExt = extname(lowerBase);
  if (skipTests !== false && isLikelyTestOrFixture(normalized)) return false;
  if (skipGenerated !== false && isLikelyGeneratedPath(normalized)) return false;
  if (extensions.length === 0) return true;
  return extensions.includes(lowerExt);
}

export function isCommentLine(line) {
  const trimmed = line.trim();
  return (
    trimmed === "" ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("--") ||
    trimmed.startsWith("<!--") ||
    trimmed.startsWith("REM ")
  );
}

/** Line numbers (1-based) of non-comment lines matching the pattern. */
export function matchingLines(text, pattern) {
  const lines = [];
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    pattern.lastIndex = 0;
    if (!isCommentLine(line) && pattern.test(line)) lines.push(index + 1);
  }
  return lines;
}
