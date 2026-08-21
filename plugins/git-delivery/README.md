# git-delivery

`git-delivery` 在 Claude Code 和 Codex 里管本地 Git 交付：拦住宽范围暂存、破坏性命令、无效分支名、含糊的提交信息、跨边界提交和批量冲突选择，并报告 partial staging、大提交，以及可以安全清掉的陈旧 Git 锁。

插件还在文件工具写入后读取最终文件，阻断仍含标准合并冲突标记的文本文件。GitHub、GitLab、CI、SVN 和远端交付闭环不属于本插件。

## 默认行为

命令规则默认严格启用。普通解析错误 fail-open；明确命中规则时返回可恢复的阻断契约。创建 linked worktree 默认拒绝。`index.lock` 只有在超过五分钟、记录了有效 PID、PID 已确认退出且锁文件在删除前未被替换时才会自动清理。

冲突标记检查默认 `block`，只匹配行首的 `<<<<<<<`、`=======`、`>>>>>>>`，跳过依赖、生成、缓存和构建目录，并且不读取超过 2 MiB 的文件。

## 项目配置

在 Git 根目录创建 `.git-delivery.mjs`：

```js
export default {
  checks: {
    mergeConflict: "block",
    worktreeCreate: "block",
  },
  overrides: [
    {
      match: /^fixtures\/legacy\//,
      checks: { mergeConflict: "report" },
    },
  ],
};
```

`mergeConflict` 可以是 `block`、`report` 或 `off`。`worktreeCreate` 可以是 `block`、`report` 或 `allow`。路径 override 只作用于 `mergeConflict`；同一检查使用第一个声明该检查的路径 override。

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

本插件只读取自己的 `.git-delivery.mjs`，不读取或转换其他插件的配置。

也可以使用插件自带的 `git-delivery-config` Skill 维护配置。

## 命令、状态与提交边界

`PreToolUse` 监听 shell 工具，以及可观察 `isolation` 参数的 Task / Agent 工具；`PostToolUse` 只监听文件工具，并扫描本次写入后的最终文件，不执行全仓库扫描。`UserPromptSubmit` 只把「明确要求隔离工作区」记成 session 回执，不保存 prompt 正文。

- 宽范围 `git add`、批量 ours/theirs、非规范新分支，以及危险的历史或工作区覆盖操作会直接阻断。
- `git worktree add` 和可观察的宿主 `isolation: worktree` 默认阻断。只有本会话用户明确要求隔离工作区，或 `.git-delivery.mjs` 将 `worktreeCreate` 设为 `allow` 时才放行。用户意图回执只能由捆绑的 UserPromptSubmit Hook 写入 `.git-delivery/state/`，PreToolUse 会阻断 agent 对该授权状态的直接文件访问和显式 shell 路径访问。`git worktree list` / `remove` / `prune` 不在此列。
- 普通 commit 校验 Conventional Commits、具体描述、staged/unstaged 重叠和提交边界；amend、fixup 与 squash 跳过消息和 scope 检查。
- 跨两个以上边界，或在一个边界内混入 source 与 config/infra 时阻断；超过 15 个文件只报告；纯 rename 不触发混合类型阻断。
- `index.lock` 状态不确定时不会自动删除。只有锁超过五分钟、是普通非符号链接文件、包含有效且已确认退出的 PID，并在 unlink 前通过相同 inode/mtime 复核，才会清理。

默认留在当前 checkout，用普通短分支。用户只说「审另一条分支、别动我现在的改动」不会被推断成必须创建 worktree。宿主如果在 Hook 看不到的内部路径创建 worktree，本插件拦不到；Grok 原生 `spawn_subagent` 也不在 Hook 面里。

`.git-delivery.mjs` 是项目拥有的可信可执行配置。路径统一为仓库相对 POSIX 路径；非法字段警告后使用严格默认，导入失败不会取消内置保护。

`.ai-experts/commit-boundaries.json` 必须使用 `version: 1`，每个 boundary 都要有非空 `id` 和不含 `..` 的字符串 prefixes，并按最长前缀优先。只有文件不存在时才允许从 manifest 推导；文件存在但无效时，commit fail-closed。

## 冲突标记扫描

只扫描受支持的文本扩展名、普通文件和不超过 2 MiB 的最终文件。检查器只匹配行首七字符标准标记，并要求至少存在一个高特异性的 `<<<<<<<` 或 `>>>>>>>`；单独的 `=======` 可能是 RST 表格边框，不视为冲突。最多报告 10 个位置。

`block` 会让 `PostToolUse` 失败，但不会回滚已经完成的写入；`report` 只注入上下文。

## 验证

```bash
npx tsx --test plugins/git-delivery/tests/*.test.ts
./scripts/acceptance/run.sh --plugin git-delivery
```

版本：`0.4.0`
