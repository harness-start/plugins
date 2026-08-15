#!/usr/bin/env node
// harness-source-hash: sha256:3f437eeefcb433232febda2e49046c49fc0a75b2953b76ed0b981ea8b05dbd56

// plugins/intent-clarify-gate/src/entries/hooks/intent-clarify-gate.ts
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

// plugins/intent-clarify-gate/src/lib/hook-io.ts
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

// plugins/intent-clarify-gate/src/lib/first-prompt-state.ts
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
  const directory = join(data.root, "intent-clarify-gate", "first-prompts");
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
    if (error?.code === "EEXIST") {
      return { claimed: false, persisted: true, path, reason: null };
    }
    return {
      claimed: true,
      persisted: false,
      path,
      reason: `first-prompt state was not persisted: ${error?.message ?? String(error)}`
    };
  }
}

// plugins/intent-clarify-gate/src/entries/hooks/intent-clarify-gate.ts
function warn(message) {
  process.stderr.write(`[intent-clarify-gate] ${message}
`);
}
function firstTurnContext() {
  return [
    "[intent-clarify-gate:first-turn]",
    "Load and follow the bundled `intent-discovery` Skill before committing to an interpretation of this first request.",
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
  main().catch((error) => warn(error?.message ?? String(error)));
}
export {
  firstTurnContext,
  runPrompt
};
