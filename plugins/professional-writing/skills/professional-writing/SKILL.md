---
name: professional-writing
description: Route prose editing to this plugin's first-party writing Skills. Use for human-readable Markdown or chat prose, not code or machine output.
---

# Professional Writing

Load only the Skills the current prose needs:

| Situation | Skill |
|---|---|
| User asked for fewer tokens or caveman mode | `writing-terse-output` |
| English prose | `writing-english-prose` |
| Chinese prose | `writing-chinese-prose` and bundled `ai-flavor-remover` |
| Human-readable Markdown | also `writing-markdown-ai-style` |

Preserve facts, numbers, URLs, identifiers, citations, and Markdown structure. SessionStart routing is not proof that the rewrite is good.
