# 跨仓库历史迁移

> **Private AIO module.** This directory is not independently installable or published. Host manifests, Hook registration, and MCP exposure belong to the `delivery-governance` owner. This module retains only its implementation, bundled methods and assets, tests, and acceptance material.

`repository-history-migration` 在源仓只读、计划摘要绑定和目标验证约束下，将指定路径及其 Git 历史迁移到一个新的本地仓库。插件提供一个公开 Skill 和两个确定性 CLI，不负责远端仓库生命周期。

## 目标

- 在不修改 source refs、worktree 和原始提交对象的前提下迁移历史。
- 把源 HEAD、包含路径、目标边界、过滤器版本和计划摘要绑定到执行请求，防止预检后条件漂移。
- 只在目标同父目录的临时 clone 中过滤，并在成功后原子发布目标目录。
- 对破坏性 Git 命令设置窄门禁，同时保留清晰的失败恢复路径。

## 实现

`repository-history-migration` Skill 组织需求确认、只读预检、执行和独立核验。`git-history-migration-preflight.mjs` 校验 source、ref、include paths、解析 symlink 后的 target 边界、干净 worktree 和 `git-filter-repo` 依赖，返回 `sourceHead`、过滤器版本、`planDigest` 与命中提交数。

`git-history-migration-execute.mjs` 重跑相同预检；HEAD、计划摘要或目标存在性变化都会拒绝。过滤只发生在目标父目录下的唯一临时 clone 中，只保留请求的本地分支；失败时只清理该临时目录，成功时才原子发布为目标仓库。

`PreToolUse` 拒绝 agent 直接对源仓运行 `git filter-repo`、`git reset --hard` 和 force-push。真正的过滤只能通过登记的 execute CLI。Hook 是宿主可观察工具边界，不是操作系统沙箱。

## 适用条件与非目标

当前只支持：

- 干净的本地 source worktree；
- 尚不存在的本地 target path；
- 安装了 `git-filter-repo` 的环境；
- 明确列出的 include paths 与本地分支。

插件不会创建远端仓库、push、归档或删除源/目标仓库，也不会自动处理跨平台账号、权限和默认分支策略。

## 使用与验证

完整参数与安全步骤见 [`skills/repository-history-migration/SKILL.md`](skills/repository-history-migration/SKILL.md)。执行后必须独立核对 source HEAD/worktree 未变、target 内容只含声明路径、目标分支与 remote 正确，并抽查代表性提交历史。

```bash
npx tsx --test plugins/repository-history-migration/tests/*.test.ts
./scripts/acceptance/run.sh --plugin repository-history-migration
```

live acceptance 由脚本进入 `docker/host-acceptance`。版本：`0.3.0`。
