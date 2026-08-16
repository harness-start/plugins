#!/usr/bin/env node
// harness-source-hash: sha256:1deb377332db5d9c89b57dce5ad89b6ccfcf0897b36cf63af3c00bbe3bcf6642
import {
  APPROVALS_SCHEMA,
  ASSET_MANIFEST_SCHEMA,
  DESIGN_SYSTEM_SCHEMA,
  DIRECTION_SCHEMA,
  PLAN_SCHEMA,
  PROJECT_SCHEMA,
  REFERENCES_SCHEMA,
  SCRIPT_SCHEMA,
  SKILL_COMPOSITION_SCHEMA,
  STORYBOARD_SCHEMA,
  VIDEO_PROFILES,
  consumeWriterCapability,
  processWriterArgv
} from "../chunks/chunk-SLRENGEQ.mjs";
import {
  assertVideoProjectRoot
} from "../chunks/chunk-JEPGOY6Q.mjs";

// plugins/video-project-delivery-guard/src/entries/cli/project-init.ts
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
var PROFILE_DEFAULTS = {
  "motion-explainer": { width: 1920, height: 1080, fps: 30, durationInFrames: 1800, platform: "web" },
  "product-promo": { width: 1920, height: 1080, fps: 30, durationInFrames: 900, platform: "web" },
  "short-form": { width: 1080, height: 1920, fps: 30, durationInFrames: 900, platform: "short-form" },
  "talking-head": { width: 1080, height: 1920, fps: 30, durationInFrames: 1800, platform: "short-form" },
  "reference-led": { width: 1920, height: 1080, fps: 30, durationInFrames: 900, platform: "web" },
  "micro-drama": { width: 1080, height: 1920, fps: 30, durationInFrames: 1800, platform: "short-form" }
};
var WORKERS = [
  ["motion-art-direction", "3c129f769d90a1328c209c386492333c9ac62312", "advisor"],
  ["animation-principles", "3c129f769d90a1328c209c386492333c9ac62312", "advisor"],
  ["beat-sync-editing", "3c129f769d90a1328c209c386492333c9ac62312", "advisor"],
  ["color-motion", "3c129f769d90a1328c209c386492333c9ac62312", "advisor"],
  ["shot-composition", "3c129f769d90a1328c209c386492333c9ac62312", "advisor"],
  ["explainer-video", "3e2d411b725d9a72939cf8e5eb81579e751373e7", "advisor"],
  ["short-form-video", "2a775336b5a638cbf8a61dbd785f9a1b649be016", "advisor"],
  ["caption-animation", "2a775336b5a638cbf8a61dbd785f9a1b649be016", "advisor"],
  ["product-launch-video", "9de027d1947ce8f8b60ccf70aa89e482bf80ecea", "advisor"],
  ["gemini-tts", "9de027d1947ce8f8b60ccf70aa89e482bf80ecea", "external-runner"],
  ["chengfeng-cut", "2e51611965af6e6b8baea3bfc82995b5c9e8f5ef", "external-runner"],
  ["chengfeng-subtitle", "2e51611965af6e6b8baea3bfc82995b5c9e8f5ef", "external-runner"],
  ["model-selector", "b4ceecc4ca27ded6b6f542b04ac756bf5bd7816d", "advisor"],
  ["prompt-translator", "b4ceecc4ca27ded6b6f542b04ac756bf5bd7816d", "advisor"],
  ["seedance-storyboard", "b4ceecc4ca27ded6b6f542b04ac756bf5bd7816d", "advisor"],
  ["impeccable", "5a149f3fdb1b5793f10567233b1dcab98fc305fd", "advisor"]
];
var sha256 = (value) => createHash("sha256").update(value).digest("hex");
var json = (value) => `${JSON.stringify(value, null, 2)}
`;
function generateLockfile(root) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: root, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 18e4);
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 1024 * 1024) stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`NPM_UNAVAILABLE:${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`NPM_LOCK_FAILED:${stderr.trim()}`));
    });
  });
}
async function main() {
  const root = assertVideoProjectRoot(process.argv[2]);
  const grant = await consumeWriterCapability({ root, capability: "video-init", argv: processWriterArgv() });
  const profileFlag = process.argv[3];
  const profile = process.argv[4];
  const modeFlag = process.argv[5];
  const mode = process.argv[6];
  if (profileFlag !== "--profile" || !VIDEO_PROFILES.includes(profile) || modeFlag !== "--mode" || !["guided", "autonomous"].includes(mode ?? "")) throw new Error("INIT_ARGUMENTS_INVALID");
  const existing = (await readdir(root)).filter((name) => name !== ".tmp");
  if (existing.length > 0) throw new Error("PROJECT_ROOT_NOT_EMPTY");
  const artifactId = basename(root);
  const defaults = PROFILE_DEFAULTS[profile];
  const direction = json({ schema: DIRECTION_SCHEMA, motionThesis: `Show ${artifactId} changing from an initial state to a resolved outcome.`, visualMetaphor: "one continuous visual system", narrativeArc: "hook, mechanism, proof, resolution", motionGrammar: ["transform", "route", "resolve"], negativeRules: ["slide-deck pacing", "decorative motion", "unlicensed media", "credential files"] });
  const script = json({ schema: SCRIPT_SCHEMA, beats: [], claims: [] });
  const storyboard = json({ schema: STORYBOARD_SCHEMA, beats: [] });
  const assets = json({ schema: ASSET_MANIFEST_SCHEMA, assets: [] });
  const storyboardDigest = sha256(`plan.script.json\0${sha256(script)}
