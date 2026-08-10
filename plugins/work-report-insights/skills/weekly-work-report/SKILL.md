---
name: weekly-work-report
description: 员工要写周报、本周总结或周度复盘时使用；汇总一周 Claude/Codex 会话并逐题补齐成果、协作和工作方法不足，确认后生成带 SHA-256 封印的周报。
---

# Weekly Work Report

## Workflow

1. 运行 `weekly-work-report-collect.mjs` 与 `weekly-work-report-transcript-scan.mjs`。周次默认本周，也可传 ISO 周 `--week YYYY-Www`。只读取本机会话，不读取 Git。
2. 按项目和日期归并成果、阻碍、反复返工、验证缺口及改进意图，每条判断保留 session ID 和行号依据。
3. 实际调用 `$grill-me`，一次问一个问题，最多五个。问题应优先覆盖 transcript 之外的工作、本周关键结果、反复出现的执行摩擦、方法上的不足和下周可验证调整。允许“无补充”或“证据不足”，禁止虚构短板。
4. 依赖不可用时在当前 Skill 内按相同规则提问，不运行联网安装。
5. 草稿必须包含本周成果、证据、非 AI 工作、阻碍、方法/执行不足、下周行动。运行 `weekly-work-report-prepare.mjs --week YYYY-Www --input <draft>`，展示全文并等待明确确认；内容变化后重新 prepare。
6. 确认后运行 `weekly-work-report-save.mjs --week YYYY-Www --input <draft>`，不得直接修改报告目录。

输出为 `~/.ai-experts/weekly-reports/YYYY-Www.md`。封印后只能通过 addition-prepare、再次确认和 append 在 SHA-256 标签之后追加内容。
