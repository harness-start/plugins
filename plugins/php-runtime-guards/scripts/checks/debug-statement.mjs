/**
 * PHP debug statement guard (PostToolUse).
 *
 * Flags net-new debug statements in PHP files. dd() is a hard-removal
 * category; var_dump/print_r/dump are "remove or replace with logging".
 *
 * Failure mode: fail-open (report — PostToolUse cannot deny on either host;
 * the message keeps the tiered severity wording).
 */

import {
  matchingLines,
  readDebtTextPair,
  shouldScanFile,
} from "../lib/debt-utils.mjs";

const PATTERNS = [
  {
    re: /(?<!->|::)\bdd\s*\(/,
    label: "dd()",
    severity: "deny",
    hint: "dd() 会中断执行，必须移除",
  },
  { re: /\bvar_dump\s*\(/, label: "var_dump()", hint: "使用 Monolog 等日志框架或移除" },
  { re: /\bprint_r\s*\(/, label: "print_r()", hint: "使用日志框架或移除" },
  { re: /\bdump\s*\(/, label: "dump()", hint: "Symfony dump() 仅用于开发，请移除" },
];

export function collectDebugFindings(toolInput, filePath) {
  if (!shouldScanFile(filePath, { extensions: [".php"] })) return undefined;
  const pair = readDebtTextPair(toolInput, filePath);
  if (!pair) return [];

  const findings = PATTERNS.flatMap((pattern) => {
    const newLocations = matchingLines(pair.newText, pattern.re);
    const baselineCount = matchingLines(pair.baselineText, pattern.re).length;
    const count = newLocations.length - baselineCount;
    return count > 0 ? [{ ...pattern, count, locations: newLocations.slice(-count) }] : [];
  });
  if (findings.length === 0) return undefined;

  return {
    filePath,
    findings,
    total: findings.reduce((sum, finding) => sum + finding.count, 0),
    denied: findings.some((finding) => finding.severity === "deny"),
  };
}

export function formatDebugReport(summary) {
  const details = summary.findings.flatMap((finding) =>
    finding.locations.map((line) => `  行 ${line}: ${finding.label} → ${finding.hint}`),
  );
  const shown = details.slice(0, 10);
  const total = details.length;
  const suffix = total > shown.length ? `\n  … 共 ${total} 处` : "";

  return [
    `[Debug Statement] ${summary.filePath} 新增了 ${summary.total} 处调试语句（${summary.denied ? "包含必须移除的调试断点" : "包含可能遗留的调试语句"}）：`,
    "",
    shown.join("\n") + suffix,
    "",
    summary.denied
      ? "Tier 1 调试工具（dd() 等）绝不应出现在提交代码中，请移除后继续。"
      : "建议在提交前移除调试输出，或替换为正式的日志框架。如果是有意保留的日志，请忽略此提醒。",
  ].join("\n");
}
