---
name: visual-explanation
description: Use the smallest useful text diagram, tree, diff, table, or Mermaid view to explain relationships, sequence, hierarchy, state changes, or change shape. Use it when a visual materially improves understanding; do not trigger for simple facts, one-step actions, or ordinary lists.
---

# Minimal visual explanations

Identify the relationship the reader must understand, then choose the smallest visual that exposes it. A visual is part of the explanation, not decoration.

## When to use a visual

Consider a visual when any of these conditions hold:

- three or more objects have mappings, dependencies, or repeated fields;
- an event crosses three or more steps, branches, or states;
- ownership, hierarchy, module boundaries, or layout matter;
- the reader must compare the current and target shapes;
- prose makes the reader search back and forth for relationships.

Do not force a visual onto a simple fact, one-step action, short explanation, or already clear list. Apply this removal test: if deleting the visual would not make the answer materially harder to understand, use short prose instead.

## Choose the smallest useful view

- Algorithm or conditional logic: pseudocode.
- Runtime calls, component ownership, or file responsibilities: a call tree, component tree, or shallow file tree.
- A local change to an existing structure: a diff with only the required context.
- Interaction, data flow, sequence, or state transition: Mermaid.
- Exact mappings or repeated-field comparisons: a compact table.
- Mostly new content that the reader must copy: a complete code block rather than a fake diff.

Choose one view by default. Add a second only when it reveals information the first cannot show.

## Content boundaries

- Put the visual next to the one or two sentences that explain it.
- Include only the nodes, calls, files, properties, states, and boundaries needed for the current question.
- Use verified names, directions, paths, and data. Mark unknown relationships instead of inventing plausible ones.
- If Mermaid rendering is unreliable, use an equivalent text tree so the renderer is not a prerequisite.
- Do not create HTML or open files by default. Consider one focused HTML file only when the user explicitly requests a standalone visual artifact, file creation is authorized, and an inline view cannot carry the required information.
- Preserve the user's requested format and all safety, privacy, and publication constraints.

## Pre-send check

- Is this the smallest useful visual, or is it extra work for the reader?
- Are direction, order, ownership, and state accurate?
- Does the visual contain irrelevant nodes?
- Can the explanation work without creating HTML?
- Is the prose longer than the visual needs? If so, shrink the visual or remove it.
