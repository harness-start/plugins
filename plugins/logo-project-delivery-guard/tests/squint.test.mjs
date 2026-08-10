import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { homedir } from "node:os";
import { access } from "node:fs/promises";

import { decodePngToRgba } from "../scripts/lib/png-decode.mjs";
import { analyzeSquintCell, buildSquintEvidence } from "../scripts/lib/squint.mjs";

async function resolveStripTool() {
  const candidates = [
    process.env.LOGO_PREVIEW_STRIP_TOOL,
    join(homedir(), ".agents/skills/logo-design/scripts/logo-preview-strip.mjs"),
    "/srv/workspaces/.agents/skills/logo-design/scripts/logo-preview-strip.mjs",
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      await access(c);
      return c;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function makeStripFixture() {
  const tool = await resolveStripTool();
  if (!tool) return null;
  const dir = await mkdtemp(join(tmpdir(), "logo-squint-"));
  const svgPath = join(dir, "mark.svg");
  const pngPath = join(dir, "strip.png");
  const manifestPath = join(dir, "strip.manifest.json");
  await writeFile(
    svgPath,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="#111"/><path d="M10 54 H54" stroke="#111" stroke-width="4"/></svg>\n`,
  );
  const env = {
    ...process.env,
    AI_EXPERTS_SESSION_ID: process.env.AI_EXPERTS_SESSION_ID ?? "squint-test",
    AI_EXPERTS_TRIGGER_FROM: process.env.AI_EXPERTS_TRIGGER_FROM ?? "squint-test",
  };
  const result = spawnSync(
    process.execPath,
    [tool, svgPath, pngPath, "--sizes", "16,32,64", "--manifest", manifestPath, "--overwrite"],
    { env, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`logo-preview-strip failed: ${result.stderr || result.stdout}`);
  }
  const buf = await readFile(pngPath);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  return { buf, manifest };
}

test("decodePngToRgba reads logo-preview-strip output", async (t) => {
  const fixture = await makeStripFixture();
  if (!fixture) {
    t.skip("logo-preview-strip tool not available");
    return;
  }
  const { width, height, rgba } = decodePngToRgba(fixture.buf);
  assert.ok(width > 0 && height > 0);
  assert.equal(rgba.length, width * height * 4);
});

test("buildSquintEvidence binds real bboxes and can fail empty cells", async (t) => {
  const fixture = await makeStripFixture();
  if (!fixture) {
    t.skip("logo-preview-strip tool not available");
    return;
  }
  const { width, height, rgba } = decodePngToRgba(fixture.buf);
  const samples = (fixture.manifest.samples ?? []).filter((s) =>
    ["black", "mono", "reverse"].includes(s.row) && [16, 32, 64].includes(Number(s.size)),
  );
  assert.ok(samples.length >= 6, "expected black/mono+reverse samples at 16/32/64");
  const ev = buildSquintEvidence({
    rgba,
    width,
    height,
    samples,
    masterDigest: "abc",
    stripDigest: "def",
  });
  assert.equal(ev.method, "box-blur-threshold-connected-components");
  assert.equal(ev.cells.length, samples.length);
  assert.ok(ev.cells.every((c) => Array.isArray(c.bbox) && c.bbox.length === 4));
  assert.ok(typeof ev.cells[0].primaryShare === "number");
  // empty corner cell should fail silhouette
  const empty = analyzeSquintCell(rgba, width, height, [0, 0, 8, 8]);
  assert.equal(empty.silhouetteIntact, false);
});
