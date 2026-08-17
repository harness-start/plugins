#!/usr/bin/env node
// harness-source-hash: sha256:1a99b67afd74c65d95d81464d3201e20bfa4123e69f24b920c1be5cb984427ad
import {
  consumeWriterCapability,
  processWriterArgv
} from "../chunks/chunk-XLAB7OOT.mjs";
import {
  ART_DIRECTION_SCHEMA,
  ASSET_MANIFEST_SCHEMA,
  DESIGN_SYSTEM_SCHEMA,
  LAYER_MANIFEST_SCHEMA,
  PLAN_SCHEMA,
  POSTER_PROFILES,
  PROJECT_SCHEMA,
  SKILL_COMPOSITION_SCHEMA,
  VARIANT_MANIFEST_SCHEMA,
  assertPosterProjectRoot
} from "../chunks/chunk-77CKVA44.mjs";

// plugins/poster-production/src/entries/cli/project-init.ts
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
var PROFILE_DEFAULTS = {
  "regional-culture": { width: 1200, height: 1600, concept: "Translate one specific regional mechanism into a contemporary visual structure.", visualCenter: "One culturally grounded structure with controlled typography." },
  mondo: { width: 1080, height: 1920, concept: "Condense the subject into one original symbolic image with a limited screen-print palette.", visualCenter: "One symbolic focal object shaped by negative space." },
  editorial: { width: 1200, height: 1600, concept: "Build a type-led editorial page whose hierarchy follows the brief rather than a fixed template.", visualCenter: "A decisive headline and an asymmetric editorial grid." },
  academic: { width: 2400, height: 1200, concept: "Compress the research story into a distance-readable digital overview.", visualCenter: "One large explanatory figure with sparse supporting evidence." },
  custom: { width: 1200, height: 1600, concept: "Create an original digital poster from one explicit communication objective.", visualCenter: "One brief-specific focal relationship." }
};
function runNpm(root) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: root, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 18e4);
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
  const root = assertPosterProjectRoot(process.argv[2], { allowMissing: true });
  const grant = await consumeWriterCapability({ root, capability: "poster-init", argv: processWriterArgv() });
  const profileFlag = process.argv[3];
  const profile = process.argv[4];
  if (profileFlag !== "--profile" || !POSTER_PROFILES.includes(profile)) throw new Error("PROFILE_INVALID");
  const artifactId = basename(root);
  const defaults = PROFILE_DEFAULTS[profile];
  await mkdir(join(root, "src", "variants", "001-main", "layers"), { recursive: true });
  await mkdir(join(root, "data"), { recursive: true });
  const packageJson = {
    name: `poster-${artifactId}`,
    private: true,
    type: "module",
    scripts: { "poster:render": "tsx src/render.ts" },
    dependencies: { "@fontsource/noto-sans-sc": "5.3.0", "@resvg/resvg-js": "2.6.2", react: "19.2.8", satori: "0.29.0" },
    devDependencies: { "@types/react": "19.2.18", eslint: "9.39.5", tsx: "4.23.12", typescript: "6.0.3", "typescript-eslint": "8.67.0" }
  };
  const files = {
    ".gitignore": "node_modules/\n.cache/\n.tmp/\n",
    "package.json": `${JSON.stringify(packageJson, null, 2)}
`,
    "plan.contract.json": `${JSON.stringify({ schema: PLAN_SCHEMA, artifactId, profile, targetStage: "source", audience: "general digital audience", objective: `deliver an original ${profile} poster`, language: "zh-CN", assumptions: [] }, null, 2)}
`,
    "plan.art-direction.json": `${JSON.stringify({ schema: ART_DIRECTION_SCHEMA, profile, concept: defaults.concept, visualCenter: defaults.visualCenter, hierarchy: "one focal relationship, one headline, then restrained supporting information", typographyStrategy: "deterministic Noto Sans SC typography with role-based scale and spacing", colorRationale: "high-contrast semantic palette selected for the declared communication objective", negativeRules: ["tourism-collage", "pseudo-text", "unlicensed-assets", "artist-imitation"] }, null, 2)}
`,
    "plan.skill-composition.json": `${JSON.stringify({ schema: SKILL_COMPOSITION_SCHEMA, workers: [
      { name: "poster-regional-culture", status: "skipped" },
      { name: "poster-mondo", status: "skipped" },
      { name: "poster-academic", status: "skipped" },
      { name: "poster-visual-critique", status: "skipped" }
    ] }, null, 2)}
`,
    "plan.assets.json": `${JSON.stringify({ schema: ASSET_MANIFEST_SCHEMA, assets: [] }, null, 2)}
`,
    "design.system.json": `${JSON.stringify({ schema: DESIGN_SYSTEM_SCHEMA, colors: { canvas: "F4F0E8", textPrimary: "111111", textSecondary: "4A4A4A", accent: "C23B22" }, typography: { display: { family: "Noto Sans SC", sizePx: 96, weight: 700 }, body: { family: "Noto Sans SC", sizePx: 32, weight: 400 }, caption: { family: "Noto Sans SC", sizePx: 20, weight: 400 } }, spacing: { safeAreaPx: 72, baseUnitPx: 8 }, contrastPairs: [{ foreground: "textPrimary", background: "canvas", minimum: 4.5 }, { foreground: "textSecondary", background: "canvas", minimum: 4.5 }] }, null, 2)}
`,
    "poster.project.json": `${JSON.stringify({ schema: PROJECT_SCHEMA, artifactId, profile, entry: "src/render.ts", variantManifest: "src/variants/manifest.json", outputs: { svg: `dist/${artifactId}.<variant>.svg`, png: `dist/${artifactId}.<variant>.png` } }, null, 2)}
`,
    "src/variants/manifest.json": `${JSON.stringify({ schema: VARIANT_MANIFEST_SCHEMA, variants: [{ index: 1, id: "main", directory: "001-main", width: defaults.width, height: defaults.height }] }, null, 2)}
`,
    "src/variants/001-main/variant.json": `${JSON.stringify({ schema: "poster-production/variant/v2", id: "main", width: defaults.width, height: defaults.height, data: "data/main.json" }, null, 2)}
`,
    "src/variants/001-main/layers/manifest.json": `${JSON.stringify({ schema: LAYER_MANIFEST_SCHEMA, layers: [{ index: 1, role: "background", source: "001-background-base.tsx" }, { index: 2, role: "title", source: "002-title-primary.tsx" }] }, null, 2)}
`,
    "data/main.json": `${JSON.stringify({ title: artifactId.replaceAll("-", " ").toUpperCase(), subtitle: `${profile} digital poster` }, null, 2)}
`,
    "src/theme.ts": 'import design from "../design.system.json" with { type: "json" };\nexport const theme = design;\n',
    "src/compose.ts": 'import React from "react";\nexport function compose(width, height, children, canvas) { return React.createElement("div", { style: { display: "flex", position: "relative", width, height, overflow: "hidden", background: canvas } }, ...children); }\n',
    "src/variants/001-main/layers/001-background-base.tsx": 'import React from "react";\nexport function buildLayer(ctx) { return React.createElement("div", { style: { display: "flex", position: "absolute", inset: 0, background: `linear-gradient(145deg, #${ctx.theme.colors.canvas}, #D8CCBA)` } }); }\n',
    "src/variants/001-main/layers/002-title-primary.tsx": 'import React from "react";\nexport function buildLayer(ctx) { return React.createElement("div", { style: { display: "flex", position: "absolute", left: ctx.safe, right: ctx.safe, bottom: ctx.safe, flexDirection: "column", color: `#${ctx.theme.colors.textPrimary}` } }, React.createElement("div", { style: { fontSize: ctx.theme.typography.display.sizePx, fontWeight: 700, lineHeight: 1 } }, ctx.data.title), React.createElement("div", { style: { marginTop: 24, fontSize: ctx.theme.typography.body.sizePx, color: `#${ctx.theme.colors.textSecondary}` } }, ctx.data.subtitle)); }\n',
    "src/render.ts": 'import { mkdir, readFile, writeFile } from "node:fs/promises";\nimport { basename, join, resolve } from "node:path";\nimport React from "react";\nimport satori from "satori";\nimport { compose } from "./compose.js";\nimport { theme } from "./theme.js";\nconst flag = process.argv.indexOf("--output-dir");\nif (flag < 0 || !process.argv[flag + 1]) throw new Error("OUTPUT_DIR_REQUIRED");\nconst out = resolve(process.argv[flag + 1]);\nconst manifest = JSON.parse(await readFile(new URL("./variants/manifest.json", import.meta.url), "utf8"));\nconst fontRoot = resolve("node_modules/@fontsource/noto-sans-sc/files");\nconst fonts = await Promise.all([["noto-sans-sc-latin-400-normal.woff",400],["noto-sans-sc-chinese-simplified-400-normal.woff",400],["noto-sans-sc-latin-700-normal.woff",700],["noto-sans-sc-chinese-simplified-700-normal.woff",700]].map(async ([file, weight]) => ({ name: "Noto Sans SC", data: await readFile(join(fontRoot, String(file))), weight: Number(weight), style: "normal" })));\nfor (const variant of manifest.variants) { const base = new URL(`./variants/${variant.directory}/`, import.meta.url); const config = JSON.parse(await readFile(new URL("variant.json", base), "utf8")); const data = JSON.parse(await readFile(resolve(config.data), "utf8")); const layersManifest = JSON.parse(await readFile(new URL("layers/manifest.json", base), "utf8")); const children = []; await mkdir(join(out, "layers", variant.id), { recursive: true }); for (const layer of layersManifest.layers) { const module = await import(new URL(`layers/${layer.source}`, base).href); const child = module.buildLayer({ theme, data, variant, safe: theme.spacing.safeAreaPx }); children.push(child); const single = await satori(compose(variant.width, variant.height, [child], `#${theme.colors.canvas}`), { width: variant.width, height: variant.height, fonts }); await writeFile(join(out, "layers", variant.id, `${basename(layer.source, ".tsx")}.svg`), single); } await mkdir(join(out, "final"), { recursive: true }); const svg = await satori(compose(variant.width, variant.height, children, `#${theme.colors.canvas}`), { width: variant.width, height: variant.height, fonts }); await writeFile(join(out, "final", `${variant.id}.svg`), svg); }\n'
  };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), content, { flag: "wx" });
  }
  await runNpm(root);
  process.stdout.write(`${JSON.stringify({ artifactId, profile, root, sessionId: grant.sessionId })}
`);
}
main().catch((error) => {
  process.stderr.write(`[poster-project-init] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});
