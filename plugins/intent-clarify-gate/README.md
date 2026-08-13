# intent-clarify-gate

`intent-clarify-gate` 同时支持 Claude Code 和 Codex。业务写入之前，先走一轮 grill-me 风格的意图澄清。

插件实现 [`docs/grill-me-hooks-design.md`](./docs/grill-me-hooks-design.md) v3.1 定义的工作流：

1. 用户 prompt 以 `/grill-me`、`$grill-me`、`/grilling` 或 `$grilling` 开头时进入。
2. 会话处于 `open` 时阻断非 ledger 的文件或 shell 修改。
3. 将用户回复机械分类为 `1|2|3`、带说明的 `N`、自由文本约束、`done` 或 `# grill-abort`。
4. `Stop` 把 `N. Done — …` 解析为完成选项；用户选择该 `N`，或在已记录选项后回复 `done`，才会关闭写屏障。单独一句 `done` 且没有已记录决策制品时，会话保持 `open`。
5. 状态损坏、TTL 到期、已关闭或空闲时 fail-open，避免永久写锁。

## 安装

可通过 marketplace `harness-start` 或本地插件路径安装，详见仓库根 README。

### 社区 Skill 依赖

插件依赖公开的 `grill-me` Skill，入口 token 为 `/grill-me` 和 `/grilling`，依赖声明位于 [`skill-deps.json`](./skill-deps.json)：

```bash
# Performed automatically by scripts/install-all.sh (global scope)
npx --yes skills add https://github.com/mattpocock/skills --skill grill-me --global --yes
```

## 配置

项目根目录可提供经受信任 `import()` 加载的配置：

- `.intent-clarify-gate.mjs` / `.cjs` / `.js`

配置维护说明见 `skills/intent-clarify-gate-config/`。

运行时 `skillInstall.mode` 默认为 `off`，适合离线和 CI。应优先通过 `install-all.sh` / `skill-deps.json` 一次性安装 `grill-me`，不要让 Hook 在运行时调用 `npx`。

## 设计与状态机

插件只实现会话 phase 的机械约束：入口前缀匹配、用户输入分类、open 期间业务写屏障、`Stop` 解析 Done 选项编号，以及状态损坏或 TTL 到期时 fail-open。它不生成题干、不替用户决策、不猜测是否应该进入 grill，也不默认联网安装 Skill。

```text
idle -> 入口前缀 -> open -> 已记录选项后的 done / Done 选项编号 / # grill-abort -> closed
```

写屏障条件为 `phase === open && writeBlock.mode === "block"`。默认 ledger allowlist 为 `.grill-ledgers/**`、`docs/decisions/**`，以及可选的 `**/spec.md`。

| open 状态输入 | 分类 | 后续 phase |
| --- | --- | --- |
| `1` / `2` / `3` | `choice` | open |
| `1 但是…` | `choice_note` | open |
| 无数字前缀自由文本 | `constraint` | open |
| `done` 及可选说明 | `done` | closed |
| 选择 `N. Done — …` 中的 `N` | `done` | closed |
| `# grill-abort` | `abort` | closed |

状态按 `sessionId + cwd` 摘要隔离，以 `0600` 权限原子写入 `PLUGIN_DATA` 或 `CLAUDE_PLUGIN_DATA` 下的 `intent-clarify-gate/`。数据目录不可用时，本轮仍可计算，但不持久化并 fail-open。

阻断文本会包含 `observedFacts`、`harm`、`unblockWhen` 和 `recovery`。用户回复 `done`、选择 Done 选项或发送 `# grill-abort` 后解除写屏障。

## 模块映射

| 模块 | 作用 |
| --- | --- |
| `scripts/lib/policy.mjs` | 入口、分类、完成项和路径 allowlist |
| `scripts/lib/state-store.mjs` | session 状态原子写入与 fail-open |
| `scripts/intent-clarify-gate.mjs` | `prompt` / `pre` / `stop` 宿主入口 |
| `hooks/claude.json`、`hooks/codex.json` | 双宿主事件接线 |

## Hook

| 事件 | 作用 |
|-------|------|
| `UserPromptSubmit` | 进入、分类和注入 |
| `PreToolUse` | open 时阻断业务写入 |
| `Stop` | 解析 `completeChoice`，阻断 open 时的实现完成声明 |

## 验证

```bash
node --test plugins/intent-clarify-gate/tests/intent-clarify-gate.test.mjs
```
