#!/usr/bin/env node
// harness-source-hash: sha256:154bfa04d198de2af76554a5ff0f27eb7ea822a0ba5bbfe221f08a07114be9da

// plugins/engineering-mindset/src/entries/hooks/engineering-mindset.ts
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

// plugins/engineering-mindset/src/entries/hooks/engineering-mindset.ts
function warn(message) {
  process.stderr.write(`[engineering-mindset] ${message}
`);
}
function engineeringMindsetContext() {
  const hostLoadingRule = process.env.HARNESS_HOST === "codex" ? "Codex loading rule: before the first matching engineering action, read `$HOME/.agents/skills/<name>/SKILL.md` for each selected Skill; reading the file is the Skill load on this host. Codex completion gate: after the last change and before the final response, read `$HOME/.agents/skills/verification-before-completion/SKILL.md`, then run fresh verification." : "Claude loading rule: use the native Skill tool for each selected Skill before the first matching engineering action.";
  return [
    "[Engineering Mindset] Selective Skill routing",
    "Mandatory pre-action gate: before the first tool call or substantive answer for a matching request, load the named Skill through the host-native Skill invocation or by reading its installed SKILL.md. Do not proceed from memory alone.",
    hostLoadingRule,
    "Load only the smallest relevant set of installed Skills; do not load every Skill for every request.",
    "Before non-trivial code implementation, review, or refactoring, load and follow `karpathy-guidelines` to surface assumptions, keep the change surgical, prefer the simplest sufficient design, and define verifiable success criteria.",
    "For a bug, test or build failure, performance regression, or unexpected technical behavior, load `systematic-debugging` before proposing a fix. Establish evidence and a reproducible signal first; use `karpathy-guidelines` when implementing the confirmed fix.",
    "Immediately before any completion, fixed, passing, commit, or PR claim, load `verification-before-completion` and support the claim with fresh, directly relevant command output from the current work epoch.",
    "Load `caveman` only when the user explicitly asks for terse output, fewer tokens, or caveman mode. Do not compress security warnings, irreversible-action confirmations, ambiguous ordered procedures, code, commands, paths, identifiers, numbers, or exact errors.",
    "For trivial requests, pure prose, or work with no matching engineering condition, load none of these Skills.",
    "User instructions, project instructions, safety constraints, and platform-specific runtime rules take precedence over this advisory router.",
    "If a named Skill is missing or cannot be loaded, never claim it was loaded. Report the missing dependency briefly and continue using the applicable project rules and verifiable evidence."
  ].join("\n");
}
async function runSessionStart() {
  const event = await readStdinJson();
  if (event.__parseError) {
    warn("invalid hook input; advisory context was skipped");
    return;
  }
  writeJson(additionalContext("SessionStart", engineeringMindsetContext()));
}
async function main() {
  await runSessionStart();
}
var isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => warn(error instanceof Error ? error.message : String(error)));
}
export {
  engineeringMindsetContext,
  runSessionStart
};
