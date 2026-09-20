import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "agent-activity-audit-config",
  fullName: "agent-activity-audit-config",
  description: "Initialize or diagnose .agent-activity-audit.mjs for the agent-activity-audit trail plugin.",
  useCases: [
    "Initialize or diagnose .agent-activity-audit.mjs for the agent-activity-audit trail plugin.",
  ],
  constraints: [
    "Do not commit unless asked.",
  ],
  invocation: InvocationPolicy.ExplicitOnly,
  frontmatter: { version: "0.2.0" },
  goal: defineSkillGoal({
    body: "# agent-activity-audit-config\n\nManage the project configuration consumed by `agent-activity-audit`.\n\nAuthoritative schema: sibling plugin `README.md`.\n\n## Discovery\n\nGit root, first existing file:\n\n1. `.agent-activity-audit.mjs`\n2. `.agent-activity-audit.cjs`\n3. `.agent-activity-audit.js`\n\n## Schema\n\n```js\nexport default {\n  enabled: true,\n  auditRoot: \".agent-activity-audit\",\n  maxCommandChars: 2000,\n  redactSecrets: true,\n};\n```\n\n| Field | Type | Rule |\n| --- | --- | --- |\n| `enabled` | `boolean` | Default `true` |\n| `auditRoot` | `string` | Relative path without `..` |\n| `maxCommandChars` | `number` | `64..20000`; default `2000` |\n| `redactSecrets` | `true` | Fixed safety invariant; `false` is rejected and redaction remains active |\n\n## Workflow\n\n1. Read existing config fully before editing.\n2. Initialize only `.agent-activity-audit.mjs` when missing.\n3. Do not commit unless asked.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
