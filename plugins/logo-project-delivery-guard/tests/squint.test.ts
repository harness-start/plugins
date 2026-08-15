import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { decodePngToRgba } from "../src/lib/png-decode.js";
import { renderPreviewStrip } from "../src/lib/preview-strip.js";
import { analyzeSquintCell, buildSquintEvidence } from "../src/lib/squint.js";

const PREVIEW_ENTRY = fileURLToPath(new URL("../dist/cli/project-preview.mjs", import.meta.url));

async function makeStripFixture() {
  const dir = await mkdtemp(join(tmpdir(), "logo-squint-"));
  const svgPath = join(dir, "mark.svg");
  const pngPath = join(dir, "strip.png");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="#111"/><path d="M10 54 H54" stroke="#111" stroke-width="4"/></svg>\n`;
  await writeFile(svgPath, svg);
  const rendered = await renderPreviewStrip(
    { svgSource: svg, outputPath: pngPath },
  );
  const buf = await readFile(pngPath);
  const manifest = { samples: rendered.samples };
  return { buf, manifest };
}

test("decodePngToRgba reads the bundled preview-strip output", async () => {
  const fixture = await makeStripFixture();
  const { width, height, rgba } = decodePngToRgba(fixture.buf);
  assert.equal(width, 192);
  assert.equal(height, 192);
  assert.equal(rgba.length, width * height * 4);
});

test("buildSquintEvidence binds real bboxes and can fail empty cells", async () => {
  const fixture = await makeStripFixture();
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

test("project preview runs with an isolated HOME and no external Skill tool", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "logo-preview-self-contained-"));
  const project = join(sandbox, "artifacts", "logo", "orbit");
  const isolatedHome = join(sandbox, "home");
  try {
    await mkdir(join(project, "build", "master"), { recursive: true });
    await mkdir(isolatedHome, { recursive: true });
    await writeFile(
      join(project, "build", "master", "mark.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="20" fill="#111"/></svg>\n',
    );
    const result = spawnSync(process.execPath, [PREVIEW_ENTRY, project], {
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: isolatedHome,
        LOGO_PREVIEW_STRIP_TOOL: join(isolatedHome, "missing-logo-preview-strip.mjs"),
      },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.equal(output.sampleCount, 6);
    await readFile(join(project, output.stripPath));
    await readFile(join(project, output.manifestPath));
    await readFile(join(project, output.squintPath));
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("distributed preview sources do not name undeclared logo Skill dependencies", async () => {
  const sources = await Promise.all([
    new URL("../README.md", import.meta.url),
    new URL("../dist/cli/project-preview.mjs", import.meta.url),
  ].map((url) => readFile(url, "utf8")));
  assert.doesNotMatch(sources.join("\n"), /logo-design|logo-audit|lettering-design|visual-evidence|\/srv\/workspaces\//u);
});

test("bundled preview fails closed when its declared renderer is unavailable", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "logo-preview-renderer-missing-"));
  try {
    await assert.rejects(
      renderPreviewStrip({
        svgSource: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>',
        outputPath: join(sandbox, "strip.png"),
        renderer: join(sandbox, "missing-ffmpeg"),
      }),
      /FFmpeg with SVG input support is required/u,
    );
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});
