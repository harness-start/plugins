# process-confidence

**流程置信度** — 给 Claude Code / Codex 加一层可观察的交付流程。

- **创建 Run：** 仅 LLM 调用 `pcf begin`（必须显式 `--session-id`，并在 `~/.claude` / `~/.codex` 校验）
- **Hooks：** 注入上下文、护盘、签发 receipt、推 stage、自动 complete、Stop 门禁
- **硬约束：** Hooks **永不**根据意图自动 `begin`

设计合同（插件内副本）：[`docs/design.md`](./docs/design.md) · [`docs/deliver.md`](./docs/deliver.md)

## 组件

| 路径 | 角色 |
| --- | --- |
| `bin/pcf` / `scripts/pcf-cli.mjs` | LLM 工具面：begin / status / check / abandon / bypass / mode / timeline |
| `scripts/pcf-hook-*.mjs` | SessionStart · UserPrompt · PreToolUse · PostToolUse · Stop |
| `scripts/lib/*` | session-registry · gate · scan · active · receipt · stage · complete |
| `templates/deliver/stages/*` | intent / plan 阶段模板 |
| `schemas/*` | run / receipt JSON Schema |
| `hooks/claude.json` · `hooks/codex.json` | 双平台 hook 绑定 |

## 安装

```bash
# Claude Code
claude plugin install process-confidence@harness-start

# Codex
codex plugin add process-confidence@harness-start
# Codex 需审查并信任 hooks 后才会执行
```

## Agent 用法

SessionStart 会注入当前 `sessionId`。交付任务时：

```bash
node "${CLAUDE_PLUGIN_ROOT:-$PLUGIN_ROOT}/scripts/pcf-cli.mjs" begin \
  --session-id <注入的会话ID> \
  --title "登录限流"
```

然后：

1. 填写 `.process-confidence/runs/<runId>/stages/01-intent.md`（`## 非目标` + `## 成功标准`）
2. 填写 `02-plan.md`（`## 涉及文件` + `## 验证` + `## 回滚`）
3. 改业务代码；跑测试 — PostToolUse 自动写 receipt
4. 门禁通过后 hook 自动 complete → `docs/process-evidence/<runId>.md`
5. 未收口时 Stop 会被 block；未 begin 就改业务代码 → orphan-work block

人类日常只看 **`.process-confidence/ACTIVE.md`**。

## 逃生

均需合法 `--session-id` 与所有权匹配：

```text
pcf abandon --session-id … --run … --reason …
pcf bypass  --session-id … --run … --reason …
pcf mode    --session-id … --run … --off
```

## 配置（可选）

`.process-confidence/config.yaml`：

```yaml
mode: on
orphanWorkStop: on
minSeverity: pass
showSessionIdInActive: false
verifyCommandHints: []
verifyCommandExclude: []
```

## 本地测试

```bash
node --test plugins/process-confidence/tests/*.test.mjs
```

## 版本

`0.1.0` — MVP：deliver 流程、session registry、hooks 运转、Stop 门禁。
