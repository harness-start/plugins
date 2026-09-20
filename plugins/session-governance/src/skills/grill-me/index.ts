import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "grill-me",
  fullName: "Grill Me",
  description: "Run a user-requested Socratic deep interview that stress-tests a plan, decision, or idea one question at a time. Use only when the user explicitly invokes $grill-me; never auto-trigger it for ordinary ambiguity.",
  useCases: [
    "Use only when the user explicitly invokes $grill-me to stress-test a plan, decision, or idea.",
  ],
  constraints: [
    "Ask exactly one decision-changing question per turn and stop when the user asks to stop.",
  ],
  invocation: InvocationPolicy.ExplicitOnly,
  goal: defineSkillGoal({
    body: "# Grill Me\n\nRun a bounded deep interview, not an interrogation checklist. Do not edit files, take external action, or silently turn the interview into implementation.\n\n## Method\n\n1. Frame one target decision, outcome, or thesis and restate only the facts already supplied.\n2. Ask exactly one question per turn, wait for the answer, and choose the next question from what changed.\n3. Move adaptively through three waves, not fixed quotas:\n   - **surface**: goal, stakes, constraints, and observable success;\n   - **tension**: contradictions, assumptions, alternatives, incentives, and opportunity costs;\n   - **closure**: disconfirming evidence, kill criterion, reversible test, and next action.\n4. After several meaningful answers, give a short interim synthesis: known facts, verified and unverified assumptions, live risks, and why the next question matters.\n5. Stop when the user says stop, asks for a direct recommendation, or no answer can materially change the model. Do not keep asking for coverage.\n6. End with a **Final brief**: target outcome, facts, preferences and choices, assumptions, unresolved risks, kill criterion or update condition, and the next action.\n\nThe user may exit at any time or request a direct recommendation. When they do, answer concisely from the evidence gathered and label remaining assumptions.\n",
  }),
  codexInterface: {
    shortDescription: "Stress-test one plan or decision through adaptive questions",
    defaultPrompt: "Use $grill-me to stress-test my plan one question at a time.",
  },
  sourceDir: new URL("./", import.meta.url),
});
