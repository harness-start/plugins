# Training Program Design

`training-program-design` 为不同起点、角色和经验水平的受众提供一条可验证的培训设计与改编流程。它不把培训主题写死为 AI；LLM、DeepSeek、Dify、软件流程、合规和岗位技能都使用同一条 audience → outcome → practice → assessment → transfer 主链。

插件内置：

- `training-program-design`：brief、design、materials、review、release 五阶段编排。
- `training-program-review`：只读质量评审与结构化 finding。
- 双宿主 Hook：选择性路由、生成物写边界、阶段反馈、Stop 门禁。
- 五个注册 CLI：初始化、校验、渲染、封存评审、签发 release receipt。

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

`adapt` 模式还会生成 `dist/adaptation-report.md`。所有 `dist/`、evidence、review 与 receipt 只能由注册 writer 生成；短期 capability 绑定精确 argv、会话和当前源摘要。

## 维护验证

```bash
npx tsx --test plugins/training-program-design/tests/*.test.ts
npm run typecheck
npm run build -- --plugin training-program-design
npm run check:dist -- --plugin training-program-design
```

调用 Claude/Codex 的 live acceptance 必须通过 `./scripts/acceptance/run.sh` 在 `docker/host-acceptance` 容器内执行。
