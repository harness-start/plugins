const FENCED_BLOCK_RE = /(```|~~~)[\s\S]*?\1/gu;
const SKILL_BLOCK_RE = /<skill\b[\s\S]*?<\/skill>/giu;
const HOOK_HEADER_RE =
  /^\s*(?:[•*-]\s*)?(?:SessionStart|UserPromptSubmit|PreToolUse|PostToolUse|Stop|SubagentStop|Notification)\s+hook\b/iu;

export const SHORT_FOLLOWUP_RE =
  /^(?:(?:好的?[，,]?\s*)?(?:继续(?:做|处理|执行|任务)?|请继续|接着(?:做|处理|执行)?|按(?:上面|上述|原计划|计划)(?:继续(?:执行|推进)?|执行|推进)?)|continue(?:\s+with\s+(?:the\s+)?(?:original|previous)\s+plan)?|好的?|可以|收到|明白|了解|请确认|稍等|已完成|完成了|ok|okay|done)[。！!？? ]*$/iu;

const HOST_COMMAND_RE =
  /^\/(?:clear|compact|config|cost|doctor|help|hooks|login|logout|model|permissions|reload-plugins|resume|status|usage)\b/iu;

function stripHookTranscriptLines(text) {
  const kept = [];
  let skipping = false;
  for (const line of text.split(/\r?\n/u)) {
    if (HOOK_HEADER_RE.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (!line.trim()) skipping = false;
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n");
}

export function actionablePrompt(prompt) {
  return stripHookTranscriptLines(
    String(prompt ?? "")
      .replace(SKILL_BLOCK_RE, "\n")
      .replace(FENCED_BLOCK_RE, "\n"),
  ).trim();
}

export function isRouteEligiblePrompt(prompt) {
  const text = actionablePrompt(prompt);
  if (!text || SHORT_FOLLOWUP_RE.test(text)) return false;
  return !HOST_COMMAND_RE.test(text);
}

export function lookupCommand(platform) {
  if (platform === "claude") {
    return 'node "$HOME/.claude/bin/skill-route-lookup.mjs" --prompt "<full request>"';
  }
  if (platform === "codex") {
    return 'AI_EXPERTS_SESSION_ID="${AI_EXPERTS_SESSION_ID:-skill-routing-transparency}" AI_EXPERTS_TRIGGER_FROM="skill-routing-transparency:user-prompt" node "${CODEX_HOME:-$HOME/.codex}/bin/skill-route-lookup.mjs" --prompt "<full request>"';
  }
  throw new Error(`unsupported platform: ${platform}`);
}

const DISCLOSURE_FORMATS = [
  "- Explicit: 📌 Skill route: explicit=`skill-id`; loaded=`skill-id`",
  "- Implicit: 📌 Skill route: primary=`skill-id`; companions=`a`, `b`; loaded=`skill-id`, `a`, `b`",
  "- No match: 📌 Skill route: noMatch; loaded=none",
  "- Lookup unavailable or invalid: 📌 Skill route: unavailable; loaded=none",
  "- Selected but not loaded: append load_failed=`skill-id` and do not include it in `loaded`.",
].join("\n");

export function sessionContext(platform) {
  return [
    "<skill_routing_transparency>",
    "[Skill Routing Transparency]",
    "This is a disclosure protocol, not a blocking gate.",
    "For each new main-agent task or distinct subgoal, disclose the final Skill route before task prose.",
    "Honor an explicit Skill invocation directly. Otherwise run the platform lookup with the full request:",
    lookupCommand(platform),
    "Honor schema 3 `noMatch`, `primarySkillId`, `companionSkillIds`, and ordered `selectedSkillIds`.",
    "Read only selected Skill files. A routed Skill is not loaded until its Skill tool/injection/file read succeeds.",
    "Emit exactly one compact line using one of these formats:",
    DISCLOSURE_FORMATS,
    "Do not expose rejected candidates, raw `matches`, scores, or scoring reasons in the disclosure line.",
    "Do not reroute or repeat the line for short confirmations, continuation-only follow-ups, background completion, or host commands.",
    "Subagents do not emit routing declarations.",
    "</skill_routing_transparency>",
  ].join("\n");
}

export function promptReminder(platform) {
  return [
    "<skill_routing_transparency_reminder>",
    "[Skill Routing Transparency Reminder]",
    "Before task prose, disclose exactly one final route line and distinguish routed Skills from successfully loaded Skills.",
    "Honor an explicit Skill invocation directly; otherwise use the implicit lookup:",
    lookupCommand(platform),
    "Use only explicit/primary/companions/loaded/noMatch/unavailable; never list rejected candidates or raw scores.",
    "</skill_routing_transparency_reminder>",
  ].join("\n");
}
