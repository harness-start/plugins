#!/usr/bin/env node
// harness-source-hash: sha256:fd95f1c50268b3bb0a6c3356df28e0a91064bac9751f5f2c76a44cae30c46690
import {
  masterSubjectDigest
} from "../chunks/chunk-4AGBB5MK.mjs";

// plugins/logo-project-delivery-guard/src/entries/cli/project-preview.ts
import { createHash } from "node:crypto";
import { access, mkdir, readFile as readFile2, writeFile as writeFile2 } from "node:fs/promises";
import { basename as basename2, join as join2, resolve as resolve2 } from "node:path";

// plugins/logo-project-delivery-guard/src/lib/png-decode.ts
import { inflateSync } from "node:zlib";
var PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function decodePngToRgba(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) {
    throw new Error("PNG_SIGNATURE_INVALID");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idats = [];
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    offset += 4;
    const type = buf.toString("ascii", offset, offset + 4);
    offset += 4;
    const data = buf.subarray(offset, offset + length);
    offset += length + 4;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idats.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  if (!(width > 0) || !(height > 0) || bitDepth !== 8) {
    throw new Error(`PNG_UNSUPPORTED:${width}x${height} depth=${bitDepth}`);
  }
  if (![2, 6].includes(colorType)) {
    throw new Error(`PNG_COLOR_TYPE_UNSUPPORTED:${colorType}`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idats));
  const stride = 1 + width * bpp;
  if (raw.length !== height * stride) {
    throw new Error(`PNG_RAW_SIZE_MISMATCH:${raw.length}!=${height * stride}`);
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  const prev = new Uint8Array(width * bpp);
  const curr = new Uint8Array(width * bpp);
  for (let y = 0; y < height; y += 1) {
    const row = raw.subarray(y * stride, (y + 1) * stride);
    const filter = row[0];
    const slice = row.subarray(1);
    for (let i = 0; i < slice.length; i += 1) {
      const left = i >= bpp ? curr[i - bpp] : 0;
      const up = prev[i];
      const upLeft = i >= bpp ? prev[i - bpp] : 0;
      let val = slice[i];
      if (filter === 1) val = val + left & 255;
      else if (filter === 2) val = val + up & 255;
      else if (filter === 3) val = val + Math.floor((left + up) / 2) & 255;
      else if (filter === 4) val = val + paeth(left, up, upLeft) & 255;
      else if (filter !== 0) throw new Error(`PNG_FILTER_UNSUPPORTED:${filter}`);
      curr[i] = val;
    }
    for (let x = 0; x < width; x += 1) {
      const si = x * bpp;
      const di = (y * width + x) * 4;
      rgba[di] = curr[si];
      rgba[di + 1] = curr[si + 1];
      rgba[di + 2] = curr[si + 2];
      rgba[di + 3] = bpp === 4 ? curr[si + 3] : 255;
    }
    prev.set(curr);
  }
  return { width, height, rgba };
}
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// plugins/logo-project-delivery-guard/src/lib/preview-strip.ts
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
var SIZES = Object.freeze([16, 32, 64]);
var ROWS = Object.freeze([
  { id: "black", color: "#000000", background: "#ffffff" },
  { id: "reverse", color: "#ffffff", background: "#10161f" }
]);
var PADDING = 16;
var GAP = 24;
var RENDER_TIMEOUT_MS = 3e4;
function parseSvgSource(source) {
  const svg = source.trim();
  const match = svg.match(/^<svg\b([^>]*)>([\s\S]*)<\/svg>$/iu);
  if (!match) throw new Error("preview input must be an SVG document");
  if (/<(?:script|foreignObject|image|iframe|use|filter)[\s>]/iu.test(svg) || /\bon[a-z]+\s*=/iu.test(svg)) {
    throw new Error("preview input contains unsupported or executable SVG content");
  }
  if (/\b(?:href|src)\s*=/iu.test(svg) || /\burl\s*\(/iu.test(svg)) {
    throw new Error("preview input contains a resource reference");
  }
  const viewBox = match[1].match(/\bviewBox\s*=\s*["']([^"']+)["']/u)?.[1];
  if (!viewBox || viewBox.trim().split(/[\s,]+/u).length !== 4) {
    throw new Error("preview input requires a four-number viewBox");
  }
  return { body: match[2], viewBox };
}
function previewGeometry() {
  const maxSize = Math.max(...SIZES);
  const rowHeight = maxSize + PADDING * 2;
  const width = SIZES.reduce((sum, size) => sum + size, 0) + GAP * (SIZES.length - 1) + PADDING * 2;
  const height = rowHeight * ROWS.length;
  const samples = [];
  for (const [rowIndex, row] of ROWS.entries()) {
    let x = PADDING;
    for (const size of SIZES) {
      const y = rowIndex * rowHeight + PADDING + Math.floor((maxSize - size) / 2);
      samples.push({
        id: `${row.id}-${size}`,
        row: row.id,
        size,
        locator: { bbox: [x, y, size, size], region: `${row.id} ${size}px` }
      });
      x += size + GAP;
    }
  }
  return { width, height, rowHeight, samples };
}
function buildStripSvg(source, geometry) {
  const parsed = parseSvgSource(source);
  const backgrounds = ROWS.map((row, index) => `<rect x="0" y="${index * geometry.rowHeight}" width="${geometry.width}" height="${geometry.rowHeight}" fill="${row.background}"/>`).join("");
  const cells = geometry.samples.map((sample) => {
    const [x, y, width, height] = sample.locator.bbox;
    return `<svg class="${sample.row}" x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${parsed.viewBox}">${parsed.body}</svg>`;
  }).join("");
  const styles = ROWS.map((row) => `.${row.id} *{fill:${row.color}!important}.${row.id} [stroke]{stroke:${row.color}!important}`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${geometry.width}" height="${geometry.height}" viewBox="0 0 ${geometry.width} ${geometry.height}"><style>${styles}[fill="none"]{fill:none!important}[stroke="none"]{stroke:none!important}</style>${backgrounds}${cells}</svg>`;
}
function rendererCandidates(explicit) {
  return explicit ? [explicit] : ["ffmpeg"];
}
function findRenderer(explicit) {
  for (const candidate of rendererCandidates(explicit)) {
    const probe = spawnSync(candidate, ["-version"], {
      encoding: "utf8",
      timeout: 5e3,
      windowsHide: true
    });
    if (probe.status === 0) return candidate;
    if (explicit && probe.error?.code !== "ENOENT") {
      throw new Error(`preview renderer probe failed: ${probe.stderr || probe.error?.message || candidate}`);
    }
  }
  throw new Error("FFmpeg with SVG input support is required (set LOGO_PREVIEW_RENDERER or install ffmpeg in PATH)");
}
async function renderPreviewStrip({ svgSource, outputPath, renderer = process.env.LOGO_PREVIEW_RENDERER }) {
  const geometry = previewGeometry();
  const rendererCommand = findRenderer(renderer);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "logo-preview-strip-"));
  const svgPath = join(temporaryRoot, "strip.svg");
  const absoluteOutput = resolve(outputPath);
  try {
    await writeFile(svgPath, buildStripSvg(svgSource, geometry));
    const result = spawnSync(rendererCommand, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      svgPath,
      "-frames:v",
      "1",
      absoluteOutput
    ], {
      encoding: "utf8",
      timeout: RENDER_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 1024 * 1024
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

// plugins/logo-project-delivery-guard/src/lib/squint.ts
function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function extractCell(rgba, width, height, bbox) {
  const [x0, y0, w, h] = bbox;
  if (w <= 0 || h <= 0 || x0 < 0 || y0 < 0 || x0 + w > width || y0 + h > height) {
    throw new Error(`SQUINT_BBOX_OOB:${bbox.join(",")}`);
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = ((y0 + y) * width + (x0 + x)) * 4;
      const a = rgba[i + 3] / 255;
      const lum = luminance(rgba[i], rgba[i + 1], rgba[i + 2]);
      const bg = 128;
      out[y * w + x] = lum * a + bg * (1 - a);
    }
  }
  return { w, h, lum: out };
}
function boxBlur(lum, w, h, radius = 2) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const r = Math.max(1, radius);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      let n = 0;
      for (let k = -r; k <= r; k += 1) {
        const xx = x + k;
        if (xx < 0 || xx >= w) continue;
        sum += lum[y * w + xx];
        n += 1;
      }
      tmp[y * w + x] = sum / n;
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      let n = 0;
      for (let k = -r; k <= r; k += 1) {
        const yy = y + k;
        if (yy < 0 || yy >= h) continue;
        sum += tmp[yy * w + x];
        n += 1;
      }
      out[y * w + x] = sum / n;
    }
  }
  return out;
}
function thresholdMask(lum, w, h) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < lum.length; i += 1) {
    if (lum[i] < min) min = lum[i];
    if (lum[i] > max) max = lum[i];
  }
  const mid = (min + max) / 2;
  const mask = new Uint8Array(w * h);
  let darkCount = 0;
  for (let i = 0; i < lum.length; i += 1) {
    if (lum[i] < mid) darkCount += 1;
  }
  const inkIsDark = darkCount <= lum.length / 2;
  for (let i = 0; i < lum.length; i += 1) {
    const isDark = lum[i] < mid;
    mask[i] = (inkIsDark ? isDark : !isDark) ? 1 : 0;
  }
  return mask;
}
function connectedComponents(mask, w, h) {
  const seen = new Uint8Array(mask.length);
  const components = [];
  const stack = [];
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i] || seen[i]) continue;
    let size = 0;
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const idx = stack.pop();
      size += 1;
      const x = idx % w;
      const y = (idx - x) / w;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (!mask[ni] || seen[ni]) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    components.push({ size, minX, minY, maxX, maxY });
  }
  components.sort((a, b) => b.size - a.size);
  return components;
}
function analyzeSquintCell(rgba, width, height, bbox, { blurRadius = 2 } = {}) {
  const { w, h, lum } = extractCell(rgba, width, height, bbox);
  const blurred = boxBlur(lum, w, h, blurRadius);
  const mask = thresholdMask(blurred, w, h);
  const components = connectedComponents(mask, w, h);
  const ink = components.reduce((n, c) => n + c.size, 0);
  const density = ink / (w * h);
  const primary = components[0] ?? null;
  const primaryShare = primary ? primary.size / Math.max(1, ink) : 0;
  const silhouetteIntact = Boolean(
    primary && components.length <= 3 && primaryShare >= 0.72 && density >= 0.04 && density <= 0.72 && primary.maxX - primary.minX + 1 >= Math.max(2, w * 0.2) && primary.maxY - primary.minY + 1 >= Math.max(2, h * 0.2)
  );
  return {
    silhouetteIntact,
    density: Number(density.toFixed(4)),
    componentCount: components.length,
    primaryShare: Number(primaryShare.toFixed(4)),
    bbox
  };
}
function buildSquintEvidence({ rgba, width, height, samples, masterDigest, stripDigest }) {
  const cells = [];
  let allPass = true;
  for (const sample of samples) {
    const bbox = sample?.locator?.bbox;
    if (!Array.isArray(bbox) || bbox.length !== 4) {
      throw new Error(`SQUINT_SAMPLE_BBOX_MISSING:${sample?.id ?? "?"}`);
    }
    const metrics = analyzeSquintCell(rgba, width, height, bbox.map(Number));
    cells.push({
      id: sample.id,
      row: sample.row,
      size: sample.size,
      region: sample.locator.region ?? sample.id,
      bbox: bbox.map(Number),
      ...metrics
    });
    if (!metrics.silhouetteIntact) allPass = false;
  }
  const sizes = new Set(cells.map((c) => Number(c.size)));
  for (const need of [16, 32, 64]) {
    if (!sizes.has(need)) throw new Error(`SQUINT_SIZE_MISSING:${need}`);
  }
  const rows = new Set(cells.map((c) => c.row));
  if (!rows.has("black") && !rows.has("mono")) throw new Error("SQUINT_ROW_MONO_MISSING");
  if (!rows.has("reverse")) throw new Error("SQUINT_ROW_REVERSE_MISSING");
  return {
    schemaVersion: 1,
    masterDigest,
    stripDigest,
    method: "box-blur-threshold-connected-components",
    blurRadius: 2,
    pass: allPass,
    observation: allPass ? "After box-blur low-pass, each 16/32/64 mono|black and reverse cell keeps one dominant connected silhouette (primaryShare\u22650.72)." : "Squint failed: at least one cell lost a single dominant silhouette after blur (fragmented or empty).",
    cells
  };
}

