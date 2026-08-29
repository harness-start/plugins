import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { issueWriterCapability } from "../../../src/domains/poster/lib/capability.js";
import { computePosterSubjectDigest } from "../../../src/domains/poster/lib/contract.js";
import { sha256, validPosterModel } from "./fixture.js";

const ENTRY = fileURLToPath(new URL("../../../dist/cli/harness.mjs", import.meta.url));

function makeWorkspace() {
  const sandbox = mkdtempSync(join(tmpdir(), "poster-release-workspace-"));
  const root = join(sandbox, "artifacts", "poster", "launch-poster");
  mkdirSync(root, { recursive: true });
  const model = validPosterModel("review");
  for (const [relativePath, content] of Object.entries(model.files ?? {})) {
    const target = join(root, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return { sandbox, root, model };
}

async function authorize(root: string, model = validPosterModel("review")) {
  await issueWriterCapability({
    root,
    capability: "poster-release",
    argv: [ENTRY, "poster", "release", root],
    subjectDigest: computePosterSubjectDigest(model),
    sessionId: "release-session",
    triggerFrom: "test:release",
  });
}

function run(root: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, "poster", "release", root], {
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

test("poster release wrapper binds exact output bytes and clears its journal", async () => {
  const { sandbox, root, model } = makeWorkspace();
  try {
    await authorize(root, model);
    const result = await run(root);

    assert.equal(result.code, 0, result.stderr);
    const receipt = JSON.parse(readFileSync(join(root, "receipt.release.json"), "utf8"));
    assert.equal(receipt.outputs["dist/launch-poster.main.png"], sha256(model.files!["dist/launch-poster.main.png"] as Buffer));
    assert.equal(existsSync(join(root, ".poster-delivery-journal.json")), false);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("poster release refuses to overwrite an active writer journal", async () => {
  const { sandbox, root, model } = makeWorkspace();
  try {
    await authorize(root, model);
    writeFileSync(join(root, ".poster-delivery-journal.json"), "{}\n");
    const result = await run(root);

    assert.equal(result.code, 2);
    assert.match(result.stderr, /EEXIST|journal/u);
    assert.equal(existsSync(join(root, "receipt.release.json")), false);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
