#!/usr/bin/env node
// harness-source-hash: sha256:32f220871ff2f3a05b774b98feb11605d79b14e24a74ee62130d37e876d1b608

// plugins/reasoning-methods/src/entries/hooks/reasoning-methods.ts
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

// plugins/reasoning-methods/src/session-context.ts
function reasoningMethodsContext() {
  return [
    "[Reasoning Methods] Selective first-principles and verification routing",
    "For exact, causal, decision, or factual work whose answer can be wrong, load this plugin's `reasoning-methods` or `first-principles` Skill before answering.",
    "Use the cheapest structure that can falsify the conclusion. Extra model turns are not evidence.",
    "Keep easy lookups, translations, and already-determined implementation tasks direct."
  ].join("\n");
}

// plugins/reasoning-methods/src/entries/hooks/reasoning-methods.ts
function warn(message) {
  process.stderr.write(`[reasoning-methods] ${message}
`);
}
async function runSessionStart() {
  const event = await readStdinJson();
  if (event.__parseError) return warn("invalid hook input; advisory context was skipped");
  writeJson(additionalContext("SessionStart", reasoningMethodsContext()));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSessionStart().catch((error) => {
    warn(error instanceof Error ? error.message : String(error));
    process.exit(0);
  });
}
export {
  runSessionStart
};
