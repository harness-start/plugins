# knowledge-work

`knowledge-work` 把信息变成可辩护、可读、可复核的产出。它在一个自包含的 Claude Code 与 Codex 插件里组合证据绑定的研究、专业写作支持，以及有证据的日报/周报/阶段汇报。

## 用途

研究、散文和报告有同一个核心问题：像样的文本容易生成，而来源出处、事实边界、读者可用性和持久证据更难。本 owner 在完整性要紧时提供显式工作流，在确定性强制不合适时提供较轻的建议性 Skill。

## 设计

`src/domains/` 下有三个域：`research`、`writing` 和 `reporting`。`research` 用项目工作流文件、owner 暴露的 MCP 服务器、确定性 writer 和 Hook 门禁，把主张绑定到已捕获来源。`writing` 提供第一方散文方法，外加有界 Markdown 分析器。`reporting` 收集本地证据，把事实与推断分开，要求员工确认，并产出 digest 绑定的报告和账本。它们共享一个 owner Hook、CLI、MCP、Skill、测试、验收、license 和构建边界。

安装 owner 即激活全部捆绑 Hook 和 Skill，没有能力 profile。硬工作流由持久项目状态和官方命令激活，不是因为提到 Skill 名。

## 能力

| 模块 | 能力 | 结果 |
| --- | --- | --- |
| `research` | 来源捕获、精确锚点、类型化主张、封印，以及封印后的对外交接 | `.research/runs/<id>` 工作流，含规范 manifest/报告和可核验封印 |
| `writing` | 面向行动的回复、中英散文、去模板、极简模式、可视化说明，以及 Markdown 分析 | 面向读者的文本，外加对观察到的 Markdown 写入的按行确定性发现 |
| `reporting` | 日报、周报和阶段证据收集；有界面谈；员工确认；TL 复核；追加/核验 | Markdown 报告和 digest 绑定账本，含证据强度和跟进矩阵 |

公开 Skill 包括 `research-evidence-workflow`、`professional-writing`、`actionable-response`、`visual-explanation`、`writing-english-prose`、`writing-chinese-prose`、`writing-markdown-ai-style`、`writing-terse-output`、`ai-flavor-remover`、`work-report-authoring`、`work-report-interview` 和 `work-report-review`。

## 适用场景

多来源调查、需要引用的技术或产品决策，或主张必须连到精确捕获证据的交付物，用 `research`。散文需要更清楚、更自然、更可执行或更少套话时用 `writing`。员工日报/周报/阶段总结必须区分观察到的工作、影响、缺口、承诺和 TL 核验时用 `reporting`。

## 不适用场景

不要为不需要持久证据包的简单查询或解释打开封印研究工作流。不要把写作分析当 AI 检测器，也不要声称风格发现变少就证明作者身份或质量。不要用工作汇报计算绩效分、搜索整个家目录、登录外部账号、上传数据或自动发送报告。

## 运行时行为

`SessionStart` 恢复相关的研究/报告状态，并提供轻量写作路由。`UserPromptSubmit` 识别显式的研究和汇报意图。`PreToolUse`、写后、失败和 `Stop` 事件只强制已激活的研究/报告工作流和受保护路径。写作的写后分析器扫描有界、已观察到的 Markdown 写入并报告发现，不会自动改写或阻断。

研究模块用当前宿主内置的网页搜索发现候选，不需要提供商 API 密钥。只有经 `research_provenance` 捕获并锚定的内容才能支撑规范主张。汇报区分已归属的本地证据、未核验所有权、推断、员工处置和后续 TL 检查。

## 公开接口

统一 CLI 是：

```bash
node "${PLUGIN_ROOT}/dist/cli/harness.mjs" <resource> <action> [arguments]
```

资源：

- `research`：转发 `run-open`、`brief-write`、`completeness-check` 和 `handoff-outbound` 等工作流动作；
- `writing`：暴露 `analyze`，做确定性 Markdown 风格分析；
- `report`：暴露日报、周报和阶段总结的 `collect`、`prepare`、`save` 与 transcript-scan 动作，以及 `addition-prepare`、`append` 和 `verify`。

公开 MCP 服务器名为 `research_provenance`。Claude Code 通过插件根 `.mcp.json` 注册，Codex 通过 `mcp/codex.json` 注册。它提供工作区绑定的研究 begin、来源捕获/读取/锚定、主张/封印以及相关出处操作。发现刻意不放进 MCP 表面：Claude Code 使用 `WebSearch`/`WebFetch`，Codex 使用其已注册的网页搜索工具。

## 配置与状态

研究工作流产物在 `.research/runs/` 下；私有捕获正文和 MCP 事件使用平台插件数据目录。工作报告及其账本在选定的报告树中，使用 SHA-256 绑定和确认令牌。写作模块不创建工作流状态，只扫描有界的文件大小/数量。可选的已认证 `gh` 或 `glab` 查询以仓库为范围，从不触发登录。

## 边界

研究封印证明可观察工作流内部一致；它不是对抗恶意同用户进程的密码学签名，未核验主张必须保持标注。写作方法只有在源文本和复核过程成立时才保住事实。报告证据可能不完整或未归属，不得膨胀成绩效结论。Hook 和额外模型轮次本身不是结果证据。

## 验证

```bash
node --import tsx --test \
  plugins/knowledge-work/tests/*.test.ts \
  plugins/knowledge-work/tests/domains/**/*.test.ts
npm run check:dist
```

Claude Code 与 Codex 实时用例必须使用 `./scripts/acceptance/run.sh --plugin knowledge-work`，该命令执行 Docker 宿主验收策略。
