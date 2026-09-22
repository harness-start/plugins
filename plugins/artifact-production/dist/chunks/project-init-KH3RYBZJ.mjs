#!/usr/bin/env node
// harness-source-hash: sha256:e391f0a627a824290ca5a1f81d0d28ec3650ef13a0f78aaa01986be4d569401c
import {
  assertPptxProjectRoot
} from "./chunk-YHDEEYYG.mjs";
import {
  DESIGN_SYSTEM_SCHEMA,
  PLAN_SCHEMA,
  PROJECT_SCHEMA,
  SKILL_COMPOSITION_SCHEMA,
  SLIDE_MANIFEST_SCHEMA,
  STORYBOARD_SCHEMA
} from "./chunk-4PTAPMHY.mjs";
import "./chunk-TX2Q2IJT.mjs";
import "./chunk-X6K6YEQP.mjs";
import "./chunk-56FB7NEV.mjs";
import "./chunk-YEA2PMNG.mjs";

// plugins/artifact-production/src/domains/presentation/entries/cli/project-init.ts
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
    "tsconfig.json": `${JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", types: ["node"], resolveJsonModule: true, allowSyntheticDefaultImports: true, esModuleInterop: true, strict: false, noEmit: true }, include: ["src/**/*.ts"] }, null, 2)}
`,
    "plan.contract.json": `${JSON.stringify({ schema: PLAN_SCHEMA, artifactId, targetStage: "source", audience: { primary: "TODO", context: "TODO", desiredAction: "TODO", addressing: "implicit" }, objective: "TODO", language: "zh-CN", assumptions: [], communicationCore: { coreIntent: "Make one decision or argument easy to recover.", audienceOutcome: "The audience can repeat the deck's primary conclusion.", retellTarget: "This deck leads to one explicit decision.", signatureCue: { description: "The opening decision statement", semanticRole: "Primary narrative promise", anchors: ["slide:opening"] }, semanticLink: "The opening assertion exposes the decision the remaining slides must support.", invariants: ["every slide advances the same decision chain"], prohibitedDrift: ["isolated slides that do not contribute to the primary conclusion"] } }, null, 2)}
`,
    "plan.storyboard.json": `${JSON.stringify({ schema: STORYBOARD_SCHEMA, slides: [{ index: 1, id: "opening", displayTitle: "TODO", headline: { mode: "label" }, role: "opening", visual: { type: "hero", logic: "statement", variant: "statement" }, assertion: "This deck leads to one explicit decision.", narrativeJob: "state the decision", transition: "establish the question before supporting evidence", coreContribution: "States the exact retell target." }] }, null, 2)}
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
    "design.system.json": `${JSON.stringify({ schema: DESIGN_SYSTEM_SCHEMA, colors: { roles: { canvas: "FFFFFF", surface: "F5F7FA", textPrimary: "17202A", textSecondary: "4B5563", accent: "0067C5", success: "237B4B", warning: "9A6700", error: "B42318" }, charts: { categorical: ["0067C5", "D97706", "237B4B", "7C3AED"] } }, typography: { roles: { display: { fontFamily: "Arial", fontSizePt: 36, lineSpacingMultiple: 1.1, paragraphSpaceAfterPt: 0, charSpacingPt: 0, maxLines: 1, scriptPolicy: "mixed", horizontalAlign: "left", verticalAlign: "top", marginPt: 0 }, title: { fontFamily: "Arial", fontSizePt: 30, lineSpacingMultiple: 1.15, paragraphSpaceAfterPt: 0, charSpacingPt: 0, maxLines: 1, scriptPolicy: "mixed", horizontalAlign: "left", verticalAlign: "top", marginPt: 0 }, section: { fontFamily: "Arial", fontSizePt: 24, lineSpacingMultiple: 1.2, paragraphSpaceAfterPt: 4, charSpacingPt: 0, maxLines: 3, scriptPolicy: "mixed", horizontalAlign: "left", verticalAlign: "top", marginPt: 0 }, body: { fontFamily: "Arial", fontSizePt: 22, lineSpacingMultiple: 1.35, paragraphSpaceAfterPt: 6, charSpacingPt: 0, maxLines: 6, scriptPolicy: "mixed", horizontalAlign: "left", verticalAlign: "top", marginPt: 0 }, list: { fontFamily: "Arial", fontSizePt: 20, lineSpacingMultiple: 1.3, paragraphSpaceAfterPt: 6, charSpacingPt: 0, maxLines: 8, scriptPolicy: "mixed", horizontalAlign: "left", verticalAlign: "top", marginPt: 0 }, caption: { fontFamily: "Arial", fontSizePt: 14, lineSpacingMultiple: 1.3, paragraphSpaceAfterPt: 2, charSpacingPt: 0, maxLines: 3, scriptPolicy: "mixed", horizontalAlign: "left", verticalAlign: "top", marginPt: 0 }, numeric: { fontFamily: "Arial", fontSizePt: 28, lineSpacingMultiple: 1.1, paragraphSpaceAfterPt: 0, charSpacingPt: 0, maxLines: 2, scriptPolicy: "latin", horizontalAlign: "center", verticalAlign: "middle", marginPt: 0 } }, fallbacks: ["Arial", "Calibri"] }, spacing: { pageMarginIn: 0.5, baseUnitIn: 0.1, blockGapIn: 0.3 }, shape: { radiusIn: 0.08 }, antiPatterns: ["brief-leakage", "formulaic-headline-chain", "repeated-layout", "decorative-connector", "centered-faux-list", "autofit-text", "color-only-encoding", "text-only-slide"] }, null, 2)}
