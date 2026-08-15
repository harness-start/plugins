import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { test } from "node:test";

import {
  eventCwd,
  eventSessionId,
  eventToolInput,
  eventToolName,
  readStdinJson,
} from "@harness/core/hook-event";
import { additionalContext, preToolDeny, stopBlock } from "@harness/core/hook-output";

test("normalizes Claude and Codex hook fields through one typed seam", async () => {
  const input = Readable.from([JSON.stringify({
    sessionId: "session-1",
    working_directory: "/workspace",
    tool_name: "exec_command",
    toolInput: { cmd: "git status" },
  })]);

  const event = await readStdinJson(input);

  assert.equal(eventSessionId(event), "session-1");
  assert.equal(eventCwd(event), "/workspace");
  assert.equal(eventToolName(event), "exec_command");
  assert.deepEqual(eventToolInput(event), { cmd: "git status" });
});

test("malformed stdin returns an explicit fail-open parse marker", async () => {
  const event = await readStdinJson(Readable.from(["{"]));

  assert.equal(event.__parseError, true);
});

test("builds host-compatible deny, context, and stop outputs", () => {
  assert.deepEqual(preToolDeny("unsafe"), {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "unsafe",
    },
  });
  assert.deepEqual(additionalContext("PostToolUse", "checked"), {
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "checked" },
  });
  assert.deepEqual(stopBlock("incomplete"), { decision: "block", reason: "incomplete" });
});
