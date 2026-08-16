import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { computeLogoSubjectDigest, validateLogoReceipt } from "../src/lib/contract.js";
import { issueWriterCapability } from "../src/lib/capability.js";
import { loadLogoProject } from "../src/lib/project.js";
import { isGeneratedPath, RENDER_FIXTURE_SCRIPT, validLogoModel, writeModel } from "./helpers/logo-fixture.js";

const RENDER_ENTRY = fileURLToPath(new URL("../dist/cli/project-render.mjs", import.meta.url));
const RELEASE_ENTRY = fileURLToPath(new URL("../dist/cli/project-release.mjs", import.meta.url));

function run(entry, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args], options);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("registered render writer creates and validates generated release outputs", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "logo-render-"));
  const project = join(sandbox, "artifacts", "logo", "orbit-logo");
  const generated = join(sandbox, "generated");
  try {
    const model = validLogoModel();
    await writeModel(project, model, { generated: "none" });
    await writeModel(generated, model, { generated: "only" });
    await writeFile(join(project, "render-fixture.mjs"), RENDER_FIXTURE_SCRIPT);
    const pkg = JSON.parse(model.files["package.json"]);
    await writeFile(join(project, "package.json"), JSON.stringify(pkg));
    await mkdir(project, { recursive: true });

    await issueWriterCapability({ root: project, capability: "logo-render", argv: [RENDER_ENTRY, project, "release"], subjectDigest: computeLogoSubjectDigest(await loadLogoProject(project)), sessionId: "render-session" });
    const rendered = await run(RENDER_ENTRY, [project, "release"], { cwd: sandbox, env: { ...process.env, LOGO_FIXTURE_SOURCE: generated }, stdio: ["ignore", "pipe", "pipe"] });
    assert.equal(rendered.code, 0, rendered.stderr);
    assert.match(rendered.stdout, /rendered release/u);
    for (const [path, value] of Object.entries(model.files)) {
      if (!/^(?:evidence\/preview\/|review\.logo\.json$)/u.test(path)) continue;
      const target = join(project, path);
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(target, value);
    }
    await issueWriterCapability({ root: project, capability: "logo-release", argv: [RELEASE_ENTRY, project], subjectDigest: computeLogoSubjectDigest(await loadLogoProject(project)), sessionId: "release-session" });
    const released = await run(RELEASE_ENTRY, [project], { cwd: sandbox, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    assert.equal(released.code, 0, released.stderr);
    assert.equal(validateLogoReceipt(await loadLogoProject(project)), true);
    assert.equal(isGeneratedPath("dist/primary/mark.svg"), true);
  } finally { rmSync(sandbox, { recursive: true, force: true }); }
});

test("render writer restores and rejects downstream review mutation", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "logo-render-boundary-"));
  const project = join(sandbox, "artifacts", "logo", "orbit-logo");
  try {
    const model = validLogoModel({ stage: "source" });
    await writeModel(project, model);
    const original = await readFile(join(project, "review.logo.json"), "utf8");
    await writeFile(join(project, "malicious-render.mjs"), "import { writeFile } from 'node:fs/promises'; await writeFile('review.logo.json', '{}');\n");
    await writeFile(join(project, "package.json"), JSON.stringify({ scripts: { "logo:render": "node malicious-render.mjs" } }));
    const subjectDigest = computeLogoSubjectDigest(await loadLogoProject(project));
    await issueWriterCapability({ root: project, capability: "logo-render", argv: [RENDER_ENTRY, project, "source"], subjectDigest, sessionId: "render-boundary-session" });
    const rendered = await run(RENDER_ENTRY, [project, "source"], { cwd: sandbox, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    assert.equal(rendered.code, 2);
    assert.match(rendered.stderr, /RENDER_DOWNSTREAM_MUTATION:review\.logo\.json/u);
    assert.equal(await readFile(join(project, "review.logo.json"), "utf8"), original);
  } finally { rmSync(sandbox, { recursive: true, force: true }); }
});
