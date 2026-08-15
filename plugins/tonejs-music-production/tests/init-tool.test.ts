import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(new URL("../dist/cli/project-init.mjs", import.meta.url));

test("initializes a code-managed mathematical music project without installing when requested", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "tonejs-init-"));
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [ENTRY, "study", "--workspace", workspace, "--skip-install"], { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stderr }));
    });
    const root = join(workspace, "artifacts", "music", "study");
    assert.equal(result.code, 0, result.stderr);
    const project = JSON.parse(await readFile(join(root, "music.project.json"), "utf8"));
    const composition = await readFile(join(root, "src", "composition.mjs"), "utf8");

    assert.equal(project.artifactId, "study");
    assert.match(composition, /tonejs-composition\/v1/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
