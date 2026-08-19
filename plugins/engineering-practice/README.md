# 工程实践

`engineering-practice` 在 Claude Code 和 Codex 的 `SessionStart` 注入轻量通用提示，在 `UserPromptSubmit` 对明确的边界/归一化或顺序/依赖任务补充一段窄挑战，并在 `Stop` 对两种可机械识别的高风险 diff 做结果门禁。Skill 是可选的方法指南，不是 Hook 前提，也不能作为结果或完成证据；任务可以直接执行。

| 场景 | Skill |
|---|---|
| 非简单的代码实现或重构 | `engineering-judgment` |
| 只读代码审查 | `engineering-review` |
| 准备声明完成、修复或通过 | `engineering-verification` |

只在方法确实有帮助时使用当前任务需要的 Skill。内容润色、语气和文风不属于本插件职责。用户指令、项目指令、安全规则和平台规则优先。

## 边界

SessionStart 和 UserPromptSubmit 只提供工程方法提示，不处理专业写作。UserPromptSubmit 路由无状态、不保存 prompt，无法解析或没有明确匹配时 fail-open。边界和排序细节只在窄路由中出现，不在 SessionStart 重复注入。

Stop 门禁不读取或保存 prompt，也不创建状态目录；它只检查相对 `git HEAD` 的可观察 diff 和当前仓库文件。新增的空输入短路若位于 broadcast、flatten、coerce 等有损变换之后，Stop 会要求把合同判断前移并补足分量值/形状测试；若前移后又为“部分为空”发明新异常，仍会要求用公开 seam 的不等基数结果证明，而不能把拒绝当成保留数据。diff 若明显手写依赖排序，而仓库已存在稳定排序 primitive，Stop 会要求复用该 primitive，或提供公开 seam 反例证明它不适用。固定参数扩展成 variadic seam 后，新增的单输入原样旁路也会被阻止，避免绕过去重、容器归一化和共同返回合同。Git 信息不可用、diff 不命中高置信形状或候选搜索失败时 fail-open。

实现效果来自工作区变更和公开行为验证；完成声明需要当前任务周期内的新鲜命令证据。不能把上下文注入、Skill 加载、Hook 触发或额外模型轮次当成结果有效的证明。

对非简单修复，提示会要求先从本地 API、调用方、测试、文档和历史提炼适用的可观察合同：返回值及类型/容器/形状、边界基数、顺序与稳定性、警告与异常、公共签名兼容性。单个示例通过不代表合同完整；应使用最便宜的独立反例挑战方案，并优先复用仓库已有机制。不可见 evaluator、答案补丁或缓存不属于可用证据，不应耗时寻找。

边界修复应先定位第一个有损变换（如 broadcast、flatten、coerce、deduplicate），并覆盖“一个分量为空、另一个是 singleton”等不等基数状态；当前异常或拒绝不是兼容性证据，除非本地文档或调用方明确要求。混合用例必须逐分量断言输入输出的值和形状，不能只断言都为空、形状相同或仍抛异常。若合同需要保留差异，应在信息丢失前分支，再汇入共同返回装配路径。需求扩展输入基数或组合能力时，优先扩展原有命名 seam，并保证已证明的旧调用仍有效；兼容性保护的是调用形式和有证据的结果合同，不是用特判保留偶然容器类型。

排序或依赖变更应先用 `stable`、`topological`、`dependency` 等概念在整个仓库和标准库搜索已有 primitive。完成前必须直接用两条完全不相交、且各含至少两个节点的链验证 stable ready frontier：发现顺序为 `[a1, a2, b1, b2]` 的两条链 `a1→a2`、`b1→b2` 应得到 `[a1, b1, a2, b2]`，不能把 flattened first appearance 的 `[a1, a2, b1, b2]` 当成同一合同。还要验证同一链内的相邻重复项不会形成 self-dependency 或误报 cycle，并让零、一、二、多输入都经过同一去重和容器归一化机制。若需求质疑诊断内容，消息应绑定调用者提供的原始约束组，而不是图算法偶然选出的内部节点；再覆盖真实 cycle fallback、精确类型和文本。单节点链、只覆盖跨链重复项或含跨链依赖的三链示例都不能替代这些测试。

方法可选不代表结果契约可选：只读审查的每条 finding 仍须包含 `P0`–`P3` 严重级别、精确 `file:line`、具体证据，以及可验证的修复或恢复路径。

## 来源

- `engineering-judgment`：改编自 MIT `karpathy-guidelines`，见 `licenses/karpathy-guidelines/`
- `engineering-verification`：改编自 MIT Superpowers，见 `licenses/obra-superpowers/`
- `engineering-review`：本项目第一方只读审查方法
