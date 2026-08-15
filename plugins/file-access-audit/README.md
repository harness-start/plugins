# file-access-audit

`file-access-audit` 把 Claude Code 和 Codex 里 agent 的结构化文件读写记到项目本地、按会话拆的 JSONL，并拦住改这条轨迹。普通业务工具只被记录，不会因此被拒。

插件不跟踪人类在 IDE 中打开或保存文件，也不解析只通过 shell 完成的 `cat` 或重定向操作。

## 记录范围

| 来源 | 操作 |
| --- | --- |
| Claude `Read` | `read` |
| Claude `Edit` / `MultiEdit` / `NotebookEdit` | `update` |
| Claude `Write` | `write` |
| Codex `apply_patch` | 根据 patch header 记录 `write` / `update` / `delete` / `move` |

## 目录结构

```text
.file-access-audit/
  .gitignore
  README.md
  sessions/<session_id>.jsonl
```

一个宿主会话对应一个 JSONL 文件。Git 根目录内的路径会记录为仓库相对路径。插件会在审计目录内创建 `.gitignore`，忽略该目录的全部内容；不会创建或修改项目根目录的 `.gitignore`。旧的 `sessions/` 模板会升级为 `*`；自定义内容不会覆盖。

## 写入策略

| 执行者 | 允许操作 |
| --- | --- |
| 插件 | 追加；只保留重写最后一行的能力，V1 文件事件实际只追加 |
| agent 工具 | 不允许修改审计根目录 |

更早的记录行按设计保持不可变。agent 尝试通过 Edit、Write 或 shell 修改审计轨迹时，`PreToolUse` 会拒绝；`PostToolUse` 负责追加结构化访问记录。匹配器覆盖 `Read`、`Edit`、`MultiEdit`、`NotebookEdit`、`Write` 和 `apply_patch`。

## 数据结构

每行使用 `file-access/v1` schema：

```json
{
  "schema": "file-access/v1",
  "ts": "ISO-8601",
  "session_id": "string|null",
  "cwd": "string",
  "tool_name": "string",
  "tool_use_id": "string|null",
  "op": "read|write|update|delete|move",
  "paths": ["repo-relative-or-abs"],
  "host": "claude|codex|unknown"
}
```

## 配置

可在 Git 根目录创建 `.file-access-audit.mjs`：

```js
export default {
  enabled: true,
  auditRoot: ".file-access-audit",
};
```

可使用内置 `file-access-audit-config` Skill 初始化或诊断配置。配置或 IO 出错时 fail-open。

## 非目标

- 推断 Bash 文件 IO；
- 捕获文件内容；
- 将记录发送到 SIEM；
- 提供真正的 WORM 存储或阻止人类删除。

## 验证

```bash
npx tsx --test plugins/file-access-audit/tests/*.test.ts
```

版本：`0.2.0`
