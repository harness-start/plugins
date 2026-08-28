---
name: writing-markdown-ai-style
description: Review and rewrite Chinese or English prose to reduce AI-generated patterns. Use for de-AI polishing, natural-language rewrites, robotic or formulaic writing, and publication cleanup. Run the bundled deterministic Markdown analyzer before editing, inspect every reported location, then read the full article for semantic patterns the rules cannot enumerate. The installed PostToolUse Hook independently rescans observed Markdown writes.
---

# Remove AI Style

Use a two-layer workflow:

1. Run the deterministic analyzer to locate repeatable lexical, punctuation, structural, and assistant-residue signals.
2. Read the full article and make contextual judgments that rules cannot cover.

The analyzer provides evidence, not automatic rewrite commands. A hit can be intentional, genre-appropriate, quoted text, or a false positive.

The installed `PostToolUse` Hook reuses the same analyzer after observed `.md` and `.markdown` writes. It reports findings without loading this Skill, rewriting the file, or blocking the write. The semantic workflow below remains the agent's responsibility.

## Intensity

Default to `heavy` when the user does not specify a level.

| Level | Behavior |
|---|---|
| `moderate` | Fix confirmed high/medium findings and the most obvious semantic patterns. Preserve most phrasing and structure. |
| `heavy` | Fix confirmed findings at every severity, rewrite awkward passages, and address unflagged formulaic rhythm. Default. |
| `full` | Treat prose as a draft and rewrite broadly while preserving facts, meaning, structure that must survive, and the author's intended voice. |

## Required workflow

### 1. Determine input and language

Prefer an absolute Markdown file path. If the user provides text only, pass it to the analyzer through stdin.

Detect Chinese or English from the article. Override auto-detection only when the result is wrong or the user explicitly specifies a language.

Load the matching reference completely:

- Chinese: [references/chinese.md](references/chinese.md)
- English: [references/english.md](references/english.md)

### 2. Run the deterministic analyzer

Run before editing:

```bash
node "${PLUGIN_ROOT}/dist/cli/harness.mjs" writing analyze <article-path>
```

On Claude Code, replace `${PLUGIN_ROOT}` with `${CLAUDE_PLUGIN_ROOT}`.

The report contains:

- stable finding ID
- rule and category
- severity
- line and column
- matched text
- local context
- suggested treatment
- repeated-rule and document-structure summaries

Do not replace this command with copied `grep` snippets. The bundled script is the single owner of deterministic detection logic.

### 3. Inspect every finding

Classify every reported item as one of:

- `confirmed`: rewrite it
- `intentional`: keep it because the genre or voice requires it
- `protected`: leave it because it belongs to code, source material, structure, or another preserved region
- `false_positive`: no change
- `semantic_review`: the local hit is real, but the correct fix depends on wider context

Read the reported context, then inspect the surrounding paragraph before deciding. Do not bulk-replace phrases across the document.

### 4. Read the full original article

Always read the complete article unless the user explicitly asks to process only an excerpt. The analyzer cannot reliably detect:

- excessive metaphors with novel wording
- argument structure that is too symmetrical
- repeated paragraph logic with different vocabulary
- synthetic emotional escalation
- vague claims that sound polished but say little
- genre mismatch
- flattened author voice
- suspicious facts or citations

Use the language reference to perform this semantic pass. The report is a navigation aid, not a substitute for reading.

### 5. Record protected structure

Before editing, record the structures that must survive:

- YAML frontmatter
- fenced code blocks
- Markdown tables when their structure is intentional
- images and links
- HTML comments
- complete `VISUAL_TODO` blocks
- quoted source material and citations

Do not change facts, numbers, URLs, code, image paths, TODO IDs, or citation targets merely to make prose sound more natural.

### 6. Rewrite according to intensity

Make contextual edits rather than phrase substitution:

- Prefer concrete subjects, actions, mechanisms, and results.
- Remove meta-writing, generic importance claims, assistant residue, and decorative transitions.
- Vary rhythm only where the current rhythm feels artificial; do not add slang, mistakes, or random fragments to imitate a human.
- Preserve deliberate voice, technical precision, and genre-appropriate structure.
- Do not force every analyzer count to zero.

When invoked as a Subagent on a file, edit the file directly, then return a concise change report. Do not delegate the rewrite to another agent.

### 7. Run the analyzer again

After editing, confirm the PostToolUse report and rerun the same command to compare complete before/after summaries. Run the CLI explicitly when Hook trust is absent, the input came through chat or stdin, the file was changed outside an observed tool event, or the automatic size/file limit skipped it.

Review remaining high/medium findings individually. A remaining hit is acceptable when it is intentional, protected, required for accuracy, or a documented false positive.

Finally, read the full revised article once more for continuity and voice. A lower finding count does not prove the rewrite is good.

## Completion report

Return:

- language and intensity
- before/after finding counts by severity
- confirmed rules addressed
- intentional or protected findings left in place
- important semantic changes found only by full reading
- confirmation that protected Markdown structures survived
- any factual or citation issue that needs human verification
