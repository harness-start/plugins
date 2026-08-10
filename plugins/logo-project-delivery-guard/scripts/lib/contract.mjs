import { createHash } from "node:crypto";

const CONCEPT_SOURCE = /^(?<index>[0-9]{3})-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\.logo\.tsx$/u;
const GENERATED_PATH = /^(?:build\/master\/|dist\/|evidence(?:\/|\.[^/]+\.json$)|evidence\.accessibility\.json$|review\.logo\.json$|release\.manifest\.json$|receipt\.[^/]+\.json$)/u;
// Flag remote/raster/runtime leaks; allow xmlns="http://www.w3.org/2000/svg".
const MASTER_VECTOR_VIOLATION = /(?:<\s*(?:image|text|foreignObject|script|style|iframe)\b|(?:href|src|xlink:href)\s*=\s*["']https?:\/\/|from\s+["'](?:node:fs|node:child_process)["']|\b(?:fetch|useState|useEffect|setTimeout|setInterval)\s*\(|\b(?:Date\.now|Math\.random)\s*\()/u;
const RECEIPT_EXCLUDED_PATH = /^(?:build\/|dist\/|evidence(?:\.|\/)|specimen\/|review\.logo\.json$|release\.manifest\.json$|receipt\.[^/]+\.json$|\.logo-delivery-journal\.json$)/u;
const CONCEPT_PROOF_PATH = /^src\/concepts\/.+\.[0-9a-f]{64}\.png$/u;
const FIB_SEQUENCE = [1, 1, 2, 3, 5, 8, 13];
const PHI = 1.618033988749895;
const AESTHETIC_CRITERIA = ["singleMemoryPoint", "opticalCraft", "markWordmarkSystem"];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const finding = (code, path, message) => ({ code, path, message });
const fileDigest = (model, filePath) => model?.digests?.[filePath] ?? sha256(model?.files?.[filePath] ?? "");

export function computeLogoSubjectDigest(model) {
  const records = Object.entries(model?.files ?? {})
    .filter(([filePath, value]) => typeof value === "string" && !RECEIPT_EXCLUDED_PATH.test(filePath) && !CONCEPT_PROOF_PATH.test(filePath))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath]) => `${filePath}\0${fileDigest(model, filePath)}\n`)
    .join("");
  return sha256(records);
}

function logoOutputPaths() {
  return [
    "dist/primary/mark.svg", "dist/primary/mark.png", "dist/primary/wordmark.svg", "dist/primary/wordmark.png",
    "dist/primary/lockup.svg", "dist/primary/lockup.png", "dist/mono/mark.svg", "dist/mono/wordmark.svg",
    "dist/mono/lockup.svg", "dist/reverse/mark.svg", "dist/reverse/wordmark.svg", "dist/reverse/lockup.svg",
    "evidence.accessibility.json", "review.logo.json", "release.manifest.json",
  ];
}

export function createLogoReceipt(model) {
  const digest = masterSubjectDigest(model);
  const previewPaths = [
    `evidence/preview/strip.${digest}.png`,
    `evidence/preview/strip.${digest}.manifest.json`,
    `evidence/preview/squint.${digest}.json`,
  ];
  return {
    schemaVersion: 1,
    plugin: "logo-project-delivery-guard",
    artifactId: model?.artifactId,
    stage: "release",
    subjectDigest: computeLogoSubjectDigest(model),
    outputs: Object.fromEntries(
      [...logoOutputPaths(), ...previewPaths].map((filePath) => [filePath, fileDigest(model, filePath)]),
    ),
  };
}

export function validateLogoReceipt(model) {
  try {
    const actual = JSON.parse(model?.files?.["receipt.release.json"] ?? "");
    const expected = createLogoReceipt(model);
    return actual?.schemaVersion === expected.schemaVersion
      && actual?.plugin === expected.plugin
      && actual?.artifactId === expected.artifactId
      && actual?.stage === expected.stage
      && actual?.subjectDigest === expected.subjectDigest
      && JSON.stringify(actual?.outputs) === JSON.stringify(expected.outputs);
  } catch {
    return false;
  }
}

function parseJson(files, filePath, findings) {
  if (typeof files[filePath] !== "string") {
    findings.push(finding("REQUIRED_PATH_MISSING", filePath, `${filePath} is required`));
    return null;
  }
  try { return JSON.parse(files[filePath]); } catch {
    findings.push(finding("JSON_INVALID", filePath, `${filePath} must contain valid JSON`));
    return null;
  }
}

export function masterSubjectDigest(model) {
  const records = ["lockup", "mark", "wordmark"].map((role) => {
    const filePath = `build/master/${role}.svg`;
    return `${filePath}\0${sha256(model?.files?.[filePath] ?? "")}\n`;
  }).join("");
  return sha256(records);
}

