# 双平台真实会话验收矩阵

> 记录每个插件在 Claude Code / Codex 新会话中的真实验收结果。
> 最近一次全量验收：2026-08-06，Docker 内运行 Claude Code 2.1.170 与 Codex 0.146.0。该次结果早于本轮 36 插件职责重构；下表保留历史证据，新领域插件的新版本结果在完成 Docker 复验后追加。

| 插件 | 平台 | 已验收版本 | 触发场景 | 结果 | 证据 | 持久化位置 | 回滚 tag |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `test-driven-development` | Claude + Codex | 0.4.1 | `01`–`06` 新实现 / 修 bug / 删特性 | Docker live：历史全组 10 过 2 挂；0.4.1 的 `02-allow-test-first` 双端通过，并确认插件本地忽略规则未改项目根 `.gitignore`。离线 44/0 覆盖 git-dirty+RED、已失败历史测试、删/改瘦测试后删实现、未跟踪新实现删除清 `needsGreen`、Claude `{stdout,# pass}` 无 exit_code 清 GREEN、`rm`/`mv`、回退清屏障 | 2026-08-14 Docker `10/2`；2026-08-15 `02` 定向 Docker `2/0/0`；单测 `44/0` | 工作区 `.test-driven-development/state/`；`.test-driven-development/.gitignore` 只忽略 `state/`；只存 RED/GREEN 回执与实体键 | — |
| `evidence-based-research` | Claude + Codex | 0.3.1 | `01-workspace-anchor-seal`、`02-unverified-limitation`、`03-ordinary-bypass`、`04-direct-firecrawl-denied` | ⚠️ 改为编排 skill + 项目内 workflow 激活（去掉 `$research`/skill 名触发）。2026-08-15 定向复验未通过：Claude 被第三方 research skill 安装路径异常挡住；Codex 未产生匹配的 `research_seal` 回执。Codex 现场已生成新 state 布局且未改项目根 `.gitignore` | 2026-08-15 Docker 定向 `0/2/0`；离线单测 `42/0` | 项目 `.research/state/` 与 `.research/runs/*/workflow.json`；`.research/.gitignore` 只忽略 `state/`；seal 后才有 report/manifest | — |
| `execution-discipline` | Claude + Codex | 0.1.3 | `01-block-edit-loop` | ✅ 通过：同一源码文件在测试阈值内重复编辑后，真实 PostToolUse 阻断；状态写入 `state/`，目录内忽略规则正确，项目根 `.gitignore` 未变 | 2026-08-15 Docker 定向汇总 `2/0/0` | `.execution-discipline/state/` 中的 session/workspace 哈希计数；不保存原始路径、命令或输出 | — |
| `agent-activity-audit` | Claude + Codex | 0.2.0 | `01-record-shell-command`、`02-deny-trail-mutation`、`03-deny-interpreter-trail`、`04-record-file-write` | ✅ 通过：`agent-activity/v1` 用 `kind` 区分 command/file；两种记录和两条审计目录硬拦截均通过 | 2026-08-16 Docker `8/0/0` | `.agent-activity-audit/sessions/`；插件本地 `.gitignore` | — |
| `source-integrity` | Claude + Codex | 0.3.0 | `01-deny-backup-artifact`、`02-repair-utf8-bom` | ✅ 通过：一个 Pre/Post dispatcher 同时完成备份文件硬拦截与 BOM 检测修复闭环 | 2026-08-16 Docker `4/0/0` | 无持久化 | — |
| `engineering-quality` | Claude + Codex | 0.3.0 | `02-block-oversized-php`、`03-fix-heading-jump` | ✅ 通过：收缩后只保留行预算与 Markdown 闭环；语言静态检查已迁移至领域插件 | 2026-08-17 Docker `4/0/0` | 仅行预算的临时 cooldown marker；无项目语言检查状态 | — |
| 11 个工程领域插件 | Claude + Codex | 0.1.0 | 各插件 `01-domain-guard`；React Native 另含 `02-deny-package-lockfile` | ✅ 通过：领域编排 Skill、领域本地 Pre/Post Hooks、依赖/生成产物保护和有界检查；声明的社区 Skill 均从 vendor 快照安装；React Native 在 Web 插件让出作用域后仍独立保护 JS lockfile | 2026-08-17 Docker `24/0/0` | 仅缺失工具的临时去重 marker；无项目状态 | — |
| `command-safety` | Claude + Codex | 0.1.0 | `01-deny-cat-heredoc` | ✅ 通过：目标文件不存在，日志有真实 Cat Write Guard deny | Docker 全量汇总 `26/0/0` | 无持久化 | — |
| `language-output` | Claude + Codex | 0.2.1 | `01-zh-cn-governance`、`02-en-us-profile`、`03-ja-jp-profile`、`04-ko-kr-profile`、`05-th-th-profile`、`06-zh-tw-profile` | ⚠️ 六种内置语言的历史验收通过。2026-08-15 的 `01` 定向复验中，新 state 布局和根 `.gitignore` 隔离在双端均正确；场景整体 `0/2`，Claude 未产生用例要求的 Stop 拦截，Codex 未按 PostToolUse 反馈修复文件 | 历史：前五种语言 Docker `10/0/0`，`zh-TW` `2/0/0`；2026-08-15 `01` 定向 Docker `0/2/0`；离线单测 `67/0` | `.language-output/state/`；`.language-output/.gitignore` 只忽略 `state/`；24h TTL | — |
| `reasoning-methods` | Claude + Codex | 1.0.0 | `01-first-principles-retry`、`02-decision-load-bearing` | ✅ Skill-only 基线：双端均真实加载目标 Skill；输出识别缺失的 exactly-once 约束，并从 fixture 动态算出成本交叉点；不创建工作区状态 | 2026-08-15 Docker 定向复验；honesty gate 覆盖 2 cases | 无持久化 | — |
| `professional-writing` | Claude + Codex | 1.3.0 | `07-actionable-response`, `08-visual-explanation`, `09-markdown-post-hook` | Pass: existing actionable/visual routes remain covered; a direct Markdown edit independently triggers bounded deterministic `file:line` findings through PostToolUse, with Claude additional context and Codex model-visible tool feedback | 2026-08-23 Docker targeted `2/0/0`; honesty `262/0` | No persistent state | Automatic scan covers observed `.md`/`.markdown` targets only; max 8 files, 256 KiB each, 20 findings |

## 说明

- **验收方式**：宿主只从 Docker 启动；Claude Code / Codex 新会话安装插件、触发真实工具调用，再同时检查世界状态与产品 hook 信号。
- **Codex 信任**：插件 hooks 是非托管 hooks，首次运行需用户审查信任；自动化验收使用 `--dangerously-bypass-hook-trust`（源码为本地已审查）。
- **模型路由**：两种宿主都通过容器内配置调用 DeepSeek；Codex 日志必须包含 DeepSeek model/provider 标记。
- **测试策略**：单元测试不调用真实模型；验收测试必须使用 Docker 内真实 Claude Code/Codex 命令与模型会话。`expect.sh` 还必须在无 hook 信号的惰性日志上失败，防止假绿。
