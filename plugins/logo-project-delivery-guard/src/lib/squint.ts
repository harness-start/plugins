/**
 * Deterministic squint / low-pass silhouette analysis on preview-strip cells.
 * Box-blur then threshold; require a single dominant connected component.
 */

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
      // Composite on mid-gray so reverse (white-on-dark) still has contrast.
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
  // horizontal
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
  // vertical
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
  // Ink is the side with smaller area near extremes — use distance from mid.
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

/**
 * Analyze one cell. Returns metrics + pass boolean.
 */
export function analyzeSquintCell(rgba, width, height, bbox, { blurRadius = 2 } = {}) {
  const { w, h, lum } = extractCell(rgba, width, height, bbox);
  const blurred = boxBlur(lum, w, h, blurRadius);
  const mask = thresholdMask(blurred, w, h);
  const components = connectedComponents(mask, w, h);
  const ink = components.reduce((n, c) => n + c.size, 0);
  const density = ink / (w * h);
  const primary = components[0] ?? null;
  const primaryShare = primary ? primary.size / Math.max(1, ink) : 0;
  // Single memory point under squint: one dominant blob, not empty, not salt/pepper.
  const silhouetteIntact = Boolean(
    primary
    && components.length <= 3
    && primaryShare >= 0.72
    && density >= 0.04
    && density <= 0.72
    && (primary.maxX - primary.minX + 1) >= Math.max(2, w * 0.2)
    && (primary.maxY - primary.minY + 1) >= Math.max(2, h * 0.2),
  );
  return {
    silhouetteIntact,
    density: Number(density.toFixed(4)),
    componentCount: components.length,
    primaryShare: Number(primaryShare.toFixed(4)),
    bbox,
  };
}

/**
 * Build squint evidence from strip PNG + logo-preview-strip style samples.
 */
export function buildSquintEvidence({ rgba, width, height, samples, masterDigest, stripDigest }) {
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
      ...metrics,
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
    observation: allPass
      ? "After box-blur low-pass, each 16/32/64 mono|black and reverse cell keeps one dominant connected silhouette (primaryShare≥0.72)."
      : "Squint failed: at least one cell lost a single dominant silhouette after blur (fragmented or empty).",
    cells,
  };
}
