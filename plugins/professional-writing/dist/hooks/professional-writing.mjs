#!/usr/bin/env node
// harness-source-hash: sha256:008928721ee9063ea42596aaadbea280afdb8afc754285c30efd03422ce7ac1f

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

// plugins/professional-writing/src/entries/hooks/professional-writing.ts
function warn(message) {
  process.stderr.write(`[professional-writing] ${message}
`);
}
function professionalWritingContext() {
  const loading = process.env.HARNESS_HOST === "codex" ? "Codex: read each selected Skill from this plugin's `skills/<name>/SKILL.md` before editing prose." : "Claude: invoke each selected plugin Skill through the native Skill tool before editing prose.";
  return [
    "[Professional Writing] Selective writing Skill orchestration",
    loading,
    "Whenever the response requires the user to carry out a procedure, troubleshoot, choose among options, recover from an error, or continue unfinished work, you MUST load `actionable-response` before answering. This is the default for action-heavy responses; do not wait for the user to request concise or ADHD-friendly wording. Never diagnose or label the user.",
    "For a knowledge-only answer or fully completed task, give the answer or result directly and do not manufacture a next action.",
    "Load `visual-explanation` when the user asks to see the topic visually, or when relationships, sequence, hierarchy, or state changes become materially clearer in the smallest useful visual. Do not force a visual onto a simple question.",
    "Use `writing-terse-output` only for an explicit terse-output request.",
    "For English prose, require `writing-english-prose`.",
    "For Chinese prose, require `writing-chinese-prose` and bundled `ai-flavor-remover`.",
    "For human-readable Markdown prose, also require `writing-markdown-ai-style`. Locate signals with `node <plugin>/dist/cli/analyze-ai-style.mjs <file>`; the report is evidence, not an automatic rewrite.",
    "For substantial mixed-language prose, use both language routes; isolated foreign terms follow the main language.",
    "Exclude code, commands, configuration, machine output, quotations, and exact short replies. Preserve facts, numbers, URLs, identifiers, citations, and Markdown structure."
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
