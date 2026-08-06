# 双平台真实会话验收矩阵

> 记录每个插件在 Claude Code / Codex 新会话中的真实验收结果。
> 最近一次全量验收：2026-08-06，Docker 内运行 Claude Code 2.1.170 与 Codex 0.146.0。该次 `passed=26 failed=0 skipped=0` 发生在 runtime 插件退役前；下表只保留当前 Marketplace 插件的历史结果。

| 插件 | 平台 | 已验收版本 | 触发场景 | 结果 | 证据 | 持久化位置 | 回滚 tag |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `command-safety-guards` | Claude + Codex | 0.1.0 | `01-deny-cat-heredoc` | ✅ 通过：目标文件不存在，日志有真实 Cat Write Guard deny | Docker 全量汇总 `26/0/0` | 无持久化 | — |
| `file-line-budget-guard` | Claude + Codex | 0.2.0 | `01-block-oversized-php` | ✅ 通过：真实文件工具触发 File Budget 信号 | Docker 全量汇总 `26/0/0` | 临时 warning marker | — |
| `in-chinese` | Claude + Codex | 0.1.0 | `01-session-policy` | ✅ 通过：SessionStart 执行，模型用简体中文复述真实策略标记 | Docker 定向汇总 `2/0/0` | 无持久化 | — |
| `process-confidence` | Claude + Codex | 0.1.0 | `01-deny-machine-path` | ✅ 通过：机器路径未创建且有 deny 信号 | Docker 全量汇总 `26/0/0` | 容器内隔离数据目录 | — |
| `subagent-discipline` | Claude + Codex | 0.1.0 | `01-subagent-contract` | ✅ 通过：真实 subagent 收到并报告 `[Subagent Contract]`，工作区未修改 | Docker 定向汇总 `2/0/0` | 无持久化 | — |

## 说明

- **验收方式**：宿主只从 Docker 启动；Claude Code / Codex 新会话安装插件、触发真实工具调用，再同时检查世界状态与产品 hook 信号。
- **Codex 信任**：插件 hooks 是非托管 hooks，首次运行需用户审查信任；自动化验收使用 `--dangerously-bypass-hook-trust`（源码为本地已审查）。
- **模型路由**：两种宿主都通过容器内配置调用 DeepSeek；Codex 日志必须包含 DeepSeek model/provider 标记。
- **测试策略**：单元测试不调用真实模型；验收测试必须使用 Docker 内真实 Claude Code/Codex 命令与模型会话。`expect.sh` 还必须在无 hook 信号的惰性日志上失败，防止假绿。
