# Kubernetes 运维插件

> **Private AIO module.** This directory is not independently installable or published. Host manifests, Hook registration, and MCP exposure belong to the `workspace-integrity` owner. This module retains only its implementation, bundled methods and assets, tests, and acceptance material.

`kubernetes-operations` 面向 Kubernetes manifest、Helm Chart、部署诊断与有状态工作负载操作。Skill 负责开放式运维方法，Hook 保护 Helm 生成产物并执行范围有界的配置检查。

## 目标

- 基于当前 kubeconfig、命名空间、Chart 和项目约定规划与执行运维任务。
- 防止直接编辑 Helm 生成的 `Chart.lock` 与 `charts/` 依赖目录。
- 在 manifest 写入后提供 JSON、`kubectl` dry-run 和 `helm lint` 的早期反馈。
- 明确 Hook 不能证明集群已更新、工作负载健康、回滚可用或数据安全。

## 实现

插件捆绑 `kubernetes-operations` 主入口与 `kubernetes-operations-playbook`。两个宿主分别注册 `PreToolUse` 和 `PostToolUse`，实际调用同一份插件内运行时。

| 检查 | 默认模式 | 说明 |
| --- | --- | --- |
| `Chart.lock`、`charts/` 写入保护 | 阻断 | 要求修改 `Chart.yaml` 后使用 Helm 依赖命令重新生成。 |
| `kubernetesDryRun` | `report` | 对同时含 `apiVersion` 与 `kind` 的 YAML 执行有界 `kubectl` 检查。 |
| `helmLint` | `report` | 修改 `Chart.yaml` 后运行有界 Helm 检查。 |
| `kubernetesJson` | `block` | 校验本次修改的 JSON 结构。 |

工具缺失时默认只报告一次，不会把“未运行”描述为通过。

## 配置

在 Git 根目录创建 `.kubernetes-operations.mjs`：

```js
export default {
  checks: {
    kubernetesDryRun: "report",
    helmLint: "report",
    kubernetesJson: "block",
  },
  limits: { maxFiles: 12, timeoutMs: 10000 },
  missingTools: "report-once",
};
```

检查模式支持 `block`、`report`、`off`。生产集群变更仍需遵循用户授权、预检、备份与回滚要求。

## 使用与验证

安装后调用 `$kubernetes-operations` 或 `/kubernetes-operations`。完成前应复核实际集群上下文，并运行项目要求的 render、diff、dry-run、lint 与 rollout 验证。

```bash
npx tsx --test plugins/kubernetes-operations/tests/*.test.ts
./scripts/acceptance/run.sh --plugin kubernetes-operations
```

live acceptance 只在 `docker/host-acceptance` 中运行。版本：`0.1.0`。
