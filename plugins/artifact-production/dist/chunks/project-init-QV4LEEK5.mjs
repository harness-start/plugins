#!/usr/bin/env node
// harness-source-hash: sha256:094ae85928967976215355a7d8cc86aa39fa623154b1006d53784ddde5b76db8
import {
  PACKAGE_SCHEMA,
  PLAN_SCHEMA,
  TRAINING_STAGES,
  assertTrainingProjectRoot,
  atomicWriteJson,
  atomicWriteText
} from "./chunk-GG4VJ3T5.mjs";
import "./chunk-QTVEXSL5.mjs";

// plugins/artifact-production/src/domains/training/entries/cli/project-init.ts
import { lstat, mkdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? "" : fallback;
}
async function main() {
  const root = assertTrainingProjectRoot(process.argv[2], { allowMissing: true });
  const mode = option("--mode", "design");
  const targetStage = option("--target", "release");
  if (!(/* @__PURE__ */ new Set(["design", "adapt"])).has(mode)) throw new Error("MODE_INVALID");
  if (!new Set(TRAINING_STAGES).has(targetStage)) throw new Error("TARGET_STAGE_INVALID");
  try {
    await lstat(root);
    throw new Error("PROJECT_ALREADY_EXISTS");
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : void 0;
    if (error instanceof Error && error.message === "PROJECT_ALREADY_EXISTS") throw error;
    if (code !== "ENOENT") throw error;
  }
  await mkdir(dirname(root), { recursive: true });
  await mkdir(root);
  const artifactId = basename(root);
  await atomicWriteJson(root, "plan.contract.json", {
    schema: PLAN_SCHEMA,
    artifactId,
    mode,
    targetStage,
    audience: "TODO",
    objective: "TODO",
    durationMinutes: 60,
    modality: "TODO",
    language: "zh-CN",
    assumptions: []
  });
  await atomicWriteJson(root, "training-package.json", {
    schema: PACKAGE_SCHEMA,
    title: "TODO",
    audience: { sharedBaseline: "TODO", variability: [], diagnostic: "TODO" },
    outcomes: [],
    agenda: [],
    activities: [],
    assessments: [],
    followUp: [],
    sources: [],
    ...mode === "adapt" ? { adaptationTrace: [] } : {}
  });
  await atomicWriteText(root, ".gitignore", ".tmp/\n");
  process.stdout.write(`${JSON.stringify({ plugin: "training-program-design", artifactId, root: resolve(root), mode, targetStage })}
`);
}
await main().catch((error) => {
  process.stderr.write(`[training-program-design:init] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 1;
});
