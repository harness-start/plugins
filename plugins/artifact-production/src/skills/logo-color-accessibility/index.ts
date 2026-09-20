import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "logo-color-accessibility",
  fullName: "Logo Color & Accessibility / 标志色彩与可访问性",
  description: "Review a logo palette, monochrome/reverse variants, gamut, and accessibility evidence. Use as a read-only adviser during logo variant and preview work.",
  useCases: [
    "Review a logo palette, monochrome/reverse variants, gamut, and accessibility evidence.",
  ],
  constraints: [
    "Do not claim legal trademark clearance, press accuracy without a physical proof, or accessibility from hex values alone.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Logo Color & Accessibility / 标志色彩与可访问性\n\nThis Skill is a **read-only bilingual adviser**. It has no project writer, review, release, network, or external-key authority. 本 Skill 只提供中英文建议，不能写项目、签发评审或执行发布。\n\nRead [Logo color checks](references/logo-color-checks.md). Return a bounded Result Card covering:\n\n- primary, mono, and reverse behavior before decorative color;\n- sRGB source values plus documented CMYK/spot-color conversion guidance;\n- contrast for surrounding UI or text without pretending that a logo itself is body text;\n- color-vision and grayscale differentiation when color carries meaning;\n- gamut risks and a concrete verification or recovery path.\n\nDo not claim legal trademark clearance, press accuracy without a physical proof, or accessibility from hex values alone.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
