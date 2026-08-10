# 候选插件：`long-task-ledger-gate`

| 字段 | 裁定 |
| --- | --- |
| 形态 | 新插件，建议目录 `plugins/long-task-ledger-gate/` |
| 优先级 | P0 |
| 默认安装 | 可以；没有有效账本时必须完全 idle |
| 目标 | 让多阶段、跨会话任务具备可恢复且不可随意改写的进度事实源 |

## 为什么保留

`harness-starter` 的 `skills/long-task-context-governance/src/hooks/task-ledger-*` 与 `ai-experts` 的 `src/experts/planning/hooks/task-ledger-*` 都有三条机械链路：受控写入、完成门禁、会话恢复。本仓的 `goal-task-gate` 只处理 `/goal` 决策轨迹，`compact-context-journal` 只恢复压缩后的需求；两者都不维护跨会话分片状态。

这项能力不能靠一份普通 Markdown 代替。普通文件既可被任意重写，也没有并发更新和 evidence freshness 约束。

## 最小产品合同

- 插件内置 `long-task-context-governance` Skill 和 `long-task-ledger` CLI，不依赖源仓 MCP runtime。Skill 是显式创建、选择和恢复账本的入口，CLI 才是可信状态 owner。
- 规范路径固定为 `.task-ledgers/<slug>.md`。格式包含 goal、non-goals、acceptance baseline、shards、Resume 和 schema version。
- `init`、`update`、`rebaseline`、`repair` 使用文件锁、expected SHA-256、临时文件加原子 rename；直接 Edit/Write/ApplyPatch 或 shell 改有效账本时拒绝。
- CLI 写出的状态记录 workspace identity、session provenance、前一版本摘要和新版本摘要。缺少 `AI_EXPERTS_SESSION_ID` 或 `AI_EXPERTS_TRIGGER_FROM` 时不得签发可信回执。
- `PreToolUse` 拒绝绕过 CLI 直接修改有效账本；`PostToolUse` 观察 evidence refs 指向的文件变化并把对应 shard 标为 stale。
- `SessionStart` 只注入未完成账本的路径、目标和 next shard；只有恰好一个账本处于 `active` 且 workspace identity 匹配时才恢复其激活状态，多个候选时不自动选择。
- `Stop` 只读取 CLI 或 `SessionStart` 建立的可信激活状态，不从最终回复中识别 ledger。成功态要求全部必需 shard 闭合；中断态要求活动 shard 已转为 `paused`/`blocked`，且 Resume 可执行。

```text
Skill 编排 CLI 创建或激活账本
  → CLI 绑定 workspace + session 并签发可信状态
  → PreToolUse 保护 CAS 状态机，PostToolUse 标记 stale evidence
  → 每个 shard 通过 CLI 写入状态与 evidence refs
  → Stop 直接解析账本并复核引用文件摘要
  → 新会话从同一账本恢复 next shard
```

门禁证明的是“账本状态与引用工件在观察时一致”，不是 shard 的业务语义一定正确。命令退出状态只有在宿主可观察或由插件自带执行器获得时才能记为验证证据；Codex 中不能把普通响应文本冒充退出码。

## 与现有插件的边界

| 插件 | 边界 |
| --- | --- |
| `goal-task-gate` | `/goal` 回合、append-only 决策 trail 与 trailer |
| `compact-context-journal` | 上下文压缩后的需求恢复，不维护任务状态机 |
| `subagent-workflow-guard` | agent handoff 与 review closure，不拥有全局任务进度 |

不做 Issue 同步、排期、人天估算，也不自动判断任务是否足够大。单会话任务不应创建账本。

## Hook / Skill 分工

- Hooks 拥有绕过保护、evidence freshness、会话恢复和 completion closure；CLI 独占 schema 校验、CAS 状态迁移与可信回执。
- Skill 负责帮助用户判断是否开启长任务、拆 shard、调用 CLI、解释冲突和组织 resume/handoff，但不能直接写账本或清理 stale 状态。
- 用户不用 Skill 而直接调用 CLI 时，Hook 保护和恢复链仍然成立；Skill 声称 shard 完成但没有 CLI 状态迁移时，`Stop` 必须拒绝成功态。

## 实现准入与验收

实现前先冻结 ledger schema、CAS 错误、状态迁移表和 Stop 激活条件。至少覆盖：

- 没有 `.task-ledgers` 时两宿主均无日志、无阻断；
- 有效账本被文件工具、重定向、`sed -i`、脚本载体间接修改时拒绝；只读命令放行；
- stale expected hash、并发 update、损坏账本和越界 evidence path 拒绝；
- 全部 shard 闭合且引用摘要新鲜时允许成功态；改动引用文件后拒绝 stale completion；
- paused/blocked 账本带有效 next shard 与 recovery commands 时允许中断态；
- Docker 双宿主完成一次 create → update → Stop → 新会话 resume，并通过 honesty gate。

补充反例：最终回复引用一个未激活 ledger、Skill 输出虚构完成状态、直接编辑 ledger 后恢复旧摘要，均不能解锁 `Stop`。

若 Codex 无法稳定提供 ledger 激活或 Stop 的 workspace/session identity，则先只交付 mutation guard + resume，不得宣称 completion gate 对 Codex 有硬效果。
