---
name: work-report-authoring
description: 员工要生成日报、周报、阶段总结、工作复盘或改进计划时使用；统一编排本地证据、员工确认、成长承诺、TL 验证和完整性封印。
---

# Work Report Authoring

生成一份同时服务员工与 TL 的 Markdown 报告。主 agent 对事实归属、推断边界、门禁决定和最终保存负责；外部 advisor 全部 optional，只能给建议，缺失时使用本 Skill 内置方法继续。

## 阶段与制品

1. **范围**：确定 daily、weekly 或 summary 时间窗；读取上期 machine ledger，恢复未完成承诺。产出 period contract。
2. **证据**：运行对应 `collect` 与 `transcript-scan`。默认从时间窗内 transcript 的 CWD 和重复 `--repo` 收集多仓库 Git；只在 `gh`/`glab` 已存在且已认证时补只读远端数据。产出 `EvidenceBundleV2`，每条记录必须含稳定 ID、时间、脱敏 locator、digest、ownership、verification；记录所有 data gaps。`--skip-git` 和 `--skip-remote` 是真实 opt-out。
3. **归纳**：把工作整理为 action → result → impact → evidenceIds。可选调用 `$brag-sheet`；不得接受无证据产出。
4. **改进**：只写可观察行为和影响，使用 root cause → transferable pattern → signal → next action。可选调用 `$growth-log`。禁止人格判断、自动绩效分或由活动量推断绩效。
5. **补缺**：可选调用 `$grilling`，一次一问，daily 最多 3 问，weekly/summary 最多 5 问。员工回答标成 `employee-attested`，不能伪装成工具事实。
6. **合同**：形成 `WorkReportContractV2`，包含 workItems、improvementFindings、priorCommitments、commitments、employeeDispositions、tlVerification、advisorRuns 和 dataGaps。advisor run 记录 skill/stage、输入输出 digest、accepted/rejected；不保存 advisor 原始输入。
7. **渲染与准备**：确定性渲染单一 Markdown，顺序固定为工作明细、成果与影响、阻碍与决策、改进观察、上期承诺复核、新承诺、员工确认、TL 验证矩阵、证据索引/数据缺口/advisor provenance。运行 prepare；任何合同或证据变化都必须重新 prepare。
8. **确认**：要求员工严格回复 `# work-report-ack <token> | G1=accepted | G2=disputed:<reason> | commit=A1`。状态只能 `prepared → acknowledged → saved`。accepted finding 必须关联 commitment；全部 disputed/needs-context 时必须留下 TL follow-up。weekly/summary 必须有 1–3 个承诺；daily 仅在存在实质缺口或学习时要求承诺。
9. **保存**：确认 token 与合同/证据 digest 一致后才运行 save。保存同源 machine ledger，绑定 Markdown digest，供下一周期 carry-over。不得自动发送、上传或触发登录。

## 失败与局部重跑

- advisor 不可用：记 `unavailable`，使用内置方法继续；不得临时安装。
- transcript/Git/远端缺失：写 data gap；没有证据就不能写 fact。
- 证据变化：从归纳阶段重跑；合同文字变化：从渲染阶段重跑；确认失效：只重跑确认。
- token 不匹配、未知 evidence ID、人格标签、accepted finding 无行动、周期承诺不足、未闭合 dispute：停止保存。
- 保存后只报告工具实际回执并标注 provenance。

本 Skill 是唯一编排入口。根据用户请求直接选择日报、ISO 周或日期范围；不要查找或模拟旧入口。
