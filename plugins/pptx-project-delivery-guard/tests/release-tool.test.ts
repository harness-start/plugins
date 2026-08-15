import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(new URL("../dist/cli/project-release.mjs", import.meta.url));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function fixtureFiles() {
  const slide = "export function renderSlide(slide, ctx) { slide.addText(ctx.copy.title); }\n";
  const digest = sha256(slide);
  return {
    ".gitignore": "node_modules/\n.cache/\n.tmp/\n",
    "package.json": "{}\n",
    "package-lock.json": "{}\n",
    "plan.contract.json": JSON.stringify({ artifactId: "deck", targetStage: "release" }),
    "plan.storyboard.json": "{}\n",
    "pptx.project.json": JSON.stringify({ artifactId: "deck", entry: "src/deck.ts", slideManifest: "src/slides/manifest.json" }),
    "src/deck.ts": "const deck = new pptxgen();\ndeck.addSlide();\n",
    "src/theme.ts": "export const theme = {};\n",
    "src/slides/manifest.json": JSON.stringify({ slides: [{ index: 1, id: "opening", source: "001-opening.ts" }] }),
    "src/slides/001-opening.ts": slide,
    [`src/slides/001-opening.${digest}.png`]: "PNG",
    "dist/deck.pptx": "PPTX",
    "dist/deck.pdf": "PDF",
    "dist/pages/001.png": "PNG",
    "evidence.structure.json": "{}\n",
    "evidence.accessibility.json": "{}\n",
    "review.pptx.json": `${JSON.stringify({ schema: "pptx-project-delivery-guard/review/v1", verdict: "pass", reviewer: { kind: "independent-agent", id: "reviewer-1", sessionId: "pptx-review-session" } })}\n`,
    "release.manifest.json": "{}\n",
  };
}

function writeFixture(root) {
  for (const [relativePath, content] of Object.entries(fixtureFiles())) {
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

test("release wrapper writes a source-and-output-bound receipt atomically", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "pptx-release-"));
  const root = join(sandbox, "deck");
  try {
    mkdirSync(root);
    writeFixture(root);

    const result = await run(root);

    assert.equal(result.code, 0, result.stderr);
    const receipt = JSON.parse(readFileSync(join(root, "receipt.release.json"), "utf8"));
    assert.equal(receipt.plugin, "pptx-project-delivery-guard");
    assert.equal(receipt.artifactId, "deck");
    assert.match(receipt.subjectDigest, /^[a-f0-9]{64}$/u);
    assert.equal(receipt.outputs["dist/deck.pptx"], sha256("PPTX"));
    assert.equal(existsSync(join(root, ".pptx-delivery-journal.json")), false);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
