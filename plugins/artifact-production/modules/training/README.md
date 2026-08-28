# 培训方案设计

> **Private AIO module.** This directory is not independently installable or published. Host manifests, Hook registration, and MCP exposure belong to the `artifact-production` owner. This module retains only its implementation, bundled methods and assets, tests, and acceptance material.

`training-program-design` 为起点、角色和经验水平不同的受众提供可验证的培训设计与改编流程。主题不限于 AI；LLM、DeepSeek、Dify、软件流程、合规和岗位技能都沿用“受众 → 结果 → 练习 → 评估 → 迁移”主链。

## 目标

- 把受众差异、业务结果和能力缺口转成可教、可练、可评估的课程合同。
- 从同一事实源生成讲师指南、学员材料、练习评估和幻灯片大纲，减少内容漂移。
- 让独立 reviewer 的 finding 与当前源摘要绑定，并在 release 前重验交付闭包。
- 防止普通文件工具或任意 shell 绕过登记 writer 直接修改成品、evidence、review 和 receipt。

## 实现

插件捆绑两个 Skill：`training-program-design` 负责 brief、design、materials、review、release 五阶段编排；`training-program-review` 只读检查教学目标、认知负荷、练习、评估、公平性、可达性和岗位迁移，并输出结构化 finding。

双平台 Hook 覆盖 `SessionStart`、`PreToolUse`、`PostToolUse`、`Stop` 和 `SubagentStop`。Claude 另注册 `PostToolUseFailure`，可在失败的 shell writer 后立即报告未闭合合同；Codex 依靠后续事件和 `Stop` 重验磁盘状态，不把缺失失败事件当作成功证据。

五个登记 CLI 分别完成初始化、校验、渲染、封存评审和签发 release receipt。所有 mutation writer 使用短期、单次、精确 argv、session 和当前 source digest 绑定的 capability。

## 交付结构

```text
artifacts/training/<artifact-id>/
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

`adapt` 模式还会生成 `dist/adaptation-report.md`。`dist/`、evidence、review 与 receipt 只能由注册 writer 生成；源摘要变化后旧 evidence、review 和 receipt 失效。

## 流程与边界

1. 使用 `project-init.mjs` 创建合同和源数据。
2. 完成受众、结果、内容、练习、评估和迁移设计。
3. 使用 `project-lint.mjs` 检查合同，再由 `project-render.mjs` 生成同源材料。
4. 在独立会话中使用 review Skill，并通过 `project-review.mjs` 封存当前摘要绑定的结论。
5. 仅在上游证据完整时由 `project-release.mjs` 签发 receipt。

Hook 能证明受保护 writer、结构和摘要新鲜度，不能证明讲师实际授课效果、学员掌握度、组织采纳或业务结果。

## 维护验证

```bash
npx tsx --test plugins/training-program-design/tests/*.test.ts
npm run typecheck
npm run build -- --plugin training-program-design
npm run check:dist -- --plugin training-program-design
./scripts/acceptance/run.sh --plugin training-program-design
```

live acceptance 必须由脚本进入 `docker/host-acceptance`。版本：`1.0.0`。
