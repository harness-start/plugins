#!/usr/bin/env node
// harness-source-hash: sha256:d28fedb9b935fbc4eb5ee80e9a140a1b1db75f45c377aa3cc4dcc7fcc572b603

// plugins/engineering-practice/src/entries/hooks/engineering-practice.ts
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// core/src/hook-event.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}
async function readStdinJson(input = process.stdin) {
  let raw = "";
  for await (const chunk of input) raw += chunk.toString();
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : { __parseError: true };
  } catch {
    return { __parseError: true };
  }
}
function eventPrompt(event) {
  return firstString(event.prompt, event.user_prompt, event.userPrompt, event.message);
}

// core/src/hook-output.ts
var TOOL_LIFECYCLE_EVENTS = /* @__PURE__ */ new Set([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure"
]);
function additionalContext(hookEventName, context, options = {}) {
  const codexToolReport = Boolean(process.env.PLUGIN_ROOT) && TOOL_LIFECYCLE_EVENTS.has(hookEventName);
  const echoStderr = options.echoStderr ?? codexToolReport;
  const suppressJson = codexToolReport || Boolean(options.suppressJson);
  if (echoStderr) process.stderr.write(`${context}
`);
  if (suppressJson) return null;
  return {
    hookSpecificOutput: {
      hookEventName,
      additionalContext: context
    }
  };
}
function writeJson(value) {
  if (value !== null && value !== void 0) {
    process.stdout.write(`${JSON.stringify(value)}
`);
  }
}

// plugins/engineering-practice/src/entries/hooks/engineering-practice.ts
function warn(message) {
  process.stderr.write(`[engineering-practice] ${message}
`);
}
function engineeringPracticeContext() {
  return [
    "[Engineering Practice] Optional engineering method guidance",
    "Skills are optional method guides, not Hook prerequisites or completion evidence.",
    "For non-trivial implementation or refactoring, use the bundled `engineering-judgment` method when it helps control scope and trade-offs.",
    "For read-only review, the bundled `engineering-review` method requires P0-P3 severity, exact file:line, concrete evidence, and a verifiable fix or recovery path.",
    "Completion, fixed, or passing claims need fresh command evidence; the bundled `engineering-verification` method can help select checks.",
    "Use local public seams, callers, tests, documentation, and project conventions as evidence. Hook injection or Skill loading does not prove an outcome."
  ].join("\n");
}
var REVIEW_PROMPT = /\b(?:audit|code review|review|assess|inspect)\b/iu;
var VERIFICATION_PROMPT = /\b(?:verify|verification|validate|test|typecheck|lint|build|before (?:claiming|completion)|ready to (?:finish|ship))\b/iu;
var IMPLEMENTATION_PROMPT = /\b(?:add|change|fix|implement|migrate|modify|refactor|repair|update)\b/iu;
function promptMethodContext(event) {
  const prompt = eventPrompt(event);
  if (!prompt) return "";
  if (REVIEW_PROMPT.test(prompt)) {
    return "[Engineering Practice] This appears to be a read-only review. Use the bundled `engineering-review` method if useful; keep the review read-only and anchor every verified finding to severity, file:line, evidence, and recovery.";
  }
  if (VERIFICATION_PROMPT.test(prompt)) {
    return "[Engineering Practice] This task asks for verification. Use the bundled `engineering-verification` method if useful; run directly relevant checks after the last mutation and report missing or stale evidence as unverified.";
  }
  if (IMPLEMENTATION_PROMPT.test(prompt)) {
    return "[Engineering Practice] This appears to be implementation or refactoring. Use the bundled `engineering-judgment` method if useful; preserve the requested public contract, keep the change scoped, and verify observable behavior.";
  }
  return "";
}
async function runSessionStart() {
  const event = await readStdinJson();
  if (event.__parseError) return warn("invalid hook input; advisory context was skipped");
  writeJson(additionalContext("SessionStart", engineeringPracticeContext()));
}
async function runUserPromptSubmit() {
  const event = await readStdinJson();
  if (event.__parseError) return warn("invalid hook input; prompt guidance was skipped");
  const context = promptMethodContext(event);
  if (context) writeJson(additionalContext("UserPromptSubmit", context));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = process.argv[2] === "user-prompt" ? runUserPromptSubmit : runSessionStart;
  run().catch((error) => warn(error instanceof Error ? error.message : String(error)));
}
export {
  engineeringPracticeContext,
  promptMethodContext,
  runSessionStart,
  runUserPromptSubmit
};
