# 项目合同

## 目录与阶段

项目根只能是 `artifacts/training/<kebab-id>`。`plan.contract.json` 的 `targetStage` 决定 Stop 门禁：

- `brief`：计划字段完整。
- `design`：培训源合同完整且映射闭环。
- `materials`：所有材料由注册 writer 生成，摘要与当前源一致。
- `review`：七项量规均有证据且通过，没有未解决的 blocking finding。
- `release`：receipt 精确绑定当前源、材料、render evidence 与 review。

一旦项目存在，Hook 会按目标阶段检查；因此不要提前宣称 `release` 后留下 TODO。需要分阶段交付时，把 `targetStage` 设为用户真正要求的阶段。

## 可编辑源与生成物

agent 可编辑：

- `plan.contract.json`
- `training-package.json`
- `.gitignore`

只有注册 writer 可编辑：

- `dist/**`
- `evidence.render.json`
- `review.training.json`
- `receipt.release.json`
- `.training-delivery-journal.json`
- `.tmp/training-guard/**`

render、review、release writer 使用 30 秒、一次性、argv/session/source-bound capability。源变化会改变 subject digest，使旧 capability、evidence、review 与 receipt 失效。

## 结果闭包

最小 release 包含：

```text
plan.contract.json
training-package.json
dist/training-brief.md
dist/facilitator-guide.md
dist/learner-workbook.md
dist/practice-and-assessment.md
dist/slide-outline.md
evidence.render.json
review.training.json
receipt.release.json
```

`adapt` 模式额外要求 `training-package.json.adaptationTrace` 与 `dist/adaptation-report.md`。
