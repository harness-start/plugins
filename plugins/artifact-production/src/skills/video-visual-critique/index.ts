import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "video-visual-critique",
  fullName: "Video visual critique",
  description: "Read-only visual critique for video frames and motion hierarchy. No writer, review stamp, or release authority.",
  useCases: [
    "Read-only visual critique for video frames and motion hierarchy.",
  ],
  constraints: [
    "Stay inside this Skill's documented boundary.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Video visual critique\n\nLoad [critique.md](references/critique.md) for hierarchy, contrast, and craft checks. Integrate useful advice into project-owned direction and design files. This Skill cannot write protected paths, stamp review, or release.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
