import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { appendRecord, prepareTrail, rewriteTip, sanitizeSessionKey } from "@harness/core/jsonl-trail";

test("prepareTrail and rewriteTip only rewrite the last line", () => {
  const root = mkdtempSync(join(tmpdir(), "jsonl-trail-"));
  const paths = prepareTrail(root, ".audit", sanitizeSessionKey("s1", root), {
    readme: "audit\n",
  });
  assert.equal(readFileSync(join(root, ".audit", ".gitignore"), "utf8"), "*\n");
  appendRecord(paths.sessionPath, { id: 1, status: "done" });
  appendRecord(paths.sessionPath, { id: 2, status: "pending" });
  assert.equal(rewriteTip(paths.sessionPath, (parsed) => {
    return typeof parsed === "object" && parsed !== null && "status" in parsed && parsed.status === "pending";
  }, { id: 2, status: "done" }), "rewritten");
  const lines = readFileSync(paths.sessionPath, "utf8").trim().split("\n");
  assert.equal(lines.length, 2);
  assert.deepEqual(JSON.parse(lines[0] ?? ""), { id: 1, status: "done" });
  assert.deepEqual(JSON.parse(lines[1] ?? ""), { id: 2, status: "done" });
});
