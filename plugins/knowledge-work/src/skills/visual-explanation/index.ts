import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "visual-explanation",
  fullName: "Minimal visual explanations",
  description: "Use the smallest useful text diagram, tree, diff, table, or Mermaid view to explain relationships, sequence, hierarchy, state changes, or change shape. Use it when a visual materially improves understanding; do not trigger for simple facts, one-step actions, or ordinary lists.",
  useCases: [
    "Use the smallest useful text diagram, tree, diff, table, or Mermaid view to explain relationships, sequence, hierarchy, state changes, or change shape.",
  ],
  constraints: [
    "do not trigger for simple facts, one-step actions, or ordinary lists.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Minimal visual explanations\n\nIdentify the relationship the reader must understand, then choose the smallest visual that exposes it. A visual is part of the explanation, not decoration.\n\n## When to use a visual\n\nConsider a visual when any of these conditions hold:\n\n- three or more objects have mappings, dependencies, or repeated fields;\n- an event crosses three or more steps, branches, or states;\n- ownership, hierarchy, module boundaries, or layout matter;\n- the reader must compare the current and target shapes;\n- prose makes the reader search back and forth for relationships.\n\nDo not force a visual onto a simple fact, one-step action, short explanation, or already clear list. Apply this removal test: if deleting the visual would not make the answer materially harder to understand, use short prose instead.\n\n## Choose the smallest useful view\n\n- Algorithm or conditional logic: pseudocode.\n- Runtime calls, component ownership, or file responsibilities: a call tree, component tree, or shallow file tree.\n- A local change to an existing structure: a diff with only the required context.\n- Interaction, data flow, sequence, or state transition: Mermaid.\n- Exact mappings or repeated-field comparisons: a compact table.\n- Mostly new content that the reader must copy: a complete code block rather than a fake diff.\n\nChoose one view by default. Add a second only when it reveals information the first cannot show.\n\n## Content boundaries\n\n- Put the visual next to the one or two sentences that explain it.\n- Include only the nodes, calls, files, properties, states, and boundaries needed for the current question.\n- Use verified names, directions, paths, and data. Mark unknown relationships instead of inventing plausible ones.\n- If Mermaid rendering is unreliable, use an equivalent text tree so the renderer is not a prerequisite.\n- Do not create HTML or open files by default. Consider one focused HTML file only when the user explicitly requests a standalone visual artifact, file creation is authorized, and an inline view cannot carry the required information.\n- Preserve the user's requested format and all safety, privacy, and publication constraints.\n\n## Pre-send check\n\n- Is this the smallest useful visual, or is it extra work for the reader?\n- Are direction, order, ownership, and state accurate?\n- Does the visual contain irrelevant nodes?\n- Can the explanation work without creating HTML?\n- Is the prose longer than the visual needs? If so, shrink the visual or remove it.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
