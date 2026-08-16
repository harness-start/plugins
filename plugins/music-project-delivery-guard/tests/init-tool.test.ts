import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { issueMusicWriterCapability } from "../src/lib/capability.js";

const ENTRY = fileURLToPath(new URL("../dist/cli/project-init.mjs", import.meta.url));

test("initializes a code-managed mathematical music project without installing when requested", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "tonejs-init-"));
  try {
    const root = join(workspace, "artifacts", "music", "study");
    const argv = [ENTRY, root, "--skip-install"];
    const subjectDigest = createHash("sha256").update(`music-project-delivery-guard@0.4.0\ninit\0${root}`).digest("hex");
    await issueMusicWriterCapability({ root, capability: "music-init", argv, subjectDigest, sessionId: "init-session", triggerFrom: "test" });
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, argv, { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stderr }));
    });
    assert.equal(result.code, 0, result.stderr);
    const project = JSON.parse(await readFile(join(root, "music.project.json"), "utf8"));
    const brief = JSON.parse(await readFile(join(root, "plan.brief.json"), "utf8"));
    const direction = JSON.parse(await readFile(join(root, "plan.direction.json"), "utf8"));
    const arrangement = JSON.parse(await readFile(join(root, "plan.arrangement.json"), "utf8"));
    const skillComposition = JSON.parse(await readFile(join(root, "plan.skill-composition.json"), "utf8"));
    const composition = await readFile(join(root, "src", "composition.mjs"), "utf8");

    assert.equal(project.artifactId, "study");
    assert.equal(project.schema, "music-project-delivery-guard/project/v1");
    assert.equal(brief.artifactId, "study");
    assert.equal(brief.schema, "music-project-delivery-guard/brief/v2");
    assert.equal(direction.artifactId, "study");
    assert.equal(arrangement.artifactId, "study");
    assert.equal(skillComposition.workers.length, 5);
    assert.match(composition, /tonejs-composition\/v1/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
