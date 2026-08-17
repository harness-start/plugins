#!/usr/bin/env node
// harness-source-hash: sha256:c4bc04f6dfe354ec49816370ec57b2bacf7e93976285208a91a8bf2e364648c5
import {
  consumeWriterCapability,
  processWriterArgv
} from "../chunks/chunk-YXENWX4D.mjs";
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
} from "../chunks/chunk-CDKX2DFZ.mjs";

// plugins/poster-production/src/entries/cli/project-init.ts
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
var PROFILE_DEFAULTS = {
  "regional-culture": {
    width: 1200,
    height: 1600,
    concept: "Translate one specific regional mechanism into a contemporary visual structure.",
    visualCenter: "One culturally grounded structure with controlled typography.",
    dominantAxis: "vertical",
    massToVoidTarget: { min: 0.08, max: 0.55 }
  },
  mondo: {
    width: 1080,
    height: 1920,
    concept: "Condense the subject into one original symbolic image with a limited screen-print palette.",
    visualCenter: "One symbolic focal object shaped by negative space.",
    dominantAxis: "vertical",
    massToVoidTarget: { min: 0.08, max: 0.55 }
  },
  editorial: {
    width: 1200,
    height: 1600,
    concept: "Build a type-led editorial page whose hierarchy follows the brief rather than a fixed template.",
    visualCenter: "A decisive headline and an asymmetric editorial grid.",
    dominantAxis: "asymmetric-grid",
    massToVoidTarget: { min: 0.03, max: 0.5 }
  },
  academic: {
    width: 2400,
    height: 1200,
    concept: "Compress the research story into a distance-readable digital overview.",
    visualCenter: "One large explanatory figure with sparse supporting evidence.",
    dominantAxis: "horizontal",
    massToVoidTarget: { min: 0.12, max: 0.68 }
  },
  custom: {
    width: 1200,
    height: 1600,
    concept: "Create an original digital poster from one explicit communication objective.",
    visualCenter: "One brief-specific focal relationship.",
    dominantAxis: "asymmetric-grid",
    massToVoidTarget: { min: 0.03, max: 0.65 }
  }
};
function runNpm(root) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npm",
      ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
      { cwd: root, stdio: ["ignore", "ignore", "pipe"] }
    );
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
  const grant = await consumeWriterCapability({
    root,
    capability: "poster-init",
    argv: processWriterArgv()
  });
  const profileFlag = process.argv[3];
  const profile = process.argv[4];
  if (profileFlag !== "--profile" || !POSTER_PROFILES.includes(profile))
    throw new Error("PROFILE_INVALID");
  const artifactId = basename(root);
  const defaults = PROFILE_DEFAULTS[profile];
  await mkdir(join(root, "src", "variants", "001-main", "layers"), {
    recursive: true
  });
  await mkdir(join(root, "data"), { recursive: true });
  const packageJson = {
    name: `poster-${artifactId}`,
    private: true,
    type: "module",
    scripts: { "poster:render": "tsx src/render.ts" },
    dependencies: {
      "@fontsource/noto-sans-sc": "5.3.0",
      "@resvg/resvg-js": "2.6.2",
      react: "19.2.8",
      satori: "0.29.0"
    },
    devDependencies: {
      "@types/react": "19.2.18",
      eslint: "9.39.5",
      tsx: "4.23.12",
      typescript: "6.0.3",
      "typescript-eslint": "8.67.0"
    }
  };
  const files = {
    ".gitignore": "node_modules/\n.cache/\n.tmp/\n",
    "package.json": `${JSON.stringify(packageJson, null, 2)}
`,
    "plan.contract.json": `${JSON.stringify({ schema: PLAN_SCHEMA, artifactId, profile, targetStage: "source", audience: "general digital audience", objective: `deliver an original ${profile} poster`, language: "zh-CN", assumptions: [] }, null, 2)}
`,
    "plan.art-direction.json": `${JSON.stringify({ schema: ART_DIRECTION_SCHEMA, profile, brief: { audience: "general digital audience", objective: `deliver an original ${profile} poster`, environment: "mobile feed and desktop editorial listing" }, constraints: { mustKeep: ["exact authored copy", "declared focal layer"], mayChange: ["crop", "scale", "spacing"], avoid: ["pseudo-text", "unlicensed assets"] }, concept: defaults.concept, visualCenter: defaults.visualCenter, hierarchy: "one focal relationship, one headline, then restrained supporting information", typographyStrategy: "deterministic role-based typography with measured line height, tracking, and line length", colorRationale: "high-contrast semantic palette selected for the declared communication objective", letterform: { typeClass: "geometric sans", strokeProfile: "uniform with role-based weight", structure: "stable editorial gravity", edgeFinish: "clean vector", sceneReference: `${profile} digital communication` }, composition: { dominantAxis: defaults.dominantAxis, focalRelationship: defaults.visualCenter, massToVoidTarget: defaults.massToVoidTarget, primaryFocalLayer: "title-primary", focalBox: { x: 0.05, y: 0.48, width: 0.9, height: 0.47 }, quietRegions: [{ id: "upper-air", box: { x: 0, y: 0, width: 1, height: 0.35 }, maxOccupancy: 0.05 }], titleMediaRelation: { depth: "separate", mechanism: "none" } }, material: { primary: "uncoated editorial paper", surfaceResponse: "soft diffuse surface with restrained grain" }, lighting: { direction: "upper-left", quality: "soft and even", contrast: "controlled" }, negativeRules: ["tourism-collage", "pseudo-text", "unlicensed-assets", "artist-imitation"] }, null, 2)}
`,
    "plan.skill-composition.json": `${JSON.stringify(
      {
        schema: SKILL_COMPOSITION_SCHEMA,
        workers: [
          { name: "poster-regional-culture", status: "skipped" },
          { name: "poster-mondo", status: "skipped" },
          { name: "poster-academic", status: "skipped" },
          { name: "poster-visual-critique", status: "skipped" }
        ]
      },
      null,
      2
    )}
`,
    "plan.assets.json": `${JSON.stringify({ schema: ASSET_MANIFEST_SCHEMA, assets: [] }, null, 2)}
`,
    "design.system.json": `${JSON.stringify(
      {
        schema: DESIGN_SYSTEM_SCHEMA,
        colors: {
          tokens: { canvas: "F4F0E8", textPrimary: "111111", textSecondary: "4A4A4A", accent: "C23B22" },
          core: "accent",
          structuralRoles: { canvas: "canvas", primaryText: "textPrimary", secondaryText: "textSecondary", accent: "accent" },
          scenarios: [{ id: "default", roles: { canvas: "canvas", primaryText: "textPrimary", secondaryText: "textSecondary", accent: "accent" } }]
        },
        typography: {
          display: {
            families: { cjk: "Noto Sans SC", latin: "Noto Sans SC" },
            hierarchy: 1,
            orientation: "horizontal",
            alignment: "left",
            trackingPolicy: "neutral CJK with measured Latin tracking",
            sizePx: 96,
            weight: 700,
            lineHeightPx: 104,
            letterSpacingEm: 0,
            maxWidthPx: Math.round(defaults.width * 0.78),
            maxLines: 3,
            scriptPolicy: "mixed"
          },
          body: {
            families: { cjk: "Noto Sans SC", latin: "Noto Sans SC" },
            hierarchy: 2,
            orientation: "horizontal",
            alignment: "left",
            trackingPolicy: "compact CJK and restrained Latin tracking",
            sizePx: 32,
            weight: 400,
            lineHeightPx: 46,
            letterSpacingEm: 0.02,
            maxWidthPx: Math.round(defaults.width * 0.62),
            maxLines: 6,
            scriptPolicy: "mixed"
          },
          caption: {
            families: { cjk: "Noto Sans SC", latin: "Noto Sans SC" },
            hierarchy: 3,
            orientation: "horizontal",
            alignment: "left",
            trackingPolicy: "neutral CJK and optically spaced Latin captions",
            sizePx: 20,
            weight: 400,
            lineHeightPx: 30,
            letterSpacingEm: 0.02,
            maxWidthPx: Math.round(defaults.width * 0.5),
            maxLines: 3,
            scriptPolicy: "mixed"
          }
        },
        fontRegistry: [
          {
            family: "Noto Sans SC",
            package: "@fontsource/noto-sans-sc",
            files: [
              {
                path: "noto-sans-sc-latin-400-normal.woff",
                weight: 400,
                script: "latin"
              },
              {
                path: "noto-sans-sc-chinese-simplified-400-normal.woff",
                weight: 400,
                script: "cjk"
              },
              {
                path: "noto-sans-sc-latin-700-normal.woff",
                weight: 700,
                script: "latin"
              },
              {
                path: "noto-sans-sc-chinese-simplified-700-normal.woff",
                weight: 700,
                script: "cjk"
              }
            ]
          }
        ],
        spacing: { safeAreaPx: 72, baseUnitPx: 8, paragraphGapPx: 24 },
        contrastPairs: [
          { foreground: "textPrimary", background: "canvas", minimum: 4.5 },
          { foreground: "textSecondary", background: "canvas", minimum: 4.5 }
        ]
      },
      null,
      2
    )}
`,
    "poster.project.json": `${JSON.stringify({ schema: PROJECT_SCHEMA, artifactId, profile, entry: "src/render.ts", variantManifest: "src/variants/manifest.json", outputs: { svg: `dist/${artifactId}.<variant>.svg`, png: `dist/${artifactId}.<variant>.png` } }, null, 2)}
`,
    "src/variants/manifest.json": `${JSON.stringify({ schema: VARIANT_MANIFEST_SCHEMA, variants: [{ index: 1, id: "main", directory: "001-main", width: defaults.width, height: defaults.height, colorScenario: "default" }] }, null, 2)}
`,
    "src/variants/001-main/variant.json": `${JSON.stringify({ schema: "poster-production/variant/v3", id: "main", width: defaults.width, height: defaults.height, data: "data/main.json", colorScenario: "default" }, null, 2)}
`,
    "src/variants/001-main/layers/manifest.json": `${JSON.stringify(
      {
        schema: LAYER_MANIFEST_SCHEMA,
        layers: [
          { index: 1, id: "background-base", role: "background", visualRole: "background", source: "001-background-base.tsx" },
          { index: 2, id: "title-primary", role: "title", visualRole: "title", typographyRole: "display", source: "002-title-primary.tsx" },
          { index: 3, id: "body-supporting", role: "body", visualRole: "body", typographyRole: "body", source: "003-body-supporting.tsx" }
        ]
      },
      null,
      2
    )}
`,
    "data/main.json": `${JSON.stringify({ title: artifactId.replaceAll("-", " ").toUpperCase(), subtitle: `${profile} digital poster` }, null, 2)}
`,
    "src/theme.ts": 'import design from "../design.system.json" with { type: "json" };\nexport const theme = design;\n',
    "src/compose.ts": 'import React from "react";\nexport function compose(width, height, children, canvas) { return React.createElement("div", { style: { display: "flex", position: "relative", width, height, overflow: "hidden", background: canvas } }, ...children); }\n',
    "src/variants/001-main/layers/001-background-base.tsx": 'import React from "react";\nexport function buildLayer(ctx) { return React.createElement("div", { style: { display: "flex", position: "absolute", inset: 0, background: `#${ctx.theme.colors.tokens[ctx.theme.colors.structuralRoles.canvas]}` } }); }\n',
    "src/variants/001-main/layers/002-title-primary.tsx": 'import React from "react";\nexport function buildLayer(ctx) { const display = ctx.theme.typography.display; const tokens = ctx.theme.colors.tokens; const roles = ctx.theme.colors.structuralRoles; return React.createElement("div", { style: { display: "flex", position: "absolute", left: ctx.safe, right: ctx.safe, bottom: ctx.safe + ctx.theme.typography.body.lineHeightPx + ctx.theme.spacing.paragraphGapPx, color: `#${tokens[roles.primaryText]}`, maxWidth: display.maxWidthPx, fontSize: display.sizePx, fontWeight: display.weight, lineHeight: `${display.lineHeightPx}px`, letterSpacing: `${display.letterSpacingEm}em` } }, ctx.data.title); }\n',
    "src/variants/001-main/layers/003-body-supporting.tsx": 'import React from "react";\nexport function buildLayer(ctx) { const body = ctx.theme.typography.body; const tokens = ctx.theme.colors.tokens; const roles = ctx.theme.colors.structuralRoles; return React.createElement("div", { style: { display: "flex", position: "absolute", left: ctx.safe, right: ctx.safe, bottom: ctx.safe, maxWidth: body.maxWidthPx, fontSize: body.sizePx, fontWeight: body.weight, lineHeight: `${body.lineHeightPx}px`, letterSpacing: `${body.letterSpacingEm}em`, color: `#${tokens[roles.secondaryText]}` } }, ctx.data.subtitle); }\n',
    "src/render.ts": 'import { mkdir, readFile, writeFile } from "node:fs/promises";\nimport { basename, join, resolve } from "node:path";\nimport React from "react";\nimport satori from "satori";\nimport { compose } from "./compose.js";\nimport { theme } from "./theme.js";\nconst flag = process.argv.indexOf("--output-dir");\nif (flag < 0 || !process.argv[flag + 1]) throw new Error("OUTPUT_DIR_REQUIRED");\nconst out = resolve(process.argv[flag + 1]);\nconst manifest = JSON.parse(await readFile(new URL("./variants/manifest.json", import.meta.url), "utf8"));\nconst fonts = await Promise.all(theme.fontRegistry.flatMap((font) => font.files.map(async (file) => ({ name: font.family, data: await readFile(resolve("node_modules", font.package, "files", file.path)), weight: Number(file.weight), style: "normal" }))));\nfor (const variant of manifest.variants) { const base = new URL(`./variants/${variant.directory}/`, import.meta.url); const config = JSON.parse(await readFile(new URL("variant.json", base), "utf8")); const data = JSON.parse(await readFile(resolve(config.data), "utf8")); const layersManifest = JSON.parse(await readFile(new URL("layers/manifest.json", base), "utf8")); const children = []; const canvas = `#${theme.colors.tokens[theme.colors.structuralRoles.canvas]}`; await mkdir(join(out, "layers", variant.id), { recursive: true }); for (const layer of layersManifest.layers) { const module = await import(new URL(`layers/${layer.source}`, base).href); const child = module.buildLayer({ theme, data, variant, safe: theme.spacing.safeAreaPx }); children.push(child); const single = await satori(compose(variant.width, variant.height, [child], canvas), { width: variant.width, height: variant.height, fonts }); await writeFile(join(out, "layers", variant.id, `${basename(layer.source, ".tsx")}.svg`), single); } await mkdir(join(out, "final"), { recursive: true }); const svg = await satori(compose(variant.width, variant.height, children, canvas), { width: variant.width, height: variant.height, fonts }); await writeFile(join(out, "final", `${variant.id}.svg`), svg); }\n'
  };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), content, { flag: "wx" });
  }
  await runNpm(root);
  process.stdout.write(
    `${JSON.stringify({ artifactId, profile, root, sessionId: grant.sessionId })}
`
  );
}
main().catch((error) => {
  process.stderr.write(
    `[poster-project-init] ${error instanceof Error ? error.message : String(error)}
`
  );
  process.exitCode = 2;
});
