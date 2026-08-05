/**
 * TypeScript debt guard (PostToolUse report).
 * Failure mode: fail-open (report — PostToolUse cannot deny).
 */

import { readDebtTextPair, shouldScanFile } from "../lib/debt-utils.mjs";

const PATTERNS = [
  {
    label: "wide any type",
    re: /\b(?:Promise|Record|Map|Set|Array)<[^>\n]*\bany\b|:\s*any\b|\bany\[\]/u,
    hint: "改用 unknown、泛型约束、schema parser 或边界类型",
  },
  {
    label: "as any assertion",
    re: /\bas\s+any\b/u,
    hint: "改用 unknown + 类型守卫；确需时同行写 justification",
  },
  {
    label: "double assertion",
    re: /\bas\s+unknown\s+as\b|\bas\s+never\b/u,
    hint: "修复上游类型合同，必要时用类型守卫收口",
  },
  {
    label: "empty catch",
    re: /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/u,
    hint: "记录、转换或显式说明为什么可以忽略异常",
  },
  {
    label: "eslint-disable without reason",
    re: /\beslint-disable(?:-next-line|-line)?\b/u,
    hint: "修复违规；确需禁用时用 -- 或 : 写明理由",
  },
  {
    label: "@ts-ignore/@ts-expect-error without reason",
    re: /@ts-(?:ignore|expect-error|nocheck)\b/u,
    hint: "写明 justification；优先修复类型",
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
  if (!shouldScanFile(filePath, { extensions: [".ts",".tsx",".mts",".cts",".js",".jsx",".mjs",".cjs"] })) return [];
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
    `[TypeScript Debt Guard] 检测到净新增债务信号：${filePath}`,
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
