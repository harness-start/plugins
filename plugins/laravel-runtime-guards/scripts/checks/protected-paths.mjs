/**
 * Laravel protected paths guard (PreToolUse).
 *
 * Blocks writes into Laravel generated / runtime / build paths. These files
 * are machine-owned; editing them corrupts authoritative state.
 *
 * Failure mode: fail-closed (deny) with a blocking contract.
 */

const PROTECTED_PATTERNS = [
  [/\/bootstrap\/cache\/.*\.php$/, "bootstrap/cache/ 是 Laravel 编译缓存（config/routes/packages/events/services），由 php artisan 生成"],
  [/\/storage\/framework\/cache\//, "storage/framework/cache/ 是框架缓存，自动生成"],
  [/\/storage\/framework\/views\//, "storage/framework/views/ 是编译后的 Blade 视图，自动生成"],
  [/\/storage\/logs\//, "storage/logs/ 是日志目录，不应手动编辑"],
  [/\/public\/build\//, "public/build/ 是 Vite 编译产物，应通过 npm run build 生成"],
  [/\/database\/migrations\/\d{4}_\d{2}_\d{2}_\d{6}_[^/]+\.php$/, "已存在的迁移文件不可修改，只能新建迁移（php artisan make:migration）"],
];

const RECOVERY =
  "如需变更，请通过框架命令（php artisan / npm run build）或新建迁移文件处理；确需编辑时请用户显式确认。";

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
    `[Laravel Protected Path] 禁止修改 ${filePath}`,
    `原因：${reason}`,
    "",
    RECOVERY,
    "",
    "blockingContract:",
    "  observedFacts: 写入目标命中 Laravel 受保护路径模式（编译缓存、运行时缓存、编译视图、日志、构建产物或既有迁移）。",
    "  harm: 写入受保护的生成、缓存或迁移路径会破坏权威状态，导致缓存不一致或部署不可复现。",
    "  unblockWhen: 提议的写入目标为允许的源码路径，且不命中任何受保护模式。",
    `  recovery: ${RECOVERY}`,
  ].join("\n");
}
