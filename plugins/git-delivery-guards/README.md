# git-delivery-guards

`git-delivery-guards` 在 Claude Code 和 Codex 中统一保护本地 Git 交付：阻止宽范围暂存、破坏性命令、无效分支名、模糊提交信息、跨边界提交和批量冲突选择，并报告 partial staging、大提交与安全清理的陈旧 Git 锁。

插件还在文件工具写入后读取最终文件，阻断仍含标准合并冲突标记的文本文件。GitHub、GitLab、CI、SVN 和远端交付闭环不属于本插件。

## 默认行为

命令规则默认严格启用。普通解析错误 fail-open；明确命中规则时返回可恢复的阻断契约。`index.lock` 只有在超过五分钟、记录了有效 PID、PID 已确认退出且锁文件在删除前未被替换时才会自动清理。

冲突标记检查默认 `block`，只匹配行首的 `<<<<<<<`、`=======`、`>>>>>>>`，跳过依赖、生成、缓存和构建目录，并且不读取超过 2 MiB 的文件。

## 项目配置

在 Git 根目录创建 `.git-delivery-guards.mjs`：

```js
export default {
  checks: {
    mergeConflict: "block",
  },
  overrides: [
    {
      match: /^fixtures\/legacy\//,
      checks: { mergeConflict: "report" },
    },
  ],
};
```

模式可以是 `block`、`report` 或 `off`。同一检查使用第一个声明该检查的路径 override。

提交边界使用 `.ai-experts/commit-boundaries.json`：

```json
{
  "version": 1,
  "boundaries": [
    { "id": "frontend", "prefixes": ["apps/web"] },
    { "id": "backend", "prefixes": ["apps/api"] }
  ]
}
```

未声明时按最近的项目 manifest 推导边界。配置存在但无效时，相关 commit 会被阻断并要求修复配置。

从 `source-sanity-guard@0.1.0` 升级时，将 `.source-sanity-guard.mjs` 中的 `mergeConflict` 模式和对应 override 原样移入 `.git-delivery-guards.mjs`；旧插件不再读取该字段。

也可以使用插件自带的 `git-delivery-guards-config` Skill 维护配置。

## 命令、状态与提交边界

`PreToolUse` 只监听 shell 工具；`PostToolUse` 只监听文件工具，并扫描本次写入后的最终文件，不执行全仓库扫描。

- 宽范围 `git add`、批量 ours/theirs、非规范新分支，以及危险的历史或工作区覆盖操作会直接阻断。
- 普通 commit 校验 Conventional Commits、具体描述、staged/unstaged 重叠和提交边界；amend、fixup 与 squash 跳过消息和 scope 检查。
- 跨两个以上边界，或在一个边界内混入 source 与 config/infra 时阻断；超过 15 个文件只报告；纯 rename 不触发混合类型阻断。
- `index.lock` 状态不确定时不会自动删除。只有锁超过五分钟、是普通非符号链接文件、包含有效且已确认退出的 PID，并在 unlink 前通过相同 inode/mtime 复核，才会清理。

`.git-delivery-guards.mjs` 是项目拥有的可信可执行配置。路径统一为仓库相对 POSIX 路径；非法字段警告后使用严格默认，导入失败不会取消内置保护。

`.ai-experts/commit-boundaries.json` 必须使用 `version: 1`，每个 boundary 都要有非空 `id` 和不含 `..` 的字符串 prefixes，并按最长前缀优先。只有文件不存在时才允许从 manifest 推导；文件存在但无效时，commit fail-closed。

## 冲突标记扫描

只扫描受支持的文本扩展名、普通文件和不超过 2 MiB 的最终文件。检查器只匹配行首七字符标准标记，并要求至少存在一个高特异性的 `<<<<<<<` 或 `>>>>>>>`；单独的 `=======` 可能是 RST 表格边框，不视为冲突。最多报告 10 个位置。

`block` 会让 `PostToolUse` 失败，但不会回滚已经完成的写入；`report` 只注入上下文。

## 验证

```bash
node --test plugins/git-delivery-guards/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin git-delivery-guards
```

版本：`0.2.1`
