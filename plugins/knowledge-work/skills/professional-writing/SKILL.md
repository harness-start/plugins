---
name: professional-writing
description: Route prose editing to this plugin's first-party writing Skills. Use for human-readable Markdown or chat prose, not code or machine output.
---

# Professional Writing

Load only the Skills the current prose needs:

| Situation | Skill |
|---|---|
| The user must perform a procedure, troubleshoot, choose, recover, or continue unfinished work | `actionable-response` |
| A visual would materially clarify relationships, sequence, hierarchy, or state changes | `visual-explanation` |
| User asked for fewer tokens or caveman mode | `writing-terse-output` |
| Explicit English prose rewrite, polishing, naturalness, or de-AI request | `writing-english-prose` |
| Explicit Chinese prose rewrite, polishing, or naturalness request | `writing-chinese-prose` |
| Explicit Chinese de-AI or humanization request | also `ai-flavor-remover` |
| Explicit human-readable Markdown prose editing | also `writing-markdown-ai-style` |

Do not load language-specific editing Skills for ordinary technical, factual, or conversational responses. Preserve facts, numbers, URLs, identifiers, citations, and Markdown structure. SessionStart routing is not proof that the rewrite is good. The installed PostToolUse Hook reports deterministic signals after observed Markdown writes even when this Skill is not loaded; treat those signals as review evidence, not rewrite commands.

Use `actionable-response` by default for action-heavy replies without waiting for explicit ADHD wording. It can be combined with `visual-explanation`, but do not turn actionability into extreme compression or add a visual to a simple question.
