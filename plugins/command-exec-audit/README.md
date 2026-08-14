# command-exec-audit

`command-exec-audit` 记录 Claude Code 和 Codex 里 agent 跑过的 shell 命令：只记状态和耗时，不记输出正文。记录按项目和会话写成 JSONL，并拦住改审计文件。

## 目录结构

```text
.command-exec-audit/
  .gitignore
  README.md
  sessions/<session_id>.jsonl
```

一个宿主会话对应一个 JSONL 文件。插件会在审计目录内创建 `.gitignore`，只忽略 `sessions/`；不会创建或修改项目根目录的 `.gitignore`。如果审计目录内已经有 `.gitignore`，插件也不会覆盖。

## 生命周期

1. `PreToolUse` 追加一条带 `started_at` 的 `pending` 记录。
2. `PostToolUse` 或 Claude `PostToolUseFailure` 在非空 `tool_use_id` 与末行待处理记录匹配时，只重写最后一行，补充 `status`、`ended_at`、`duration_ms` 和可选的 `exit_code`。
3. 并行工具、空 ID 或锁未命中导致末行无法重写时，插件会追加一条终态记录，并通过向前扫描相同非空 ID 的待处理记录恢复 `started_at`；更早的行不会被改写。

空值或 `null` 的 `tool_use_id` 不参与末行重写匹配。没有明确的退出或成功信号时，状态记为 `unknown`，不会臆测为成功。

## 写入策略

- 插件可以追加记录；只有匹配待处理 `tool_use_id` 时才能重写最后一行。
- agent 的 Edit、Write 或 shell 工具不能修改审计目录。
- 若并行导致末行不匹配，则追加终态记录，绝不改写非末行。

## 数据结构

每行使用 `command-exec/v1` schema：

```json
{
  "schema": "command-exec/v1",
  "ts": "ISO-8601",
  "session_id": "string|null",
  "cwd": "string",
  "tool_name": "string",
  "tool_use_id": "string|null",
  "command": "string",
  "status": "pending|success|failure|unknown",
  "started_at": "ISO-8601",
  "ended_at": "ISO-8601|null",
  "duration_ms": "number|null",
  "exit_code": "number|null",
  "host": "claude|codex|unknown"
}
```

记录中没有 `stdout`、`stderr` 或原始 `tool_response` 字段。插件会尽力遮盖 `TOKEN=…`、Bearer token 等敏感值，并将命令截断到 `maxCommandChars`，默认上限为 2000 个字符。

## 配置

可在 Git 根目录创建 `.command-exec-audit.mjs`：

```js
export default {
  enabled: true,
  auditRoot: ".command-exec-audit",
  maxCommandChars: 2000,
  redactSecrets: true,
};
```

可使用 `command-exec-audit-config` Skill 初始化配置。

## 验证

```bash
node --test plugins/command-exec-audit/tests/*.test.mjs
```

版本：`0.1.2`

## 非目标

- 捕获完整命令输出。
- 记录 agent 工具以外的人类终端会话。
- 自动修改项目根目录的 `.gitignore`。
- 提供真正的 WORM 存储。
