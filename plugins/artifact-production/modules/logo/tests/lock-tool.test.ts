import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { computeLogoSubjectDigest } from "../src/lib/contract.js";
import { issueWriterCapability } from "../src/lib/capability.js";
import { loadLogoProject } from "../src/lib/project.js";
import { validLogoModel, writeModel } from "./helpers/logo-fixture.js";

const ENTRY = fileURLToPath(new URL("../dist/cli/project-lock.mjs", import.meta.url));

test("registered lock writer generates package-lock without lifecycle scripts or unrelated project writes", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "logo-lock-"));
  const project = join(sandbox, "artifacts", "logo", "orbit-logo");
  try {
    await writeModel(project, validLogoModel({ stage: "source" }));
    await unlink(join(project, "package-lock.json"));
    const packageJson = JSON.stringify({
      scripts: {
        "logo:render": "node render-fixture.mjs",
        preinstall: "node -e \"require('node:fs').writeFileSync('lifecycle-ran.txt','forged')\"",
      },
    });
    await writeFile(join(project, "package.json"), packageJson);
    await issueWriterCapability({
      root: project,
      capability: "logo-lock",
      argv: [ENTRY, project],
      subjectDigest: computeLogoSubjectDigest(await loadLogoProject(project)),
      sessionId: "lock-session",
    });

    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolvePromise, reject) => {
      const child = spawn(process.execPath, [ENTRY, project], { cwd: sandbox, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /generated package-lock/u);
    assert.equal(await readFile(join(project, "package.json"), "utf8"), packageJson);
    const lock = JSON.parse(await readFile(join(project, "package-lock.json"), "utf8"));
    assert.equal(lock.lockfileVersion, 3);
    assert.equal(typeof lock.packages, "object");
    assert.equal(existsSync(join(project, "lifecycle-ran.txt")), false);
    assert.equal(existsSync(join(project, "node_modules")), false);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
