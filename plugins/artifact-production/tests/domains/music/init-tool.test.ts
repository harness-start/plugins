import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { issueMusicWriterCapability } from "../../../src/domains/music/lib/capability.js";

const ENTRY = fileURLToPath(new URL("../../../dist/cli/harness.mjs", import.meta.url));

test("initializes a code-managed mathematical music project without installing when requested", async () => {
  const workspace = await realpath(await mkdtemp(join(tmpdir(), "tonejs-init-")));
  try {
    const root = join(workspace, "artifacts", "music", "study");
    const argv = [ENTRY, "music", "init", root, "--skip-install"];
    const subjectDigest = createHash("sha256").update(`music-production@0.4.0\ninit\0${root}`).digest("hex");
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
    const compositionPath = join(root, "src", "composition.mjs");

    assert.equal(project.artifactId, "study");
    assert.equal(project.schema, "music-production/project/v1");
    assert.equal(brief.artifactId, "study");
    assert.equal(brief.schema, "music-production/brief/v2");
    assert.equal(direction.artifactId, "study");
    assert.equal(arrangement.artifactId, "study");
    assert.equal(skillComposition.workers.length, 4);
    const syntax = spawnSync(process.execPath, ["--check", compositionPath], { encoding: "utf8" });
    assert.equal(syntax.status, 0, syntax.stderr);
    const module = await import(`${pathToFileURL(compositionPath).href}?test=${Date.now()}`);
    assert.equal(typeof module.default, "object");
    assert.equal(module.default.schema, "tonejs-composition/v1");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
