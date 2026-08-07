# skill-routing-transparency

双宿主 Skill 路由透明度插件。它要求主代理在每个新任务或独立子目标的首段任务回复前，用一行公开最终路由和实际加载状态。

## 可见格式

```text
📌 Skill 路由：explicit=`skill-id`；loaded=`skill-id`
📌 Skill 路由：primary=`skill-id`；companions=`a`, `b`；loaded=`skill-id`, `a`, `b`
📌 Skill 路由：noMatch；loaded=none
📌 Skill 路由：unavailable；loaded=none
```

`primary` 和 `companions` 来自 route lookup schema 3。`loaded` 只能列出已通过 Skill tool、Skill injection 或成功读取 `SKILL.md` 的 Skill；加载失败的命中项使用 `load_failed`，不能冒充已调用。

插件不会展示被拒候选、原始 `matches`、评分或评分理由。

## 行为边界

- `SessionStart` 注入完整公开协议。
- `UserPromptSubmit` 为新任务补充轻量提醒，抵抗长会话上下文衰减。
- 显式 Skill 直接使用，不运行隐式 lookup。
- 隐式路由使用宿主已有的 `skill-route-lookup.mjs`；缺失或输出无效时公开 `unavailable`，不能伪装成 `noMatch`。
- 短确认、仅延续上一任务的回复、后台完成通知和宿主命令不重新路由。
- subagent 不输出路由声明。

这是透明度 guidance，不是阻断 gate。插件没有 `PreToolUse`、`Stop` 或持久化状态；模型漏报时不会阻断会话。

## Lookup 路径

Claude：

```bash
node "$HOME/.claude/bin/skill-route-lookup.mjs" --prompt "<full request>"
```

Codex：

```bash
AI_EXPERTS_SESSION_ID="${AI_EXPERTS_SESSION_ID:-skill-routing-transparency}" \
AI_EXPERTS_TRIGGER_FROM="skill-routing-transparency:user-prompt" \
node "${CODEX_HOME:-$HOME/.codex}/bin/skill-route-lookup.mjs" --prompt "<full request>"
```

如果只安装 Marketplace 插件而没有对应 runtime lookup，代理必须使用 `unavailable` 公开该事实。

## 验证

```bash
node --test plugins/skill-routing-transparency/tests/skill-routing-transparency.test.mjs
bash plugins/skill-routing-transparency/acceptance/cases/01-visible-route-disclosure/run-fixture.sh
```
