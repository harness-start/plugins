# 工程实践

`engineering-practice` 在 Claude Code 和 Codex 的 `SessionStart` 注入轻量路由提示：仅在匹配的实现、只读审查或完成前验证场景加载本插件方法 Skill，再开始实质工作。

| 场景 | Skill |
|---|---|
| 非简单的代码实现或重构 | `engineering-judgment` |
| 只读代码审查 | `engineering-review` |
| 准备声明完成、修复或通过 | `engineering-verification` |

只加载当前任务需要的方法。内容润色、语气和文风不属于本插件职责。用户指令、项目指令、安全规则和平台规则优先。

## 边界

SessionStart 只负责工程方法编排，不处理专业写作，也不提供硬门禁。Hooks 的硬约束独立运行，不能把上下文注入、Skill 加载或额外模型轮次当成结果有效的证明。本插件不创建状态目录。

## 来源

- `engineering-judgment`：改编自 MIT `karpathy-guidelines`，见 `licenses/karpathy-guidelines/`
- `engineering-verification`：改编自 MIT Superpowers，见 `licenses/obra-superpowers/`
- `engineering-review`：本项目第一方只读审查方法
