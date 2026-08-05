/**
 * ThinkPHP protected paths guard (PreToolUse).
 *
 * Blocks writes into ThinkPHP runtime directories (modern `runtime/` and
 * legacy `Application/Runtime/`). These files are machine-owned.
 *
 * Failure mode: fail-closed (deny) with a blocking contract.
 */

const PROTECTED_PATTERNS = [
  [/\/runtime\//, "runtime/ 是 ThinkPHP 运行时缓存与日志目录，自动生成"],
  [/\/Application\/Runtime\//, "Application/Runtime/ 是 legacy ThinkPHP 运行时目录，自动生成"],
];

const RECOVERY =
  "如需清理或变更，请通过应用命令或删除整个运行时目录让框架重建；不要手动编辑其中的文件。";

/** Returns a deny reason string for a protected target, or null when allowed. */
export function protectedPathViolation(filePath) {
  if (typeof filePath !== "string" || !filePath) return null;
  const normalized = filePath.replaceAll("\\", "/");
  for (const [pattern, reason] of PROTECTED_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(normalized)) return reason;
  }
  return null;
}

export function protectedPathDenyMessage(filePath, reason) {
  return [
    `[ThinkPHP Protected Path] 禁止修改 ${filePath}`,
    `原因：${reason}`,
    "",
    RECOVERY,
    "",
    "blockingContract:",
    "  observedFacts: 写入目标命中 ThinkPHP 受保护路径模式（runtime 缓存/日志）。",
    "  harm: 手动写入运行时文件会破坏缓存一致性，导致难以诊断的运行时故障。",
    "  unblockWhen: 提议的写入目标为允许的源码路径，且不命中任何受保护模式。",
    `  recovery: ${RECOVERY}`,
  ].join("\n");
}
