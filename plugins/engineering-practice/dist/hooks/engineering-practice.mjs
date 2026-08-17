#!/usr/bin/env node
// harness-source-hash: sha256:06ae2efd51a6299c0a4545aec66c89ad33da1659f9d05f7847423a0d8987f550

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
  const loading = process.env.HARNESS_HOST === "codex" ? "Codex: read each selected community Skill at `$HOME/.agents/skills/<name>/SKILL.md` before acting." : "Claude: invoke each selected community Skill through the native Skill tool before acting.";
  return [
    "[Engineering Practice] Selective engineering Skill orchestration",
    loading,
    "For non-trivial implementation, review, or refactoring, require `karpathy-guidelines`.",
    "For bugs, failures, regressions, or unexpected behavior, require `systematic-debugging` before proposing a fix.",
    "Before a completion, fixed, passing, commit, or PR claim, require `verification-before-completion` and fresh command evidence.",
    "If a required Skill is absent or unreadable, stop this orchestration route and report the missing dependency. Do not imitate it from memory.",
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
