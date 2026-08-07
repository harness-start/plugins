import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  actionablePrompt,
  isRouteEligiblePrompt,
  lookupCommand,
  promptReminder,
  sessionContext,
} from "../scripts/lib/policy.mjs";

const ENTRY = fileURLToPath(
  new URL("../scripts/skill-routing-transparency.mjs", import.meta.url),
);

function runEntry(mode, platform, event) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, mode, platform], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(typeof event === "string" ? event : JSON.stringify(event));
  });
}

function parseOutput(stdout) {
  const text = stdout.trim();
  return text ? JSON.parse(text) : null;
}

test("session context keeps platform lookup mechanisms separate", () => {
  const claude = sessionContext("claude");
  const codex = sessionContext("codex");

  assert.match(claude, /\$HOME\/\.claude\/bin\/skill-route-lookup\.mjs/u);
  assert.doesNotMatch(claude, /CODEX_HOME|AI_EXPERTS_/u);
  assert.match(codex, /CODEX_HOME/u);
  assert.match(codex, /AI_EXPERTS_SESSION_ID/u);
  assert.match(codex, /AI_EXPERTS_TRIGGER_FROM/u);
  assert.doesNotMatch(codex, /\.claude\/bin/u);
});

test("session context exposes final route and actual load formats", () => {
  const context = sessionContext("codex");

  assert.match(context, /explicit=/u);
  assert.match(context, /primary=/u);
  assert.match(context, /companions=/u);
  assert.match(context, /loaded=/u);
  assert.match(context, /noMatch/u);
  assert.match(context, /unavailable/u);
  assert.match(context, /load_failed=/u);
  assert.match(context, /Do not expose rejected candidates/u);
});

test("lookup command sets Codex provenance and preserves Claude path", () => {
  assert.match(lookupCommand("codex"), /AI_EXPERTS_TRIGGER_FROM/u);
  assert.match(lookupCommand("codex"), /skill-route-lookup\.mjs/u);
  assert.equal(
    lookupCommand("claude"),
    'node "$HOME/.claude/bin/skill-route-lookup.mjs" --prompt "<full request>"',
  );
});

test("prompt policy skips continuation-only and host command turns", () => {
  assert.equal(isRouteEligiblePrompt("continue"), false);
  assert.equal(isRouteEligiblePrompt("continue with the original plan"), false);
  assert.equal(isRouteEligiblePrompt("/help"), false);
  assert.equal(isRouteEligiblePrompt("Research route transparency and implement the plugin"), true);
  assert.equal(isRouteEligiblePrompt("$python-engineering fix the script"), true);
  assert.equal(isRouteEligiblePrompt("/python-engineering fix the script"), true);
  assert.equal(isRouteEligiblePrompt("Continue fixing the login issue"), true);
  assert.equal(isRouteEligiblePrompt("Finished that; now implement the plugin"), true);
});

test("actionable prompt removes injected Skill and fenced-only noise", () => {
  assert.equal(actionablePrompt("<skill>x</skill>\nImplement route display"), "Implement route display");
  assert.equal(actionablePrompt("```js\nconst x = 1;\n```"), "");
});

test("prompt reminder is compact and excludes raw route diagnostics", () => {
  const reminder = promptReminder("claude");
  assert.match(reminder, /exactly one final route line/u);
  assert.match(reminder, /Honor an explicit Skill invocation directly/u);
  assert.match(reminder, /never list rejected candidates or raw scores/u);
});

test("hook emits SessionStart and UserPromptSubmit contexts", async () => {
  const session = await runEntry("session", "codex", { session_id: "s1" });
  assert.equal(session.code, 0);
  assert.equal(
    parseOutput(session.stdout)?.hookSpecificOutput?.hookEventName,
    "SessionStart",
  );

  const prompt = await runEntry("prompt", "claude", {
    session_id: "s1",
    prompt: "Implement Skill route transparency",
  });
  assert.equal(prompt.code, 0);
  assert.equal(
    parseOutput(prompt.stdout)?.hookSpecificOutput?.hookEventName,
    "UserPromptSubmit",
  );
});

test("hook stays silent for short follow-ups, subagents, and malformed input", async () => {
  const followup = await runEntry("prompt", "codex", { prompt: "continue" });
  assert.equal(followup.code, 0);
  assert.equal(followup.stdout, "");

  const subagent = await runEntry("prompt", "codex", {
    agent_id: "agent-1",
    prompt: "Implement the routing plugin",
  });
  assert.equal(subagent.code, 0);
  assert.equal(subagent.stdout, "");

  const malformed = await runEntry("prompt", "codex", "{");
  assert.equal(malformed.code, 0);
  assert.equal(malformed.stdout, "");
});