plan.storyboard.json\0${sha256(storyboard)}
`);
  const files = {
    ".gitignore": "node_modules/\n.cache/\n.tmp/\n",
    "package.json": json({ name: `video-${artifactId}`, private: true, type: "module", scripts: { "video:render:visual": "node tools/render-visual.mjs", "video:render:audio": "node tools/render-audio.mjs", "video:render:final": "remotion render src/index.ts Main" }, dependencies: { remotion: "4.0.512", "@remotion/cli": "4.0.512", react: "19.2.8", "react-dom": "19.2.8" }, devDependencies: { "@types/react": "19.2.18", "@types/react-dom": "19.2.3", typescript: "6.0.3" } }),
    "plan.contract.json": json({ schema: PLAN_SCHEMA, artifactId, profile, mode, targetStage: "source", audience: "general audience", objective: `deliver an original ${profile} video`, platform: defaults.platform, language: "zh-CN", assumptions: [], externalBudget: { currency: "USD", limit: 0, spent: 0 } }),
    "plan.direction.json": direction,
    "plan.script.json": script,
    "plan.storyboard.json": storyboard,
    "plan.skill-composition.json": json({ schema: SKILL_COMPOSITION_SCHEMA, workers: WORKERS.map(([name, revision, workerMode]) => ({ name, revision, mode: workerMode, status: "skipped" })) }),
    "plan.assets.json": assets,
    "plan.approvals.json": json({ schema: APPROVALS_SCHEMA, mode, gates: [{ stage: "direction", status: "pending", subjectSha256: sha256(direction), actor: "", reason: "" }, { stage: "storyboard", status: "pending", subjectSha256: storyboardDigest, actor: "", reason: "" }, { stage: "assets", status: "pending", subjectSha256: sha256(assets), actor: "", reason: "" }] }),
    "plan.references.json": json({ schema: REFERENCES_SCHEMA, references: [] }),
    "design.system.json": json({ schema: DESIGN_SYSTEM_SCHEMA, colors: { canvas: "#101114", text: "#f7f7f5", accent: "#5eead4" }, typography: { displayPx: 96, bodyPx: 42, captionPx: 36 }, safeAreaPx: 80, motion: { enterFrames: 15, exitFrames: 12, easing: "ease-out" }, captions: { maxCharsPerSecond: 20, maxLines: 2 }, audio: { integratedLufs: -16, truePeakDb: -1 } }),
    "video.project.json": json({ schema: PROJECT_SCHEMA, artifactId, profile, compositionId: "Main", durationInFrames: defaults.durationInFrames, fps: defaults.fps, width: defaults.width, height: defaults.height }),
    "src/index.ts": 'import { registerRoot } from "remotion";\nimport { Root } from "./Root.js";\nregisterRoot(Root);\n',
    "src/Root.tsx": `import React from "react";
import { Composition } from "remotion";
import { Video } from "./Video.js";
export const Root = () => <Composition id="Main" component={Video} durationInFrames={${defaults.durationInFrames}} fps={${defaults.fps}} width={${defaults.width}} height={${defaults.height}} />;
`,
    "src/Video.tsx": 'import React from "react";\nimport { VisualTimeline } from "./timelines/VisualTimeline.js";\nimport { AudioTimeline } from "./timelines/AudioTimeline.js";\nimport { CaptionTimeline } from "./timelines/CaptionTimeline.js";\nexport const Video = () => <><VisualTimeline/><AudioTimeline/><CaptionTimeline/></>;\n',
    "src/timelines/VisualTimeline.tsx": 'import manifest from "../visual/manifest.json" with { type: "json" };\nexport const VisualTimeline = () => manifest.units.length > 0 ? null : null;\n',
    "src/timelines/AudioTimeline.tsx": 'import manifest from "../audio/manifest.json" with { type: "json" };\nexport const AudioTimeline = () => manifest.units.length > 0 ? null : null;\n',
    "src/timelines/CaptionTimeline.tsx": 'import manifest from "../captions/manifest.json" with { type: "json" };\nexport const CaptionTimeline = () => manifest.units.length > 0 ? null : null;\n',
    "src/visual/manifest.json": json({ units: [] }),
    "src/audio/manifest.json": json({ units: [] }),
    "src/captions/manifest.json": json({ units: [] }),
    "tools/render-visual.mjs": 'throw new Error("IMPLEMENT_VIDEO_VISUAL_RENDERER");\n',
    "tools/render-audio.mjs": 'throw new Error("IMPLEMENT_VIDEO_AUDIO_RENDERER");\n'
  };
  for (const [relativePath, content] of Object.entries(files)) {
    await mkdir(join(root, relativePath, ".."), { recursive: true });
    await writeFile(join(root, relativePath), content, { flag: "wx" });
  }
  await generateLockfile(root);
  process.stdout.write(`${JSON.stringify({ artifactId, profile, mode, root, sessionId: grant.sessionId })}
`);
}
main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[video-project-init] ${message}
`);
  process.exitCode = 2;
});