`,
    "pptx.project.json": `${JSON.stringify({ schema: PROJECT_SCHEMA, artifactId, layout: "LAYOUT_16X9", language: "zh-CN", entry: "src/deck.ts", slideManifest: "src/slides/manifest.json", designSystem: "design.system.json", outputs: { pptx: `dist/${artifactId}.pptx`, pdf: `dist/${artifactId}.pdf`, pages: "dist/pages" } }, null, 2)}
`,
    "src/theme.ts": 'import design from "../design.system.json" with { type: "json" };\nexport const theme = design;\n',
    "src/semantic-layout.ts": 'export type Bounds = { x: number; y: number; w: number; h: number };\nexport const semanticName = { title: (slideId: string, role: "display" | "title") => `pptx:title:${slideId}:${role}`, text: (slideId: string, role: string, id: string) => `pptx:text:${slideId}:${role}:${id}`, list: (slideId: string, groupId: string) => `pptx:list:${slideId}:list:${groupId}`, item: (slideId: string, role: string, groupId: string, index: number) => `pptx:item:${slideId}:${role}:${groupId}:${index}`, node: (slideId: string, nodeId: string, role: string) => `pptx:node:${slideId}:${nodeId}:${role}`, edge: (slideId: string, relationId: string, segment = 0) => `pptx:edge:${slideId}:${relationId}:${segment}`, marker: (slideId: string, relationId: string) => `pptx:marker:${slideId}:${relationId}`, separator: (slideId: string, id: string) => `pptx:separator:${slideId}:${id}`, matrix: (slideId: string, matrixId: string, rowId: string, columnId: string) => `pptx:matrix:${slideId}:${matrixId}:${rowId}:${columnId}:body`, comparison: (slideId: string, comparisonId: string, optionId: string, criterionId: string) => `pptx:comparison:${slideId}:${comparisonId}:${optionId}:${criterionId}:body`, metric: (slideId: string, metricId: string) => `pptx:metric:${slideId}:${metricId}:numeric` };\nexport function connectBounds(from: Bounds, to: Bounds) { const source = { x: from.x + from.w / 2, y: from.y + from.h / 2 }; const target = { x: to.x + to.w / 2, y: to.y + to.h / 2 }; const dx = target.x - source.x; const dy = target.y - source.y; if (!dx && !dy) throw new Error("CONNECTOR_NODES_OVERLAP"); const sourceScale = Math.min(dx ? (from.w / 2) / Math.abs(dx) : Infinity, dy ? (from.h / 2) / Math.abs(dy) : Infinity); const targetScale = Math.min(dx ? (to.w / 2) / Math.abs(dx) : Infinity, dy ? (to.h / 2) / Math.abs(dy) : Infinity); const start = { x: source.x + dx * sourceScale, y: source.y + dy * sourceScale }; const end = { x: target.x - dx * targetScale, y: target.y - dy * targetScale }; return { x: start.x, y: start.y, w: end.x - start.x, h: end.y - start.y }; }\n',
    "src/text-layout.ts": 'import type pptxgen from "pptxgenjs";\nimport { semanticName, type Bounds } from "./semantic-layout.js";\nimport { theme } from "./theme.js";\ntype Deck = InstanceType<typeof pptxgen>;\nexport type Slide = ReturnType<Deck["addSlide"]>;\ntype TextOptions = NonNullable<Parameters<Slide["addText"]>[1]>;\nexport type TypographyRole = keyof typeof theme.typography.roles;\ntype TextKind = "text" | "title" | "item";\nfunction options(role: TypographyRole, bounds: Bounds, objectName: string): TextOptions { const spec = theme.typography.roles[role]; return { ...bounds, objectName, fontFace: spec.fontFamily, fontSize: spec.fontSizePt, lineSpacingMultiple: spec.lineSpacingMultiple, paraSpaceAfter: spec.paragraphSpaceAfterPt, charSpacing: spec.charSpacingPt, align: spec.horizontalAlign as TextOptions["align"], valign: spec.verticalAlign as TextOptions["valign"], margin: spec.marginPt, breakLine: false }; }\nexport function addTextBlock(slide: Slide, slideId: string, id: string, text: string, role: TypographyRole, bounds: Bounds, kind: TextKind = "text", groupId?: string, itemIndex = 0) { const objectName = kind === "title" ? semanticName.title(slideId, role === "display" ? "display" : "title") : kind === "item" ? semanticName.item(slideId, role, String(groupId), itemIndex) : semanticName.text(slideId, role, id); slide.addText(text, options(role, bounds, objectName)); }\nfunction addList(slide: Slide, slideId: string, groupId: string, items: string[], bounds: Bounds, numbered: boolean) { slide.addText(items.join("\\n"), { ...options("list", bounds, semanticName.list(slideId, groupId)), bullet: numbered ? { type: "number" } : true }); }\nexport function addBulletList(slide: Slide, slideId: string, groupId: string, items: string[], bounds: Bounds) { addList(slide, slideId, groupId, items, bounds, false); }\nexport function addNumberedList(slide: Slide, slideId: string, groupId: string, items: string[], bounds: Bounds) { addList(slide, slideId, groupId, items, bounds, true); }\nexport function addAlignedStack(slide: Slide, slideId: string, groupId: string, items: Array<{ text: string; bounds: Bounds }>, role: TypographyRole = "body") { items.forEach((item, index) => addTextBlock(slide, slideId, groupId, item.text, role, item.bounds, "item", groupId, index)); }\nexport function addMatrixCell(slide: Slide, slideId: string, matrixId: string, rowId: string, columnId: string, text: string, bounds: Bounds) { slide.addText(text, options("body", bounds, semanticName.matrix(slideId, matrixId, rowId, columnId))); }\nexport function addComparisonCell(slide: Slide, slideId: string, comparisonId: string, optionId: string, criterionId: string, text: string, bounds: Bounds) { slide.addText(text, options("body", bounds, semanticName.comparison(slideId, comparisonId, optionId, criterionId))); }\nexport function addMetricValue(slide: Slide, slideId: string, metricId: string, value: number, unit: string, bounds: Bounds) { slide.addText(`${value}${unit}`, options("numeric", bounds, semanticName.metric(slideId, metricId))); }\n',
    "src/slides/manifest.json": `${JSON.stringify({ schema: SLIDE_MANIFEST_SCHEMA, slides: [{ index: 1, id: "opening", source: "001-opening.ts", displayTitle: "TODO", role: "opening", visual: { type: "hero", logic: "statement", variant: "statement" }, accessibility: { title: "TODO", altText: [], readingOrder: ["title"], colorEncoding: ["label"] } }] }, null, 2)}
