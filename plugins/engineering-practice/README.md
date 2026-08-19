# 工程实践

`engineering-practice` 在 Claude Code 和 Codex 的 `SessionStart` 注入轻量方法提示，并在 `UserPromptSubmit` 对明确的边界/归一化或顺序/依赖任务补充一段窄挑战。Skill 是可选的方法指南，不是 Hook 前提，也不能作为结果或完成证据；任务可以直接执行。

| 场景 | Skill |
|---|---|
| 非简单的代码实现或重构 | `engineering-judgment` |
| 只读代码审查 | `engineering-review` |
| 准备声明完成、修复或通过 | `engineering-verification` |

只在方法确实有帮助时使用当前任务需要的 Skill。内容润色、语气和文风不属于本插件职责。用户指令、项目指令、安全规则和平台规则优先。

## 边界

SessionStart 和 UserPromptSubmit 只提供工程方法提示，不处理专业写作，也不提供硬门禁。UserPromptSubmit 路由无状态、不保存 prompt，无法解析或没有明确匹配时 fail-open。实现效果来自工作区变更和公开行为验证；完成声明需要当前任务周期内的新鲜命令证据。Hooks 的硬约束独立运行，不能把上下文注入、Skill 加载或额外模型轮次当成结果有效的证明。本插件不创建状态目录。

对非简单修复，提示会要求先从本地 API、调用方、测试、文档和历史提炼适用的可观察合同：返回值及类型/容器/形状、边界基数、顺序与稳定性、警告与异常、公共签名兼容性。单个示例通过不代表合同完整；应使用最便宜的独立反例挑战方案，并优先复用仓库已有机制。不可见 evaluator、答案补丁或缓存不属于可用证据，不应耗时寻找。

边界修复应先定位第一个有损变换（如 broadcast、flatten、coerce、deduplicate），并覆盖“一个分量为空、另一个仍有值”等混合状态；当前异常或拒绝不是兼容性证据，除非本地文档或调用方明确要求。若合同需要保留差异，应在信息丢失前分支，再汇入共同返回装配路径。需求扩展输入基数或组合能力时，优先扩展原有命名 seam，并保证已证明的旧调用仍有效；兼容性保护的是调用形式和有证据的结果合同，不是用特判保留偶然容器类型。

排序或依赖变更应先搜索仓库或标准库已有的稳定 primitive。完成前必须直接用两条完全不相交、且各含至少两个节点的链验证 stable ready frontier，而不是只验证题面示例或 flattened first appearance；再覆盖重复项、真实 cycle fallback 和精确诊断合同。单节点链或含跨链依赖的三链示例都不能替代该测试。

方法可选不代表结果契约可选：只读审查的每条 finding 仍须包含 `P0`–`P3` 严重级别、精确 `file:line`、具体证据，以及可验证的修复或恢复路径。

## 来源

- `engineering-judgment`：改编自 MIT `karpathy-guidelines`，见 `licenses/karpathy-guidelines/`
- `engineering-verification`：改编自 MIT Superpowers，见 `licenses/obra-superpowers/`
- `engineering-review`：本项目第一方只读审查方法
