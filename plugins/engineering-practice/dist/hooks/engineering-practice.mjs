#!/usr/bin/env node
// harness-source-hash: sha256:d0bfade33e3c4aa9bf35bdf2cabcf892d8017c445f558b1972a080fc13cd86ae

// plugins/engineering-practice/src/entries/hooks/engineering-practice.ts
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// core/src/hook-event.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

// core/src/hook-output.ts
function additionalContext(hookEventName, context, options = {}) {
  if (options.echoStderr) process.stderr.write(`${context}
`);
  if (options.suppressJson) return null;
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
  const loading = process.env.HARNESS_HOST === "codex" ? "Codex: read each selected Skill from this plugin's `skills/<name>/SKILL.md` before acting." : "Claude: invoke each selected plugin Skill through the native Skill tool before acting.";
  return [
    "[Engineering Practice] Selective engineering Skill orchestration",
    loading,
    "For non-trivial implementation or refactoring, require `engineering-judgment`.",
    "For read-only code review, require `engineering-review`; findings need severity, file:line, evidence, and a verifiable fix or recovery path.",
    "Before a completion, fixed, passing, commit, or PR claim, require `engineering-verification` and fresh command evidence.",
    "Load only Skills selected by the current engineering task. Hooks remain independent enforcement and are not completion evidence."
  ].join("\n");
}
async function runSessionStart() {
  const event = await readStdinJson();
  if (event.__parseError) return warn("invalid hook input; advisory context was skipped");
  writeJson(additionalContext("SessionStart", engineeringPracticeContext()));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSessionStart().catch((error) => warn(error instanceof Error ? error.message : String(error)));
}
export {
  engineeringPracticeContext,
  runSessionStart
};
