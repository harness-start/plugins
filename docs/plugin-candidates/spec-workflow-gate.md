# 候选插件：`spec-workflow-gate`

| 字段 | 裁定 |
| --- | --- |
| 形态 | 新插件，建议目录 `plugins/spec-workflow-gate/` |
| 优先级 | P1 |
| 默认安装 | 可以；仅在存在有效 `.spec-workflow.json` 时激活 |
| 目标 | 对 `.specs` 的 spec → plan → tasks 产物图执行确定性前置检查 |

## 为什么保留

`harness-starter` 的 `spec-workflow-artifact-gate` 与 `ai-experts` 的 `spec-plan-artifact-gate` 都会在写下游产物前检查 sibling `spec.md`。本仓的 `intent-clarify-gate` 只在首轮前置探索上下文，`reasoning-discipline` 只提供思考方法；它们都不验证磁盘上的规格产物依赖。

候选不采用“任意正则 + 只检查文件存在”的原草案。那条链路既容易误配，也不能阻止空 spec。最小版本使用固定、可解析的 `.specs/<NNN>-<slug>/` 合同。

## 最小产品合同

- 项目通过根级 `.spec-workflow.json` opt-in；配置只允许 schema version、规范化相对 spec root 和门禁模式，不执行用户代码。
- 插件内置 Skill、模板和确定性 validator。Skill 帮助创建产物，validator 由 `PreToolUse` 直接调用，不依赖 agent 主动执行。
- `spec.md` 至少包含稳定 Requirement ID、每个 Requirement 的可判定 Scenario、non-goals，并且不得残留 `NEEDS CLARIFICATION`。
- 写 `plan.md`、`research.md`、`data-model.md` 或 `contracts/**` 前，必须有通过 validator 的 sibling `spec.md`。
- 写 `tasks.md` 前，`plan.md` 必须记录当前 `spec.md` 摘要；摘要过期时拒绝。
- PreToolUse 同时覆盖文件工具和可确定目标的 shell 写入。无法确定 shell 目标时只 report，不声称已阻断所有旁路。
- validator 可写缓存 receipt，但 `PreToolUse` 放行前必须比较当前 spec root、相对路径、文件摘要、schema version、workspace 和 session provenance；缓存缺失或过期时直接重算。普通手写 JSON 不能解锁。

```text
项目显式 opt-in
  → PreToolUse 识别下游写目标并解析 sibling 上游
  → Hook 直接调用 validator 检查结构、未决标记和摘要谱系
  → 缺失/无效/过期则在写入前拒绝
  → 不匹配固定产物图的文件完全旁路
```

## Hook / Skill 分工

- `PreToolUse` 拥有目标识别、上游读取、validator 调用与 allow/deny；固定产物图的顺序约束不依赖 Skill 是否被触发。
- `spec-workflow` Skill 是初始化 `.spec-workflow.json`、选择模板、编排 spec → plan → tasks、解释 validator finding 和修复未决项的入口。
- Skill 不能签发 validator receipt、跳过 Requirement/Scenario 合同或把模型声称的“需求已澄清”当作文件事实。
- v1 不需要 `Stop` Hook；硬约束发生在下游副作用之前。以后若增加 completion closure，必须另有可信在途状态，不能解析最终回复。

## 非目标与边界

- 不判断需求是否真实、方案是否最佳，也不强制所有项目采用 spec-driven development。
- v1 不门禁生产源码写入；只保护规格产物之间的顺序，避免把配置错误扩大成全仓写锁。
- 不与长任务账本合并。规格产物可以引用任务 ID，但不共享状态文件。

## 实现准入与验收

- 无配置、无 `.specs`、普通 docs/plan 文件：完全 idle；
- 缺失 spec、空 Requirement、无 Scenario、残留 clarification、错误 sibling：写 plan 前拒绝；
- 合法 spec 允许 plan；spec 改动后旧 plan digest 失效，写 tasks 前拒绝；
- target path traversal、symlink spec root、大小上限、重复 ID 与 near-miss 文件名有离线测试；
- shell 重定向、`tee`、`cp`、脚本包装命中可确定目标时与文件工具结果一致；
- Docker 双宿主覆盖 negative → 修复 spec → retry 成功，并通过 honesty gate。

验收必须证明：不加载 Skill 时非法下游写入仍被拒绝；加载 Skill 但绕过模板、留下无效 spec 时也不能放行。

如果实现只能确认 `spec.md` 存在，不能验证最小结构和摘要谱系，则收益不足以新增插件。
