import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { issueWriterCapability } from "../src/lib/capability.js";
import { computePptxSubjectDigest, loadPptxProject } from "../src/lib/contract.js";
import { releaseModel, sha256, writeModel } from "./fixture.js";

const ENTRY = fileURLToPath(new URL("../dist/cli/project-release.mjs", import.meta.url));

function run(root: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, root], {
      env: { ...process.env, AI_EXPERTS_SESSION_ID: "release-session", AI_EXPERTS_TRIGGER_FROM: "test:release" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("release wrapper consumes a one-time grant and writes a source-and-output-bound receipt", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "pptx-release-"));
  const root = join(workspace, "artifacts", "pptx", "deck");
  try {
    execFileSync("git", ["init", "-q"], { cwd: workspace });
    mkdirSync(root, { recursive: true });
    writeModel(root, releaseModel());
    const model = await loadPptxProject(root);
    await issueWriterCapability({ root, capability: "pptx-release", argv: [ENTRY, root], subjectDigest: computePptxSubjectDigest(model), sessionId: "release-session", triggerFrom: "test:release" });

    const result = await run(root);

    assert.equal(result.code, 0, result.stderr);
    const receipt = JSON.parse(readFileSync(join(root, "receipt.release.json"), "utf8"));
    assert.equal(receipt.plugin, "presentation-production");
    assert.equal(receipt.artifactId, "deck");
    assert.match(receipt.subjectDigest, /^[a-f0-9]{64}$/u);
    assert.equal(receipt.outputs["dist/deck.pptx"], sha256(readFileSync(join(root, "dist/deck.pptx"))));
    assert.equal(existsSync(join(root, ".pptx-delivery-journal.json")), false);
    assert.equal(existsSync(join(root, ".tmp/pptx-guard/capability.pptx-release.json")), false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("release wrapper fails closed without a one-time grant", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "pptx-release-no-cap-"));
  const root = join(workspace, "artifacts", "pptx", "deck");
  try {
    execFileSync("git", ["init", "-q"], { cwd: workspace });
    mkdirSync(root, { recursive: true });
    writeModel(root, releaseModel());
    const result = await run(root);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /WRITER_CAPABILITY_MISSING/u);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
