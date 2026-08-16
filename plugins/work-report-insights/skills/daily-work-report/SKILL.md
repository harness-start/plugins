---
name: daily-work-report
description: 员工要写日报、今日工作总结或下班复盘时使用；作为兼容入口把当日范围移交统一 work-report-authoring 编排。
---

# Daily Work Report Compatibility Adapter

选择今天或用户给出的 `--date YYYY-MM-DD`，然后完整执行 `$work-report-authoring`。不要在本适配器内复制另一套采访、证据、确认或保存流程。

- daily 在没有实质缺口或学习项时可以没有新承诺；否则 accepted 改进项必须绑定行动。
- 使用 `daily-work-report-collect.mjs` / `daily-work-report-transcript-scan.mjs`，默认收集 transcript CWD 对应的 Git；`--skip-git` 与 `--skip-remote` 是显式 opt-out。
- V2 使用 `--contract <json> --evidence <json>` 调用 prepare/save。展示完整确定性渲染报告后，必须取得 hook 给出的精确 acknowledgement。
- 只报告实际 save 回执；不得直接写 `~/.ai-experts/daily-reports/`，不得自动发送。
