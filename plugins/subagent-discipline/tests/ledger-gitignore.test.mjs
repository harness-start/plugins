import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  utimesSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import {
  cleanupOlderThan,
  readSpawnRecord,
  writeReturnRecord,
  writeSpawnRecord,
  ledgerRoot,
} from "../scripts/lib/ledger.mjs";
import { ensureIgnorePattern } from "../scripts/lib/gitignore.mjs";
import { GITIGNORE_PATTERN } from "../scripts/lib/policy.mjs";

function tempGitRepo() {
  const root = mkdtempSync(join(tmpdir(), "sd-git-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  return root;
}

test("spawn write and read", () => {
  const root = mkdtempSync(join(tmpdir(), "sd-ledger-"));
  const path = writeSpawnRecord(root, "agent-1", { v: 1, agentId: "agent-1" });
  assert.ok(path);
  assert.equal(readSpawnRecord(root, "agent-1").agentId, "agent-1");
});

test("cleanup deletes old files keeps new", () => {
  const root = mkdtempSync(join(tmpdir(), "sd-clean-"));
  writeSpawnRecord(root, "old-agent", { v: 1, agentId: "old-agent" });
  writeSpawnRecord(root, "new-agent", { v: 1, agentId: "new-agent" });
  const oldPath = join(ledgerRoot(root), "spawns", "old-agent.json");
  const past = (Date.now() - 48 * 3600 * 1000) / 1000;
  utimesSync(oldPath, past, past);

  const deleted = cleanupOlderThan(root, 24 * 3600 * 1000);
  assert.ok(deleted >= 1);
  assert.equal(readSpawnRecord(root, "old-agent"), null);
  assert.ok(readSpawnRecord(root, "new-agent"));
});

test("writeReturnRecord creates unique file", () => {
  const root = mkdtempSync(join(tmpdir(), "sd-ret-"));
  const p = writeReturnRecord(root, "a1", {
    v: 1,
    agentId: "a1",
    at: "2026-08-07T00:00:00.000Z",
  });
  assert.ok(existsSync(p));
});

test("ensureIgnorePattern creates and is idempotent", () => {
  const root = tempGitRepo();
  const r1 = ensureIgnorePattern(root);
  assert.equal(r1.action, "created");
  const body = readFileSync(join(root, ".gitignore"), "utf8");
  assert.match(body, /\.subagent-discipline\//);

  const r2 = ensureIgnorePattern(root);
  assert.equal(r2.action, "present");

  writeFileSync(join(root, ".gitignore"), "node_modules/\n", "utf8");
  const r3 = ensureIgnorePattern(root);
  assert.equal(r3.action, "appended");
  assert.match(
    readFileSync(join(root, ".gitignore"), "utf8"),
    new RegExp(GITIGNORE_PATTERN.replace("/", "\\/")),
  );
});

test("ensureIgnorePattern skips without gitRoot", () => {
  assert.equal(ensureIgnorePattern(null).action, "skipped");
});
