---
name: training-program-design
description: 为起点、角色或经验差异明显的受众设计新培训，或把已有课程改编成可实施、可练习、可评价的培训包。适用于 AI、软件、流程、合规和岗位技能等主题；当用户只要解释一个概念、润色单份材料或安排会议时不使用。
---

# Training Program Design

把培训当作“从真实起点到可观察工作表现”的设计任务。主 agent 始终负责用户意图、事实来源、方案取舍、源合同和最终交付；Hook 只验证阶段合同，不替代教学判断。

## 必读参考

开始前完整阅读：

- [项目合同](references/project-contract.md)
- [培训设计方法](references/training-method.md)
- [评审量规](references/review-rubric.md)

## 编排流程

1. 明确是 `design`（新建）还是 `adapt`（改编），选定小写 kebab-case artifact id。除非用户明确只要较早阶段，`targetStage` 使用 `release`。
2. 使用注册入口初始化 `artifacts/training/<artifact-id>`。Claude 使用 `${CLAUDE_PLUGIN_ROOT}`，Codex 使用 `${PLUGIN_ROOT}`；Codex 的命令环境必须保留 Hook 提供的 `AI_EXPERTS_SESSION_ID` 与 `AI_EXPERTS_TRIGGER_FROM`。
3. 完成 `brief`：在 `plan.contract.json` 写清受众、工作目标、时长、形式、语言与可证伪假设。没有真实证据时明确标成假设，不臆造学习者画像。
4. 完成 `design`：在 `training-package.json` 建立 audience → outcome → agenda/activity → assessment → follow-up 的双向映射。所有人完成同一个核心任务；初学者获得 entry supports，有经验者获得 stretch extensions，不能按“初/中/高”简单拆成三套孤立课程。
5. 执行 `project-lint.mjs --stage design`。总时长、引用、练习、评价和迁移闭环全部通过后才进入下一阶段。
6. 完成 `materials`：执行 `project-render.mjs`，由同一 JSON 源生成讲师指南、学员手册、练习与评价、幻灯片大纲、培训 brief；`adapt` 模式还生成改编报告。不要手工编辑 `dist/` 或 evidence。
7. 完成 `review`：按 `$training-program-review` 做只读评审，生成项目外的 review input，再执行 `project-review.mjs <project-root> <external-review-input>`。发现阻断问题时只修改源合同，并从 lint → render → review 重跑。
8. 完成 `release`：评审通过后执行 `project-release.mjs`。只把 `receipt.release.json` 已绑定的文件作为已发布结果报告。

命令必须是独立、精确的 wrapper 调用，不能与重定向、管道、命令替换或第二条命令串联：

```bash
node "${PLUGIN_ROOT}/dist/cli/harness.mjs training init" artifacts/training/workflow-foundations --mode design --target release
node "${PLUGIN_ROOT}/dist/cli/harness.mjs training lint" artifacts/training/workflow-foundations --stage design
node "${PLUGIN_ROOT}/dist/cli/harness.mjs training render" artifacts/training/workflow-foundations
node "${PLUGIN_ROOT}/dist/cli/harness.mjs training review" artifacts/training/workflow-foundations /absolute/path/outside-project/review-input.json
node "${PLUGIN_ROOT}/dist/cli/harness.mjs training release" artifacts/training/workflow-foundations
```

Claude 中仅将上面的 `${PLUGIN_ROOT}` 换成 `${CLAUDE_PLUGIN_ROOT}`。不混用两个平台的变量或 Hook 机制。

## AI 培训的领域补充

当主题是 LLM、DeepSeek、Dify 或其他 AI 工具时，把版本、模型能力、费用、部署和安全规则视为可能变化的事实，优先核验官方一手资料并记录来源。共同任务应围绕真实业务产出与验证，例如“在限定数据边界内构建并检查一个问答工作流”，而不是只记术语或点击步骤。至少包含输出核验、隐私/权限边界和失败恢复。

## 失败与恢复

- 用户目标或时长变化：更新 plan 与 training package，从 design lint 重跑。
- 源变化后旧材料、评审和 receipt 自动失效：从 render 重跑。
- `adapt` 缺失 retain/modify/remove 轨迹：补全来源元素、动作与理由，不把原课程静默覆盖。
- audience 证据不足：先加入轻量诊断和可证伪假设；不等待完美画像，也不虚构调查结果。
- 最多进行两轮“修改—评审”。仍有阻断问题时回到 outcome 或共同任务设计，而不是降低量规。

只使用本插件捆绑的 Skill、参考文档、CLI 与 Hook。运行时出现的同名 Skill 不是本插件依赖。
