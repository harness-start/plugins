import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(
  new URL("../scripts/project-capability-manage.mjs", import.meta.url),
);

function proposal(id, status = "reviewing") {
  return [
    "---",
    `proposal_id: ${id}`,
    "proposal_revision: 1",
    "kind: skill",
    "title: Release review workflow",
    `status: ${status}`,
    "---",
    "",
    "## Evidence",
    "",
    "- repeated release review",
    "",
    "## Reuse scenarios",
    "",
    "- service and library releases",
    "",
    "## Acceptance",
    "",
    "- project skill loads on both hosts",
    "",
    "## Counterexample",
    "",
    "- a one-off note does not qualify",
    "",
  ].join("\n");
}

function runManage(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

test("delete removes one reviewed proposal without leaving a receipt", async () => {
  const root = mkdtempSync(join(tmpdir(), "project-capability-delete-"));
  const reviewing = join(root, ".project-capabilities", "inbox", "reviewing");
  const target = join(reviewing, "pc-release-review.md");
  mkdirSync(reviewing, { recursive: true });
  writeFileSync(target, proposal("pc-release-review"));
  writeFileSync(
    join(root, ".project-capabilities", ".notice-state.json"),
    `${JSON.stringify({ version: 1, notified: { "pc-release-review": 1 } }, null, 2)}\n`,
  );

  try {
    const result = await runManage([
      "delete",
      "--root", root,
      "--proposal", "pc-release-review",
      "--outcome", "rejected",
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(existsSync(target), false);
    assert.equal(existsSync(join(root, ".project-capabilities", "archive")), false);
    assert.equal(existsSync(join(root, ".project-capabilities", "processed.jsonl")), false);
    assert.deepEqual(readdirSync(reviewing), []);
    assert.deepEqual(
      JSON.parse(readFileSync(join(root, ".project-capabilities", ".notice-state.json"), "utf8")),
      { version: 1, notified: {} },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("lifecycle keeps deferred and blocked proposals until they are reopened", async () => {
  const root = mkdtempSync(join(tmpdir(), "project-capability-lifecycle-"));
  const pending = join(root, ".project-capabilities", "inbox", "pending");
  const reviewing = join(root, ".project-capabilities", "inbox", "reviewing");
  const deferred = join(root, ".project-capabilities", "inbox", "deferred");
  mkdirSync(pending, { recursive: true });
  mkdirSync(reviewing, { recursive: true });
  mkdirSync(deferred, { recursive: true });
  writeFileSync(join(pending, "pc-release-review.md"), proposal("pc-release-review", "pending"));

  try {
    const started = await runManage(["start", "--root", root, "--proposal", "pc-release-review"]);
    assert.equal(started.code, 0, started.stderr);
    assert.equal(existsSync(join(pending, "pc-release-review.md")), false);
    assert.match(readFileSync(join(reviewing, "pc-release-review.md"), "utf8"), /status: reviewing/u);

    const blocked = await runManage([
      "block", "--root", root, "--proposal", "pc-release-review", "--reason", "Codex project hook is unavailable",
    ]);
    assert.equal(blocked.code, 0, blocked.stderr);
    assert.match(readFileSync(join(reviewing, "pc-release-review.md"), "utf8"), /blocker: "Codex project hook is unavailable"/u);

    const deferredResult = await runManage([
      "defer", "--root", root, "--proposal", "pc-release-review", "--condition", "Revisit when Codex project hooks load",
    ]);
    assert.equal(deferredResult.code, 0, deferredResult.stderr);
    assert.match(readFileSync(join(deferred, "pc-release-review.md"), "utf8"), /revisit_condition: "Revisit when Codex project hooks load"/u);

    const refusedDelete = await runManage([
      "delete", "--root", root, "--proposal", "pc-release-review", "--outcome", "rejected",
    ]);
    assert.equal(refusedDelete.code, 2);
    assert.equal(existsSync(join(deferred, "pc-release-review.md")), true);

    const reopened = await runManage(["reopen", "--root", root, "--proposal", "pc-release-review"]);
    assert.equal(reopened.code, 0, reopened.stderr);
    assert.match(readFileSync(join(pending, "pc-release-review.md"), "utf8"), /status: pending/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("delete rejects traversal ids and proposal symlinks", async () => {
  const root = mkdtempSync(join(tmpdir(), "project-capability-safety-"));
  const reviewing = join(root, ".project-capabilities", "inbox", "reviewing");
  const outside = join(root, "outside.md");
  mkdirSync(reviewing, { recursive: true });
  writeFileSync(outside, proposal("pc-outside"));
  symlinkSync(outside, join(reviewing, "pc-outside.md"));

  try {
    const traversal = await runManage([
      "delete", "--root", root, "--proposal", "../outside", "--outcome", "accepted",
    ]);
    assert.equal(traversal.code, 2);

    const symlink = await runManage([
      "delete", "--root", root, "--proposal", "pc-outside", "--outcome", "accepted",
    ]);
    assert.equal(symlink.code, 2);
    assert.equal(existsSync(outside), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
