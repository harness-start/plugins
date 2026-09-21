# delivery-governance

`delivery-governance` 覆盖从已改工作树到安全交付结果的过渡。它治理 Git 改写边界、显式的 CI 门控合并请求交付、保留历史的仓库抽取，以及 Kubernetes 运维工作。

## 用途

交付失败发生在普通代码生成并不拥有的边界上：意外的大范围暂存、未解决的冲突标记、未经批准的 worktree、过期的 CI 证据、force-push 历史，或拆仓时丢失提交。本插件按交付结果而不是按编程语言分组这些职责。

## 设计

`src/domains/` 下有三个运行时域：`git`、`ci` 和 `history`。`git` 拥有始终相关的仓库改写检查。`ci` 拥有显式调用的合并请求状态机和远端证据要求。`history` 拥有密封的预检/执行协议：源仓库保持不变，同时创建过滤后的目标。三者共享 owner 的 Hook、CLI、Skill、测试、验收、license 和构建边界。

Kubernetes 运维方法作为公开 Skill 捆绑，因为它们属于部署与交付；相关的改写完整性 Hook 仍在 `workspace-integrity`。安装本 owner 即为 Claude Code 与 Codex 启用其全部表面，没有能力 profile。

## 能力

| 范围 | 模块或 Skill | 能力 |
| --- | --- | --- |
| Git 安全 | `git` | 拒绝危险的批量 pathspec、主动创建的 worktree、受保护回执写入、不安全的冲突标记状态，以及无效提交边界 |
| CI 门控交付 | `ci` | 显式的评审/CI/默认分支监督，要求当前 head 证据，以及绑定 SHA 的 merge/push 授权 |
| 历史迁移 | `history` | 预检密封、选定路径过滤、源不可变检查、目标隔离、核验和恢复回执 |
| Kubernetes 交付 | `kubernetes-operations`、`kubernetes-operations-playbook` | Manifest/Helm 运维方法、工作负载加固、滚动诊断、资源和 API 漂移指引 |

配置与编排 Skill 包括 `git-delivery-config`、`ci-gated-mr-workflow` 和 `repository-history-migration`。

## 适用场景

准备提交、处理合并边界、创建明确请求的 worktree、监督合并请求走过评审和 CI、把选定路径连同历史抽到新仓库，或设计/评审 Kubernetes 交付变更时使用。远端状态、分支身份或历史保全属于验收条件时最有价值。

## 不适用场景

不要为每次普通代码改动调用 CI 工作流；它刻意只在显式请求时启用。不要把历史迁移用于普通文件拷贝、同一仓库内移动，或故意丢弃历史的导入。不要把 Kubernetes 指引当成现场集群健康的证明。源码正确性和测试先行开发属于 `engineering-workflow`。

## 运行时行为

`PreToolUse` 在 Git、CI 和迁移命令运行前分类它们。`UserPromptSubmit` 为 Git 模块记录显式的 worktree 意图。`PostToolUse` 检查可观察的仓库结果，例如冲突状态和交付回执。远端交付动作要求绑定当前 head 的证据，而不是文本里碰巧出现一个像样的 SHA。

历史迁移使用两阶段协议：预检记录干净的源 head、计划 digest、过滤器版本、包含路径和隔离目标；执行在创建目标前拒绝过期封印。临时过滤失败时源仓库不变，只删除本次操作自己的临时 clone。

## 公开接口

公开确定性 CLI 是：

```bash
node "${PLUGIN_ROOT}/dist/cli/harness.mjs" migration preflight [arguments]
node "${PLUGIN_ROOT}/dist/cli/harness.mjs" migration execute [arguments]
```

`migration` 是唯一公开 CLI 资源。Git、CI 和 Kubernetes 的开放工作通过上面列出的捆绑 Skill 进入。没有公开 MCP 服务器。

## 配置与状态

Git 交付规则可通过 `git-delivery-config` 配置 `.git-delivery.mjs` 和 `commit-boundaries.json`。提交边界只约束独立提交；当 Git 通过 `MERGE_HEAD`、`CHERRY_PICK_HEAD`、`REVERT_HEAD` 或 `REBASE_HEAD` 标记 continuation 时，范围检查静默跳过，其他 Git 安全检查仍然生效。CI 工作流状态在仓库本地，把观察到的远端证据绑定到当前修订。迁移计划和封印是显式输入/输出产物，不是隐式全局状态。本插件从不安装或登录 GitHub、GitLab 或 Kubernetes 的宿主凭据。

## 边界

Hook 观察宿主可见的命令和仓库状态；它们不授予远端权限、不批准合并，也不保证部署成功。head 变化后 CI 证据会过期。历史回执证明实际执行的过滤输入和结果，不是把目标公开发布的组织批准。Kubernetes 建议仍需要集群特定授权、dry-run 和滚动观察。

## 验证

```bash
node --import tsx --test \
  plugins/delivery-governance/tests/*.test.ts \
  plugins/delivery-governance/tests/domains/**/*.test.ts
npm run check:dist
```

实时验收必须使用 `./scripts/acceptance/run.sh --plugin delivery-governance`，使两个宿主都在规定的 Docker 环境内执行。
