# 工程实践方法

`engineering-practice` 为 Claude Code 和 Codex 提供实现判断、高风险检查点、只读代码审查和完成前验证方法。它使用短小、无状态、fail-open 的软路由，不创建业务账本，也不把 Skill 加载或多一次模型回合当作完成证据。

## 目标

- 让非平凡实现先识别约束、变更面、失败模式和最小验证路径。
- 在安全、持久化、迁移、并发、数据完整性、部署、恢复等高风险工作中提供独立检查点。
- 让代码审查结果包含严重级别、精确 `file:line`、具体证据和可复验的修复或恢复路径。
- 在声称完成前要求新鲜、与目标结果直接相关的验证证据。

具体软件故障的复现与修复循环不属于本插件，由 `software-debugging` 负责。

## 实现

插件注册 `SessionStart` 与 `UserPromptSubmit`：前者注入简短方法概览，后者只对明确匹配的任务建议一个合适的捆绑 Skill。路由不保存 prompt，输入无关或解析失败时保持静默。

| 场景 | 捆绑 Skill | 作用 |
| --- | --- | --- |
| 非平凡实现或重构 | `engineering-judgment` | 识别约束、最小设计和验证面。 |
| 高风险实现检查点 | `engineering-review-checkpoint` | 调用至多一个宿主原生只读 reviewer，并选择一个专业视角。 |
| 只读代码审查 | `engineering-review` | 输出有锚点、证据和恢复路径的 finding。 |
| 完成前验证 | `engineering-verification` | 将完成声明绑定到最新结果级验证。 |
| 方法总入口 | `engineering-practice` | 根据任务选择上述窄方法。 |

高风险 reviewer 的视角按 `breaker`、`operator`、`maintainer` 的优先顺序选择一个。父 agent 必须重新打开 reviewer 提供的每个锚点并自行裁决；没有 subagent 能力时可由父 agent 做带标签的回退审查，但不得称其为独立审查。

## 使用与边界

自动路由只是建议，用户也可显式调用 `$engineering-practice`、`$engineering-review` 等 Codex Skill，或使用 Claude Code 对应的 `/...` 入口。用户指令、项目规则和安全规则始终优先。

插件没有 `PreToolUse`、`PostToolUse` 或 `Stop` 完成门禁，不修改项目文件，也不保存会话状态。真正的完成证据来自产物、测试、构建、运行结果或其他与目标直接相关的独立验证。

## 来源与验证

`engineering-judgment` 参考 MIT 许可的 `karpathy-guidelines`，`engineering-verification` 参考 MIT 许可的 Superpowers，归因文件位于 `licenses/`；`engineering-review` 为第一方方法。

```bash
npx tsx --test plugins/engineering-practice/tests/*.test.ts
./scripts/acceptance/run.sh --plugin engineering-practice
```

live acceptance 由脚本进入 `docker/host-acceptance`。版本：`2.1.0`。
