---
name: weekly-work-report
description: 员工要写周报、本周复盘或周度改进计划时使用；作为兼容入口把 ISO 周范围移交统一 work-report-authoring 编排。
---

# Weekly Work Report Compatibility Adapter

选择当前周或 `--week YYYY-Www`，然后完整执行 `$work-report-authoring`。不要复制另一套流程。

- 必须回顾上期 ledger 中的未完成承诺，并形成 1–3 个可验证的新承诺。
- 使用 weekly collect/scan 官方 wrapper；允许重复 `--repo PATH`，不扫描整个 HOME。
- V2 使用 `--contract <json> --evidence <json>` prepare；员工精确 acknowledgement 后才 save。
- 最终单一 Markdown 同时包含员工成长闭环和 TL 验证矩阵；machine ledger 仅用于跨期状态，不是第二份用户报告。
