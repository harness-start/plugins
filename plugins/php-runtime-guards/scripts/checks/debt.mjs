/**
 * PHP debt guard (PostToolUse).
 *
 * Blocks net-new static-analysis suppressions, reflection encapsulation
 * bypasses and swallowed exceptions in PHP files. A justification
 * (issue/ticket reference or `-- 原因:` inline note) exempts a line.
 *
 * Failure mode: fail-open (report — PostToolUse cannot deny on either host).
 */

import {
  readDebtTextPair,
  shouldScanFile,
} from "../lib/debt-utils.mjs";

const PATTERNS = [
  {
    label: "PHPStan suppression",
    re: /@phpstan-ignore(?:-line|-next-line)?\b/i,
    hint: "修复类型问题；确需例外时写明 issue 与偿还条件",
  },
  {
    label: "Psalm suppression",
    re: /@psalm-suppress\b/i,
    hint: "修复类型问题；确需例外时写明 issue 与偿还条件",
  },
  {
    label: "reflection encapsulation bypass",
    re: /\bReflection(?:Class|Property|Method)\b|->setAccessible\s*\(\s*true\s*\)/,
    hint: "通过公开 API、容器参数或测试边界处理，不要反射破坏封装",
  },
  {
    label: "empty catch",
    re: /\bcatch\s*\([^)]*\)\s*\{\s*\}/,
    hint: "只捕获能处理的异常；不能处理时转换、记录或向上抛",
  },
];

const DEFAULT_JUSTIFICATION_RE =
  /--\s*\S|(?:\/\/|#|\/\*)\s*(?:原因|reason|because|issue|ticket|jira|gh|task)\b|\b(?:issue|ticket|jira|gh|task)\s*#?[A-Z0-9-]+\b|\b[A-Z][A-Z0-9]+-\d+\b/i;

function hasJustification(line, pattern) {
  if (pattern.justification === false) return false;
  return (pattern.justification ?? DEFAULT_JUSTIFICATION_RE).test(line);
}

function countDebtLines(text, pattern) {
  let count = 0;
  for (const line of text.split(/\r?\n/u)) {
    pattern.re.lastIndex = 0;
    if (pattern.re.test(line) && !hasJustification(line, pattern)) count += 1;
  }
  return count;
}

function collectLocations(text, pattern) {
  const locations = [];
  const lines = text.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) continue;
    pattern.re.lastIndex = 0;
    if (pattern.re.test(line) && !hasJustification(line, pattern)) {
      locations.push({ line: index + 1, text: line.trim().slice(0, 160) });
    }
  }
  return locations;
}

export function collectDebtFindings(toolInput, filePath) {
  if (!shouldScanFile(filePath, { extensions: [".php"] })) return [];
  const pair = readDebtTextPair(toolInput, filePath);
  if (!pair) return [];

  return PATTERNS.flatMap((pattern) => {
    const count =
      countDebtLines(pair.newText, pattern) - countDebtLines(pair.baselineText, pattern);
    if (count <= 0) return [];
    return [{ ...pattern, count, locations: collectLocations(pair.newText, pattern) }];
  });
}

export function formatDebtReport(filePath, findings) {
  const total = findings.reduce((sum, finding) => sum + finding.count, 0);
  const details = findings.flatMap((finding) =>
    finding.locations.slice(0, 6).map((location) =>
      `  行 ${location.line}: ${finding.label} -> ${finding.hint}${location.text ? `\n    ${location.text}` : ""}`,
    ),
  );
  const suffix = details.length < total ? `\n  ... 共 ${total} 处净新增债务信号` : "";
  return [
    `[PHP Debt Guard] ${filePath} 新增了 ${total} 处未说明原因的技术债信号：`,
    "",
    details.join("\n") + suffix,
    "",
    "处理方式：优先修复根因；确需保留时，在同一行写明 issue/ticket 或 `-- 原因：...`。",
  ].join("\n");
}
