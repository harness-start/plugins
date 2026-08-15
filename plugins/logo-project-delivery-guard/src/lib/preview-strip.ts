import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const SIZES = Object.freeze([16, 32, 64]);
const ROWS = Object.freeze([
  { id: "black", color: "#000000", background: "#ffffff" },
  { id: "reverse", color: "#ffffff", background: "#10161f" },
]);
const PADDING = 16;
const GAP = 24;
const RENDER_TIMEOUT_MS = 30_000;

function parseSvgSource(source: string): { body: string; viewBox: string } {
  const svg = source.trim();
  const match = svg.match(/^<svg\b([^>]*)>([\s\S]*)<\/svg>$/iu);
  if (!match) throw new Error("preview input must be an SVG document");
  if (/<(?:script|foreignObject|image|iframe|use|filter)[\s>]/iu.test(svg) || /\bon[a-z]+\s*=/iu.test(svg)) {
    throw new Error("preview input contains unsupported or executable SVG content");
  }
  if (/\b(?:href|src)\s*=/iu.test(svg) || /\burl\s*\(/iu.test(svg)) {
    throw new Error("preview input contains a resource reference");
  }
  const viewBox = match[1]?.match(/\bviewBox\s*=\s*["']([^"']+)["']/u)?.[1];
  if (!viewBox || viewBox.trim().split(/[\s,]+/u).length !== 4) {
    throw new Error("preview input requires a four-number viewBox");
  }
  return { body: match[2] ?? "", viewBox };
}

type PreviewSample = { id: string; row: string; size: number; locator: { bbox: [number, number, number, number]; region: string } };
type PreviewGeometry = { width: number; height: number; rowHeight: number; samples: PreviewSample[] };

function previewGeometry(): PreviewGeometry {
  const maxSize = Math.max(...SIZES);
  const rowHeight = maxSize + PADDING * 2;
  const width = SIZES.reduce((sum, size) => sum + size, 0) + GAP * (SIZES.length - 1) + PADDING * 2;
  const height = rowHeight * ROWS.length;
  const samples: PreviewSample[] = [];
  for (const [rowIndex, row] of ROWS.entries()) {
    let x = PADDING;
    for (const size of SIZES) {
      const y = rowIndex * rowHeight + PADDING + Math.floor((maxSize - size) / 2);
      samples.push({
        id: `${row.id}-${size}`,
        row: row.id,
        size,
        locator: { bbox: [x, y, size, size], region: `${row.id} ${size}px` },
      });
      x += size + GAP;
    }
  }
  return { width, height, rowHeight, samples };
}

function buildStripSvg(source: string, geometry: PreviewGeometry): string {
  const parsed = parseSvgSource(source);
  const backgrounds = ROWS.map((row, index) => (
    `<rect x="0" y="${index * geometry.rowHeight}" width="${geometry.width}" height="${geometry.rowHeight}" fill="${row.background}"/>`
  )).join("");
  const cells = geometry.samples.map((sample) => {
    const [x, y, width, height] = sample.locator.bbox;
    return `<svg class="${sample.row}" x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${parsed.viewBox}">${parsed.body}</svg>`;
  }).join("");
  const styles = ROWS.map((row) => `.${row.id} *{fill:${row.color}!important}.${row.id} [stroke]{stroke:${row.color}!important}`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${geometry.width}" height="${geometry.height}" viewBox="0 0 ${geometry.width} ${geometry.height}"><style>${styles}[fill="none"]{fill:none!important}[stroke="none"]{stroke:none!important}</style>${backgrounds}${cells}</svg>`;
}

function rendererCandidates(explicit: string | undefined): string[] {
  return explicit ? [explicit] : ["ffmpeg"];
}

function findRenderer(explicit: string | undefined): string {
  for (const candidate of rendererCandidates(explicit)) {
    const probe = spawnSync(candidate, ["-version"], {
      encoding: "utf8",
      timeout: 5_000,
      windowsHide: true,
    });
    if (probe.status === 0) return candidate;
    const probeError = probe.error;
    if (explicit && probeError && "code" in probeError && probeError.code !== "ENOENT") {
      throw new Error(`preview renderer probe failed: ${probe.stderr || probeError.message || candidate}`);
    }
  }
  throw new Error("FFmpeg with SVG input support is required (set LOGO_PREVIEW_RENDERER or install ffmpeg in PATH)");
}

export async function renderPreviewStrip({
  svgSource,
  outputPath,
  renderer = process.env.LOGO_PREVIEW_RENDERER,
}: {
  svgSource: string;
  outputPath: string;
  renderer?: string | undefined;
}): Promise<PreviewGeometry & { renderer: string }> {
  const geometry = previewGeometry();
  const rendererCommand = findRenderer(renderer);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "logo-preview-strip-"));
  const svgPath = join(temporaryRoot, "strip.svg");
  const absoluteOutput = resolve(outputPath);
  try {
    await writeFile(svgPath, buildStripSvg(svgSource, geometry));
    const result = spawnSync(rendererCommand, [
      "-hide_banner",
      "-loglevel", "error",
      "-y",
      "-i", svgPath,
      "-frames:v", "1",
      absoluteOutput,
    ], {
      encoding: "utf8",
      timeout: RENDER_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    if (result.status !== 0) {
      throw new Error(`FFmpeg preview failed: ${result.stderr || result.error?.message || `exit ${result.status}`}`);
    }
    const png = await readFile(absoluteOutput);
    if (!png.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
      throw new Error(`FFmpeg did not create a PNG: ${basename(absoluteOutput)}`);
    }
    return { ...geometry, renderer: basename(rendererCommand) };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
