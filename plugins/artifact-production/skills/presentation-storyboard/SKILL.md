---
name: presentation-storyboard
description: "Read-only adviser for planning a new presentation-production v5 deck from scratch: audience boundary, human title voice, information structure, visual variety, evidence allocation, grouping, and diagram semantics. Do not use for editing an existing PPTX or template, extracting a deck, writing project files, rendering, review-signing, or release."
license: "MIT"
metadata:
  version: "5.0"
  category: "productivity"
---

# Presentation Storyboard

## When to use

- Plan a new presentation deck from scratch before authoring begins.

## Constraints

- Do not use for editing an existing PPTX or template, extracting a deck, writing project files, rendering, review-signing, or release.

This adviser is read-only and has no writer or release authority. It plans a from-scratch v5 deck for the project contract owned by `$pptx-deck-authoring`; it never edits templates, manipulates OOXML, installs dependencies, writes slide modules, or invokes rendering tools.

## Method

1. Record the private audience brief as `audience.primary`, `context`, and `desiredAction`. Default `addressing` to `implicit`: write for the audience, not about the audience. Use `explicit` only when naming the audience is itself part of the requested communication and record the rationale.
2. Freeze an exact one-sentence retell target and one signature cue anchored to the slide that establishes it. Keep the argument in each slide's `assertion`; do not copy that sentence into the visible title.
3. Give every slide a single-line `displayTitle` of at most 20 display-width units, roughly ten Han characters, and declare `headline.mode` as `label`, `finding`, or `question`. A finding also names its evidence anchor. Read the titles as one chain: vary syntax naturally, prefer concrete nouns and specific observations, and remove repeated balanced clauses, abstract slogans, and mechanically parallel frames. A short title is not automatically a human title. Keep the full claim in the hidden assertion so the visual can carry the proof.
4. Give every slide one role and record its assertion, narrative job, transition, and concrete contribution to the communication core. Use the smallest slide count that closes the objective.
5. Choose one `visual.type`: `hero`, `content`, `comparison`, `diagram`, `data`, `media`, or `closing`. Also declare what the visual must do with `visual.logic`: `statement`, `group`, `comparison`, `evidence`, `metric`, `sequence`, `branch`, `cycle`, `hierarchy`, or `network`. Use `variant` only for a real composition difference.
6. When peers form a group, declare `groups` with a unique id, `itemCount`, and an encoding: `bulleted`, `numbered`, `aligned-stack`, or `grid`. A centered text box containing newline- or dot-separated peers is not a grouping encoding.
7. Allocate sources, numbers, caveats, and uncertainty to the exact slide where they matter. Flag text-heavy pages, repeated title-box-takeaway templates, interchangeable card grids, weak transitions, missing evidence, and visuals that merely restate the subtitle.
8. Return a proposed `plan.storyboard.json` shape to the orchestrator as advice only. The orchestrator decides and writes it.

## Diagram slides

Use `visual.type: "diagram"` when the audience must understand a relationship, sequence, state change, hierarchy, system boundary, or disconnection. Do not disguise a relationship slide with an arbitrary visual label.

For every diagram, declare `visual.logic` and `readingDirection`. Prefer left-to-right sequence and branch layouts on 16:9. A top-to-bottom sequence or branch needs a concrete `directionRationale`; hierarchy is allowed to run vertically when the structure calls for it.

For `mode: "native"`, declare unique nodes with a typography role and typed relations. Use `flow` or `dependency` for target-directed arrows, `association` for an arrowless connection, and `disconnect` for an explicit between-node break marker with no connector line. Mark relations as `pathRole: "forward"` or `"return"`. A cycle requires a real return edge that closes a directed loop; do not label a one-way chain as a closed loop. Declare `segmentCount` when a relation uses more than one native line segment.

For `mode: "svg"`, declare the local SVG asset, current SHA-256, fit, takeaway, and alt text. The pipeline validates the embedded bytes, while the independent reviewer remains responsible for relationships drawn inside the SVG.

## Output

Return a concise table with slide index, display title, headline mode, role, hidden assertion, narrative job, core contribution, visual type, visual logic, grouping or reading direction, evidence, and transition. Add the audience-addressing choice, retell target, signature cue, assumptions, and risks separately. Do not provide shell commands or implementation code.

## References

- [design-system.md](references/design-system.md)
- [editing.md](references/editing.md)
- [pitfalls.md](references/pitfalls.md)
- [pptxgenjs.md](references/pptxgenjs.md)
- [slide-types.md](references/slide-types.md)
