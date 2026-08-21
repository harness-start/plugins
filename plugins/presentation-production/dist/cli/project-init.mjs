#!/usr/bin/env node
// harness-source-hash: sha256:7dd4197f7388a95b8fcb0a3f0c2674cf89d8d8f71b7b2dff1e767a158f31565a
import {
  assertPptxProjectRoot
} from "../chunks/chunk-6GTQERFB.mjs";
import {
  DESIGN_SYSTEM_SCHEMA,
  PLAN_SCHEMA,
  PROJECT_SCHEMA,
  SKILL_COMPOSITION_SCHEMA,
  SLIDE_MANIFEST_SCHEMA,
  STORYBOARD_SCHEMA
} from "../chunks/chunk-L66YBYFZ.mjs";

// plugins/presentation-production/src/entries/cli/project-init.ts
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
function runNpm(root) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npm",
      ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
      { cwd: root, stdio: ["ignore", "ignore", "pipe"] }
    );
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 12e4);
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 1024 * 1024) stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`NPM_UNAVAILABLE:${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`NPM_INSTALL_FAILED:${stderr.trim()}`));
    });
  });
}
async function main() {
  const root = assertPptxProjectRoot(process.argv[2], { allowMissing: true });
  const artifactId = basename(root);
  await mkdir(join(root, "src", "slides"), { recursive: true });
  const files = {
    ".gitignore": "node_modules/\n.cache/\n.tmp/\n",
    "package.json": `${JSON.stringify({ name: `pptx-${artifactId}`, private: true, type: "module", scripts: { "pptx:render": "tsx src/deck.ts" }, dependencies: { pptxgenjs: "4.0.1" }, devDependencies: { tsx: "4.23.12", typescript: "6.0.3", eslint: "9.39.5", "typescript-eslint": "8.67.0" } }, null, 2)}
`,
    "plan.contract.json": `${JSON.stringify({ schema: PLAN_SCHEMA, artifactId, targetStage: "source", audience: "TODO", objective: "TODO", language: "zh-CN", assumptions: [] }, null, 2)}
`,
    "plan.storyboard.json": `${JSON.stringify({ schema: STORYBOARD_SCHEMA, slides: [{ index: 1, id: "opening", title: "TODO", role: "opening", visualType: "hero" }] }, null, 2)}
`,
    "plan.skill-composition.json": `${JSON.stringify(
      {
        schema: SKILL_COMPOSITION_SCHEMA,
        workers: [
          { name: "presentation-storyboard", status: "skipped" },
          { name: "presentation-visual-critique", status: "skipped" }
        ]
      },
      null,
      2
    )}
`,
    "design.system.json": `${JSON.stringify({ schema: DESIGN_SYSTEM_SCHEMA, colors: { roles: { canvas: "FFFFFF", surface: "F5F7FA", textPrimary: "17202A", textSecondary: "4B5563", accent: "0067C5", success: "237B4B", warning: "9A6700", error: "B42318" }, charts: { categorical: ["0067C5", "D97706", "237B4B", "7C3AED"] } }, typography: { roles: { display: { fontFamily: "Arial", fontSizePt: 36, lineSpacingMultiple: 1.1, charSpacingPt: 0, maxLines: 2, scriptPolicy: "mixed" }, title: { fontFamily: "Arial", fontSizePt: 30, lineSpacingMultiple: 1.15, charSpacingPt: 0, maxLines: 2, scriptPolicy: "mixed" }, section: { fontFamily: "Arial", fontSizePt: 24, lineSpacingMultiple: 1.2, charSpacingPt: 0, maxLines: 3, scriptPolicy: "mixed" }, body: { fontFamily: "Arial", fontSizePt: 22, lineSpacingMultiple: 1.35, charSpacingPt: 0, maxLines: 6, scriptPolicy: "mixed" }, caption: { fontFamily: "Arial", fontSizePt: 14, lineSpacingMultiple: 1.3, charSpacingPt: 0, maxLines: 3, scriptPolicy: "mixed" }, numeric: { fontFamily: "Arial", fontSizePt: 28, lineSpacingMultiple: 1.1, charSpacingPt: 0, maxLines: 2, scriptPolicy: "latin" } }, fallbacks: ["Arial", "Calibri"] }, spacing: { pageMarginIn: 0.5, baseUnitIn: 0.1, blockGapIn: 0.3, paragraphGapIn: 0.18 }, shape: { radiusIn: 0.08 }, antiPatterns: ["color-only-encoding", "text-only-slide", "repeated-layout"] }, null, 2)}
