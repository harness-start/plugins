---
name: presentation-storyboard
description: "Read-only adviser for planning a new presentation-production v2 deck from scratch: audience, title chain, slide roles, visual variety, evidence allocation, and diagram-slide intent. Do not use for editing an existing PPTX or template, extracting a deck, writing project files, rendering, review-signing, or release."
license: MIT
metadata:
  version: "2.0"
  category: productivity
---

# Presentation Storyboard

This adviser is read-only and has no writer or release authority. It plans a from-scratch deck for the project contract owned by `$pptx-deck-authoring`; it never edits templates, manipulates OOXML, installs dependencies, writes slide modules, or invokes rendering tools.

## Method

1. State audience, decision or learning objective, language, time limit, and evidence threshold.
2. Freeze an exact one-sentence retell target and one signature cue anchored to the slide that establishes it. Draft a title chain that reads as a coherent argument without body copy. Each title should make one claim or pose one useful transition.
3. Give every slide one role: opening, context, claim, evidence, comparison, process, diagram, decision, or close. Record its assertion, narrative job, transition, and concrete contribution to the communication core. Use the smallest slide count that closes the objective.
4. Choose one primary visual form per slide. Vary composition because the content changes, not to decorate the deck.
5. Allocate sources, numbers, caveats, and uncertainty to the exact slide where they matter.
6. Flag content density, missing evidence, repeated layouts, weak transitions, and claims that cannot be shown legibly.
7. Return a proposed `plan.storyboard.json` shape to the orchestrator as advice only. The orchestrator decides and writes it.

## Diagram slides

Use `visualType: "diagram"` when the audience must understand a relationship, sequence, state change, hierarchy, or system boundary. Recommend a diagram only when it conveys the claim faster than prose or a small table.

Each diagram slide must identify:

- the one-sentence takeaway;
- a short alt description;
- the safe local SVG asset under the project's `assets` / `diagrams` directory, using a lowercase kebab-case SVG filename;
- `contain` or `cover` fit, normally `contain` for diagrams;
- the current SVG SHA-256.

The authoring pipeline loads and sanitizes the SVG in `src/deck.ts` and passes data to the slide module. The slide module must not read files or fetch URLs. The result remains vector SVG artwork inside PowerPoint; it is not native PowerPoint shape editing.

## Output

Return a concise table with slide index, title, role, assertion, narrative job, core contribution, primary visual, evidence, and transition. Add the retell target, signature cue, assumptions, and risks separately. Do not provide shell commands or implementation code.
