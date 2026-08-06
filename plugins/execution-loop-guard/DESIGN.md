# execution-loop-guard 设计

## 责任边界

插件只识别有连续事件证据的执行空转，不根据单次失败、单次编辑或任务耗时猜测 Agent 表现。它不替代调试方法、任务账本、CI 监督器或交付完成门禁。

PreToolUse 在命令执行前判断重复和轮询预算；PostToolUse 记录命令结果和文件编辑。Claude 的 `PostToolUseFailure` 补充失败结果，Codex 从 PostToolUse 响应退出码推断成败。

## 配置

按 `.execution-loop-guard.mjs`、`.cjs`、`.js` 顺序加载 Git 根目录的第一个配置。配置是项目拥有、通过 `import()` 加载的可信可执行配置。

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
    exemptPaths: [/\.mdx?$/i],
  },
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

- 模式为 `block | report | off`。`report` 永不阻断，`off` 不累计对应检查。
- 数值必须是非负或正整数；报告阈值必须小于阻断阈值。非法字段逐项回退默认值。
- `editLoop.exemptPaths` 追加到内置 Markdown 豁免，匹配 Git 根相对 POSIX 路径。
- 用户 RegExp 每次匹配前克隆，避免 `g`/`y` 状态影响判断。

## 状态与隐私

状态按 session 和 cwd 摘要隔离，原子写入宿主提供的插件数据目录，权限为 0600。文件路径和规范化命令只用于内存中的提示；磁盘只记录摘要、时间戳、计数与失败签名，不记录命令输出或文件内容。状态目录不可用、状态损坏或 Hook 异常时 fail-open。

编辑计数采用 30 分钟滚动时间戳，而不是永久累计。成功验证命令清空当前会话全部编辑计数；达到阻断阈值时立即清空对应文件周期。命令重复在阻断、显式 `# retry-ok` 或过期时清空。

## 命令判定

规范化只删除尾部观察管道、最终重定向和无语义空白，保留参数差异。失败连续计数还要求最近失败输出签名一致；错误形状改变时重新计数。

轮询预算识别字面 `sleep`、简单 `for {a..b}`/`while` 放大，以及 `glab`/`gh` 的 pipeline、job、run、checks、release、deploy 状态查询。默认只报告，因为等待可能是合法业务流程。

## 恢复

阻断消息必须给出 observed facts、潜在损害、解除条件和恢复路径。插件不会自动修改源码、终止外部任务或回滚已经发生的编辑。
