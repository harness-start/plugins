# 双平台真实会话验收矩阵

> 记录每个插件在 Claude Code / Codex 新会话中的真实验收结果。
> 最近一次全量验收：2026-08-06，Docker 内运行 Claude Code 2.1.170 与 Codex 0.146.0。该次 `passed=26 failed=0 skipped=0` 发生在 runtime 插件退役前；下表只保留当前 Marketplace 插件的历史结果。

| 插件 | 平台 | 已验收版本 | 触发场景 | 结果 | 证据 | 持久化位置 | 回滚 tag |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `tdd-guard` | Claude + Codex | 0.2.0 | `01-block-source-first`、`02-allow-test-first`、`03-same-name-identity` | ✅ 两宿主均在实现文件产生副作用前拒绝 source-first；test-first 按 PHP FQCN、Python/JS/TS module、Rust crate、Go module/package 或完整目录镜像放行；同名 PHP 类场景真实拒绝错误 FQCN 后放行正确 FQCN | 2026-08-13 Docker 定向汇总 `6/0/0`；honesty gate `204/0`；20 项离线测试覆盖六语言实体、别名、同名冲突、Cargo/go.mod 边界、补丁载荷、失败关闭与状态隐私 | 平台插件数据目录中的 session/workspace 哈希状态；0600 原子写；仅保存实体键和必要标识符，不保存测试源码 | — |
| `research-provenance-guard` | Claude + Codex | 0.2.0 | `01-workspace-anchor-seal`、`02-unverified-limitation`、`03-ordinary-bypass`、`04-direct-firecrawl-denied` | ⚠️ 0.2.0 改为编排 skill + 项目内 workflow 激活（去掉 `$research`/skill 名触发）；Claude 旧 0.1.0 四场景曾通过，需按新入口回归；Codex MCP tools 暴露问题仍在 | 2026-08-08 合同改写后待 Docker 重跑 | 项目 `.research/runs/*/workflow.json` + 平台插件数据 0600 捕获/收据；seal 后才有 report/manifest；outbound handoff 需 seal | — |
| `execution-loop-guard` | Claude + Codex | 0.1.0 | `01-block-edit-loop` | ✅ 通过：同一源码文件在测试阈值内重复编辑后，真实 PostToolUse 阻断并清空该文件计数周期 | 2026-08-07 Docker 定向汇总 `2/0/0` | 插件数据目录中的 session/workspace 哈希计数；不保存原始路径、命令或输出 | — |
| `source-sanity-guard` | Claude + Codex | 0.1.0 | `01-deny-backup-artifact` | ✅ 通过：真实 PreToolUse 拒绝源码备份文件，目标始终不存在 | 2026-08-07 Docker 定向汇总 `2/0/0` | 无持久化 | — |
| `code-quality-guard` | Claude + Codex | 0.1.0 | `01-repair-javascript-syntax` | ✅ 通过：真实 PostToolUse 捕获 JavaScript 语法错误，最终文件修复并通过 `node --check` | 2026-08-07 Docker 定向汇总 `2/0/0` | 插件数据目录中的会话去重与 PHP 文件列表 | — |
| `encoding-guard` | Claude + Codex | 0.1.0 | `01-repair-utf8-bom` | ✅ 通过：真实 BOM 写入触发守卫，最终文件修复为无 BOM UTF-8 | Docker 定向汇总 `2/0/0` | 无持久化 | — |
| `command-safety-guards` | Claude + Codex | 0.1.0 | `01-deny-cat-heredoc` | ✅ 通过：目标文件不存在，日志有真实 Cat Write Guard deny | Docker 全量汇总 `26/0/0` | 无持久化 | — |
| `file-line-budget-guard` | Claude + Codex | 0.2.0 | `01-block-oversized-php` | ✅ 通过：真实文件工具触发 File Budget 信号 | Docker 全量汇总 `26/0/0` | 临时 warning marker | — |
| `language-output-governance` | Claude + Codex | 0.2.0 | `01-zh-cn-governance`、`02-en-us-profile`、`03-ja-jp-profile`、`04-ko-kr-profile`、`05-th-th-profile`、`06-zh-tw-profile` | ✅ 通过：六种内置语言均保持会话 profile；Claude 触发 PostToolUse 软反馈与 Stop 纠偏，DeepSeek-Codex 安全降级到 Stop 纠偏且未丢失工具结果 | 2026-08-07 前五种语言 Docker 定向汇总 `10/0/0`；2026-08-13 `zh-TW` Docker 定向 `2/0/0`，honesty gate `210/0` | 插件数据目录中的会话 profile、授权语言与软反馈去重状态；24h TTL | — |
| `project-capability-governance` | Claude + Codex | 0.2.0 | `01-human-only-notice`、`02-ordinary-no-notice`、`03-parent-capture`、`06-ordinary-subagent-no-abandon` | ✅ 通过：父 agent 可直接创建 schema-valid proposal；普通 subagent 未被分配插件身份或要求放弃工具；notice 仍为 human-only、non-blocking | 2026-08-14 Docker 定向汇总 `8/0/0`；honesty `174/0`；单测 `15/0` | 工作区 `.project-capabilities/`；只存 inbox 与 notice 去重状态，不存 subagent reservation、mailbox 或 lifecycle ledger | — |
| `first-principles-gate` | Claude + Codex | 0.1.0 | `01-open-deny-then-ledger-complete`、`02-completion-claim-blocks-without-ledger`、`03-short-alias-no-entry`、`04-abort-unlocks-without-ledger`、`05-invalid-ledger-blocks-close`、`06-soft-report-while-open` | ⏳ 待 Docker 宿主验收；离线 6 场景 fixture + 严格单元测试；入口仅 `/first-principles` 与 `$first-principles` | 本地 unit + 全量 `run-fixture.sh`；honesty gate 覆盖 6 cases | 插件数据目录 session/workspace 哈希；24h TTL | — |

## 说明

- **验收方式**：宿主只从 Docker 启动；Claude Code / Codex 新会话安装插件、触发真实工具调用，再同时检查世界状态与产品 hook 信号。
- **Codex 信任**：插件 hooks 是非托管 hooks，首次运行需用户审查信任；自动化验收使用 `--dangerously-bypass-hook-trust`（源码为本地已审查）。
- **模型路由**：两种宿主都通过容器内配置调用 DeepSeek；Codex 日志必须包含 DeepSeek model/provider 标记。
- **测试策略**：单元测试不调用真实模型；验收测试必须使用 Docker 内真实 Claude Code/Codex 命令与模型会话。`expect.sh` 还必须在无 hook 信号的惰性日志上失败，防止假绿。
