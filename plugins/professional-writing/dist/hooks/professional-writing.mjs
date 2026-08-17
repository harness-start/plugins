#!/usr/bin/env node
// harness-source-hash: sha256:925f1867326047dfc237884ae5d5ebfe6057d6095c43be5e23bd505b1549d970

// plugins/professional-writing/src/entries/hooks/professional-writing.ts
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

// plugins/professional-writing/src/entries/hooks/professional-writing.ts
function warn(message) {
  process.stderr.write(`[professional-writing] ${message}
`);
}
function professionalWritingContext() {
  const loading = process.env.HARNESS_HOST === "codex" ? "Codex: read each selected community Skill at `$HOME/.agents/skills/<name>/SKILL.md` and the bundled `ai-flavor-remover` Skill before editing prose." : "Claude: invoke each selected Skill through the native Skill tool before editing prose.";
  return [
    "[Professional Writing] Selective writing Skill orchestration",
    loading,
    "Use `caveman` only for an explicit terse-output request.",
    "For English prose, require `humanizer` and `stop-slop`.",
    "For Chinese prose, require `humanizer-zh`, `shuorenhua`, and bundled `ai-flavor-remover`.",
    "For human-readable Markdown prose, also require `remove-ai-style`. Before every analyzer run, SHA-256 `scripts/analyze_ai_style.py` and require `b1f0fa7af66072f23723f52fde09db05f0d3a3bcdaeab8194a14cf2cbce04bf7`; never execute a mismatched file.",
    "For substantial mixed-language prose, use both language routes; isolated foreign terms follow the main language.",
    "Exclude code, commands, configuration, machine output, quotations, and exact short replies. Preserve facts, numbers, URLs, identifiers, citations, and Markdown structure.",
    "If any Skill required by the selected route is absent or unreadable, stop the route and report the dependency gap. Do not imitate it from memory."
  ].join("\n");
}
async function runSessionStart() {
  const event = await readStdinJson();
  if (event.__parseError) return warn("invalid hook input; advisory context was skipped");
  writeJson(additionalContext("SessionStart", professionalWritingContext()));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSessionStart().catch((error) => warn(error instanceof Error ? error.message : String(error)));
}
export {
  professionalWritingContext,
  runSessionStart
};
