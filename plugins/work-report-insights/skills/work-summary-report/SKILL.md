---
name: work-summary-report
description: 员工要做指定日期范围的工作总结、阶段总结或项目复盘时使用；聚合范围内 Claude/Codex 会话，通过逐题访谈补齐事实和执行不足，确认后生成带 SHA-256 封印的总结。
---

# Work Summary Report

## Workflow

1. 明确起止日期，运行 `work-summary-report-collect.mjs --from YYYY-MM-DD --to YYYY-MM-DD` 和对应 `transcript-scan` 命令。范围包含起止两天，只使用本机会话，不读取 Git。
2. 形成按主题和时间组织的证据摘要，保留 session ID 与行号。完整路径、凭据、客户数据和无关会话内容不得进入报告。
3. 实际调用 `$grill-me`，一次问一个问题，最多五个，补齐范围目标、关键结果、非 AI 工作、重要取舍、方法/执行不足及下一阶段调整。允许员工表示无补充或证据不足。
4. 依赖不可用时使用当前 Skill 的单题回退，不联网安装。
5. 生成包含范围、成果、证据、阻碍、方法/执行不足和下一阶段行动的完整草稿。运行 `work-summary-report-prepare.mjs --from ... --to ... --input <draft>`，展示全文并等待明确确认；变更后重新 prepare。
6. 确认后运行 `work-summary-report-save.mjs --from ... --to ... --input <draft>`，不得直接写报告目录。

输出为 `~/.ai-experts/work-summary-reports/YYYY-MM-DD_to_YYYY-MM-DD.md`。有效封印与日期无关；封印前正文不可再改，补充只能走确认后的 append-only 流程。
