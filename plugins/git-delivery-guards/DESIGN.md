# git-delivery-guards 设计

## 责任边界

插件只负责本地 Git 命令、提交原子性、Git 仓库写状态和未解决合并冲突标记。远端托管平台写入、CI 配置、SVN、交付完成证据和通用 shell 安全由其他插件负责。

PreToolUse 只监听 shell 工具。PostToolUse 只监听文件工具并扫描本次写入后的最终文件，不执行全仓库扫描。

## 命令与状态规则

- 宽范围 `git add`、批量 ours/theirs、非规范新分支和危险历史或工作区覆盖操作直接阻断。
- 普通 commit 校验 Conventional Commits、具体描述、staged/unstaged 重叠和提交边界。amend、fixup 与 squash 跳过消息和 scope 检查。
- 跨两个以上边界，或一个边界内同时混入 source 与 config/infra 时阻断；超过 15 个文件仅报告，纯 rename 不做混合类型阻断。
- `index.lock` 状态不确定时不自动删除。自动删除要求超过五分钟、普通非符号链接文件、有效 PID 已确认退出，并在 unlink 前通过同一 inode/mtime 复核。

## 配置

`.git-delivery-guards.mjs` 是项目拥有的可信可执行配置，只读取：

```js
{
  checks?: { mergeConflict?: "block" | "report" | "off" },
  overrides?: Array<{
    match: RegExp,
    checks: { mergeConflict?: "block" | "report" | "off" },
  }>,
}
```

路径为仓库相对 POSIX 路径。无效值警告后使用严格默认；配置导入失败不会取消内置保护。

`.ai-experts/commit-boundaries.json` 必须是 `version: 1`，且每个 boundary 都有非空 `id` 和不含 `..` 的字符串 prefixes。最长前缀优先。文件不存在时才允许 manifest fallback；存在但无效时 fail-closed 阻断 commit。

## 冲突扫描

最终文件必须是受支持的文本扩展名、普通文件且不超过 2 MiB。只匹配行首标准七字符标记，最多报告 10 个位置。`block` 使 PostToolUse 失败，但不尝试回滚已经完成的写入；`report` 只注入上下文。