// plugins/logo-project-delivery-guard/src/entries/cli/project-preview.ts
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
async function loadTextTree(root) {
  const { readdir } = await import("node:fs/promises");
  const files = {};
  const digests = {};
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", ".cache", ".tmp"].includes(entry.name)) continue;
      const abs = join2(dir, entry.name);
      if (entry.isDirectory()) await walk(abs);
      else if (entry.isFile()) {
        const rel = abs.slice(root.length + 1).replaceAll("\\", "/");
        const bytes = await readFile2(abs);
        digests[rel] = createHash("sha256").update(bytes).digest("hex");
        files[rel] = /\.(png|jpg|jpeg|webp)$/iu.test(rel) ? bytes.toString("base64") : bytes.toString("utf8");
      }
    }
  }
  await walk(root);
  return { files, digests };
}
async function main() {
  const args = process.argv.slice(2);
  const rootArg = args[0];
  const options = args.slice(1);
  const root = resolve2(rootArg?.startsWith("-") ? "" : rootArg ?? "");
  const writeReview = args.includes("--write-review");
  if (!rootArg || rootArg.startsWith("-") || options.some((option) => option !== "--write-review") || options.filter((option) => option === "--write-review").length > 1) {
    process.stderr.write("usage: project-preview.mjs <project-root> [--write-review]\n");
    process.exitCode = 2;
    return;
  }
  const markSvg = join2(root, "build/master/mark.svg");
  if (!await exists(markSvg)) throw new Error("build/master/mark.svg is required");
  const tree = await loadTextTree(root);
  const model = { files: tree.files, digests: tree.digests, artifactId: basename2(root) };
  const digest = masterSubjectDigest(model);
  const previewDir = join2(root, "evidence/preview");
  await mkdir(previewDir, { recursive: true });
  const stripPath = join2(previewDir, `strip.${digest}.png`);
  const manifestPath = join2(previewDir, `strip.${digest}.manifest.json`);
  const squintPath = join2(previewDir, `squint.${digest}.json`);
  const geometry = await renderPreviewStrip({
    svgSource: await readFile2(markSvg, "utf8"),
    outputPath: stripPath
  });
  const stripBytes = await readFile2(stripPath);
  const stripDigest = createHash("sha256").update(stripBytes).digest("hex");
  const manifest = {
    schemaVersion: 1,
    masterDigest: digest,
    artifact: {
      path: relativeToRoot(root, stripPath),
      kind: "image/png",
      sha256: stripDigest,
      bytes: stripBytes.byteLength,
      width: geometry.width,
      height: geometry.height
    },
    samples: geometry.samples
  };
  await writeFile2(manifestPath, `${JSON.stringify(manifest, null, 2)}
`);
  const { width, height, rgba } = decodePngToRgba(stripBytes);
  const squint = buildSquintEvidence({
    rgba,
    width,
    height,
    samples: manifest.samples,
    masterDigest: digest,
    stripDigest
  });
  await writeFile2(squintPath, `${JSON.stringify(squint, null, 2)}
`);
  if (writeReview) {
    const reviewPath = join2(root, "review.logo.json");
    let review = {};
    if (await exists(reviewPath)) {
      try {
        review = JSON.parse(await readFile2(reviewPath, "utf8"));
      } catch {
        review = {};
      }
    }
    review.masterDigest = digest;
    review.squintStripDigest = stripDigest;
    review.squintPass = squint.pass;
    if (review.autoStamped) delete review.autoStamped;
    if (review.source === "project-preview-default") delete review.source;
    await writeFile2(reviewPath, `${JSON.stringify(review, null, 2)}
`);
  }
  if (!squint.pass) {
    process.stderr.write(`[logo-project-preview] squint FAILED \u2014 see ${squintPath}
`);
    process.exitCode = 3;
  }
  process.stdout.write(`${JSON.stringify({
    ok: squint.pass,
    masterDigest: digest,
    stripPath: relativeToRoot(root, stripPath),
    manifestPath: relativeToRoot(root, manifestPath),
    squintPath: relativeToRoot(root, squintPath),
    stripDigest,
    squintPass: squint.pass,
    sampleCount: manifest.samples.length
  }, null, 2)}
`);
}
function relativeToRoot(root, abs) {
  return abs.slice(root.length + 1).replaceAll("\\", "/");
}
main().catch((error) => {
  process.stderr.write(`[logo-project-preview] ${error.message}
`);
  process.exitCode = 2;
});
