# Debugging Workflow Guard

`debugging-workflow-guard` 管具体软件故障怎么修。它带一份 `debug-workflow` Skill，并用 Hook 卡住证据顺序。语言不限。多个缺陷各自记账，不会混在一起。

只加载 Skill 不会打开硬规则。要先创建或恢复一份有效的 `.debug-workflow/*.md` Work Order，会话才进入工作流。Hook 不靠读 prompt 判断你在干什么。

## 怎么跑

```text
具体故障请求
  -> debug-workflow Skill 创建或恢复有效 Work Order
  -> PostToolUse 将该文件和 epoch 绑定到会话
  -> 命令与修改回执归属 activeBugId
  -> PreToolUse 要求精确失败基线和因果证据，并在三轮失败修复后冻结该缺陷
  -> Stop 用当前会话回执核对关闭声明；暂停的订单只当交接，不当完成
```

它核对的是工作流有没有按顺序留下证据，不核对假设对不对。agent 还是要看命令输出，把能证伪的解释写进订单。

## 激活和状态

- `SessionStart` 只报告可恢复的 Work Order，从不选择或激活它。
- 成功修改一个有效 Work Order 的 `PostToolUse` 是唯一激活入口，会把稳定 ID 和 epoch 绑定到当前宿主会话。
- 创建任何有效 Work Order 都会记录进入工作流；只有 open/active 订单取得修改守卫租约。
- 跨会话恢复必须增加 `run.epoch`，且租约空闲或已过期。V1 不允许多个会话并发使用同一个 Work Order。
- 默认通过 `.git/info/exclude` 排除 Work Order，不修改项目 `.gitignore`。
- 插件状态保存哈希、有限摘要、结果、修订、时间戳和缺陷归属，不保存原始命令输出。
- `status`、`run.state`、缺陷状态、假设状态、根因状态和修复状态是彼此独立的状态机。内置 Skill 列出所有允许值，schema 错误也会给出这些值。
- 临时无效的已绑定 Work Order 会阻断无关生产写入，但允许在同一路径修复；其 ID、epoch 和已有回执不能被静默替换。

## 必须满足的条件

1. 有效 Work Order 修改绑定当前会话前，Hook 保持惰性；以暂停状态创建只记录入口，不留下活动守卫。
2. 同一时间只有一个活动缺陷，所有回执都带该缺陷 ID。
3. 修改生产文件前，活动缺陷以及共享修复列出的每个缺陷，都要各自有归属明确、精确、发生在修改前的失败复现。活动缺陷还须有当前会话支持的假设和根因，并处于 `fixing` / `in-progress`。
4. Skill 可以在确有价值时用普通自然语言创建通用只读子 Agent，帮助挑战诊断或架构判断；插件不绑定子 Agent 身份，也不把其回复当作审批。缺陷标为 resolved 前，必须有已应用的修复修改、修改前失败、受支持的假设与根因、最后一次相关修改后原复现成功、回归成功以及非失败的清理回执；`Stop` 还会独立扫描 Work Order debug marker。
5. 回执引用必须存在于已绑定会话，并归属同一缺陷。
6. 三次修改后复现失败只冻结当前缺陷。
7. `SessionStart` 发现永不选择或恢复 Work Order。

共享生产修复只有在每个受影响缺陷依次激活并取得各自精确失败基线后才允许进行。完成证据的新鲜度只相对该缺陷的相关修复修改计算，无关的后续编辑不会使有效证据过期。

## Hook 行为

- `PreToolUse` 在已绑定 ledger 无效、缺少精确失败基线或受支持的因果证据、共享受影响缺陷没有独立基线、活动缺陷状态不合格，或三次修改后复现失败时阻断生产修改；它始终允许修复已绑定的同一路径。
- `PostToolUse` 和 Claude `PostToolUseFailure` 保存有限回执。标准宿主接收结构化 `additionalContext`；Codex 0.146 配合本仓库 DeepSeek provider 时，Hook 会先保存回执，再输出非零 stderr 信号并以状态 2 退出，以绕开会替换原工具结果的 provider 问题。
- `Stop` 始终要求回复引用已绑定 Work Order。`closed` 订单必须用当前会话回执证明完成，并通过独立 debug-marker 扫描；`paused` 或 `aborted` 订单只接受 schema 有效的交接，不伪装为完成。

Codex 通过 `PostToolUse` 响应报告命令失败，Claude 还提供 `PostToolUseFailure`。Shell 修改检测较保守，优先使用文件工具可获得更清晰的编辑轨迹。

## 项目配置

需要调整默认值时，在 Git 根目录创建 `.debugging-workflow-guard.mjs`：

```js
export default {
  mode: "block", // block | report | off
  ledger: {
    root: ".debug-workflow",
    persistence: "local", // local | tracked
    maxFiles: 40,
    maxBytes: 256 * 1024,
  },
  limits: {
    maxBugs: 50,
    maxHypothesesPerBug: 20,
    maxFailedFixAttempts: 3,
    leaseMinutes: 120,
    maxReceipts: 200,
  },
  commands: {
    reproductionPatterns: [],
    verificationPatterns: [],
    expectedFailurePatterns: [],
    expectedSuccessPatterns: [],
  },
  paths: {
    codePatterns: [],
    testPatterns: [],
    diagnosticPatterns: [],
    nonCodePatterns: [],
  },
};
```

正则配置使用不带分隔符的 JavaScript 正则表达式；无效表达式永不匹配。

## 边界

- 伪造的 Work Order 回执会被拒绝，因为 `Stop` 会从 `.debug-workflow/.state/` 解析 ID。
- 缺陷各自记账，不能拿 A 的复现去给 B 交差；最后一次相关修改之前的验证算过期。
- 租约和 epoch watermark 会拒绝并发恢复。
- 已绑定后，无效、过大、符号链接、多代码块或含未知字段的 Work Order 会 fail-closed。首次写入失败且没留下文件时保持空闲；暂时坏掉的已绑定文件会保留回执，只能原地修，不能改 ID 或 epoch。

命令成功、ledger 结构对，只说明流程走完了，不说明缺陷真修好了。

## 方法来源

工作流吸收了四项固定 revision 的外部方法，但不会安装或路由到这些外部 Skill：

- `obra/superpowers/systematic-debugging` @ `44c9b2d6e889982ac18c27d05a19fefe335194e1`：修复前先定位根因，重复失败后升级架构处理；
- `anthropics/knowledge-work-plugins/debug` @ `28153f89ef0dcc754d0707a1d02ce0bf8213b9cc`：精简的复现、隔离、诊断和修复报告循环；
- `wshobson/agents/debugging-strategies` @ `c4b82b0ad771190355eb8e204b1329732a18449a`：差分、二分和 trace 隔离策略；
- `pproenca/dot-skills/debug` @ `c9228d2d0c1391190168845824ceb4e33bb844fb`：先定位行为在哪里偏离，再判断哪里损坏，并使用 last-known-good 与 fault propagation。

本插件还约定了紧凑的 RED 循环、重置样例、唯一调试前缀、按缺陷记录因果、精确复现验证、有限状态，以及双宿主怎么记来源。
