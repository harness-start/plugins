import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const FILTER = fileURLToPath(new URL("../acceptance/lib/codex-wait-receipt.jq", import.meta.url));
const PARENT_LANE_FILTER = fileURLToPath(new URL("../acceptance/lib/codex-parent-lane.jq", import.meta.url));

function call(name, callId, argumentsValue) {
  return { type: "response_item", payload: { type: "function_call", name, call_id: callId, arguments: JSON.stringify(argumentsValue) } };
}

function receipt(callId, output) {
  return { type: "response_item", payload: { type: "function_call_output", call_id: callId, output } };
}

function accepts(events) {
  const result = spawnSync("jq", ["-s", "-e", "-f", FILTER], {
    encoding: "utf8",
    input: `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
  });
  return result.status === 0;
}

function parentAvoidedLanes(events) {
  const result = spawnSync("jq", ["-s", "-e", "-f", PARENT_LANE_FILTER], {
    encoding: "utf8",
    input: `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
  });
  return result.status === 0;
}


const SPAWNS = [
  call("spawn_agent", "spawn-1", { task_name: "orchard_lane" }),
  call("spawn_agent", "spawn-2", { task_name: "harbor_lane" }),
];
const WAIT = call("wait_agent", "wait-1", { timeout_ms: 10000 });
const SUCCESS = receipt("wait-1", JSON.stringify({ message: "Wait completed.", timed_out: false }));

test("Codex bounded-worker oracle accepts one successful post-call wait receipt", () => {
  assert.equal(accepts([...SPAWNS, WAIT, SUCCESS]), true);
});

test("Codex bounded-worker oracle rejects missing and error wait receipts", () => {
  assert.equal(accepts([...SPAWNS, WAIT]), false);
  assert.equal(accepts([...SPAWNS, WAIT, receipt("wait-1", "Error: wait unavailable")]), false);
});

test("Codex bounded-worker oracle rejects a receipt placed before its wait call", () => {
  assert.equal(accepts([...SPAWNS, SUCCESS, WAIT]), false);
});

test("Codex parent-lane oracle accepts parent writes outside worker lanes", () => {
  assert.equal(parentAvoidedLanes([
    call("update_plan", "plan-1", {
      plan: [{ step: "Verify bounded workers", status: "in_progress" }],
    }),
    call("exec_command", "exec-absolute-workspace", {
      cmd: "printf '%s\\n' 'parent rejected unverified workers' > rejection.txt && wc -c rejection.txt && cat rejection.txt",
      workdir: "/out/spec-driven-development__04-multi-task-context-isolation__codex/workspace",
    }),
  ]), true);
  assert.equal(parentAvoidedLanes([
    {
      type: "response_item",
      payload: {
        type: "custom_tool_call",
        name: "apply_patch",
        input: "*** Begin Patch\n*** Add File: rejection.txt\n+parent rejected unverified workers\n*** End Patch",
      },
    },
  ]), true);
  assert.equal(parentAvoidedLanes([
    call("exec_command", "exec-read-chain", {
      cmd: "cat -A rejection.txt && echo \"---\" && wc -l rejection.txt",
    }),
  ]), true);
  assert.equal(parentAvoidedLanes([
    call("exec_command", "exec-byte-check", { cmd: "od -c rejection.txt" }),
  ]), true);
  assert.equal(parentAvoidedLanes([
    call("exec_command", "exec-skill", {
      cmd: "cat /out/example/codex-home/plugins/cache/harness-start/spec-driven-development/0.2.0/skills/sdd-build/SKILL.md",
    }),
    call("exec_command", "exec-write-order", {
      cmd: "printf 'parent rejected unverified workers\\n' > rejection.txt && cat rejection.txt && wc -c rejection.txt",
    }),
  ]), true);
  assert.equal(parentAvoidedLanes([
    call("exec_command", "exec-safe", {
      cmd: "printf 'parent rejected unverified workers\\n' > rejection.txt && wc -c rejection.txt && cat rejection.txt",
    }),
  ]), true);
  assert.equal(parentAvoidedLanes([
    call("exec_command", "exec-format", {
      cmd: "printf '%s\\n' 'parent rejected unverified workers' > rejection.txt && wc -c rejection.txt && cat rejection.txt",
    }),
  ]), true);
  assert.equal(parentAvoidedLanes([
    call("exec_command", "exec-format-stdin-count", {
      cmd: "printf '%s\\n' 'parent rejected unverified workers' > rejection.txt && cat rejection.txt && printf 'bytes: ' && wc -c < rejection.txt",
    }),
  ]), true);
  assert.equal(parentAvoidedLanes([
    call("exec_command", "exec-format-no-newline", {
      cmd: "printf '%s' 'parent rejected unverified workers' > rejection.txt && wc -c rejection.txt",
    }),
  ]), true);
  assert.equal(parentAvoidedLanes([
    call("exec_command", "exec-format-no-newline-chain", {
      cmd: "printf '%s' 'parent rejected unverified workers' > rejection.txt && wc -c rejection.txt && cat rejection.txt",
    }),
  ]), true);
  assert.equal(parentAvoidedLanes([
    call("exec_command", "exec-write", {
      cmd: "printf 'parent rejected unverified workers\\n' > rejection.txt && wc -c rejection.txt",
    }),
    call("exec_command", "exec-read", { cmd: "cat rejection.txt" }),
  ]), true);
});

test("Codex parent-lane oracle rejects apply_patch and shell access to worker lanes", () => {
  assert.equal(parentAvoidedLanes([
    { type: "response_item", payload: { type: "custom_tool_call", name: "apply_patch", input: "*** Add File: lanes/orchard/result.txt" } },
  ]), false);
  for (const path of ["lanes/orchard/rejection.txt", "/tmp/rejection.txt", "../rejection.txt"]) {
    assert.equal(parentAvoidedLanes([
      {
        type: "response_item",
        payload: {
          type: "custom_tool_call",
          name: "apply_patch",
          input: `*** Begin Patch\n*** Add File: ${path}\n+parent rejected unverified workers\n*** End Patch`,
        },
      },
    ]), false, path);
  }
  assert.equal(parentAvoidedLanes([
    call("exec_command", "exec-1", { cmd: "cd lanes && pwd" }),
  ]), false);
  assert.equal(parentAvoidedLanes([
    call("exec_command", "exec-2", { cmd: "pwd", workdir: "/tmp/accept/lanes" }),
  ]), false);
  assert.equal(parentAvoidedLanes([
    call("exec_command", "exec-3", { cmd: "cd 'lanes' && cat orchard/request.md" }),
  ]), false);
  assert.equal(parentAvoidedLanes([
    call("exec_command", "exec-4", { cmd: "find . -type f -exec cat {} ;" }),
  ]), false);
  assert.equal(parentAvoidedLanes([
    call("exec_command", "exec-5", { cmd: "cat rejection.txt && cat lanes/orchard/request.md" }),
  ]), false);
  assert.equal(parentAvoidedLanes([
    call("exec_command", "exec-substitution", {
      cmd: "cat /out/x$(cat${IFS}lanes/orchard/request.md)/spec-driven-development/0.2.0/skills/sdd-build/SKILL.md",
    }),
  ]), false);
  assert.equal(parentAvoidedLanes([
    call("exec_command", "exec-backtick", {
      cmd: "cat /out/x`cat lanes/orchard/request.md`/spec-driven-development/0.2.0/skills/sdd-build/SKILL.md",
    }),
  ]), false);
});
