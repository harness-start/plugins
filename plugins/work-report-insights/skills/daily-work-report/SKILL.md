---
name: daily-work-report
description: 员工要写日报、今日工作总结或下班复盘时使用；从 Claude/Codex 会话提取证据，通过逐题问答补齐非 AI 工作和执行不足，确认后写入带 SHA-256 封印的日报。
---

## Workflow

1. 运行 `daily-work-report-collect.mjs` 和 `daily-work-report-transcript-scan.mjs`。日期默认今天，也可传 `--date YYYY-MM-DD`；平台用 `--platform claude|codex|all`，默认 `all`。旧参数 `--skip-git` 可接受，但没有效果。
2. 基于 transcript 的 session ID、行号和脱敏片段预填事实。证据不足就写“证据不足”，不要推测员工做了什么。
3. 实际调用 `$grill-me`，要求它围绕本日证据一次问一个问题，最多三个。优先问 transcript 之外的工作、最消耗精力的事项、工作方法或执行上可改进之处。每题给出两到三个短选项和自由回答空间；员工可回答“无补充”或“证据不足”。
4. `$grill-me` 不可用时，在当前 Skill 内执行相同的一次一问流程，不联网安装依赖。
5. 生成完整 Markdown 草稿，至少包含：今日成果、会话证据、非 AI 工作、阻碍、工作方法/执行不足、明日改进。所有不足都写入报告，但必须来自证据或员工确认。
6. 将草稿写到报告目录之外的临时文件，运行 `daily-work-report-prepare.mjs --date YYYY-MM-DD --input <draft>`。对于事实较多或判断困难的报告，可以用自然语言请一个普通只读子 agent 检查遗漏；它只提供建议，父 agent 必须核对事实并决定是否修改。向员工展示完整草稿；内容有改动就重新 prepare。Hook 不会根据用户下一句话确认。
7. 确认正文后运行 `daily-work-report-save.mjs --date YYYY-MM-DD --input <draft>`。只报告工具实际返回的路径和摘要；不要直接 Write/Edit `~/.ai-experts/daily-reports/`。

保存结果为 `~/.ai-experts/daily-reports/YYYY-MM-DD.md`。正文末尾的 `work-report-insights:sha256` 标签封印确认正文；标签存在后不得修改正文。

需要补充已封印日报时，把新增内容放入临时文件，依次运行 `work-report-insights-addition-prepare.mjs --report <path> --input <addition>`、等待用户确认、再运行 `work-report-insights-append.mjs`。已有字节必须全部保留。
