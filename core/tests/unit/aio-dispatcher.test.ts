import assert from "node:assert/strict";
import { test } from "node:test";

import * as dispatcher from "../../src/aio-dispatcher.js";

test("dispatcher exposes owner-handler routing without a module process boundary", async () => {
  assert.equal(typeof dispatcher.dispatchHookRoutes, "function");
  const calls: string[] = [];
  const result = await dispatcher.dispatchHookRoutes({
    eventName: "PreToolUse",
    host: "codex",
    raw: JSON.stringify({ tool_name: "Bash" }),
    routes: { PreToolUse: [{ handler: "testing", args: ["pre"], matcher: "Bash" }] },
    handlers: {
      testing: ({ args }: { args: string[] }) => {
        calls.push(args[0] ?? "");
        return { hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: "handled" } };
      },
    },
  });
  assert.deepEqual(calls, ["pre"]);
  assert.equal(result.output?.hookSpecificOutput?.additionalContext, "handled");
});

test("malformed Hook input still reaches a matched fail-closed owner handler", async () => {
  const calls: boolean[] = [];
  const result = await dispatcher.dispatchHookRoutes({
    eventName: "PreToolUse",
    host: "codex",
    raw: "{not-json",
    routes: { PreToolUse: [{ handler: "testing", matcher: "Bash" }] },
    handlers: {
      testing: ({ event }) => {
        calls.push(event.__parseError === true);
        return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny" } };
      },
    },
  });
  assert.deepEqual(calls, [true]);
  assert.equal(result.output?.hookSpecificOutput?.permissionDecision, "deny");
});

test("Codex model-visible tool feedback survives owner aggregation", async () => {
  const result = await dispatcher.dispatchHookRoutes({
    eventName: "PostToolUse",
    host: "codex",
    raw: JSON.stringify({ tool_name: "Edit" }),
    routes: { PostToolUse: [{ handler: "review", matcher: "Edit" }] },
    handlers: {
      review: () => ({
        continue: false,
        stopReason: "review feedback",
        reason: "inspect the Markdown finding",
      }),
    },
  });
  assert.deepEqual(result.output, {
    continue: false,
    stopReason: "review feedback",
    reason: "inspect the Markdown finding",
  });
});

test("SessionStart route matchers use the session source and treat a missing source as startup", async () => {
  const seen: string[] = [];
  const routes = { SessionStart: [{ handler: "startup", matcher: "startup|resume|clear" }] };
  const handlers = { startup: () => { seen.push("startup"); } };

  await dispatcher.dispatchHookRoutes({ eventName: "SessionStart", host: "codex", raw: JSON.stringify({ source: "compact" }), routes, handlers });
  await dispatcher.dispatchHookRoutes({ eventName: "SessionStart", host: "codex", raw: "{}", routes, handlers });

  assert.deepEqual(seen, ["startup"]);
});
