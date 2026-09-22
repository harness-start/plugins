import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "presentation-visual-critique",
  fullName: "Presentation visual critique",
  description: "Read-only critique of slide audience boundary, human title voice, text rhythm, content encoding, grouping, layout rhythm, and relationship semantics. No writer or release authority.",
  useCases: [
    "Critique a presentation before or after rendering when it needs stronger hierarchy, visual rhythm, or relationship clarity.",
  ],
  constraints: [
    "Do not write project files, generated artifacts, review verdicts, or releases.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: `# Presentation visual critique

This adviser is read-only. Start with the complete slide montage before inspecting individual pages. Check whether the cover speaks to the audience without exposing internal planning labels such as who the deck is "for". Compare the visible cover language with the private audience brief and flag unexplained explicit addressing.

Check seven v5 quality dimensions:

1. **Headline voice** — read only the title chain first. Classify each title as plain, specific, or formulaic. Compactness is only a constraint: repeated balanced clauses, abstract noun slogans, and mechanically parallel frames still fail when they make the deck sound generated. Labels, findings, and questions are all valid when the page earns them.
2. **Typography rhythm** — inspect baselines and the vertical position of text inside boxes, not just nominal font sizes. Compare visible line spacing, paragraph spacing, left/top alignment, CJK/Latin fit, and clipping with the OOXML text-rhythm evidence. Flag dense text that appears vertically centered or compressed.
3. **Content encoding** — identify what the visual communicates beyond the subtitle. Diagrams, data, screenshots, comparisons, or spatial structure should carry the main information; decorative boxes, badges, and takeaway strips must not merely restate prose.
4. **Grouping semantics** — peers are visibly grouped through real bullets, numbering, aligned stacks, or grids. Flag centered newline lists and irregular alignment that makes categories look unrelated.
5. **Layout rhythm** — repeated frames are intentional. Flag runs of interchangeable title-plus-cards-plus-footer layouts, especially when headline, composition, or similar-page signals recur.
6. **Relationship semantics** — compare the claim with the graph: a closed loop has a return path, a branch visibly forks or merges, and a hierarchy has a root. Then verify physical reading direction, arrowheads, endpoints, crossings, associations, and break markers. A locally correct arrow can still produce a globally wrong reading path.
7. **Access** — check contrast, reading order, non-color encoding, image quality, and legibility at presentation distance.

Anchor every concern to a page and an observable feature. Separate deterministic probe failures from aesthetic judgment; do not claim that a schema or layout fingerprint proves audience comprehension.
`,
  }),
  sourceDir: new URL("./", import.meta.url),
});
