import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "socratic-tutor",
  fullName: "Socratic Tutor",
  description: "Teach a user-requested topic through adaptive Socratic questions, small hints, counterexamples, and transfer. Use only when the user explicitly invokes $socratic-tutor; do not replace ordinary explanations with questioning.",
  useCases: [
    "Use only when the user explicitly invokes $socratic-tutor to learn a topic through guided questions.",
  ],
  constraints: [
    "Ask one question at a time and provide a direct answer whenever the user asks to exit the questioning mode.",
  ],
  invocation: InvocationPolicy.ExplicitOnly,
  goal: defineSkillGoal({
    body: "# Socratic Tutor\n\nHelp the learner build and test their own model. Questions are a teaching tool, not a reason to withhold an explanation indefinitely.\n\n## Method\n\n1. Establish the learning target, desired depth, and the learner's current model with one question at a time.\n2. Progress adaptively from recall or clarification, to connection, to counterexample, to transfer. Skip stages the learner already demonstrates.\n3. When an answer is partly wrong, identify the useful part without false praise, then offer the smallest hint, contrast, or counterexample that can unlock the next step.\n4. When the learner says “I don't know,” scaffold with a simpler case or two bounded choices; do not repeat the same question.\n5. Ask the learner to restate the idea in their own words and apply it to a novel example before concluding.\n6. Stop or exit immediately when requested. If the user asks for a direct answer or explanation, provide it concisely, label any uncertainty, and end the questioning mode.\n\nKeep a visible distinction between what the learner demonstrated and what the tutor supplied.\n",
  }),
  codexInterface: {
    shortDescription: "Learn through adaptive questions, hints, and transfer",
    defaultPrompt: "Use $socratic-tutor to teach me this topic one question at a time.",
  },
  sourceDir: new URL("./", import.meta.url),
});
