/**
 * Python debt guard (PostToolUse report).
 * Failure mode: fail-open (report — PostToolUse cannot deny).
 */

import { readDebtTextPair, shouldScanFile } from "../lib/debt-utils.mjs";

const PATTERNS = [
  {
    label: "type ignore",
    re: /#\s*type:\s*ignore\b/u,
    hint: "修复类型合同；确需忽略时写明上游缺口或 issue",
  },
  {
    label: "bare except",
    re: /^\s*except\s*:/u,
    hint: "捕获具体异常并保留失败路径",
  },
  {
    label: "typing Any",
    re: /\bfrom\s+typing\s+import\s+.*\bAny\b|:\s*Any\b|->\s*Any\b/u,
    hint: "优先用 Protocol、TypedDict、dataclass 或 pydantic 边界收口",
  },
  {
    label: "pytest skip without reason",
    re: /@pytest\.mark\.(?:skip|xfail)\b/u,
    hint: "跳过测试必须写明原因、issue 和恢复条件",
  }
];

const DEFAULT_JUSTIFICATION_RE =
  /--\s*\S|(?:\/\/|#|\/\*)\s*(?:原因|reason|because|issue|ticket|jira|gh|task)\b|\b(?:issue|ticket|jira|gh|task)\s*#?[A-Z0-9-]+\b|\b[A-Z][A-Z0-9]+-\d+\b/i;

function hasJustification(line) {
  return DEFAULT_JUSTIFICATION_RE.test(line);
}

function countDebtLines(text, pattern) {
  let count = 0;
  for (const line of text.split(/\r?\n/u)) {
    pattern.re.lastIndex = 0;
    if (pattern.re.test(line) && !hasJustification(line)) count += 1;
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
    if (pattern.re.test(line) && !hasJustification(line)) {
      locations.push({ line: index + 1, text: line.trim().slice(0, 160) });
    }
  }
  return locations;
}

export function collectDebtFindings(toolInput, filePath) {
  if (!shouldScanFile(filePath, { extensions: [".py",".pyi"] })) return [];
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
  const lines = [
    `[Python Debt Guard] 检测到净新增债务信号：${filePath}`,
    "",
  ];
  for (const f of findings) {
    lines.push(`- ${f.label} ×${f.count}: ${f.hint}`);
    for (const loc of f.locations.slice(0, 3)) {
      lines.push(`  L${loc.line}: ${loc.text}`);
    }
  }
  lines.push("", "请修复债务或补充 justification（issue/ticket 或 -- 原因:）。");
  return lines.join("\n");
}
