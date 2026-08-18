# 工程实践

`engineering-practice` 在 Claude Code 和 Codex 的 `SessionStart` 注入轻量方法提示。Skill 是可选的方法指南，不是 Hook 前提，也不能作为结果或完成证据；任务可以直接执行。

| 场景 | Skill |
|---|---|
| 非简单的代码实现或重构 | `engineering-judgment` |
| 只读代码审查 | `engineering-review` |
| 准备声明完成、修复或通过 | `engineering-verification` |

只在方法确实有帮助时使用当前任务需要的 Skill。内容润色、语气和文风不属于本插件职责。用户指令、项目指令、安全规则和平台规则优先。

## 边界

SessionStart 只提供工程方法提示，不处理专业写作，也不提供硬门禁。实现效果来自工作区变更和公开行为验证；完成声明需要当前任务周期内的新鲜命令证据。Hooks 的硬约束独立运行，不能把上下文注入、Skill 加载或额外模型轮次当成结果有效的证明。本插件不创建状态目录。

方法可选不代表结果契约可选：只读审查的每条 finding 仍须包含 `P0`–`P3` 严重级别、精确 `file:line`、具体证据，以及可验证的修复或恢复路径。

## 来源

- `engineering-judgment`：改编自 MIT `karpathy-guidelines`，见 `licenses/karpathy-guidelines/`
- `engineering-verification`：改编自 MIT Superpowers，见 `licenses/obra-superpowers/`
- `engineering-review`：本项目第一方只读审查方法
