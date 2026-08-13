# work-report-insights

`work-report-insights` 从本机 Claude Code 和 Codex 的 transcript 生成日报、周报和指定日期范围的工作总结。员工按题回答；报告会写工作方法和执行上的缺口，正文要员工确认后才能落盘。

## Skills

- `$daily-work-report`：保留原 Skill 名，输出 `~/.ai-experts/daily-reports/YYYY-MM-DD.md`。
- `$weekly-work-report`：输出 `~/.ai-experts/weekly-reports/YYYY-Www.md`。
- `$work-summary-report`：输出 `~/.ai-experts/work-summary-reports/YYYY-MM-DD_to_YYYY-MM-DD.md`。

三个流程都只读取 transcript，不调用 Git。`daily-work-report-collect` 兼容旧的 `--skip-git` 参数，但该参数是 no-op。

## Confirm and seal

报告先在受保护目录之外形成草稿。`prepare` 记录候选正文摘要，员工明确确认后，`save` 才能写入最终路径。保存工具在确认正文末尾加入唯一标签：

```html
<!-- work-report-insights:sha256:<64-hex-digest> -->
```

摘要覆盖标签之前的精确 UTF-8 字节。存在有效标签后，正文和标签均不可修改。后续补充必须经过 `addition-prepare`、再次确认和 `append`；append 保留文件的所有原有字节，只在末尾新增内容。摘要错误、标签畸形或重复标签都会停止写入。

## Hook boundary

`PreToolUse` 拒绝 Write、Edit、apply_patch 和 shell 对 `~/.ai-experts/*-reports/*` 的直接修改，同时检查真实路径、symlink 和递归父目录操作。只读检查不受影响。`Stop` 仅在活动报告流程声称已经保存、但没有成功封印回执时阻断；普通请求不建立状态，也不产生 hook 输出。会话 hook 状态写在当前工作目录的 `.work-report-insights/.state/`，带 `*` 的 `.gitignore`。

这个边界保护的是经过 Claude/Codex 工具调用的 AI 操作。用户在宿主之外直接修改文件不经过插件 hook；下次校验会把正文摘要不匹配视为损坏并拒绝继续追加。

## Local verification

在 marketplace 根目录运行：

```bash
node --test plugins/work-report-insights/tests/*.test.mjs
find plugins/work-report-insights/scripts -type f -name '*.mjs' -print0 | xargs -0 -n1 node --check
SKIP_HOST_INSTALL=1 SKIP_CODEX_LOAD=1 bash scripts/ci/validate-plugins.sh
```
