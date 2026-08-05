/**
 * PHP protected paths guard (PreToolUse).
 *
 * Blocks writes into Composer-generated and test-cache paths. These files are
 * machine-owned; editing them corrupts authoritative state.
 *
 * Failure mode: fail-closed (deny) with a blocking contract.
 */

const PROTECTED_PATTERNS = [
  [/\/vendor\/[^/]+\/[^/]+\//, "vendor/ 下的第三方 Composer 包不应手动修改"],
  [/\/vendor\/autoload\.php$/, "vendor/autoload.php 由 Composer 自动生成，不应手动修改"],
  [/\/vendor\/composer\//, "vendor/composer/ 由 Composer 自动生成，不应手动修改"],
  [/\/\.phpunit\.result\.cache$/, ".phpunit.result.cache 是测试缓存，自动生成"],
];

const RECOVERY =
  "如需修改第三方依赖，请通过包管理器（composer）或 patch 文件处理。";

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
    `[Protected Path] 禁止修改 ${filePath}`,
    `原因：${reason}`,
    "",
    RECOVERY,
    "",
    "blockingContract:",
    "  observedFacts: 写入目标命中受保护路径模式（Composer 生成文件或测试缓存）。",
    "  harm: 写入受保护的生成、vendor 或缓存路径会破坏权威状态。",
    "  unblockWhen: 提议的写入目标为允许的源码路径，且不命中任何受保护模式。",
    `  recovery: ${RECOVERY}`,
  ].join("\n");
}
