# goal-task-gate

`goal-task-gate` 同时支持 Claude Code 和 Codex，用于审计宿主 `/goal` 长任务：

1. 用户 prompt 以 `/goal <objective>` 开头时启动；status、pause、resume 和裸 `/goal` 不启动。
2. 注入简短协议，要求通过 `log-decision.mjs` 将决策写入 `.goal-task/runs/<run_id>/decisions.tsv`。
3. 保护轨迹文件：禁止通用 Edit/Write，只允许追加或重写末尾 2–3 行。
4. assistant 必须以 `GOAL_TASK_DONE …` 结尾，且轨迹末行是哈希匹配的 `kind=close`，才算完成。
5. `/goal clear` 及 Claude 的 clear 别名会清除运行；运行中启动另一个 `/goal <objective>` 会替换旧运行。

插件不阻断普通业务代码修改，不替代宿主自身的目标继续执行或评估器，也不创建或修改仓库 `.gitignore`。

## 宿主与完成信号

| 宿主 | Hook 是否暴露目标完成状态 | 使用的入口信号 |
| --- | --- | --- |
| Claude Code | 否；`Stop` 没有目标字段 | `UserPromptSubmit` 文本前缀 `/goal …` |
| Codex | 没有公开的 `thread_goals.status` Hook 字段 | 同一 prompt 前缀 |
| Grok | Goal loop 在 `Stop` 门禁前运行，没有完成字段 | prompt 可见时兼容协议 |

因此完成检测依赖注入协议：`Stop` 读取 `last_assistant_message` 的最后一行 trailer，并校验磁盘轨迹。

## 生命周期

| 用户输入 | 插件行为 |
| --- | --- |
| `/goal <objective>` | 启动，或将之前的 armed 运行标为 superseded |
| `/goal clear` / stop / off / reset / none / cancel | 清除并解除 armed 状态 |
| 裸 `/goal`、status、pause、resume | 忽略 |
| `# goal-task-abort` | 中止并解除 armed 状态 |

会话状态为 `idle` ↔ `armed`；磁盘运行状态为 `armed`、`completed`、`cleared` 或 `superseded`。

## 决策轨迹

```text
.goal-task/
  CURRENT
  runs/<run_id>/meta.json
  runs/<run_id>/decisions.tsv
  runs/<run_id>/work.jsonl
```

决策列固定为：

```text
seq ts phase kind decision why evidence result scope prev_hash row_hash run_id session_id
```

`kind` 可以是 `open`、`plan`、`explore`、`implement`、`verify`、`pivot`、`revert`、`blocker`、`checkpoint` 或 `close`。写入必须使用 `log-decision.mjs` 追加；`--rewrite-tip k` 只允许重写最后 `tipWindow` 行，`tipWindow` 可为 2 或 3，默认 3。更早的 sealed prefix 通过哈希链保持不可变。

完成 trailer 格式：

```text
GOAL_TASK_DONE run_id=<id> status=completed close_seq=<n> tip_hash=<hash>
```

`run_id`、`close_seq` 和 `tip_hash` 必须与末行 `kind=close` 的序号和 `row_hash` 一致。伪造 trailer 会被 `Stop` 阻断，除非配置为 `softOnly`。

## Hook 与状态

| 事件 | 作用 |
| --- | --- |
| `UserPromptSubmit` | 启动、替换、清除并注入协议 |
| `PreToolUse` | 拒绝通用 Edit/Write/shell 修改 `decisions.tsv` 或 `work.jsonl` |
| `Stop` | 校验 trailer 与轨迹，并稀疏软报告 |

状态写在 `PLUGIN_DATA` 或 `CLAUDE_PLUGIN_DATA` 的 `goal-task-gate/` 下，以 `sessionId\0cwd` 的 SHA-256 为键，默认 TTL 为 48 小时，异常时 fail-open。

## 配置与 Skill

可在项目根目录提供受信任的 `.goal-task-gate.mjs`、`.cjs` 或 `.js` 配置。

- `goal-task-audit-trail`：说明何时、如何记录和完成；
- `goal-task-gate-config`：维护项目配置。

## 保留范围与非目标

后续阶段可增加业务路径与 `scope` / `work.targets` 的一致性、宿主未来可能暴露的 `goal_status`，以及 `PostToolUse` 自动 work 行。当前版本不判断决策语义质量、不提供真正的 WORM 或防人类删除、不镜像 pause/resume/status UI，也不创建 `/goal-task` 等别名。

## 定位与验证

```bash
cat .goal-task/CURRENT
column -s$'\t' -t .goal-task/runs/"$(cat .goal-task/CURRENT)"/decisions.tsv

node --test plugins/goal-task-gate/tests/*.test.mjs
bash plugins/goal-task-gate/acceptance/cases/01-goal-prompt-arms-inject/run-fixture.sh
```