`,
    "src/slides/001-opening.ts": 'import { addTextBlock, type Slide } from "../text-layout.js";\nimport { theme } from "../theme.js";\ntype Context = { theme: typeof theme; copy: { displayTitle: string }; entry: { id: string } };\nexport function renderSlide(slide: Slide, ctx: Context) {\n  slide.background = { color: ctx.theme.colors.roles.canvas };\n  addTextBlock(slide, ctx.entry.id, "display-title", ctx.copy.displayTitle, "display", { x: 0.7, y: 2.1, w: 8.6, h: 1.2 }, "title");\n}\n',
    "src/deck.ts": 'import { createHash } from "node:crypto";\nimport { readFile } from "node:fs/promises";\nimport { resolve } from "node:path";\nimport pptxgen from "pptxgenjs";\nimport { theme } from "./theme.js";\nconst outputFlag = process.argv.indexOf("--output");\nif (outputFlag < 0 || !process.argv[outputFlag + 1]) throw new Error("OUTPUT_REQUIRED");\nconst manifest = JSON.parse(await readFile(new URL("./slides/manifest.json", import.meta.url), "utf8"));\nconst storyboard = JSON.parse(await readFile(new URL("../plan.storyboard.json", import.meta.url), "utf8"));\nconst planned = new Map<string, any>(storyboard.slides.map((entry: any) => [String(entry.id), entry]));\nfunction unsafeSvg(svg: string) { if (/<\\s*(?:script|foreignObject|iframe|object|embed)\\b|\\bon\\w+\\s*=|@import\\b/iu.test(svg)) return true; for (const match of svg.matchAll(/(?:href|src)\\s*=\\s*["\']([^"\']*)["\']/giu)) if (!/^(?:#|data:image\\/(?:png|jpeg|gif|webp);base64,)/iu.test(match[1] || "")) return true; for (const match of svg.matchAll(/url\\(\\s*["\']?([^"\')\\s]+)["\']?\\s*\\)/giu)) if (!/^(?:#|data:(?:image|font)\\/)/iu.test(match[1] || "")) return true; return false; }\nasync function loadDiagram(entry: any) { const spec = planned.get(entry.id)?.visual; if (!spec || spec.type !== "diagram" || spec.mode !== "svg") return undefined; const svg = await readFile(new URL(`../${spec.asset}`, import.meta.url), "utf8"); if (createHash("sha256").update(svg).digest("hex") !== spec.sha256) throw new Error(`DIAGRAM_HASH_MISMATCH:${entry.id}`); if (!/^\\s*(?:<\\?xml[^>]*>\\s*)?<svg\\b/iu.test(svg) || unsafeSvg(svg)) throw new Error(`DIAGRAM_SVG_UNSAFE:${entry.id}`); return { svg, data: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, fit: spec.fit, takeaway: spec.takeaway, alt: spec.alt, sha256: spec.sha256 }; }\nconst deck = new pptxgen();\ndeck.layout = "LAYOUT_WIDE";\ndeck.author = "presentation-production";\nfor (const entry of manifest.slides) { const slide = deck.addSlide(); const module = await import(`./slides/${entry.source}`); module.renderSlide(slide, { theme, copy: { displayTitle: entry.displayTitle }, entry, diagram: await loadDiagram(entry) }); }\nawait deck.writeFile({ fileName: resolve(process.argv[outputFlag + 1]) });\n'
  };
  for (const [filePath, content] of Object.entries(files))
    await writeFile(join(root, filePath), content, { flag: "wx" });
  await runNpm(root);
  process.stdout.write(`${JSON.stringify({ artifactId, root })}
`);
}
await main().catch((error) => {
  process.stderr.write(
    `[pptx-project-init] ${error instanceof Error ? error.message : String(error)}
`
  );
  process.exitCode = 2;
});
