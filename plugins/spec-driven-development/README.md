# 规格驱动开发

`spec-driven-development` 提供一个轻量的 Spec-Driven Development 主入口：用户调用 `$sdd`，插件按 `spec.md → plan.md → tasks.md → build` 推进。

## 目标

让需求、方案、任务与实现之间存在可机械重算的摘要和覆盖关系：上游发生变化时，下游在下一次写入前被判定为 stale。插件只守规格产物顺序和结构，不声称规格正确、任务已执行或实现符合需求。

## 实现

`sdd` 编排入口按阶段加载 `sdd-specify`、`sdd-plan`、`sdd-tasks` 与 `sdd-build`。`PreToolUse` 在写 `plan.md` 或 `tasks.md` 前校验 sibling 上游及摘要；`PostToolUse` 只报告刚写产物自身的结构问题。可选 subagent 只返回带 `brief-id` 的有界 Result Card，父 agent 仍负责写规格、检查 diff 与复跑验证。

## 产物

每个变更位于 `.specs/<NNN>-<slug>/`：

- `spec.md`：Intent、带 `REQ-NNN` 的 Requirements、Given/When/Then Scenario、Non-goals。
- `plan.md`：当前 spec 摘要、Approach、Change Surface、Risks、Validation，以及完整 REQ 覆盖。
- `tasks.md`：当前 spec/plan 摘要、`TASK-NNN`、Requirement、Depends、Files 和 Verify。

Hook 在写 `plan.md` 前验证 sibling `spec.md`，在写 `tasks.md` 前验证当前 `spec.md` 与 `plan.md`。上游变化会使下游摘要失效。PostToolUse 只报告刚写 artifact 自身的结构问题；下游 stale 状态留给下一次 PreToolUse 确定性重验，避免冗余提示干扰宿主工具回执。

该硬效果只覆盖宿主能识别的 `.specs` 文件工具与已知 shell 写目标。插件不阻断源码、不判断需求或方案质量、不证明实现遵循规格，也不把 `Verify:` 文本视为已执行验证。不透明 shell 旁路不在完整阻断承诺内。

## Subagent 策略

Skills 把 subagent 用作上下文收口：默认 `fork_turns: "none"`、最大并发 2、禁止嵌套委派，使用带 `brief-id` 的有界 Task Brief 和不超过 4 KiB 的 Result Card。Result Card 必须回显 `brief-id`；这只是关联结果的必要条件，不是直接交付证明。简单单文件任务不派发；父 agent 始终负责写规格、裁决冲突、检查 diff、复跑 Verify 和最终交付。

`fork_turns: "none"` 只是隔离请求：spawn 成功和 `brief-id` 回显都不能单独证明 worker 遵守了 Task Brief。它也不是文件系统 sandbox，不能证明 worker 没有读取共享工作区中的其他文件。父 agent 必须以 agent 树、实际 diff 和复验约束结果；出现缺失 direct brief、意外后代、禁用工具调用或越界写入时 fail closed 并收回父会话。当前 Codex 0.147 + DeepSeek 的 Docker 验收会让收到 bounded brief 的 worker 继续调用禁用工具，因此这个组合默认退回 parent，而不是改用 `fork_turns: "all"`。敏感信息不能仅靠 Task Brief 隔离。

## 验证

```bash
npx tsx --test plugins/spec-driven-development/tests/*.test.ts
bash scripts/ci/validate-plugins.sh
./scripts/acceptance/run.sh --plugin spec-driven-development
```

live acceptance 由入口脚本构建并运行 `docker/host-acceptance`，不在宿主直接启动 Claude Code 或 Codex。
