import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "training-program-review",
  fullName: "Training Program Review",
  description: "只读评审已经生成的培训包，检查受众差异、目标对齐、练习、评价、讲师可执行性、材料一致性与迁移设计，并生成 training-program-design review writer 所需的外部 JSON。仅在 materials 阶段后使用；不用于编写课程。",
  useCases: [
    "只读评审已经生成的培训包，检查受众差异、目标对齐、练习、评价、讲师可执行性、材料一致性与迁移设计，并生成 training-program-design review writer 所需的外部 JSON。仅在 materials 阶段后使用；不用于编写课程。",
  ],
  constraints: [
    "不要编辑项目、生成物、evidence 或 receipt。",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Training Program Review\n\n你是只读评审者。阅读目标项目的 `plan.contract.json`、`training-package.json`、`evidence.render.json` 和全部 `dist/*.md`，再阅读 authoring Skill 的 [评审量规](../training-program-design/references/review-rubric.md)。不要编辑项目、生成物、evidence 或 receipt。\n\n逐项检查七个 criterion：`alignment`、`audience-variability`、`practice`、`assessment`、`facilitation`、`material-consistency`、`transfer`。主动寻找反例：某个 outcome 未练习、初学者支架替代了核心任务、高手拓展偏离目标、评价只测记忆、议程时长不可执行、讲师无法据表现调节、培训后没有迁移证据。\n\n在项目根之外写一个临时 JSON，结构如下：\n\n```json\n{\n  \"schema\": \"training-program-design/review-input/v1\",\n  \"reviewer\": { \"kind\": \"agent\", \"id\": \"当前会话或评审者标识\" },\n  \"criteria\": [\n    { \"id\": \"alignment\", \"pass\": true, \"evidence\": \"training-package.json:outcomes:0 ↔ activities:0 ↔ assessments:0\" }\n  ],\n  \"findings\": [\n    {\n      \"severity\": \"blocking\",\n      \"anchor\": \"dist/facilitator-guide.md:具体标题或 training-package.json:字段路径\",\n      \"evidence\": \"可复核的事实\",\n      \"fix\": \"可验证的修复或恢复路径\",\n      \"resolved\": false\n    }\n  ]\n}\n```\n\n七个 criterion 必须各有且仅有清晰判断与证据。finding 的 severity 只能是 `blocking`、`warning`、`note`；没有问题时使用空数组，不要为了显得严格而虚构 finding。\n\n然后在当前评审会话执行唯一允许的项目写操作：\n\n```bash\nnode \"${PLUGIN_ROOT}/dist/cli/harness.mjs training review\" artifacts/training/<artifact-id> /absolute/path/outside-project/review-input.json\n```\n\nClaude 使用 `${CLAUDE_PLUGIN_ROOT}`，Codex 使用 `${PLUGIN_ROOT}`，不要混用。若 verdict 为 `revise`，把 findings 返回给 producer；评审者不自行修复、不执行 render 或 release。结果只报告检查过的文件、七项判断、admitted review 摘要和未解决风险。\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
