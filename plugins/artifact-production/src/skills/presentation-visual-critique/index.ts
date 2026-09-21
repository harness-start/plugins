import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "presentation-visual-critique",
  fullName: "Presentation visual critique",
  description: "Read-only critique of slide audience boundary, hierarchy, title economy, visual payload, layout rhythm, relationship semantics, and typography. No writer or release authority.",
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

Check five v4 quality dimensions:

1. **Headline economy** — the display title is a compact locator, not a sentence that competes with the visual. The page's assertion should be recoverable from the visual and evidence.
2. **Visual payload** — diagrams, data, screenshots, or comparisons carry the main information; decorative boxes, badges, and takeaway strips do not merely restate text.
3. **Layout rhythm** — repeated frames are intentional. Flag runs of interchangeable title-plus-cards-plus-footer layouts, especially when the probe reports similar-page groups.
4. **Relationship semantics** — arrows mean direction, plain lines mean association, and disconnection uses a visible break rather than a floating pseudo-connector. Verify that endpoints visually meet their nodes.
5. **Typography and access** — check point size, line spacing, character spacing, line cap, CJK/Latin fit, contrast, clipping, reading order, and non-color encoding.

Anchor every concern to a page and an observable feature. Separate deterministic probe failures from aesthetic judgment; do not claim that a schema or layout fingerprint proves audience comprehension.
`,
  }),
  sourceDir: new URL("./", import.meta.url),
});
