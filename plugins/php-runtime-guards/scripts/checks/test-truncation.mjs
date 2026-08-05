/**
 * PHP test output truncation guard (PreToolUse — Bash).
 *
 * Truncating phpunit/phpstan/pest/psalm output with `| tail/head -N` (N > 1)
 * hides key error lines and drives blind-guess fix loops.
 *
 * Failure mode: fail-open (report).
 */

const HEAVY_COMMANDS = ["phpunit", "phpstan", "pest", "psalm"];
const HEAVY_RE = new RegExp(`\\b(?:${HEAVY_COMMANDS.join("|")})\\b`);

// | tail -N / | head -N at the end; `| tail -1` is a legitimate single-line
// summary and stays allowed.
const TRUNCATION_RE = /\|\s*(?:tail|head)\s+-(?:n\s*)?(\d+)\s*$/;

/** Returns the truncation line count when the command is flagged, else null. */
export function truncationHit(command) {
  if (typeof command !== "string" || !command) return null;
  if (!HEAVY_RE.test(command)) return null;

  const match = command.match(TRUNCATION_RE);
  if (!match) return null;

  const lines = Number.parseInt(match[1] ?? "", 10);
  if (lines === 1) return null;
  return lines;
}

export function truncationReportMessage(lines) {
  return [
    `[Test Truncation] 测试/编译输出被 | tail/head -${lines} 截断`,
    "",
    "截断输出会丢失关键错误信息，导致盲猜修复循环。建议：",
    "  • 直接查看完整输出（大多数测试输出 < 200 行）",
    "  • 如输出过长，先 tee /tmp/test-output.log 保存，再按需 grep",
    "  • 用 grep -E 'FAIL|ERROR|error\\[' 精确过滤关键信息",
  ].join("\n");
}
