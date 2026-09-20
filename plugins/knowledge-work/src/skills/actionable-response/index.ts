import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "actionable-response",
  fullName: "Actionable responses",
  description: "Structure task-oriented responses so the reader can act immediately. Load by default when the user must perform a procedure, troubleshoot, choose, recover from an error, or continue unfinished work. Do not wait for explicit ADHD wording, and never diagnose or label the user.",
  useCases: [
    "Structure task-oriented responses so the reader can act immediately.",
  ],
  constraints: [
    "Do not wait for explicit ADHD wording, and never diagnose or label the user.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Actionable responses\n\nPut the answer, current state, or first action where the reader sees it immediately. Actionable writing is not extreme compression. Preserve facts, conditions, order, safety boundaries, commands, paths, and verification criteria.\n\n## Default routing\n\nUse this Skill by default when the response asks the user to act:\n\n- follow a procedure or a sequence of commands;\n- troubleshoot a failure or recover from an error;\n- choose among options with different consequences;\n- take over unfinished work or respond to a blocker;\n- provide progress or a handoff that includes remaining work.\n\nDo not wait for the user to mention ADHD, ask for shorter prose, or request step-by-step instructions. Explicit ADHD-friendly wording is an additional signal, not a prerequisite and not evidence about the user's identity.\n\nDo not force this shape onto a pure knowledge question. If the agent already completed the work, lead with the result and observable evidence instead of assigning the work back to the user. If the user requests an exhaustive audit, complete checklist, or fixed format, preserve that content contract.\n\n## Response contract\n\n1. Make the first meaningful sentence the answer, current state, or first action. Skip throat-clearing.\n2. Use a numbered list for ordered work. Give each step one bounded action and keep dependencies in the correct order.\n3. If work remains open, end with exactly one next action. If the task is complete, end on the last concrete result and add no invented follow-up.\n4. For work spanning multiple turns, restate only the current state, such as \"Step 2 of 4 is complete; tests are running.\" Use the host plan tool when available instead of repeating the full plan.\n5. State failures plainly: what failed, the observed cause, and the recovery path. After repeated failed attempts, stop blind edits, identify the assumption in doubt, and ask one diagnostic question that separates likely causes.\n6. Group long lists by urgency or necessity when that improves scanning. Never drop required audit, checklist, or enumeration items to satisfy a list-size preference.\n\n## Time, tone, and identity\n\n- Give a time estimate only when current evidence, a stable procedure, or a known executor supports it. State the condition that affects the estimate. Do not invent precise durations.\n- Remove praise, preambles, recap endings, and generic closers such as \"I hope this helps\" or \"let me know if you have questions.\"\n- Show progress with concrete state and verification evidence, not celebratory language.\n- Do not mention ADHD in the answer unless the user explicitly asks to discuss it. Never infer, diagnose, or describe the user's identity from their request style.\n\n## Priority\n\nSafety confirmations, destructive actions, privacy, permissions, the user's requested format, and host requirements override brevity. If a style rule conflicts with task content, preserve the task content and keep only the answer-first, bounded-step, clear-state shape.\n\n## Pre-send check\n\n- Does the first screen show the answer, current state, or first action?\n- Are ordered steps numbered and still in the right order?\n- Is there exactly one next action only when work remains?\n- Did the response preserve facts, commands, paths, error text, limits, and safety warnings?\n- Did it add a diagnosis, an unsupported time estimate, a side quest, or a generic closing?\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
