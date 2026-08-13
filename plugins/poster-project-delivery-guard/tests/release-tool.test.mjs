import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { computePosterSubjectDigest } from "../scripts/lib/contract.mjs";

const ENTRY = fileURLToPath(new URL("../scripts/tools/project-release.mjs", import.meta.url));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const MINIMAL_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da636000000200018ffd09d40000000049454e44ae426082",
  "hex",
);
const MINIMAL_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1 1\"></svg>";

function writeFixture(root) {
  const layer = "export function buildLayer(){return <div style={{display:'flex'}}>Poster</div>;}\n";
  const layerDigest = sha256(layer);
  const sourceFiles = {
    ".gitignore": "node_modules/\n.cache/\n.tmp/\n",
    "package.json": "{}\n",
    "package-lock.json": "{}\n",
    "plan.contract.json": JSON.stringify({ artifactId: "poster", targetStage: "release" }),
    "plan.assets.json": "{}\n",
    "poster.project.json": JSON.stringify({ artifactId: "poster" }),
    "src/render.ts": "export const render = () => {};\n",
    "src/compose.ts": "export const compose = () => {};\n",
    "src/theme.ts": "export const theme = {};\n",
    "src/variants/manifest.json": JSON.stringify({ variants: [{ index: 1, id: "main", directory: "001-main" }] }),
    "src/variants/001-main/variant.json": JSON.stringify({ id: "main", width: 1200, height: 1600 }),
    "src/variants/001-main/layers/manifest.json": JSON.stringify({ layers: [{ index: 1, role: "background", source: "001-background-base.tsx" }] }),
    "src/variants/001-main/layers/001-background-base.tsx": layer,
  };
  const subjectDigest = computePosterSubjectDigest({ artifactId: "poster", files: sourceFiles });
  const files = {
    ...sourceFiles,
    [`src/variants/001-main/layers/001-background-base.${layerDigest}.svg`]: MINIMAL_SVG,
    [`src/variants/001-main/layers/001-background-base.${layerDigest}.png`]: MINIMAL_PNG,
    "dist/poster.main.png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0x00]),
    "evidence.accessibility.json": `${JSON.stringify({
      schema: "poster-project-delivery-guard/accessibility/v1",
      artifactId: "poster",
      subjectDigest,
      tool: "axe-core",
      verdict: "pass",
      checks: [{ id: "contrast", status: "pass" }],
    })}\n`,
    "review.poster.json": `${JSON.stringify({
      schema: "poster-project-delivery-guard/review/v1",
      verdict: "pass",
      reviewer: { kind: "independent-agent", id: "reviewer-1", sessionId: "poster-review-session" },
      subjectDigest,
    })}\n`,
    "release.manifest.json": `${JSON.stringify({
      schema: "poster-project-delivery-guard/release-manifest/v1",
      artifactId: "poster",
      subjectDigest,
      variants: [{ id: "main", output: "dist/poster.main.png" }],
    })}\n`,
  };
  for (const [relativePath, content] of Object.entries(files)) {
    const target = join(root, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

function run(root) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, root], {
      env: { ...process.env, AI_EXPERTS_SESSION_ID: "test", AI_EXPERTS_TRIGGER_FROM: "test:release" },
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

test("poster release wrapper binds raw output bytes and clears its journal", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "poster-release-"));
  const root = join(sandbox, "poster");
  try {
    mkdirSync(root);
    writeFixture(root);
    const result = await run(root);

    assert.equal(result.code, 0, result.stderr);
    const receipt = JSON.parse(readFileSync(join(root, "receipt.release.json"), "utf8"));
    assert.equal(receipt.outputs["dist/poster.main.png"], sha256(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0x00])));
    assert.equal(existsSync(join(root, ".poster-delivery-journal.json")), false);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("poster release refuses to overwrite an active writer journal", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "poster-release-"));
  const root = join(sandbox, "poster");
  try {
    mkdirSync(root);
    writeFixture(root);
    writeFileSync(join(root, ".poster-delivery-journal.json"), "{}\n");
    const result = await run(root);

    assert.equal(result.code, 2);
    assert.match(result.stderr, /EEXIST|journal/u);
    assert.equal(existsSync(join(root, "receipt.release.json")), false);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
