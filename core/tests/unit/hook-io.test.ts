import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { test } from "node:test";

import {
  eventCwd,
  eventSessionId,
  eventToolInput,
  eventToolName,
  eventToolUseId,
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

test("reads nested tool and context aliases without treating event.name as a tool", async () => {
  const event = await readStdinJson(Readable.from([JSON.stringify({
    name: "PreToolUse",
    sessionID: "nested-session",
    context: { session_id: "should-not-win" },
    tool: { name: "create_file", input: { path: "src/a.ts" }, id: "tool-9" },
    input: { script: "echo unused" },
  })]));

  assert.equal(eventSessionId(event), "nested-session");
  assert.equal(eventToolName(event), "create_file");
  assert.deepEqual(eventToolInput(event), { path: "src/a.ts" });
  assert.equal(eventToolUseId(event), "tool-9");
});

test("prefers context.session_id when top-level session fields are absent", async () => {
  const event = await readStdinJson(Readable.from([JSON.stringify({
    context: { session_id: "from-context" },
  })]));
  assert.equal(eventSessionId(event), "from-context");
});

test("falls back to process.cwd when no working directory is present", async () => {
  const event = await readStdinJson(Readable.from([JSON.stringify({})]));
  assert.equal(eventCwd(event), process.cwd());
});

test("malformed stdin returns an explicit fail-open parse marker", async () => {
  const event = await readStdinJson(Readable.from(["{"]));

  assert.equal(event.__parseError, true);
});

test("empty stdin is a valid empty object and non-objects are parse errors", async () => {
  assert.deepEqual(await readStdinJson(Readable.from([""])), {});
  assert.equal((await readStdinJson(Readable.from(["[]"]))).__parseError, true);
  assert.equal((await readStdinJson(Readable.from(["\"x\""]))).__parseError, true);
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
