# Debugging Workflow Guard

`software-debugging` 管具体软件故障怎么修。它带一份 `debug-workflow` Skill，并用 Hook 卡住证据顺序。语言不限。多个缺陷各自记账，不会混在一起。

只加载 Skill 不会打开硬规则。要先用插件自带的 `debug-workflow` CLI 创建或恢复账本，会话才进入工作流。Hook 不靠读 prompt 判断你在干什么，也不接受对账本的直接 Edit/Write。

## 怎么跑

```text
具体故障请求
  -> debug-workflow Skill 调用 CLI 创建或恢复账本（intent.json + events.jsonl）
  -> PostToolUse 把该 writer 命令绑定到会话
  -> 命令与修改回执归属 activeBugId
  -> PreToolUse 要求精确失败基线，并在三轮失败修复后冻结该缺陷；直接改账本会被拒绝
  -> Stop 允许进行中的轮次结束；关闭时用当前会话回执核对完成，不要求把 R-N 抄回快照
```

它核对的是工作流有没有按顺序留下证据，不核对假设对不对。agent 还是要看命令输出。

## 激活和状态

- `SessionStart` 只报告 fold 后的可恢复账本，从不选择或激活它。
- 插件 CLI（init/open/resume/activate/pause/close/…）是唯一激活入口，会把稳定 ID 和 epoch 绑定到当前宿主会话。
- 创建任何有效账本都会记录进入工作流；只有 open/active 订单取得修改守卫租约。
- 跨会话恢复必须增加 `run.epoch`（`resume`），且租约空闲或已过期。V1 不允许多个会话并发使用同一个 Work Order。
- 默认通过 `.git/info/exclude` 排除账本，不修改项目 `.gitignore`。
- 插件状态保存哈希、有限摘要、结果、修订、时间戳和缺陷归属，不保存原始命令输出。
- 新账本是写一次的 `intent.json` 加只追加的 `events.jsonl`。旧的 `.debug-workflow/*.md` 仍可读。
- 直接用文件工具或等价 shell 改 live ledger 会被拒绝。

## 必须满足的条件

1. 有效 CLI writer 绑定当前会话前，Hook 保持惰性。
2. 同一时间只有一个活动缺陷，所有回执都带该缺陷 ID。
3. 修改生产文件前，活动缺陷以及共享修复列出的每个缺陷，都要各自有归属明确、精确、发生在修改前的失败复现。不再要求模型改快照去写 `supported` / `fixing` / `in-progress`。
4. 缺陷关闭前，必须有已应用的修复修改、修改前失败、最后一次相关修改后原复现成功、回归成功以及非失败的清理回执；`Stop` 在 `close` 后还会独立扫描 debug marker。
5. 回执引用必须存在于已绑定会话，并归属同一缺陷。
6. 三次修改后复现失败只冻结当前缺陷。
7. `SessionStart` 发现永不选择或恢复 Work Order。
8. 进行中的轮次可以结束，不必先 pause。

共享生产修复只有在每个受影响缺陷依次激活并取得各自精确失败基线后才允许进行。完成证据的新鲜度只相对该缺陷的相关修复修改计算。

## Hook 行为

- `PreToolUse` 在已绑定 ledger 无效、缺少精确失败基线、共享受影响缺陷没有独立基线，或三次修改后复现失败时阻断生产修改；它拒绝直接改账本，始终允许官方 CLI。
- `PostToolUse` 和 Claude `PostToolUseFailure` 保存有限回执，并在 writer 命令后绑定。Claude 接收结构化 `additionalContext`；Codex 的非阻断工具生命周期提示以状态 0 写入 stderr，不向 provider 插入替代工具结果。
- `Stop` 对仍开放的账本放行。`closed` 订单必须用当前会话回执证明完成，并通过独立 debug-marker 扫描；`paused` 或 `aborted` 订单只当交接。

Codex 通过 `PostToolUse` 响应报告命令失败，Claude 还提供 `PostToolUseFailure`。Shell 修改检测较保守，优先使用文件工具可获得更清晰的编辑轨迹。

## CLI

```bash
DWG="${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:?}}/dist/cli/debug-workflow.mjs"
node "$DWG" init --cwd "$PWD" --slug login --summary "..." --actual "..." --repro "node --test test/login.test.mjs"
node "$DWG" activate --bug BUG-001
node "$DWG" affect --bugs BUG-001,BUG-002
node "$DWG" pause --next "collect a local reproduction"
node "$DWG" status
node "$DWG" close
```

## 项目配置

需要调整默认值时，在 Git 根目录创建 `.software-debugging.mjs`：

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

- 伪造的回执会被拒绝，因为完成检查只读 `.debug-workflow/.state/` 里 Hook 签发的回执。
- 缺陷各自记账，不能拿 A 的复现去给 B 交差；最后一次相关修改之前的验证算过期。
- 租约和 epoch watermark 会拒绝并发恢复。
- 已绑定后，无效、过大、符号链接或损坏的账本会 fail-closed。

命令成功、ledger 结构对，只说明流程走完了，不说明缺陷真修好了。

## 方法来源

工作流参考了四项历史审计时的外部方法，但不会安装或路由到这些外部 Skill：

- `obra/superpowers/systematic-debugging` @ `44c9b2d6e889982ac18c27d05a19fefe335194e1`：修复前先定位根因，重复失败后升级架构处理；
- `anthropics/knowledge-work-plugins/debug` @ `28153f89ef0dcc754d0707a1d02ce0bf8213b9cc`：精简的复现、隔离、诊断和修复报告循环；
- `wshobson/agents/debugging-strategies` @ `c4b82b0ad771190355eb8e204b1329732a18449a`：差分、二分和 trace 隔离策略；
- `pproenca/dot-skills/debug` @ `c9228d2d0c1391190168845824ceb4e33bb844fb`：先定位行为在哪里偏离，再判断哪里损坏，并使用 last-known-good 与 fault propagation。

本插件还约定了紧凑的 RED 循环、重置样例、唯一调试前缀、按缺陷记录因果、精确复现验证，以及双宿主怎么记来源。