/** Extract <circle cx cy r> from SVG markup (build master fact source). */
export function extractSvgCircles(svg) {
  if (typeof svg !== "string") return [];
  const circles = [];
  for (const match of svg.matchAll(/<circle\b([^>]*?)(?:\/>|>)/giu)) {
    const attrs = match[1] ?? "";
    const cx = Number(attrs.match(/\bcx\s*=\s*["']?(-?[\d.]+)/u)?.[1]);
    const cy = Number(attrs.match(/\bcy\s*=\s*["']?(-?[\d.]+)/u)?.[1]);
    const r = Number(attrs.match(/\br\s*=\s*["']?(-?[\d.]+)/u)?.[1]);
    if ([cx, cy, r].every((n) => Number.isFinite(n) && n >= 0)) circles.push({ cx, cy, r });
  }
  return circles;
}

function attrNumber(attrs, name) {
  const value = Number(attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']?(-?[\\d.]+)`, "u"))?.[1]);
  return Number.isFinite(value) ? value : null;
}

/** Extract simple M/L path points for rim binding checks. */
export function extractSvgPathPoints(svg) {
  if (typeof svg !== "string") return [];
  const points = [];
  for (const match of svg.matchAll(/<path\b([^>]*?)(?:\/>|>)/giu)) {
    const attrs = match[1] ?? "";
    const d = attrs.match(/\bd\s*=\s*["']([^"']+)["']/u)?.[1] ?? "";
    let x = 0;
    let y = 0;
    for (const token of d.matchAll(/([MmLl])\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/gu)) {
      const cmd = token[1];
      const px = Number(token[2]);
      const py = Number(token[3]);
      if (cmd === "M" || cmd === "L") {
        x = px;
        y = py;
      } else {
        x += px;
        y += py;
      }
      points.push({ x, y });
    }
  }
  return points;
}

function fibAdjacent(a, b) {
  const i = FIB_SEQUENCE.lastIndexOf(a);
  const j = FIB_SEQUENCE.lastIndexOf(b);
  if (i < 0 || j < 0) return false;
  return Math.abs(i - j) === 1 || (a === 1 && b === 1);
}

function expectedRatio(larger, smaller) {
  if (!(larger > 0) || !(smaller > 0)) return null;
  return larger / smaller;
}

function validateRequired(files, findings) {
  for (const filePath of [
    ".gitignore", "package.json", "package-lock.json", "plan.contract.json", "plan.assets.json",
    "logo.project.json", "src/render.ts", "src/concepts/manifest.json", "src/master/Mark.logo.tsx",
    "src/master/Wordmark.logo.tsx", "src/master/Lockup.logo.tsx", "src/construction/construction.json",
    "src/construction/standard-grid.json", "src/construction/geometry.json", "src/construction/fibonacci.json",
    "src/variants/manifest.json", "build/master/mark.svg", "build/master/wordmark.svg", "build/master/lockup.svg",
  ]) if (!(filePath in files)) findings.push(finding("REQUIRED_PATH_MISSING", filePath, `${filePath} is required`));
}

function validateArtifactGitignore(files, findings) {
  const text = files[".gitignore"];
  if (typeof text !== "string") return;
  text.split(/\r?\n/u).forEach((raw, offset) => {
    const line = raw.trim();
    const normalized = line.replace(/^\//u, "");
    if (line && !line.startsWith("#") && !line.startsWith("!") && (/^(?:dist|build|evidence)(?:\/|$)/u.test(normalized) || /^(?:receipt|review|release)(?:\.|\/|$)/u.test(normalized) || /^(?:\*\*\/)?\*\.(?:png|svg|pdf|pptx|mp4|wav)$/u.test(normalized))) findings.push(finding("DELIVERY_PATH_IGNORED", `.gitignore:${offset + 1}`, `artifact delivery path must not be ignored: ${line}`));
  });
}

function validateConcepts(model, findings) {
  const manifest = parseJson(model.files, "src/concepts/manifest.json", findings);
  const concepts = Array.isArray(manifest?.concepts) ? manifest.concepts : [];
  concepts.forEach((entry, offset) => {
    const match = typeof entry?.source === "string" ? entry.source.match(CONCEPT_SOURCE) : null;
    const sourcePath = `src/concepts/${entry?.source ?? "manifest.json"}`;
    if (!match || entry.index !== offset + 1 || Number(match?.groups.index) !== entry.index) {
      findings.push(finding("CONCEPT_SEQUENCE_INVALID", sourcePath, "concepts must use contiguous NNN-slug.logo.tsx sources"));
      return;
    }
    const source = model.files[sourcePath];
    if (typeof source !== "string") { findings.push(finding("CONCEPT_SOURCE_MISSING", sourcePath, "concept source is missing")); return; }
    const preview = `src/concepts/${entry.source.slice(0, -9)}.${sha256(source)}.png`;
    if (!(preview in model.files)) findings.push(finding("CONCEPT_PREVIEW_MISSING", preview, "current source-hash concept preview is required"));
  });
}

function validateMaster(model, findings) {
  for (const role of ["Mark", "Wordmark", "Lockup"]) {
    const filePath = `src/master/${role}.logo.tsx`;
    const source = model.files[filePath];
    if (typeof source !== "string") continue;
    if (!/<\s*svg\b/u.test(source) || MASTER_VECTOR_VIOLATION.test(source)) findings.push(finding("MASTER_VECTOR_VIOLATION", filePath, "master role must be a self-contained native-vector SVG component"));
    if ((source.match(/export\s+function\s+[A-Za-z][A-Za-z0-9]*\s*\(/gu) ?? []).length !== 1) findings.push(finding("MASTER_EXPORT_INVALID", filePath, "master role must export exactly one SVG component"));
  }
  for (const role of ["mark", "wordmark", "lockup"]) {
    const filePath = `build/master/${role}.svg`;
    const svg = model.files[filePath];
    if (typeof svg !== "string") continue;
    const root = svg.match(/<svg\b([^>]*)>/u)?.[1] ?? "";
    // Only root-level width/height attrs (not stroke-width / line-height-like names).
    const rootHasFixedSize = /(?:^|\s)(?:width|height)\s*=/u.test(root);
    const hasForbidden = /<(?:image|text|foreignObject|script|style)\b/u.test(svg);
    if (!/<svg\s[^>]*viewBox=/u.test(svg) || rootHasFixedSize || hasForbidden) {
      findings.push(finding("MASTER_SVG_INVALID", filePath, "master SVG root must use viewBox without fixed width/height; no image/text/foreignObject/script/style"));
    }
  }
}

/**
 * Formal Fibonacci-circle / golden-spiral construction.
 * Schema-only stubs (sequence + bare anchors without circles/bindings) fail closed.
 */
export function validateFibonacciConstruction(model, findings) {
  const path = "src/construction/fibonacci.json";
  const fibonacci = parseJson(model.files, path, findings);
  if (!fibonacci) return;

  if (JSON.stringify(fibonacci.sequence) !== JSON.stringify(FIB_SEQUENCE)) {
    findings.push(finding("FIBONACCI_SEQUENCE_INVALID", path, "Fibonacci sequence must be 1,1,2,3,5,8,13"));
  }
  if (!new Set(["structural", "optical-reference"]).has(fibonacci.usage)) {
    findings.push(finding("FIBONACCI_USAGE_INVALID", path, "Fibonacci usage must be structural or optical-reference"));
  }

  const unit = Number(fibonacci.unit);
  const tolPx = Number(fibonacci.tolerancePx ?? 1.5);
  const tolRatio = Number(fibonacci.toleranceRatio ?? 0.08);
  if (!(unit > 0) || !Number.isFinite(unit)) {
    findings.push(finding("FIBONACCI_UNIT_INVALID", path, "fibonacci.unit must be a positive number (base radius)"));
  }
  if (!(tolPx > 0) || !(tolRatio > 0 && tolRatio < 0.5)) {
    findings.push(finding("FIBONACCI_TOLERANCE_INVALID", path, "tolerancePx must be > 0 and toleranceRatio in (0, 0.5)"));
  }

  const circles = Array.isArray(fibonacci.circles) ? fibonacci.circles : [];
  if (circles.length < 3) {
    findings.push(finding("FIBONACCI_CIRCLES_MISSING", path, "formal construction requires at least three named Fibonacci circles"));
  }

  const byId = new Map();
  for (const circle of circles) {
    if (!circle || typeof circle.id !== "string" || !circle.id) {
      findings.push(finding("FIBONACCI_CIRCLE_INVALID", path, "each circle needs a non-empty id"));
      continue;
    }
    if (byId.has(circle.id)) findings.push(finding("FIBONACCI_CIRCLE_INVALID", path, `duplicate circle id ${circle.id}`));
    const cx = Number(circle.cx);
    const cy = Number(circle.cy);
    const radiusUnits = Number(circle.radiusUnits);
    if (![cx, cy, radiusUnits].every(Number.isFinite)) {
      findings.push(finding("FIBONACCI_CIRCLE_INVALID", path, `circle ${circle.id} needs numeric cx, cy, radiusUnits`));
      continue;
    }
    if (!FIB_SEQUENCE.includes(radiusUnits)) {
      findings.push(finding("FIBONACCI_RADIUS_NOT_IN_SEQUENCE", path, `circle ${circle.id} radiusUnits=${radiusUnits} is not in 1,1,2,3,5,8,13`));
    }
    byId.set(circle.id, { id: circle.id, cx, cy, radiusUnits, r: radiusUnits * (unit > 0 ? unit : 1) });
  }

  // At least one adjacent Fibonacci radius pair must appear (formal φ / Fib ratio).
  const unitSet = [...new Set([...byId.values()].map((c) => c.radiusUnits))].sort((a, b) => a - b);
  let hasAdjacentPair = false;
  for (let i = 0; i < unitSet.length; i += 1) {
    for (let j = i + 1; j < unitSet.length; j += 1) {
      if (fibAdjacent(unitSet[i], unitSet[j])) {
        hasAdjacentPair = true;
        const larger = Math.max(unitSet[i], unitSet[j]);
        const smaller = Math.min(unitSet[i], unitSet[j]);
        const ratio = expectedRatio(larger, smaller);
        const expected = larger === smaller ? 1 : larger / smaller;
        // Also accept φ when pair is 8/5 or 13/8 style
        if (ratio != null && Math.abs(ratio - expected) > 1e-9) {
          /* ratio is exact for integer Fib units */
        }
        void expected;
      }
    }
  }
  if (circles.length >= 2 && !hasAdjacentPair) {
    findings.push(finding("FIBONACCI_RATIO_PAIR_MISSING", path, "circles must include at least one adjacent Fibonacci radius pair (e.g. 5+8 or 8+13)"));
  }

  // Spiral chain: true Fibonacci quarter-arc construction (non-concentric joints).
  // Consecutive circles use adjacent Fib radii; centers sit at arc joints
  // (distance ≈ |r1−r2| for internal growth or r1+r2 for external). Pure
  // concentric stacks (all centers equal) are rejected — that is not a spiral.
  const spiral = fibonacci.spiral;
  if (!spiral || spiral.kind !== "fibonacci-quarter-arcs" || !Array.isArray(spiral.orderedCircleIds) || spiral.orderedCircleIds.length < 3) {
    findings.push(finding("FIBONACCI_SPIRAL_INVALID", path, "spiral.kind must be fibonacci-quarter-arcs with orderedCircleIds length ≥ 3"));
  } else {
    const ordered = spiral.orderedCircleIds.map((id) => byId.get(id)).filter(Boolean);
    if (ordered.length >= 2) {
      let maxCenterDist = 0;
      for (let i = 0; i < ordered.length; i += 1) {
        for (let j = i + 1; j < ordered.length; j += 1) {
          maxCenterDist = Math.max(maxCenterDist, Math.hypot(ordered[i].cx - ordered[j].cx, ordered[i].cy - ordered[j].cy));
        }
      }
      if (maxCenterDist <= tolPx) {
        findings.push(finding("FIBONACCI_SPIRAL_CONCENTRIC", path, "spiral circles must not be concentric; quarter-arc construction needs offset joint centers"));
      }
    }
    for (let i = 0; i < spiral.orderedCircleIds.length - 1; i += 1) {
      const a = byId.get(spiral.orderedCircleIds[i]);
      const b = byId.get(spiral.orderedCircleIds[i + 1]);
      if (!a || !b) {
        findings.push(finding("FIBONACCI_SPIRAL_INVALID", path, `spiral references unknown circle at index ${i}`));
        continue;
      }
      if (!fibAdjacent(a.radiusUnits, b.radiusUnits)) {
        findings.push(finding("FIBONACCI_SPIRAL_STEP_INVALID", path, `spiral step ${a.id}→${b.id} radii ${a.radiusUnits},${b.radiusUnits} are not adjacent Fibonacci units`));
      }
      const dist = Math.hypot(a.cx - b.cx, a.cy - b.cy);
      const internal = Math.abs(a.r - b.r);
      const external = a.r + b.r;
      // Joint centers only — concentric (dist≈0) is not a valid spiral step.
      const okInternal = Math.abs(dist - internal) <= tolPx && dist > tolPx;
      const okExternal = Math.abs(dist - external) <= tolPx;
      if (!okInternal && !okExternal) {
        findings.push(finding("FIBONACCI_SPIRAL_GEOMETRY_INVALID", path, `spiral ${a.id}→${b.id}: center distance ${dist.toFixed(2)} must equal |r1−r2|=${internal.toFixed(2)} or r1+r2=${external.toFixed(2)} (quarter-arc joint)`));
      }
    }
    // Optional arcs metadata: when present, each step is a 90° sweep on one circle.
    if (Array.isArray(spiral.arcs) && spiral.arcs.length > 0) {
      for (const arc of spiral.arcs) {
        if (!byId.has(arc?.circleId)) {
          findings.push(finding("FIBONACCI_SPIRAL_ARC_INVALID", path, `spiral.arcs references unknown circle ${arc?.circleId}`));
          continue;
        }
        const sweep = Math.abs(Number(arc.endAngleDeg) - Number(arc.startAngleDeg));
        const norm = ((sweep % 360) + 360) % 360;
        if (Math.abs(norm - 90) > 1 && Math.abs(norm - 270) > 1) {
          findings.push(finding("FIBONACCI_SPIRAL_ARC_INVALID", path, `spiral arc on ${arc.circleId} must be a quarter turn (90°), got ${sweep}°`));
        }
      }
    }
  }

  const bindings = Array.isArray(fibonacci.pathBindings) ? fibonacci.pathBindings : [];
  const outlineBindings = bindings.filter((b) => b?.role === "outline");
  const voidBindings = bindings.filter((b) => b?.role === "negative-space" || b?.role === "turn");
  if (outlineBindings.length < 2 || voidBindings.length < 1) {
    findings.push(finding("FIBONACCI_PATH_BINDINGS_INVALID", path, "pathBindings need ≥2 outline and ≥1 negative-space|turn roles bound to circles"));
  }
  for (const binding of bindings) {
    if (!byId.has(binding?.circleId)) {
      findings.push(finding("FIBONACCI_PATH_BINDINGS_INVALID", path, `pathBinding references unknown circleId ${binding?.circleId}`));
    }
    if (!["center", "rim"].includes(binding?.feature)) {
      findings.push(finding("FIBONACCI_PATH_BINDINGS_INVALID", path, "pathBinding.feature must be center or rim"));
    }
  }

  // Legacy anchors still accepted as soft documentation but cannot replace circles/bindings.
  const anchors = Array.isArray(fibonacci.anchors) ? fibonacci.anchors : [];
  if (anchors.length > 0) {
    if (anchors.filter(({ kind }) => kind === "outline").length < 2 || anchors.filter(({ kind }) => kind === "negative-space" || kind === "turn").length < 1) {
      findings.push(finding("FIBONACCI_ANCHORS_INVALID", path, "when anchors are present, need two outline and one negative-space|turn"));
    }
  }

  // Geometry JSON must list circle primitives that cover fibonacci circle ids.
  const geometry = parseJson(model.files, "src/construction/geometry.json", findings);
  if (geometry) {
    const primitives = Array.isArray(geometry.primitives) ? geometry.primitives : [];
    const circlePrims = primitives.filter((p) => p?.type === "circle" && typeof p.id === "string");
    for (const id of byId.keys()) {
      if (!circlePrims.some((p) => p.id === id)) {
        findings.push(finding("FIBONACCI_GEOMETRY_PRIMITIVE_MISSING", "src/construction/geometry.json", `geometry.primitives must include circle id ${id}`));
      }
    }
    if (!Array.isArray(geometry.pathMappings) || geometry.pathMappings.length === 0) {
      findings.push(finding("GEOMETRY_MAPPING_INVALID", "src/construction/geometry.json", "geometry must map master paths to stable primitives"));
    }
  }

  // Master mark SVG must materialize the declared circles (not schema-only).
  const markSvg = model.files?.["build/master/mark.svg"];
  const svgCircles = extractSvgCircles(markSvg);
  const pathPoints = extractSvgPathPoints(markSvg);
  if (byId.size > 0 && svgCircles.length === 0 && pathPoints.length === 0) {
    findings.push(finding("FIBONACCI_MARK_GEOMETRY_MISSING", "build/master/mark.svg", "mark master must contain circle elements or path points realizing the Fibonacci construction"));
  }
  for (const declared of byId.values()) {
    const matchCircle = svgCircles.some((s) => Math.hypot(s.cx - declared.cx, s.cy - declared.cy) <= tolPx && Math.abs(s.r - declared.r) <= tolPx);
    if (matchCircle) continue;
    // Allow path-only marks if a rim binding point lies on the circumference.
    const rimHit = pathPoints.some((p) => Math.abs(Math.hypot(p.x - declared.cx, p.y - declared.cy) - declared.r) <= tolPx);
    const centerHit = pathPoints.some((p) => Math.hypot(p.x - declared.cx, p.y - declared.cy) <= tolPx);
    if (!rimHit && !centerHit) {
      findings.push(finding("FIBONACCI_MARK_CIRCLE_UNREALIZED", "build/master/mark.svg", `declared circle ${declared.id} (r=${declared.r}) is not realized in mark SVG geometry`));
    }
  }

  // Binding feature checks against mark geometry.
  for (const binding of bindings) {
    const circle = byId.get(binding.circleId);
    if (!circle) continue;
    if (binding.feature === "center") {
      const ok = svgCircles.some((s) => Math.hypot(s.cx - circle.cx, s.cy - circle.cy) <= tolPx)
        || pathPoints.some((p) => Math.hypot(p.x - circle.cx, p.y - circle.cy) <= tolPx);
      if (!ok) findings.push(finding("FIBONACCI_BINDING_CENTER_MISS", "build/master/mark.svg", `outline/void center binding for ${circle.id} not found near (${circle.cx},${circle.cy})`));
    }
    if (binding.feature === "rim") {
      const ok = svgCircles.some((s) => Math.hypot(s.cx - circle.cx, s.cy - circle.cy) <= tolPx && Math.abs(s.r - circle.r) <= tolPx)
        || pathPoints.some((p) => Math.abs(Math.hypot(p.x - circle.cx, p.y - circle.cy) - circle.r) <= tolPx);
      if (!ok) findings.push(finding("FIBONACCI_BINDING_RIM_MISS", "build/master/mark.svg", `rim binding for ${circle.id} not found on circumference r=${circle.r}`));
    }
  }

  // φ sanity: largest/smallest adjacent pair ratio should be near φ when units differ.
  const sorted = [...byId.values()].sort((a, b) => a.radiusUnits - b.radiusUnits);
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (!fibAdjacent(a.radiusUnits, b.radiusUnits) || a.radiusUnits === b.radiusUnits) continue;
    const ratio = b.r / a.r;
    const ideal = b.radiusUnits / a.radiusUnits;
    if (Math.abs(ratio - ideal) > tolRatio * ideal) {
      findings.push(finding("FIBONACCI_RADIUS_RATIO_INVALID", path, `radius ratio ${b.id}/${a.id}=${ratio.toFixed(4)} diverges from Fib ${ideal}`));
    }
    // Document φ proximity for 8/5 and 13/8 pairs without requiring exact φ.
    if ((a.radiusUnits === 5 && b.radiusUnits === 8) || (a.radiusUnits === 8 && b.radiusUnits === 13)) {
      if (Math.abs(ratio - PHI) > 0.12) {
        findings.push(finding("FIBONACCI_PHI_RATIO_WEAK", path, `pair ${a.radiusUnits}:${b.radiusUnits} ratio ${ratio.toFixed(4)} is far from φ≈1.618`));
      }
    }
  }
}

function validateConstruction(model, findings) {
  const standard = parseJson(model.files, "src/construction/standard-grid.json", findings);
  const geometry = parseJson(model.files, "src/construction/geometry.json", findings);
  if (!(Number(standard?.unit) > 0) || !(Number(standard?.clearSpace) > 0) || ![16, 32, 64].some((size) => size >= Number(standard?.minimumPixels))) {
    findings.push(finding("STANDARD_GRID_INVALID", "src/construction/standard-grid.json", "standard grid needs positive unit, clear space, and minimum size"));
  }
  if (!Array.isArray(geometry?.primitives) || geometry.primitives.length === 0 || !Array.isArray(geometry?.pathMappings) || geometry.pathMappings.length === 0) {
    findings.push(finding("GEOMETRY_MAPPING_INVALID", "src/construction/geometry.json", "geometry must map master paths to stable primitives"));
  }
  validateFibonacciConstruction(model, findings);
  const digest = masterSubjectDigest(model);
  for (const sheet of ["standard", "geometry", "fibonacci"]) for (const extension of ["png", "svg"]) {
    const filePath = `evidence/construction/${sheet}.${digest}.${extension}`;
    if (!(filePath in (model.files ?? {}))) findings.push(finding("CONSTRUCTION_SHEET_MISSING", filePath, `${sheet} ${extension.toUpperCase()} sheet must bind the current master digest`));
  }
}

function samplesFromManifest(manifest) {
  if (Array.isArray(manifest?.samples)) return manifest.samples;
  if (Array.isArray(manifest?.cells)) {
    return manifest.cells.map((c, i) => ({
      id: c.id ?? `cell-${i}`,
      row: c.row,
      size: c.size,
      locator: { bbox: c.bbox ?? c.locator?.bbox, region: c.region ?? c.locator?.region },
    }));
  }
  return [];
}

function validatePreviewAndAesthetic(model, findings) {
  const digest = masterSubjectDigest(model);
  const stripPath = `evidence/preview/strip.${digest}.png`;
  const manifestPath = `evidence/preview/strip.${digest}.manifest.json`;
  const squintPath = `evidence/preview/squint.${digest}.json`;

  if (!(stripPath in (model.files ?? {}))) {
    findings.push(finding("PREVIEW_STRIP_MISSING", stripPath, "multi-size preview strip PNG bound to master digest is required for release"));
  }
  const manifest = parseJson(model.files, manifestPath, findings);
  const samples = samplesFromManifest(manifest);
  if (manifest) {
    const sizes = [...new Set(samples.map((s) => Number(s.size)).filter(Number.isFinite))];
    for (const need of [16, 32, 64]) {
      if (!sizes.includes(need)) findings.push(finding("PREVIEW_STRIP_SIZES_INVALID", manifestPath, `preview strip must include ${need}px samples`));
    }
    const rows = new Set(samples.map((s) => s.row).filter(Boolean));
    // logo-preview-strip uses color/black/reverse (black = mono row).
    const hasMono = rows.has("black") || rows.has("mono");
    const hasReverse = rows.has("reverse");
    if (!hasMono || !hasReverse) {
      findings.push(finding("PREVIEW_STRIP_ROWS_INVALID", manifestPath, "preview strip samples must include black|mono and reverse rows"));
    }
    for (const sample of samples) {
      const bbox = sample?.locator?.bbox;
      if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((n) => !Number.isFinite(Number(n)))) {
        findings.push(finding("PREVIEW_STRIP_BBOX_INVALID", manifestPath, `sample ${sample?.id ?? "?"} missing locator.bbox[4]`));
      } else if (bbox[0] === 0 && bbox[1] === 0 && samples.length > 1) {
        // Fabricated (0,0) cells for every sample are rejected when multiple sizes exist.
        const allOrigin = samples.every((s) => {
          const b = s?.locator?.bbox;
          return Array.isArray(b) && Number(b[0]) === 0 && Number(b[1]) === 0;
        });
        if (allOrigin) {
          findings.push(finding("PREVIEW_STRIP_BBOX_FABRICATED", manifestPath, "sample bboxes must come from the rendered strip (not all origin placeholders)"));
          break;
        }
      }
    }
    const claimed = manifest.artifact?.sha256 ?? manifest.pngSha256 ?? manifest.stripDigest ?? manifest.sha256;
    const actual = fileDigest(model, stripPath);
    if (typeof claimed === "string" && claimed.length === 64 && claimed !== actual) {
      findings.push(finding("PREVIEW_STRIP_DIGEST_MISMATCH", manifestPath, "manifest strip digest does not match strip PNG bytes"));
    }
    if (manifest.masterDigest && manifest.masterDigest !== digest) {
      findings.push(finding("PREVIEW_STRIP_MASTER_STALE", manifestPath, "preview manifest masterDigest must match current master digest"));
    }
  }

  const squint = parseJson(model.files, squintPath, findings);
  if (squint) {
    if (squint.masterDigest !== digest) {
      findings.push(finding("SQUINT_MASTER_STALE", squintPath, "squint evidence masterDigest must match current masters"));
    }
    const stripDigest = fileDigest(model, stripPath);
    if (squint.stripDigest !== stripDigest) {
      findings.push(finding("SQUINT_STRIP_DIGEST_MISMATCH", squintPath, "squint.stripDigest must equal the preview strip PNG digest"));
    }
    if (squint.method !== "box-blur-threshold-connected-components") {
      findings.push(finding("SQUINT_METHOD_INVALID", squintPath, "squint.method must be box-blur-threshold-connected-components (no theater pass)"));
    }
    if (squint.pass !== true) {
      findings.push(finding("SQUINT_FAILED", squintPath, "squint observation must pass (silhouette intact under blur/low-pass)"));
    }
    const cells = Array.isArray(squint.cells) ? squint.cells : [];
    const cellSizes = new Set(cells.map((c) => Number(c.size)));
    for (const need of [16, 32, 64]) {
      if (!cellSizes.has(need)) findings.push(finding("SQUINT_CELLS_INCOMPLETE", squintPath, `squint cells must cover ${need}px`));
    }
    // Each squint cell must bind a real bbox matching a manifest sample and carry metrics.
    for (const cell of cells) {
      if (cell.silhouetteIntact !== true && cell.silhouetteIntact !== false) {
        findings.push(finding("SQUINT_METRICS_MISSING", squintPath, `cell ${cell.id ?? cell.size} missing silhouetteIntact boolean from analysis`));
      }
      if (!(Number(cell.primaryShare) >= 0) || !(Number(cell.density) >= 0)) {
        findings.push(finding("SQUINT_METRICS_MISSING", squintPath, `cell ${cell.id ?? cell.size} missing density/primaryShare metrics`));
      }
      if (squint.pass === true && cell.silhouetteIntact !== true) {
        findings.push(finding("SQUINT_PASS_INCONSISTENT", squintPath, `pass=true but cell ${cell.id ?? cell.size} silhouetteIntact is not true`));
      }
      const bbox = cell.bbox;
      if (!Array.isArray(bbox) || bbox.length !== 4) {
        findings.push(finding("SQUINT_BBOX_MISSING", squintPath, `cell ${cell.id ?? cell.size} must include bbox bound to strip samples`));
      } else {
        const match = samples.some((s) => {
          const b = s?.locator?.bbox;
          return Array.isArray(b) && b.length === 4 && b.every((n, i) => Number(n) === Number(bbox[i]));
        });
        if (samples.length > 0 && !match) {
          findings.push(finding("SQUINT_BBOX_NOT_IN_MANIFEST", squintPath, `cell bbox ${bbox.join(",")} not present in strip manifest samples`));
        }
      }
    }
    if (typeof squint.observation !== "string" || squint.observation.trim().length < 24) {
      findings.push(finding("SQUINT_OBSERVATION_WEAK", squintPath, "squint.observation must describe the silhouette result"));
    }
  }

  const review = parseJson(model.files, "review.logo.json", findings);
  if (review) {
    if (review.masterDigest !== digest) {
      findings.push(finding("REVIEW_MASTER_STALE", "review.logo.json", "review.logo.json masterDigest must match current masters"));
    }
    if (review.autoStamped === true || review.source === "project-preview-default") {
      findings.push(finding("AESTHETIC_SCORES_AUTOSTAMPED", "review.logo.json", "aesthetic criteria must not be auto-stamped by project-preview defaults"));
    }
    const criteria = review.criteria ?? {};
    for (const key of AESTHETIC_CRITERIA) {
      const row = criteria[key];
      const score = Number(row?.score);
      const requiredMin = Number(row?.requiredMin ?? 2);
      if (!Number.isFinite(score) || score < requiredMin) {
        findings.push(finding("AESTHETIC_SCORE_BELOW_THRESHOLD", "review.logo.json", `${key} score ${score} < requiredMin ${requiredMin}`));
      }
      if (typeof row?.note !== "string" || row.note.trim().length < 8) {
        findings.push(finding("AESTHETIC_NOTE_MISSING", "review.logo.json", `${key} requires a substantive note (not empty autostamp)`));
      }
    }
    if (review.squintStripDigest && review.squintStripDigest !== fileDigest(model, stripPath)) {
      findings.push(finding("REVIEW_SQUINT_DIGEST_MISMATCH", "review.logo.json", "review.squintStripDigest must match strip PNG digest"));
    }
  }
}

export function validateLogoModel(model, { stage = "source" } = {}) {
  const findings = [];
  const files = model?.files ?? {};
  if (".logo-delivery-journal.json" in files) findings.push(finding("MUTATION_JOURNAL_OPEN", ".logo-delivery-journal.json", "an interrupted generated writer must be resumed or rolled back"));
  validateRequired(files, findings);
  validateArtifactGitignore(files, findings);
  if (model?.project?.artifactId !== model?.artifactId) findings.push(finding("ARTIFACT_ID_MISMATCH", "logo.project.json", "project artifactId must match directory id"));
  validateConcepts(model, findings);
  validateMaster(model, findings);
  validateConstruction(model, findings);
  if (stage === "release") {
    for (const filePath of [...logoOutputPaths(), "receipt.release.json"]) {
      if (!(filePath in files)) findings.push(finding("RELEASE_PATH_MISSING", filePath, `${filePath} is required for release`));
    }
    validatePreviewAndAesthetic(model, findings);
    if ("receipt.release.json" in files && !validateLogoReceipt(model)) findings.push(finding("RECEIPT_INVALID", "receipt.release.json", "release receipt must bind current logo sources and outputs"));
  }
  return findings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path));
}

export function evaluateLogoWrite({ relativePath = "", toolName = "", writer = "" } = {}) {
  const normalized = relativePath.replaceAll("\\", "/");
  const match = normalized.match(/(?:^|\/)artifacts\/logo\/[^/]+\/(?<inside>.+)$/u);
  if (!match) return { decision: "allow" };
  const inside = match.groups.inside;
  const conceptPreview = /^src\/concepts\/.*\.png$/u.test(inside);
  if ((GENERATED_PATH.test(inside) || conceptPreview) && !writer.startsWith("logo-")) return { decision: "deny", code: "PROTECTED_WRITER_REQUIRED", message: `${inside} must be written by a logo guard tool, not ${toolName || "an unregistered tool"}` };
  return { decision: "allow" };
}

export { FIB_SEQUENCE, PHI, AESTHETIC_CRITERIA };
