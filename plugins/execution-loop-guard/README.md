# execution-loop-guard

`execution-loop-guard` 在 Claude Code 和 Codex 中识别三类无进展循环：反复编辑同一文件、重复执行相同命令，以及用大量 `sleep` 和状态查询轮询远端 CI。

## 默认行为

| 检查 | 提示 | 阻断 | 自动清理 |
| --- | ---: | ---: | --- |
| 同文件编辑 | 30 分钟内第 5 次 | 第 20 次 | 滚动窗口、成功验证命令、阻断后新周期 |
| 相同失败命令 | 第 2 次执行前 | 第 3 次执行前 | 10 分钟过期、阻断或 `# retry-ok` |
| 相同成功命令 | 第 6 次执行前 | 第 12 次执行前 | 10 分钟过期、阻断或 `# retry-ok` |
| 远端轮询 | 30 分钟内 `sleep >= 600s` 或查询 20 次 | 默认不阻断 | 滚动窗口，报告冷却 5 分钟 |

Markdown 文件默认不计入编辑循环。只读命令不计入命令重复；`# poll-ok` 可让有意等待不进入轮询预算。

成功的测试、lint、typecheck、build 或其他明确验证命令会清空当前 session/workspace 的全部编辑计数，代表本轮修改已经产生可验证进展。插件状态只保存在 `PLUGIN_DATA` 或 `CLAUDE_PLUGIN_DATA`，不写项目目录，也不保存命令输出或文件内容。

## 项目配置

在 Git 根目录创建 `.execution-loop-guard.mjs`：

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

模式支持 `block`、`report`、`off`。完整 schema 见 [DESIGN.md](./DESIGN.md)，也可使用插件自带的 `execution-loop-guard-config` Skill 初始化或诊断配置。

## 验证

```bash
node --test plugins/execution-loop-guard/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin execution-loop-guard
```

Version: `0.1.0`
