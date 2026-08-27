# 执行纪律守卫

`execution-discipline` 在 Claude Code 和 Codex 中识别三类无进展循环：反复编辑同一文件、重复执行相同命令，以及用大量 `sleep`、Codex wait 工具和状态查询轮询远端任务。

## 目标

在 agent 消耗整个会话前，用连续事件证据识别重复编辑、同形错误重试、无意义成功命令重复和过度轮询。插件只在达到明确阈值后报告或阻断，不根据单次失败、任务耗时或主观印象评判执行质量。

## 实现

`PreToolUse` 根据规范化命令、直接输入文件摘要、近期结果签名和轮询预算决定提示或阻断；`PostToolUse` 更新命令结果与文件编辑计数。状态按 session/workspace 摘要隔离，原子写入宿主数据目录，不保存命令输出、文件内容或明文路径。成功验证命令会清空编辑周期，`execution-discipline-config` Skill 仅帮助配置与诊断。

## 默认行为

| 检查 | 提示 | 阻断 | 自动清理 |
| --- | ---: | ---: | --- |
| 同文件编辑 | 30 分钟内第 5 次 | 第 20 次 | 滚动窗口、成功验证命令、阻断后新周期 |
| 相同失败命令 | 第 2 次执行前 | 第 3 次执行前 | 命令直接文件输入内容变化、10 分钟过期、阻断或 `# retry-ok` |
| 相同成功命令 | 第 6 次执行前 | 第 12 次执行前 | 命令直接文件输入内容变化、10 分钟过期、阻断或 `# retry-ok` |
| 远端轮询 | 30 分钟内 `sleep >= 600s` 或查询 20 次 | 默认不阻断 | 滚动窗口，报告冷却 5 分钟 |

Markdown 文件默认不计入编辑循环。只读命令不计入命令重复；`# poll-ok` 可让有意等待不进入轮询预算。

成功的测试、lint、typecheck、build 或其他明确验证命令会清空当前 session/workspace 的全部编辑计数，代表本轮修改已经产生可验证进展。插件状态写在当前工作目录的 `.execution-discipline/state/`；`.execution-discipline/.gitignore` 忽略该工作目录的全部内容，插件不会修改项目根目录的 `.gitignore`。状态不保存命令输出或文件内容。

## 项目配置

在 Git 根目录创建 `.execution-discipline.mjs`：

```js
export default {
  checks: {
    editLoop: "block",
    failedCommandRetry: "block",
    successfulCommandRepeat: "block",
    remotePolling: "report",
  },
  editLoop: {
    reportAt: 5,
    blockAt: 20,
    windowMinutes: 30,
    exemptPaths: [/^docs\//],
  },
};
```

模式支持 `block`、`report`、`off`。也可使用插件自带的 `execution-discipline-config` Skill 初始化或诊断配置。

完整配置还支持：

```js
export default {
  commandRepeat: {
    failureReportAt: 2,
    failureBlockAt: 3,
    successReportAt: 6,
    successBlockAt: 12,
    windowMinutes: 10,
    retryBypass: /(?:^|\s)#\s*retry-ok\b/i,
  },
  polling: {
    sleepBudgetSeconds: 600,
    queryBudgetCount: 20,
    windowMinutes: 30,
    cooldownMinutes: 5,
    maxSleepPerCommandSeconds: 3600,
    whileLoopAssumedIterations: 10,
    pollBypass: /(?:^|\s)#\s*poll-ok\b/i,
  },
};
```

配置按 `.execution-discipline.mjs`、`.cjs`、`.js` 顺序通过 `import()` 加载 Git 根目录中的第一个文件。数值必须是合法非负或正整数，报告阈值必须小于阻断阈值；非法字段逐项回退默认值。`editLoop.exemptPaths` 追加到内置 Markdown 豁免，并匹配 Git 根相对 POSIX 路径。用户正则每次匹配前会克隆，避免 `g`/`y` 状态影响结果。

## 设计与判定边界

插件只识别有连续事件证据的执行空转，不会根据单次失败、单次编辑或任务耗时猜测 agent 表现，也不替代调试方法、任务账本、CI 监督器或交付完成门禁。

`PreToolUse` 在命令执行前判断重复和轮询预算；Codex 若为 `wait`、`wait_agent`、`write_stdin`、`list_agents` 发出工具事件，也按请求的等待上限和查询次数计入同一预算。`PostToolUse` 记录命令结果和文件编辑。Claude 的 `PostToolUseFailure` 补充失败结果，Codex 从 `PostToolUse` 响应退出码推断成败。

工具级统计只在宿主实际发出对应 Hook 事件时生效；请求的 timeout/yield 是上限，不是实际耗时，所以默认只报告。持续中的统一命令 session 不会因后续 `write_stdin` 必然再次触发 `PreToolUse`，插件不声称能观察宿主未暴露的轮询事件。调用方自身的单次等待上限是这类不可见边界的第一道约束。

状态按 session 和 cwd 摘要隔离，原子写入宿主插件数据目录，权限为 `0600`。磁盘只保存摘要、时间戳、计数和失败签名，不保存命令输出、文件内容、路径或规范化命令。状态目录不可用、状态损坏或 Hook 异常时 fail-open。

命令规范化只删除尾部观察管道、最终重定向和无语义空白，保留参数差异。失败连续计数还要求最近失败输出签名一致，错误形状变化后重新计数。轮询预算识别字面 `sleep`、简单 `for {a..b}`/`while` 放大，以及 `glab`/`gh` 的 pipeline、job、run、checks、release、deploy 状态查询；默认只报告，因为等待可能是合法流程。

阻断消息必须说明观察事实、潜在损害、解除条件和恢复路径。插件不会自动修改源码、终止外部任务或回滚已经发生的编辑。

## 验证

```bash
npx tsx --test plugins/execution-discipline/tests/*.test.ts
./scripts/acceptance/run.sh --plugin execution-discipline
```

版本：`0.2.0`
