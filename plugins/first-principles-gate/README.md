# first-principles-gate

`first-principles-gate` 同时支持 Claude Code 和 Codex，在业务写入前建立一个短期的第一性原理分析会话：

1. 只有用户 prompt 以 `/first-principles` 或 `$first-principles` 开头时进入；`/fp`、`$fp` 等短别名和句中提及都不会触发。
2. 会话处于 `open` 时阻断非 ledger 的文件或 shell 修改，默认只允许 `.first-principles/**`、`docs/decisions/**`，以及启用 `allowSpecMd` 后的 `**/spec.md`。
3. 完成时要求磁盘上存在符合 `first-principles/v1` 的结构化 ledger。
4. `Stop` 在会话中途只软报告不完整 ledger；assistant 声称完成或用户用 `done` 关闭时，没有有效 ledger 就会阻断。
5. `# first-principles-abort` 可中止。状态损坏、TTL 到期、已中止或空闲时 fail-open，避免永久写锁。

插件只检查明确入口、流程、写入范围和可机读结构，不判断原子是否真正不可再分、推理质量是否良好或结论是否最优。

## 会话模型

阶段为 `idle` → `open` → `closed`，TTL 到期后回到 `idle`。

| 事件 | 行为 |
| --- | --- |
| `UserPromptSubmit` 入口 | 匹配 prompt 前缀 token，进入 `open` 并注入协议 |
| `UserPromptSubmit`（open） | `done` 进入 `closed(completed)`；`# first-principles-abort` 进入 `closed(aborted)`；其他文本继续注入 |
| `PreToolUse` | `open` 且 `writeBlock.mode=block` 时拒绝非 allowlist 文件或 shell 修改 |
| `PostToolUse` | allowlist 路径变化后按需记录 ledger revision |
| `Stop` | open 时软报告不完整 ledger；完成声明或 `closed(completed)` 无有效 ledger 时阻断；open 时也阻断实现完成声明 |

状态保存在宿主插件数据目录中，以 `sessionId\0cwd` 的 SHA-256 为键，默认 TTL 为 24 小时。状态缺失或损坏时回到 `idle` 并 fail-open。

## Ledger 契约

主路径为 `.first-principles/ledger.json`，内容是 JSON 对象。`.first-principles/` 下的 Markdown 也可嵌入 fenced `first-principles` JSON 块。配置的 `ledger.primaryRelativePath` 会自动将目标文件和父目录加入写入 allowlist。

必需字段：

- `schema`: `"first-principles/v1"`；
- `question` 或 `problem`：非空字符串；
- `assumptions[]`：每项有 `id` 和 `claim`；
- `atoms[]`：每项有 `id` 和 `statement`；
- `rebuild.options[]`，或数组形式的 `rebuild`：每项有 `id`、`conclusion` 和非空的 atom ID 列表 `derived_from`；
- `uncertainties[]`：非空字符串数组。

可选字段有 `status`、`default_practice`、atom 的 `kind`/`source` 和 option 的 `rejects`。硬检查只覆盖结构与引用完整性。

结构正确还不足以完成。`Stop` 要求 ledger 通过下列任一方式绑定到当前 open 会话：

1. 文件 `mtime` 不早于 `state.enteredAt`；
2. 当前会话观察到 ledger 产物文件写入，使 `ledgerRevision > 0`。仅创建父目录的 `mkdir` 不计入。

旧分析留下的 stale ledger 会得到明确错误。open 期间的 shell 写入会先规范化 `..` 路径：allowlist ledger 目标可通过，业务目标拒绝，无法解析目标的修改命令 fail-closed。

## 配置与恢复

可在 Git 根目录提供受信任的可执行配置：

- `.first-principles-gate.mjs`
- `.first-principles-gate.cjs`
- `.first-principles-gate.js`

不支持的字段值回退该字段默认值；加载失败时使用完整默认配置。`skills/first-principles-gate-config/` 用于维护配置，内置 `first-principles-ledger` Skill 说明最小 JSON schema 和 `Stop` 阻断后的恢复步骤。

- 用户输入 `done` 解锁写入，`# first-principles-abort` 中止。
- agent 写入有效 ledger 后可重新触发 `Stop`；阻断原因会列出缺少字段。
- 连续两次因 ledger 无效而被 `Stop` 阻断后，插件会输出明确警告并 fail-open，避免死锁。

## 非目标

- 判断第一性原理推理的语义质量；
- 替代插件外的全局 `first-principles-thinking` Skill；
- 提供 grill-me 多选访谈体验；
- 管理语言、测试或 CI provenance，以及 subagent hygiene。

## 验证

```bash
node --test plugins/first-principles-gate/tests/*.test.mjs
bash plugins/first-principles-gate/acceptance/cases/01-open-deny-then-ledger-complete/run-fixture.sh
```
