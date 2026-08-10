# subagent-lifecycle-audit

`subagent-lifecycle-audit` 记录 Claude Code 和 Codex 的 subagent 生命周期 metadata。它观察启动与停止事件，按宿主 session 和 `agent_id` 关联，并阻断 agent 直接修改项目本地轨迹的常见方式。

插件不记录 prompt、response、命令、文件路径、工具名或工具输入输出。观察到 `stopped` 只表示宿主发出了 `SubagentStop`，不能证明任务成功。

## 存储与事件流

```text
.subagent-lifecycle-audit/
  README.md
  sessions/<session_key>.jsonl
```

插件不会创建或修改 `.gitignore`。session ID 会做路径规范化；宿主没有提供 ID 时，以工作目录哈希作为 session key。目录权限为 `0700`，生成文件权限为 `0600`，不提供自动保留期或清理策略。

```text
SubagentStart ─┐
SubagentStop ──┼─> 规范化 -> session lock -> 追加 JSONL -> report
               │
PreToolUse ────┘   只保护审计根目录
```

保护 Hook 不是工作内容收集器，`PreToolUse` 或 `PostToolUse` payload 都不会写入轨迹。

## Schema 与关联

每行使用 `subagent-lifecycle/v1`：

```json
{
  "schema": "subagent-lifecycle/v1",
  "event": "started",
  "observed_at": "2026-08-08T00:00:00.000Z",
  "host": "codex",
  "session_id": "session-1",
  "agent_id": "agent-1",
  "agent_type": "explorer",
  "parent_agent_id": null,
  "started_at": "2026-08-08T00:00:00.000Z",
  "ended_at": null,
  "duration_ms": null,
  "correlation": "open",
  "monotonic_ns": "1234567890",
  "provenance": {
    "session_id": "session-1",
    "trigger_from": "subagent-lifecycle-audit:start"
  }
}
```

`monotonic_ns` 来自宿主 OS 单调时钟。匹配的 Stop 使用持久化 Start 值计算 `duration_ms`；差值为负、缺失或无法解析时记为 `null`。

同一 session 文件中，每个 agent ID 维护一个未匹配 Start 栈：

| 状态 | 含义 |
| --- | --- |
| `open` | 已观察 Start，尚未观察匹配 Stop |
| `matched` | Stop 与最近的未匹配 Start 配对 |
| `duplicate-start` | 同一 agent ID 已有未匹配 Start 时再次启动 |
| `orphan-stop` | 没有未匹配 Start 时观察到 Stop |
| `missing-agent-id` | 宿主事件缺少可用 agent 身份，且永不参与配对 |

`open` 可能表示 subagent 仍在运行，也可能是 Stop 事件未被观察到，不作为失败。report 从轨迹推导 `stopped`、`open` 和 `orphan-stop` 视图，从不把生命周期状态映射为任务结果。

## 报告

在被审计仓库中运行已安装插件脚本，或使用本仓库中的等效命令：

```bash
node plugins/subagent-lifecycle-audit/scripts/subagent-lifecycle-report.mjs
node plugins/subagent-lifecycle-audit/scripts/subagent-lifecycle-report.mjs --session <session-id> --json
```

从目标仓库外运行时使用 `--cwd <repository-path>`。不传 `--session` 时，report 按确定性的文件名顺序读取全部 session JSONL。

## 完整性与失败策略

插件在有界 session lock 内创建目录并一次追加完整 JSON 行。`PreToolUse` 拒绝 agent 直接将 Edit/Write/apply_patch 目标指向审计根目录，也拒绝识别出的 shell 修改命令；只读 shell 检查允许。

生命周期记录 fail-open：Hook 输入畸形、锁竞争或 IO 失败只写 stderr，不阻断 subagent。明确的轨迹修改则 fail-closed。这里提供的是 Hook 可观察路径上的尽力防篡改，不是 WORM；间接命令、人类或 Hook 之外进程仍可修改或删除文件。

## 平台映射

| 平台 | 生命周期 Hook | 插件根变量 |
| --- | --- | --- |
| Claude Code | `SubagentStart`、`SubagentStop` | `CLAUDE_PLUGIN_ROOT` |
| Codex | `SubagentStart`、`SubagentStop` | `PLUGIN_ROOT` |

Codex 命令设置 `AI_EXPERTS_SESSION_ID` 和 `AI_EXPERTS_TRIGGER_FROM`，并将其保留为 Hook provenance。

## 非目标

- 捕获 prompt、response、命令、文件、工具、token 或成本 telemetry；
- 评分返回质量或阻断生命周期；
- 证明 subagent 成功完成；
- 提供 WORM、站外证据存储或完全阻止间接和外部修改。

版本：`0.1.1`

## 验证

在 marketplace 根目录运行：

```bash
node --test plugins/subagent-lifecycle-audit/tests/*.test.mjs
SKIP_HOST_INSTALL=1 bash scripts/ci/validate-plugins.sh
./scripts/acceptance/run.sh --plugin subagent-lifecycle-audit
```
