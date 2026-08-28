# 意图发现

> **Private AIO module.** This directory is not independently installable or published. Host manifests, Hook registration, and MCP exposure belong to the `session-governance` owner. This module retains only its implementation, bundled methods and assets, tests, and acceptance material.

`intent-discovery` 在 Claude Code 和 Codex 收到会话首个用户 prompt 时，先注入一次短小的发现协议。目标、结果、约束和验收已经具体的任务按 `light` 直接执行，不加载 Skill，也不启动 discovery worker；只有尚未解决的解释会实质改变交付物或实现时，主 agent 才加载插件自带的 `intent-discovery` Skill，前置查找项目事实并按任务复杂度选择是否并发只读 subagent。同一会话后来出现新的结果、交付物、目标系统或范围时，也可通过宿主的正常 Skill 路由再次使用；继续执行、追问、纠正或状态请求不会重跑完整发现流程。

这个插件不会开启访谈、等待 `done`、阻断业务写入或要求用户批准方案。探索结束后，agent 以有界、可逆的合理假设继续原请求；只有宿主自身的安全、权限或不可逆操作规则仍可能要求确认。

## 目标

在真正会改变实现的歧义上先查项目事实、候选解释和最便宜反例，同时让目标、约束与验收已经明确的任务直接执行。发现过程有界，证据重复时停止，父 agent 对最终判断和行动负责。

## 实现

唯一的 `UserPromptSubmit` Hook 通过平台数据目录中的摘要 claim 保证首个 prompt 最多注入一次短协议，不保存 prompt 正文。开放式判断全部在捆绑的 `intent-discovery` Skill 中完成：按 `light`、`standard`、`intensive` 选择本地探索和至多三个只读 worker；后来出现实质新任务时依靠宿主原生 Skill 路由，不复用首轮 Hook 状态。

具体仓库任务的本地探索限定为命名 seam、调用方、测试、文档和历史；证据开始重复时停止搜索并转入复现。不可见 evaluator、答案补丁和答案缓存被明确视为不可用证据，不能替代仓库合同。

## 行为

```text
first UserPromptSubmit
  -> platform-scoped exclusive session claim
  -> inject intent-discovery instruction once
  -> light | standard | intensive discovery
  -> parent reconciles evidence and continues

later UserPromptSubmit
  -> silent

later materially new task
  -> native Skill routing (no Hook reinjection)
  -> bounded discovery for the new task only
```

| 深度 | 适用 | 并发行为 |
| --- | --- | --- |
| `light` | 明确查询、转换、小范围任务或已有可靠 oracle | 主 agent 快速核对，不启动 worker |
| `standard` | 仓库事实或一项关键假设会改变实现 | 最多两个只读 worker：上下文侦察、假设挑战 |
| `intensive` | 模糊、跨模块、高影响、陌生或外部依赖任务 | 最多三个并发 worker；必要时 fan-in 后增加一次独立复核 |

worker 只返回带 `Evidence`、`Assumptions` 和 `Gaps` 的 Result Card。父 agent 重读关键证据、处理分歧并承担最终行动，不输出 worker transcript 或私有逐 token 推理。

## Hook 与状态

插件只注册 `UserPromptSubmit`。Hook 不判断开放式意图，也不生成方案；它只机械保证本会话的首轮协议最多注入一次。新任务边界由 Skill 描述和宿主原生路由判断，不增加第二套 Hook 状态。

- Claude 状态位于 `CLAUDE_PLUGIN_DATA/intent-discovery/first-prompts/`。
- Codex 状态位于 `PLUGIN_DATA/intent-discovery/first-prompts/`。
- 文件名由平台和 session id 的 SHA-256 生成，正文仅含 schema version 与注入时间，不保存用户 prompt。
- 缺少 session id 或平台数据目录时 fail-open：本轮仍注入，但不建立会阻断后续工作的状态。

双平台使用各自的 Hook 根变量和数据目录；运行时不安装依赖，也不引用插件目录外的文件。

## Skill

`skills/intent-discovery/` 是插件唯一的 Skill。它把三种方法收在一个入口内，避免多个宽泛 Skill 互相抢路由：

- context-first：先读项目指令、入口、测试、配置和必要的当前信源；
- divergent framing：只展开会产生不同工作结果的候选解释；
- adversarial review：steelman 最强替代方案，检查承重假设和最便宜证伪路径。

方法经过独立重写，参考了 [mattpocock/skills](https://github.com/mattpocock/skills) 的 design tree、[obra/superpowers](https://github.com/obra/superpowers) 的 context-first brainstorming、[wangruofeng/meta-skill](https://github.com/wangruofeng/meta-skill) 的生成/对抗分离，以及 [oliwoodman/fable-skills](https://github.com/oliwoodman/fable-skills) 的 honest limits。插件不复制或运行这些仓库的 Skill、脚本和 assets。

## 从 0.1.x 迁移

2.0.0 删除了 `/grilling`、三选一输入、`done`/abort、业务写屏障、项目配置文件和外部 `skill-deps.json`。已有 `.grill-ledgers/` 与 `.intent-discovery.*` 是用户历史数据，升级不会删除；它们不再被插件读取。

## 验证

```bash
# cwd: marketplace 仓库根目录
npx tsx --test plugins/intent-discovery/tests/*.test.ts
bash scripts/ci/validate-plugins.sh
./scripts/acceptance/run.sh --plugin intent-discovery
```

最后一条命令从宿主构建 `docker/host-acceptance`，在容器内运行 Claude Code 和 Codex live acceptance。
