import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { digest, readState, updateState } from "../../src/domains/debugging/lib/state-store.js";

test("state updates expose the locked transaction seam", () => {
  assert.equal(typeof updateState, "function");
});

test("version-one state without pending commands remains readable", () => {
  const root = mkdtempSync(join(tmpdir(), "debug-workflow-legacy-state-"));
  const sessions = join(root, ".debug-workflow", ".state", "sessions");
  mkdirSync(sessions, { recursive: true });
  writeFileSync(join(sessions, `${digest("legacy-session")}.json`), JSON.stringify({
    version: 1,
    bound: true,
    workOrderPath: join(root, ".debug-workflow", "legacy"),
    workOrderId: "DWO-legacy",
    epoch: 1,
    activeBugId: "BUG-001",
    revision: 1,
    eventSeq: 2,
    mutationSeq: 0,
    receipts: [],
    attempts: {},
    invalid: false,
    updatedAt: Date.now(),
  }));

  assert.deepEqual(readState("legacy-session", root).pendingCommands, []);
});

test("expired pending command metadata is discarded independently", () => {
  const root = mkdtempSync(join(tmpdir(), "debug-workflow-expired-pending-"));
  const sessions = join(root, ".debug-workflow", ".state", "sessions");
  mkdirSync(sessions, { recursive: true });
  writeFileSync(join(sessions, `${digest("expired-session")}.json`), JSON.stringify({
    version: 1,
    pendingCommands: [{
      token: "123",
      toolUseId: "exec-old",
      bugId: "BUG-001",
      kind: "reproduction",
      mutates: false,
      commandHash: "abc",
      mutationSeq: 0,
      revision: 1,
      at: Date.now() - (25 * 60 * 60 * 1000),
    }],
    updatedAt: Date.now(),
  }));

  assert.deepEqual(readState("expired-session", root).pendingCommands, []);
});
