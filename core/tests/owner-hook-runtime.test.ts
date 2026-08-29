import assert from "node:assert/strict";
import { test } from "node:test";

import { readStdinJson } from "../src/hook-event.js";
import { writeJson } from "../src/hook-output.js";
import { invokeOwnerHook, ownerHookHandler } from "../src/owner-hook-runtime.js";

test("owner hook runtime injects one event and collects structured output", async () => {
  const originalArgv = process.argv;
  const output = await invokeOwnerHook(
    { session_id: "session-1", tool_name: "Write" },
    ["post"],
    async () => {
      assert.equal(process.argv[2], "post");
      assert.equal((await readStdinJson()).session_id, "session-1");
      writeJson({ decision: "block", reason: "bounded" });
    },
  );
  assert.deepEqual(output, [{ decision: "block", reason: "bounded" }]);
  assert.equal(process.argv, originalArgv);
});

test("owner hook handler preserves a private hook hard-block exit status", async () => {
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;
  try {
    const handler = ownerHookHandler(() => {
      process.exitCode = 2;
    });
    const output = await handler({
      args: [],
      event: {},
      eventName: "PostToolUse",
      host: "claude",
      raw: "{}",
      trigger: "test",
    });
    assert.deepEqual(output, []);
    assert.equal(process.exitCode, 2);
  } finally {
    process.exitCode = originalExitCode;
  }
});