`,
    "pptx.project.json": `${JSON.stringify({ schema: PROJECT_SCHEMA, artifactId, layout: "LAYOUT_16X9", language: "zh-CN", entry: "src/deck.ts", slideManifest: "src/slides/manifest.json", designSystem: "design.system.json", outputs: { pptx: `dist/${artifactId}.pptx`, pdf: `dist/${artifactId}.pdf`, pages: "dist/pages" } }, null, 2)}
`,
    "src/theme.ts": 'import design from "../design.system.json" with { type: "json" };\nexport const theme = design;\n',
    "src/slides/manifest.json": `${JSON.stringify({ schema: SLIDE_MANIFEST_SCHEMA, slides: [{ index: 1, id: "opening", source: "001-opening.ts", title: "TODO", role: "opening", visualType: "hero", accessibility: { title: "TODO", altText: [], readingOrder: ["title"], colorEncoding: ["label"] } }] }, null, 2)}
`,
    "src/slides/001-opening.ts": "export function renderSlide(slide, ctx) {\n  const display = ctx.theme.typography.roles.display;\n  slide.background = { color: ctx.theme.colors.roles.canvas };\n  slide.addText(ctx.copy.title, { x: 0.7, y: 2.1, w: 8.6, h: 1.2, fontFace: display.fontFamily, fontSize: display.fontSizePt, charSpacing: display.charSpacingPt, breakLine: false, color: ctx.theme.colors.roles.textPrimary, bold: true, margin: 0 });\n}\n",
    "src/deck.ts": 'import { createHash } from "node:crypto";\nimport { readFile } from "node:fs/promises";\nimport { resolve } from "node:path";\nimport pptxgen from "pptxgenjs";\nimport { theme } from "./theme.js";\nconst outputFlag = process.argv.indexOf("--output");\nif (outputFlag < 0 || !process.argv[outputFlag + 1]) throw new Error("OUTPUT_REQUIRED");\nconst manifest = JSON.parse(await readFile(new URL("./slides/manifest.json", import.meta.url), "utf8"));\nconst storyboard = JSON.parse(await readFile(new URL("../plan.storyboard.json", import.meta.url), "utf8"));\nconst planned = new Map(storyboard.slides.map((entry) => [entry.id, entry]));\nfunction unsafeSvg(svg) { if (/<\\s*(?:script|foreignObject|iframe|object|embed)\\b|\\bon\\w+\\s*=|@import\\b/iu.test(svg)) return true; for (const match of svg.matchAll(/(?:href|src)\\s*=\\s*["\']([^"\']*)["\']/giu)) if (!/^(?:#|data:image\\/(?:png|jpeg|gif|webp);base64,)/iu.test(match[1] || "")) return true; for (const match of svg.matchAll(/url\\(\\s*["\']?([^"\')\\s]+)["\']?\\s*\\)/giu)) if (!/^(?:#|data:(?:image|font)\\/)/iu.test(match[1] || "")) return true; return false; }\nasync function loadDiagram(entry) { const spec = planned.get(entry.id)?.diagram; if (!spec) return undefined; const svg = await readFile(new URL(`../${spec.asset}`, import.meta.url), "utf8"); if (createHash("sha256").update(svg).digest("hex") !== spec.sha256) throw new Error(`DIAGRAM_HASH_MISMATCH:${entry.id}`); if (!/^\\s*(?:<\\?xml[^>]*>\\s*)?<svg\\b/iu.test(svg) || unsafeSvg(svg)) throw new Error(`DIAGRAM_SVG_UNSAFE:${entry.id}`); return { svg, data: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, fit: spec.fit, takeaway: spec.takeaway, alt: spec.alt, sha256: spec.sha256 }; }\nconst deck = new pptxgen();\ndeck.layout = "LAYOUT_WIDE";\ndeck.author = "presentation-production";\nfor (const entry of manifest.slides) { const slide = deck.addSlide(); const module = await import(`./slides/${entry.source}`); module.renderSlide(slide, { theme, copy: { title: entry.title }, entry, diagram: await loadDiagram(entry) }); }\nawait deck.writeFile({ fileName: resolve(process.argv[outputFlag + 1]) });\n'
  };
  for (const [filePath, content] of Object.entries(files))
    await writeFile(join(root, filePath), content, { flag: "wx" });
  await runNpm(root);
  process.stdout.write(`${JSON.stringify({ artifactId, root })}
`);
}
main().catch((error) => {
  process.stderr.write(
    `[pptx-project-init] ${error instanceof Error ? error.message : String(error)}
`
  );
  process.exitCode = 2;
});
