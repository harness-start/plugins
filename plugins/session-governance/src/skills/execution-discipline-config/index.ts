import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "execution-discipline-config",
  fullName: "execution-discipline-config",
  description: "Change execution-discipline thresholds for edit loops, command retries, polling budgets, exemptions, or bypass markers in .execution-discipline.mjs.",
  useCases: [
    "Change execution-discipline thresholds for edit loops, command retries, polling budgets, exemptions, or bypass markers in .execution-discipline.mjs.",
  ],
  constraints: [
    "Do not create a second config when one already exists.",
  ],
  invocation: InvocationPolicy.ExplicitOnly,
  frontmatter: { version: "0.2.0" },
  goal: defineSkillGoal({
    body: "# execution-discipline-config\n\nManage the project configuration consumed by `execution-discipline`. The authoritative schema is the plugin sibling `README.md`; read it before editing configuration.\n\n## Discovery\n\nResolve the project root with `git rev-parse --show-toplevel`. Load the first existing file only:\n\n1. `.execution-discipline.mjs` — preferred for new configuration\n2. `.execution-discipline.cjs`\n3. `.execution-discipline.js`\n\nDo not create a second config when one already exists. A missing or broken config leaves built-in defaults active; diagnose and report the error instead of silently weakening protection.\n\n## Schema\n\n```js\nexport default {\n  checks: {\n    editLoop: \"block\",\n    failedCommandRetry: \"block\",\n    successfulCommandRepeat: \"block\",\n    remotePolling: \"report\",\n  },\n  editLoop: {\n    reportAt: 5,\n    blockAt: 20,\n    windowMinutes: 30,\n    exemptPaths: [/^docs\\//],\n  },\n  commandRepeat: {\n    failureReportAt: 2,\n    failureBlockAt: 3,\n    successReportAt: 6,\n    successBlockAt: 12,\n    windowMinutes: 10,\n    retryBypass: /(?:^|\\s)#\\s*retry-ok\\b/i,\n  },\n  polling: {\n    sleepBudgetSeconds: 600,\n    queryBudgetCount: 20,\n    windowMinutes: 30,\n    cooldownMinutes: 5,\n    maxSleepPerCommandSeconds: 3600,\n    whileLoopAssumedIterations: 10,\n    pollBypass: /(?:^|\\s)#\\s*poll-ok\\b/i,\n  },\n};\n```\n\n- Check modes are `block`, `report`, or `off`.\n- All thresholds are finite integers; report thresholds must be lower than block thresholds.\n- `editLoop.exemptPaths` contains RegExp literals matched against repo-relative POSIX paths and is appended to the built-in Markdown exemption.\n- Bypass patterns are RegExp literals, not strings.\n- Successful verification commands clear edit counts; this is built-in behavior and has no config switch.\n\n## Workflow\n\n1. Classify the request as `init`, `show`, `set-mode`, `set-threshold`, `add-exemption`, `set-bypass`, or `diagnose`.\n2. Locate and read the entire existing config and plugin `README.md`.\n3. For `init`, create only `.execution-discipline.mjs` with the minimal template below; do not copy every default field unless the user wants to own it.\n4. Apply the narrowest change. Preserve unrelated comments, order and formatting.\n5. Dynamically import the config with Node, validate field types and threshold ordering, then summarize effective changes.\n\nMinimal init template:\n\n```js\n// Project overrides for execution-discipline. Unspecified values use plugin defaults.\nexport default {\n  checks: {},\n  editLoop: {\n    exemptPaths: [],\n  },\n};\n```\n\n## Safety rules\n\n- Do not set all checks to `off` without explicit user instruction.\n- Prefer a narrow path exemption over raising the global edit threshold.\n- Do not lower a block threshold below its report threshold.\n- Keep remote polling `report` unless the user explicitly accepts blocking legitimate waits.\n- Do not use `/.*/` exemptions or bypass patterns merely to silence one incident.\n- Do not edit the installed plugin to customize a project.\n\n## Reference\n\n- Plugin design: `${CLAUDE_PLUGIN_ROOT}/README.md`.\n- Complete example: `references/example-config.mjs`.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
