import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { findVideoProjects, loadVideoProject, resolveWorkspaceRoot } from "../scripts/lib/project.mjs";

function write(root, relativePath, content) {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

test("streaming loader hashes binary media without decoding it as project text", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "video-loader-"));
  const root = join(sandbox, "artifacts", "video", "demo");
  const bytes = Buffer.from([0xff, 0xfe, 0x00, 0x01, 0x80]);
  try {
    write(root, "dist/demo.mp4", bytes);
    write(root, "plan.contract.json", "{}\n");

    const model = await loadVideoProject(root);

    assert.equal(model.files["dist/demo.mp4"], null);
    assert.equal(model.digests["dist/demo.mp4"], createHash("sha256").update(bytes).digest("hex"));
    assert.equal(resolveWorkspaceRoot(root), sandbox);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("project discovery fails closed instead of truncating project count", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "video-project-count-"));
  try {
    for (let index = 0; index < 33; index += 1) mkdirSync(join(sandbox, "artifacts", "video", `video-${String(index).padStart(2, "0")}`), { recursive: true });

    await assert.rejects(findVideoProjects(sandbox), /PROJECT_COUNT_LIMIT_EXCEEDED/u);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
