import assert from "node:assert/strict";
import { test } from "node:test";
import { isUsableAgentId, readAgentId } from "../scripts/lib/agent-id.mjs";

test("readAgentId accepts snake_case and camelCase", () => {
  assert.equal(readAgentId({ agent_id: "agent-abc" }), "agent-abc");
  assert.equal(readAgentId({ agentId: "a2e6cbc3" }), "a2e6cbc3");
});

test("readAgentId rejects missing empty path traversal and long ids", () => {
  assert.equal(readAgentId({}), null);
  assert.equal(readAgentId({ agent_id: "  " }), null);
  assert.equal(readAgentId({ agent_id: "../x" }), null);
  assert.equal(readAgentId({ agent_id: "a/b" }), null);
  assert.equal(readAgentId({ agent_id: "a\nb" }), null);
  assert.equal(readAgentId({ agent_id: "x".repeat(200) }), null);
});

test("isUsableAgentId mirrors readAgentId", () => {
  assert.equal(isUsableAgentId("ok-id"), true);
  assert.equal(isUsableAgentId(""), false);
});
