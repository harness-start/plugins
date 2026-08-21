#!/usr/bin/env node
// harness-source-hash: sha256:15b5ab1b33b0ffa6a449be4c0693a278505907afd65bf82ebe1ac06addfa8568

// plugins/intent-discovery/src/entries/hooks/intent-discovery.ts
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
function nestedRecord(event, key) {
  const value = event[key];
  return isRecord(value) ? value : null;
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
function eventSessionId(event) {
  const context = nestedRecord(event, "context");
  return firstString(
    event.session_id,
    event.sessionId,
    event.sessionID,
    event.conversation_id,
    event.conversationId,
    context?.session_id
  );
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

// plugins/intent-discovery/src/lib/hook-io.ts
var readStdinJson2 = readStdinJson;
function extractSessionId(event, env = process.env) {
  const value = eventSessionId(event) || env.AI_EXPERTS_SESSION_ID;
  if (typeof value !== "string" || !value.trim() || value === "hook") return null;
  return value.trim();
}
function platformDataRoot(env = process.env) {
  if (env.CLAUDE_PLUGIN_ROOT && env.CLAUDE_PLUGIN_DATA) {
    return { platform: "claude", root: env.CLAUDE_PLUGIN_DATA };
  }
  if (env.PLUGIN_ROOT && env.PLUGIN_DATA) {
    return { platform: "codex", root: env.PLUGIN_DATA };
  }
  return null;
}
function additionalContextOutput(hookEventName, text) {
  return additionalContext(hookEventName, text);
}

// plugins/intent-discovery/src/lib/first-prompt-state.ts
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
var VERSION = 1;
function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
function claimFirstPrompt(event, env = process.env, now = /* @__PURE__ */ new Date()) {
  const sessionId = extractSessionId(event, env);
  const data = platformDataRoot(env);
  if (!sessionId || !data) {
    return {
      claimed: true,
      persisted: false,
      path: null,
      reason: "session identity or platform data root is unavailable; injecting without sticky state"
    };
  }
  const directory = join(data.root, "intent-discovery", "first-prompts");
  const path = join(directory, `${digest(`${data.platform}:${sessionId}`)}.json`);
  try {
    mkdirSync(directory, { recursive: true, mode: 448 });
    writeFileSync(path, `${JSON.stringify({ version: VERSION, injectedAt: now.toISOString() })}
`, {
      encoding: "utf8",
      mode: 384,
      flag: "wx"
    });
    return { claimed: true, persisted: true, path, reason: null };
  } catch (error) {
    if (isRecord(error) && error.code === "EEXIST") {
      return { claimed: false, persisted: true, path, reason: null };
    }
    return {
      claimed: true,
      persisted: false,
      path,
      reason: `first-prompt state was not persisted: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// plugins/intent-discovery/src/entries/hooks/intent-discovery.ts
function warn(message) {
  process.stderr.write(`[intent-discovery] ${message}
`);
}
function firstTurnContext() {
  return [
    "[intent-discovery:first-turn]",
    "First classify whether discovery can change the work. If the request already states a concrete target, outcome, constraints, and acceptance, treat it as light: do not load the Skill or spawn discovery workers; inspect the named seam and continue directly.",
    "For concrete repository work, bound local discovery to the named seam, callers, tests, documentation, and history. Time-box it: when repeated evidence appears, stop searching and reproduce the behavior.",
    "Do not search for hidden evaluator artifacts, solution patches, or answer caches. Treat unavailable evidence as unavailable and proceed from the repository contract.",
    "Load and follow the bundled `intent-discovery` Skill only when unresolved interpretations would materially change the deliverable or implementation.",
    "Front-load repository and source facts, use bounded parallel subagents only when their independent evidence can change the approach, and reconcile their result cards in the parent agent.",
    "Do not stop to ask the user for clarification or approval as part of this discovery pass. Choose a bounded, reversible assumption when needed, state material assumptions briefly, and continue with the request."
  ].join("\n");
}
function runPrompt(event, env = process.env) {
  const claim = claimFirstPrompt(event, env);
  if (!claim.claimed) return;
  if (!claim.persisted && claim.reason) warn(claim.reason);
  writeJson(additionalContextOutput("UserPromptSubmit", firstTurnContext()));
}
async function main() {
  const mode = process.argv[2] ?? "prompt";
  if (!(/* @__PURE__ */ new Set(["prompt", "user-prompt", "UserPromptSubmit"])).has(mode)) return;
  const event = await readStdinJson2();
  if (event.__parseError) return;
  runPrompt(event);
}
var isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => warn(error instanceof Error ? error.message : String(error)));
}
export {
  firstTurnContext,
  runPrompt
};
