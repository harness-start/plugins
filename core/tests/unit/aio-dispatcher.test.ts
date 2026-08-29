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
