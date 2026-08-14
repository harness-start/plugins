import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { codexReviewIdentity } from "./codex-review-identity.mjs";

test("Codex review identity derives the exact canonical task name from child session_meta", () => {
  const codexHome = mkdtempSync(join(tmpdir(), "codex-review-identity-"));
  const transcriptPath = join(codexHome, "sessions", "child.jsonl");
  mkdirSync(dirname(transcriptPath), { recursive: true });
  const event = { session_id: "parent", agent_id: "child", cwd: "/workspace", transcript_path: transcriptPath };
  const payload = { id: "child", parent_thread_id: "parent", cwd: "/workspace", thread_source: "subagent", agent_path: "/root/rd_challenge_case", source: { subagent: { thread_spawn: { parent_thread_id: "parent", depth: 1, agent_path: "/root/rd_challenge_case" } } } };
  writeFileSync(transcriptPath, `${JSON.stringify({ type: "session_meta", payload })}\n`);
  const parentEvent = codexReviewIdentity(event, { codexHome });
  const childEvent = codexReviewIdentity({ ...event, session_id: "child" }, { codexHome });
  assert.equal(parentEvent.taskName, "rd_challenge_case");
  assert.equal(parentEvent.parentSessionId, "parent");
  assert.equal(parentEvent.childSessionId, "child");
  assert.deepEqual(childEvent, parentEvent);
});
