import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "poster-mondo",
  fullName: "Limited-palette poster direction",
  description: "Advise on original limited-palette screen-print posters, covers, and key visuals using symbolic compression, negative space, lettering, and print texture.",
  useCases: [
    "Advise on original limited-palette screen-print posters, covers, and key visuals using symbolic compression, negative space, lettering, and print texture.",
  ],
  constraints: [
    "Do not accept “高级”, “复古”, “大师感”, “有设计感”, or a named creator as a complete direction.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Limited-palette poster direction\n\nThis Skill is a **read-only** adviser. It cannot write project files, run scripts, call an image service, create protected evidence, stamp review, or release. The main `$poster-project-authoring` workflow decides whether and how to integrate its advice.\n\n## Build a decision-complete direction\n\nTranslate the brief into these executable dimensions:\n\n1. **Communication scene**: audience, viewing distance, carrier, aspect ratio, and the one response the poster should cause.\n2. **Symbolic subject**: one subject-specific object or relationship that can carry the idea without a literal scene collage.\n3. **Composition**: dominant axis, focal bbox, mass-to-void target range, scale contrast, and intended foreground/midground/background order.\n4. **Letterform system**: type class, stroke profile, structural gravity, spacing rhythm, edge finish, and the exact relationship between display type and imagery.\n5. **Palette and material**: two to five semantic colors, paper or ink behavior, halftone/grain policy, and an explicit cleanliness limit.\n6. **Negative rules**: prohibited cliches, undeclared copy, decorative metadata, style mixing, and any visual treatment that would obscure required text.\n\nDo not accept “高级”, “复古”, “大师感”, “有设计感”, or a named creator as a complete direction. Replace each with observable choices from the six dimensions above.\n\n## Select one composition family\n\nRead [Composition families](references/composition-families.md) and choose one family. Do not combine families unless the brief explains the causal benefit.\n\n- `single-symbol`: one object, a restrained text block, and a declared void range.\n- `figure-ground`: one silhouette or container whose negative space reveals a second subject-specific reading.\n- `scale-contrast`: a small foreground subject against one dominant environmental mass.\n- `type-architecture`: exact display lettering acts as structure, boundary, mask, or path rather than a label placed afterward.\n- `layered-atmosphere`: one primary subject and no more than two depth-supporting layers.\n\n## Return an adviser result\n\nReturn one recommended direction and one materially different fallback. For each include:\n\n- composition family and rationale;\n- dominant axis and mass-to-void target range;\n- symbolic subject and why it is non-substitutable;\n- exact letterform dimensions and `front|behind|mask|interrupt` image/type relation;\n- palette roles and texture limits;\n- required copy and prohibited invention;\n- smallest useful review thumbnail;\n- falsifiable failure conditions.\n\nUse [Carrier notes](references/carrier-notes.md) when the artifact is a book cover, album cover, social card, or event poster. Never promise generation, availability of a model, or a visual outcome from prompt formatting alone.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
