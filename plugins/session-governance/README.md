# session-governance

`session-governance` 提供几乎每次 Claude Code 或 Codex 会话都需要的横切行为：理解当前意图、选择合适的推理方法、执行有纪律的工程实践、避免无产出的执行循环，并把自然语言输出保持在配置的语言内。

## 用途

这些关注点不绑定 JavaScript、Python、前端或其他领域，管的是 agent 如何对待任务。插件把它们集中在一个始终安装的 owner 里，这样每个消费者拿到同一套会话合同，不必再选角色包或叠多个小治理插件。

## 设计

`src/domains/` 下有五个可独立测试的域：`intent`、`reasoning`、`practice`、`discipline` 和 `language`。一个 owner Hook 入口把每个生命周期事件在进程内派发给相关域。Hook 处理可机械观察的事项，例如首条 prompt 主张、重试计数、语言脚本检查和完成门禁。Skill 容纳开放方法，例如意图发现、第一性原理分析、工程判断、评审和验证。

安装 owner 即为两个宿主启用完整表面。没有能力 profile、FDE/OPC 分支，也不依赖全局已有 Skill。

## 能力

| 模块 | 能力 | 典型效果 |
| --- | --- | --- |
| `intent` | 首次任务与实质新任务发现 | 先补齐相关仓库事实，只在未决解释会改变实现时追问 |
| `reasoning` | 第一性原理与精确推理方法 | 为因果、逻辑、重证据或后果性问题选一套紧凑方法 |
| `practice` | 工程判断、有界消融、评审检查点、只读评审、按比例完成验证 | 仅当同一合同和 oracle 仍成立时去掉任务局部复杂度；只在显式或高风险边界扩大验证 |
| `discipline` | 重复编辑、重复命令、轮询检测 | 达到配置阈值后报告或阻断可证实的空转循环 |
| `language` | 会话级输出语言治理 | 散文使用选定语言，同时保留代码、命令、路径、标识符和原文 |

## 适用场景

适合作为实现、评审、研究或运维类仓库的默认基础。任务在长对话中经常改范围、完成声明需要可靠命令证据、重复重试会耗尽会话，或团队需要主 agent 与子 agent 使用一致输出语言时尤其有用。

## 不适用场景

不要把它当领域工作流的替代。具体缺陷调查属于 `engineering-workflow`；Git/CI 交付属于 `delivery-governance`；源码与命令保护属于 `workspace-integrity`。它也不定义组织角色、模型档位、权限沙箱、任务追踪器或审批链。

## 运行时行为

`UserPromptSubmit` 路由意图、语言和工程实践上下文。`SessionStart` 恢复语言/实践/推理上下文。`PreToolUse`、`PostToolUse` 以及 Claude Code 上的 `PostToolUseFailure` 只喂给可机械观察的执行纪律计数器和语言反馈。`Stop` 与 `SubagentStop` 执行配置的输出语言边界。owner 聚合各模块反馈，但保留模块自己的 deny 决定。

简单且已经足够具体的请求保持直达。Hook 执行机械合同从不要求先加载 Skill；仅仅加载 Skill 也不证明任务完成。

完成验证按声明范围裁剪。稳定、局部、有直接 oracle 的行为改动可以在一次聚焦的 RED/GREEN 命令后结束；全仓测试、构建和评审检查点留给显式项目要求，或风险已越过聚焦缝的改动。提交和 pull request 意图不会单独扩大本地验证范围。

对非平凡实现或重构，`engineering-judgment` 在聚焦 GREEN 之后包含一次有界消融。这仍是建议性、任务局部的：不建账本、不加 Stop 门禁，也不把删除量当质量证明。

## 公开接口

公开 Skill 包括 `intent-discovery`、`first-principles`、`reasoning-methods`、显式调用的 `grill-me` 与 `socratic-tutor`、`engineering-practice`、`engineering-judgment`、`engineering-review-checkpoint`、`engineering-review`、`engineering-verification`、`execution-discipline-config` 和 `language-output-config`。

本 owner 没有公开 CLI 或 MCP 服务器。Claude Code 与 Codex 通过各自的平台 manifest 和 Hook 消费同一套捆绑方法。

## 配置与状态

`discipline` 读取项目拥有的 `.execution-discipline.mjs`，设置编辑循环、命令重复、轮询、豁免和旁路标记。`language` 先读 `.language-output.mjs`，再读安装器写入的宿主级偏好，再落到严格默认。其响应 profile 以会话为范围；可选的 `artifactProfile` 在项目对生成文件另有稳定语言合同时单独生效。运行时状态按会话/工作区隔离，保存摘要、计数器、语言授权和时间戳，不保存 prompt 正文、命令输出或文件内容。

配置 Skill 诊断并初始化这些文件。它们不会悄悄削弱固定安全规则；无效字段按负责域的已文档 schema 回退。

## 边界

插件只观察宿主发出的事件。它不能统计看不见的终端活动、证明内部确实遵循了某种推理方法，或把一次通过的 Hook 变成结果证据。语言检查管自然语言脚本，不管翻译质量或语气。循环检测使用有界证据，不应解读为性能分数。评审 Skill 保持只读，除非另有用户请求授权实现。

## 验证

```bash
node --import tsx --test \
  plugins/session-governance/tests/*.test.ts \
  plugins/session-governance/tests/domains/**/*.test.ts
npm run check:dist
```

Claude Code 与 Codex 的实时验收必须通过仓库 Docker 验收环境中的 `./scripts/acceptance/run.sh --plugin session-governance` 运行。
