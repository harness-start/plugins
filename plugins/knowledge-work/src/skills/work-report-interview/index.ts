import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "work-report-interview",
  fullName: "Work report interview",
  description: "Fill evidence gaps in a work report with a bounded one-question-at-a-time interview. Use during daily, weekly, or summary authoring when data gaps remain; do not use as a standalone grilling session or to write the saved report.",
  useCases: [
    "Fill evidence gaps in a work report with a bounded one-question-at-a-time interview.",
  ],
  constraints: [
    "do not use as a standalone grilling session or to write the saved report.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Work report interview\n\nThis Skill is a **read-only** gap interview. It cannot save the report, stamp TL verification, or invent tool facts.\n\nAsk **one question at a time**. Daily: at most 3 questions. Weekly or summary: at most 5. Wait for the answer before the next question.\n\n## Rules\n\n1. Ask only what local Git, transcript, and optional remote collectors cannot answer.\n2. Finding facts from the workspace is your job. Do not ask the employee for a commit hash you can read.\n3. Decisions belong to the employee. Offer a recommended answer when it helps, then wait.\n4. Mark every employee answer `employee-attested`. Never disguise it as a collector fact.\n5. Stop when the remaining gaps are documented or the question budget is spent.\n\n## Question shape\n\n```\nQ<n> — <title>\n<body>\nRecommended: <one recommended answer>\n```\n\nDo not emit a numbered frontier of several questions in one turn.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
