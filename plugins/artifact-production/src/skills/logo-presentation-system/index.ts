import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "logo-presentation-system",
  fullName: "Logo Presentation System / 标志呈现系统",
  description: "Plan logo specimen boards, application mockups, icon exports, print notes, and Figma handoff as a read-only adviser.",
  useCases: [
    "Plan logo specimen boards, application mockups, icon exports, print notes, and Figma handoff as a read-only adviser.",
  ],
  constraints: [
    "Stay inside this Skill's documented boundary.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Logo Presentation System / 标志呈现系统\n\nThis Skill is a **read-only bilingual adviser** with no project writer, review, release, network, or Figma write authority. 本 Skill 不能直接修改 Figma 或项目文件。\n\nUse it to recommend a restrained delivery set: primary and secondary lockups, transparent PNG sizes, favicon/app icons, monochrome and reverse examples, one specimen board, one realistic application mockup, and print-production notes.\n\nIf authenticated Figma writeback is unavailable, require the `svg-import-package` fallback and enumerate import-ready primary SVG files. Never report a Figma URL or writeback receipt unless the external capability actually returned it.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
