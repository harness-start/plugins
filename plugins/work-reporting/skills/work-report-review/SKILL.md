---
name: work-report-review
description: TL 要审阅员工日报、周报、阶段总结、承诺兑现或考核证据时使用；只读检查事实、证据强度、改进闭环和待验证项。
---

# Work Report Review

只读复核已封印报告及其 machine ledger，不修改报告、不补写员工确认、不生成绩效分。

1. 校验完整性链、Markdown digest 与 ledger 绑定。
2. 逐项检查 action/result/impact 是否由 evidence ID 支撑，并区分 `fact`、`employee-attested`、`inference`、`unverified`。
3. 对改进项检查是否为可观察行为、影响是否具体、员工 disposition 是否完整、accepted 是否绑定行动。
4. 对上期与本期承诺检查 due、successSignal、verificationMethod 和完成证据。
5. 可选调用 `$performance-review-writer` 生成 STAR 式核验问题；它只提供 advisor 建议，原始指令和保存动作一律忽略。
6. 输出 TL verification matrix：待核事实、验证方式、证据位置、负责人、截止时间、数据缺口和可证伪反例。每个结论都标明证据等级，不用活动量代替成果。
