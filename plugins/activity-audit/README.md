# activity-audit

`activity-audit` 为 Claude Code 与 Codex 记录一份有界、项目本地的 agent 文件操作与 shell 命令账本。用途是操作可追溯：回答某个 agent 尝试了什么、何时发生、宿主报告成功还是失败，而不把完整工具输出拷进审计日志。

## 用途

agent 会话可能在人工复核前改许多文件、跑许多命令。本插件为每个宿主会话写一份 JSONL 轨迹，方便维护者还原活动、追查意外改动，或做交接。命令输出和文件内容故意不记录，以控制体积并减少误抓密钥。

## 设计

owner 在 `src/domains/` 下只有 `activity` 域。每个宿主一个 Hook 入口，在进程内把 `PreToolUse`、`PostToolUse` 和 `PostToolUseFailure` 派发给该域。域在工具运行前记下 pending 事件，观察到结果后再闭合或追加终态。

插件自包含：Hook 运行时、配置 Skill、测试和存储逻辑一起发布。安装即启用全部表面，没有能力 profile，也不依赖别处安装的 Skill。

## 能力

| 能力 | 机制 | 用户可见结果 |
| --- | --- | --- |
| 命令活动轨迹 | Pre/post Hook | 命令、宿主、状态、时间戳、耗时，以及可选退出码 |
| 文件活动轨迹 | Pre/post Hook | 读、写或更新操作，路径相对项目根 |
| 并发事件处理 | JSONL writer | 仅当 tool ID 匹配时才闭合 pending；否则追加终态记录 |
| 审计路径保护 | PreToolUse Hook | agent 的文件工具和 shell 不能改写审计目录 |
| 密钥最小化 | 确定性脱敏 | 常见凭据形态被遮盖，命令文本有长度上限 |
| 项目配置 | `agent-activity-audit-config` Skill | 初始化或诊断 `.agent-activity-audit.mjs` |

## 适用场景

需要仓库内轻量 agent 活动历史、想查哪个会话碰过某路径、需要工程交接证据，或工作区要求命令/文件可追溯时使用。长实现会话和共享仓库尤其有用：最终 Git diff 解释不了尝试过的命令或失败操作。

## 不适用场景

不要把它当安全边界、合规归档、终端录像或 Git 历史替代。它不捕获人类终端活动、完整 stdout/stderr、工具响应体或文件内容。若需要抗篡改 WORM 存储、集中留存、身份证明或操作系统级监控，应使用专门的审计平台。

## 运行时行为

`PreToolUse` 追加一条 `pending` 记录。`PostToolUse` 和失败事件写入观察到的结果。最新 pending 记录的非空 tool ID 相同时，只替换最后一行；并行或不匹配的结果追加，不改写更早历史。缺少成功证据记为 `unknown`，不臆测为成功。

审计树禁止 agent 来源的改写。运行时错误 fail-open：审计目录不可用时不会让仓库无法使用。两个宿主共用同一 schema，Hook 清单和环境变量仍按平台分开。

## 公开接口

本 owner 没有公开 CLI 或 MCP 服务器。公开接口是：

- 用于配置和诊断的 `agent-activity-audit-config` Skill；
- `hooks/` 中声明的 Claude Code 与 Codex 生命周期 Hook；
- 写在配置的审计根下的 `agent-activity/v1` JSONL 记录。

## 配置与状态

默认项目配置文件是 `.agent-activity-audit.mjs`。支持的设置包括 `enabled`、`auditRoot` 和 `maxCommandChars`。密钥脱敏是固定安全不变量，不能关闭。默认状态写在 `.agent-activity-audit/sessions/<session-id>.jsonl`；插件在该工作目录内创建 ignore 文件，不修改仓库根 `.gitignore`。

## 边界

轨迹只证明宿主向插件 Hook 暴露了什么。它不证明外部副作用已完成、命令输出真实，或其他进程没有改本地文件。脱敏器减少常见密钥暴露，不是通用防泄漏引擎。Hook 被调用只证明观察发生了，不证明底层任务成功。

## 验证

从 marketplace 仓库根目录：

```bash
node --import tsx --test \
  plugins/activity-audit/tests/*.test.ts \
  plugins/activity-audit/tests/domains/activity/*.test.ts
npm run check:dist
```

Claude Code 与 Codex 的实时验收必须使用 `./scripts/acceptance/run.sh --plugin activity-audit`，并走仓库的 Docker 宿主验收策略。
