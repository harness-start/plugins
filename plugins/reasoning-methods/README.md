# 推理方法插件

`reasoning-methods` 为 Claude Code 和 Codex 提供两种聚焦方法：`first-principles` 拆除继承标签并从基本约束重建模型，`reasoning-methods` 根据问题选择精确、因果、决策或事实核验结构。

## 目标

- 让复杂问题的推理深度由承重条件决定，而不是固定套用长流程。
- 区分事实、推断与可证伪假设，并明确有效证据边界。
- 先给结论和可检验依据，不输出私有逐 token 思维过程。
- 对简单查询保持简短；只有额外工作可能改变结论时才增加分析。

## 实现

插件仅在 `SessionStart` 注入短路由：精确计算、因果分析、硬约束决策或事实核验可加载本插件的 Skill，简单查询直接处理。它不创建推理产物、不保存账本、不阻断文件写入，也没有 `Stop` 自我纠正门禁。

未注册 `Stop` nudge 是有意设计：额外模型回合只能证明又生成了一次文本，不能证明结论改善；缺少独立证据时，强制自我纠正可能保留错误，也可能把正确答案改错。

## 使用

- Claude Code：`/first-principles` 或 `/reasoning-methods`
- Codex：`$first-principles` 或 `$reasoning-methods`

两个 Skill 都要求结论先行，区分已知事实和假设，并指出有价值的反例、falsifier 或未覆盖证据。Skill 加载、Hook 激活和回答长度都不是正确性证据。

## 迁移、来源与验证

本插件替代旧的 `first-principles-gate` 与 `reasoning-methods-guard`。旧的 done/abort 生命周期、业务写屏障、五阶段 receipt 和工作区状态目录已不再属于合同；历史 `.first-principles/` 与 `.reasoning-methods/` 目录不会被删除。

方法独立综合了 `meta-skill`、`fable-skills`、Step-Back Prompting、自我纠正局限研究和自适应推理深度研究。具体来源、固定 revision 与许可证说明见 `licenses/` 和 Skill 正文。

```bash
npx tsx --test plugins/reasoning-methods/tests/*.test.ts
./scripts/acceptance/run.sh --plugin reasoning-methods
```

live acceptance 由脚本进入 `docker/host-acceptance`。版本：`1.0.0`。
