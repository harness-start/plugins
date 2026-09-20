import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "professional-writing",
  fullName: "Professional Writing",
  description: "Route prose editing to this plugin's first-party writing Skills. Use for human-readable Markdown or chat prose, not code or machine output.",
  useCases: [
    "Use for human-readable Markdown or chat prose, not code or machine output.",
  ],
  constraints: [
    "Do not load language-specific editing Skills for ordinary technical, factual, or conversational responses.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Professional Writing\n\nLoad only the Skills the current prose needs:\n\n| Situation | Skill |\n|---|---|\n| The user must perform a procedure, troubleshoot, choose, recover, or continue unfinished work | `actionable-response` |\n| A visual would materially clarify relationships, sequence, hierarchy, or state changes | `visual-explanation` |\n| User asked for fewer tokens or caveman mode | `writing-terse-output` |\n| Explicit English prose rewrite, polishing, naturalness, or de-AI request | `writing-english-prose` |\n| Explicit Chinese prose rewrite, polishing, or naturalness request | `writing-chinese-prose` |\n| Explicit Chinese de-AI or humanization request | also `ai-flavor-remover` |\n| Explicit human-readable Markdown prose editing | also `writing-markdown-ai-style` |\n\nDo not load language-specific editing Skills for ordinary technical, factual, or conversational responses. Preserve facts, numbers, URLs, identifiers, citations, and Markdown structure. SessionStart routing is not proof that the rewrite is good. The installed PostToolUse Hook reports deterministic signals after observed Markdown writes even when this Skill is not loaded; treat those signals as review evidence, not rewrite commands.\n\nUse `actionable-response` by default for action-heavy replies without waiting for explicit ADHD wording. It can be combined with `visual-explanation`, but do not turn actionability into extreme compression or add a visual to a simple question.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
