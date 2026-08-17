# Cross-repo history migration

`repository-history-migration` 提供一个公开 Skill 和两个确定性 CLI：先只读预检并密封 source head 与计划摘要，再在目标父目录的临时 clone 中执行过滤，最后原子发布为新的本地 Git 仓库。

插件只支持干净的本地 source worktree 和尚不存在的 target path。它不会修改 source refs/worktree，不会创建远端仓库、push、归档或删除仓库。PreToolUse 拒绝 agent 直接对源仓运行 `git filter-repo`、`git reset --hard` 和 force-push；真正的过滤只允许通过插件 `dist/cli/git-history-migration-execute.mjs`。执行依赖 `git-filter-repo`。

## 安全模型

- `preflight` 校验 source、ref、include paths、解析父目录 symlink 后的 target 边界及依赖，返回 `sourceHead`、过滤器版本、`planDigest` 和命中提交数。
- `execute` 重跑相同预检；head 或 digest 改变即拒绝，并在发布前保持 target 不存在。
- 历史过滤只发生在 target 同父目录的唯一临时 clone 中；只保留请求的本地分支，失败时仅删除该临时目录。
- 成功后仍需独立核对 source 不变、target 内容边界、branch、remote、worktree 与代表性提交。

完整用法见 [`skills/repository-history-migration/SKILL.md`](skills/repository-history-migration/SKILL.md)。
