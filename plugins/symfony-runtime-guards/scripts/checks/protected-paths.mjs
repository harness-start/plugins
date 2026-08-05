/**
 * Symfony protected paths guard (PreToolUse).
 *
 * Blocks writes into Symfony Flex / runtime / build generated paths. These
 * files are machine-owned; editing them corrupts authoritative state.
 *
 * Failure mode: fail-closed (deny) with a blocking contract.
 */

const PROTECTED_PATTERNS = [
  [/\/symfony\.lock$/, "symfony.lock 由 Symfony Flex 自动生成，不应手动编辑"],
  [/\/var\/cache\//, "var/cache/ 是 Symfony 运行时缓存，自动生成"],
  [/\/var\/log\//, "var/log/ 是日志目录，不应手动编辑"],
  [/\/public\/build\//, "public/build/ 是 Webpack Encore 编译产物，应通过 npm run build 生成"],
  [/\/public\/bundles\//, "public/bundles/ 由 assets:install 命令生成，不应手动修改"],
  [/\/migrations\/Version\d+\.php$/, "已存在的迁移文件不可修改，只能新建迁移"],
];

const RECOVERY =
  "如需修改第三方依赖，请通过包管理器（composer/npm）或 patch 文件处理。";

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
    `[Symfony Protected Path] 禁止修改 ${filePath}`,
    `原因：${reason}`,
    "",
    RECOVERY,
    "",
    "blockingContract:",
    "  observedFacts: 写入目标命中 Symfony 受保护路径模式（Flex 生成、运行时缓存、编译产物或既有迁移）。",
    "  harm: 写入受保护的生成、缓存或迁移路径会破坏权威状态，导致依赖解析或部署不可复现。",
    "  unblockWhen: 提议的写入目标为允许的源码路径，且不命中任何受保护模式。",
    `  recovery: ${RECOVERY}`,
  ].join("\n");
}
