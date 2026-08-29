import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { computeLogoSubjectDigest } from "../../../src/domains/logo/lib/contract.js";
import { issueWriterCapability } from "../../../src/domains/logo/lib/capability.js";
import { loadLogoProject } from "../../../src/domains/logo/lib/project.js";
import { validLogoModel, writeModel } from "./helpers/logo-fixture.js";

const ENTRY = fileURLToPath(new URL("../../../dist/cli/harness.mjs", import.meta.url));

test("registered stage writer validates source closure and atomically advances to release", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "logo-stage-"));
  const project = join(sandbox, "artifacts", "logo", "orbit-logo");
  try {
    await writeModel(project, validLogoModel({ stage: "source" }));
    await issueWriterCapability({ root: project, capability: "logo-stage", argv: [ENTRY, "logo", "stage", project, "release"], subjectDigest: computeLogoSubjectDigest(await loadLogoProject(project)), sessionId: "stage-session" });
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [ENTRY, "logo", "stage", project, "release"], { cwd: sandbox, stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stderr }));
    });
    assert.equal(result.code, 0, result.stderr);
    const plan = JSON.parse(await readFile(join(project, "plan.contract.json"), "utf8"));
    assert.equal(plan.targetStage, "release");
  } finally { rmSync(sandbox, { recursive: true, force: true }); }
});
