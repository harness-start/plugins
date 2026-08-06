import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { SUBAGENT_CONTEXT } from "../scripts/lib/policy.mjs";

const ENTRY = fileURLToPath(
  new URL("../scripts/subagent-discipline-hook-start.mjs", import.meta.url),
);

function runEntry(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

test("SubagentStart emits the exact discipline context", async () => {
  const result = await runEntry(
    JSON.stringify({
      hook_event_name: "SubagentStart",
      session_id: "session-1",
      agent_id: "agent-1",
      agent_type: "explorer",
    }),
  );

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    hookSpecificOutput: {
      hookEventName: "SubagentStart",
      additionalContext: SUBAGENT_CONTEXT,
    },
  });
});

test("SubagentStart applies to every agent type", async () => {
  for (const agentType of ["Explore", "worker", "custom-reviewer"]) {
    const result = await runEntry(
      JSON.stringify({ hook_event_name: "SubagentStart", agent_type: agentType }),
    );
    assert.equal(
      JSON.parse(result.stdout).hookSpecificOutput.additionalContext,
      SUBAGENT_CONTEXT,
    );
  }
});

test("policy does not impose a Result Card or completion schema", () => {
  assert.doesNotMatch(SUBAGENT_CONTEXT, /Result Card|Parent action needed:/u);
});

test("SubagentStart fails open for malformed JSON", async () => {
  const result = await runEntry("{");

  assert.equal(result.code, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});
