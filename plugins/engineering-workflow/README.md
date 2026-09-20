# engineering-workflow

`engineering-workflow` 拥有与语言无关、可持久的软件变更工作流：先证据的调试、规格驱动交付、测试先行的实现，以及由父 agent 审核落地的显式 CLI 实现委派。它同时提供 agent 方法和机械门禁，使工作流能撑过长会话，或从仓库产物恢复。

## 用途

一般工程建议不够用时：失败需要可复现的因果记录，大改动需要可追踪需求，或行为变更必须在实现前展示 RED。本插件把这些情况变成显式工作流，同时不拖累普通功能工作和简单编辑。

## 设计

owner 在同一源码树下有四个内部域：`debugging`、`delegation`、`specification` 和 `testing`。它们共享 owner dispatcher、CLI、构建、测试、验收、Skill 和 license 边界。Skill 拥有诊断、规划、任务分解、红绿判断和委派方法。Hook 只拥有可机械验证的约束，例如绑定活动调试账本、保护工作流产物、强制规格顺序，以及要求对应测试先于实现写入而改变。`delegation` 是显式 CLI 工作流，不注册 Hook，也不构成自动 provider 编排层。

owner 暴露一个公开 dispatcher 和一套统一的确定性 CLI。安装即为 Claude Code 与 Codex 启用完整 Hook 和 Skill 表面；没有能力 profile，也没有按语言分支。

## 能力

| 域 | 能力 | 持久产物或门禁 |
| --- | --- | --- |
| `debugging` | 复现、假设跟踪、根因证据、多缺陷隔离、尝试回执、暂停/恢复和完成检查 | 只追加的 `.debug-workflow` 账本和会话租约 |
| `delegation` | 把有边界的实现任务显式交给 Codex、Claude Code、Antigravity、Grok Build 或 Pi CLI；父 agent 复核和落地 | relay `result.json` 加委派前后 Git 审计；允许既有脏工作树 |
| `specification` | Specify → plan → tasks → build 推进，带 digest 新鲜度和需求可追溯性 | `.specs` 产物以及顺序/新鲜度校验 |
| `testing` | 测试先行编排和源码写入顺序强制 | 行为变更的实现目标写入前，对应测试必须先改 |

公开 Skill 包括 `debug-workflow`、`sdd`、`sdd-specify`、`sdd-plan`、`sdd-tasks`、`sdd-build`、`tdd-red-green`、`test-driven-development-orchestrator`，以及 `codex-delegate`、`claude-delegate`、`agy-delegate`、`grok-delegate` 和 `pi-delegate`。

## 适用场景

具体错误、失败测试、回归、不稳定行为、性能故障或可恢复的缺陷调查用 `debugging`。用户明确指定某个外部 CLI 作为实现者、且父 agent 将负责审查时用 `delegation`。变更跨越多项需求或模块、需要持久意图、计划、任务和验证配方时用 `specification`。公开行为有稳定测试缝、实现应由观察到的 RED/GREEN 循环驱动时用 `testing`。

## 不适用场景

不要为推测性评审、功能设计、仍需先遏制的生产事故或概念解释启动调试工作流。不要自动选择 provider、同时启动 provider fleet，或把普通直接实现请求解释成委派。不要为一行、oracle 明显的机械改动创建 SDD 产物。不要把 TDD 强加到生成文件、纯文档编辑，或没有有意义公开测试缝的工作。工程评审和一般完成纪律属于 `session-governance`。

## 运行时行为

`SessionStart` 报告可恢复的调试/测试上下文。`PreToolUse` 保护调试和规格账本，并强制测试先于源码的顺序。`PostToolUse` 记录观察到的调试回执并推进规格证据；Claude Code 上的 `PostToolUseFailure` 仍对调试状态可见。`Stop` 只阻断已激活、且声明的完成证据不完整的调试工作流。owner 解析每个 Hook 事件一次，并在同一进程内调用匹配的领域处理器；不启动私有插件运行时。

安装插件不会自动打开调试账本或创建 `.specs`。硬工作流由持久项目产物和官方 writer 命令激活，不是因为提到 Skill 名或仅仅加载了 Skill。

## 公开接口

公开 CLI 协议是：

```bash
node "${PLUGIN_ROOT}/dist/cli/harness.mjs" <resource> <action> [arguments]
```

资源：

- `debug`：把 `init`、`activate`、`claim`、`affect`、`add-bug`、`pause`、`resume`、`status`、`close` 和 `abort` 等动作转发到调试账本 writer；
- `delegate`：把显式选择的 `codex`、`claude`、`agy`、`grok` 或 `pi` provider 转发到插件内置 relay，并在 `result.json` 中追加基线/最终 Git 审计；
- `spec`：暴露 `check`，校验当前规格产物。

Skill 仍是开放工作的常规入口；CLI 是 Skill、用户和 Hook 使用的确定性 writer/校验缝。

## 配置与状态

调试工作流把仓库拥有的账本存在 `.debug-workflow` 下，并把活动工作绑定到会话/epoch 租约。规格状态在 `.specs` 中，用内容 digest 检测过期的下游产物。测试域从仓库路径、导入、符号和 Git 变更推导对应关系，不另建任务数据库。领域特定项目配置可以调整支持的模式，但不引入语言档位。

## 边界

Hook 能证明顺序、产物有效性、观察到的命令结果，以及当前 digest 关系。它不能证明假设在科学上成立、失败测试是因预期原因失败，或通过的套件覆盖了全部行为。委派审计只能比较前后 Git 可见状态，不能归因并发写入，也不覆盖 ignored path、submodule 内部或完美还原的临时改写。父 agent 必须解释 RED/GREEN、根因证据和 provider 产物，并独立重跑门禁。

五个 relay 固定来自 `amelnagdy/delegate-skills` 提交 `f36c3db8f80a29ac064cdc6d1dd8f5c63a6c84ef`，按 MIT 许可证分发，并移除了上游 fleet lane 依赖。本版本只完成离线协议测试；所有真实 provider 会话均标记为 live-unverified。

## 验证

```bash
node --import tsx --test \
  plugins/engineering-workflow/tests/**/*.test.ts
npm run check:dist
```

Claude Code 与 Codex 实时验收使用 `./scripts/acceptance/run.sh --plugin engineering-workflow`，因此在 Docker 中运行。
