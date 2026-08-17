#!/usr/bin/env node
// harness-source-hash: sha256:8eecc1d0fe32b9af36783fbcc28f7f262fde52744d4b1aa97ed5d3a04a3329ab

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
  const loading = process.env.HARNESS_HOST === "codex" ? "Codex: read each selected Skill from this plugin's `skills/<name>/SKILL.md` before editing prose." : "Claude: invoke each selected plugin Skill through the native Skill tool before editing prose.";
  return [
    "[Professional Writing] Selective writing Skill orchestration",
    loading,
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
