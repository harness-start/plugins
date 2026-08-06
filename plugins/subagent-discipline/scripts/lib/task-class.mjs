const TYPE_RULES = [
  { re: /explore|explorer|research|search/iu, taskClass: "explore" },
  { re: /plan|planner|architect/iu, taskClass: "plan" },
  { re: /verify|test|qa/iu, taskClass: "verify" },
  {
    re: /worker|general-purpose|general|implement|code|coder|build/iu,
    taskClass: "implement",
  },
];

const BRIEF_RULES = [
  {
    re: /\b(pytest|npm test|go test|cargo test|vitest|jest)\b/iu,
    taskClass: "verify",
  },
  {
    re: /\b(explore|find where|search codebase|locate|investigate)\b/iu,
    taskClass: "explore",
  },
  {
    re: /\b(plan only|design only|do not (edit|change|implement))\b/iu,
    taskClass: "plan",
  },
  {
    re: /\b(implement|fix|refactor|edit|change|add tests?)\b/iu,
    taskClass: "implement",
  },
];

/**
 * @param {string|undefined|null} agentType
 * @param {string} [parentBrief]
 * @param {Record<string, string>} [agentTypeMap]
 */
export function resolveTaskClass(agentType, parentBrief = "", agentTypeMap = {}) {
  if (agentType && typeof agentType === "string") {
    const key = agentType.trim();
    if (agentTypeMap[key]) return agentTypeMap[key];
    const lowerMap = Object.fromEntries(
      Object.entries(agentTypeMap).map(([k, v]) => [k.toLowerCase(), v]),
    );
    if (lowerMap[key.toLowerCase()]) return lowerMap[key.toLowerCase()];

    for (const rule of TYPE_RULES) {
      if (rule.re.test(key)) return rule.taskClass;
    }
  }

  const brief = typeof parentBrief === "string" ? parentBrief : "";
  for (const rule of BRIEF_RULES) {
    if (rule.re.test(brief)) return rule.taskClass;
  }

  return "general";
}
