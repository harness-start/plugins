---
name: work-summary-report
description: 员工要做日期范围工作总结、阶段复盘或为 TL 准备考核证据时使用；作为兼容入口把范围移交统一 work-report-authoring 编排。
---

# Work Summary Report Compatibility Adapter

使用 `--from YYYY-MM-DD --to YYYY-MM-DD` 选择闭区间，然后完整执行 `$work-report-authoring`。

- 汇总时间窗内 transcript 涉及的去重 Git 仓库；远端只在现有 `gh`/`glab` 已认证时只读查询。
- 必须形成 1–3 个可验证的新承诺，并列明上期承诺状态、证据或员工陈述。
- 报告不生成绩效分，只向 TL 提供 action/result/impact、证据等级、待核事实与验证方法。
- V2 prepare 后要求精确 acknowledgement，再由官方 save 生成封印 Markdown 与绑定 ledger；不得自动发送或上传。
