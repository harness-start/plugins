#!/usr/bin/env node

import { lstat, mkdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { PACKAGE_SCHEMA, PLAN_SCHEMA, TRAINING_STAGES } from "../../lib/contract.js";
import { assertTrainingProjectRoot, atomicWriteJson, atomicWriteText } from "../../lib/writer.js";

function option(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? "" : fallback;
}

async function main() {
  const root = assertTrainingProjectRoot(process.argv[2], { allowMissing: true });
  const mode = option("--mode", "design");
  const targetStage = option("--target", "release");
  if (!new Set(["design", "adapt"]).has(mode)) throw new Error("MODE_INVALID");
  if (!new Set(TRAINING_STAGES).has(targetStage as (typeof TRAINING_STAGES)[number])) throw new Error("TARGET_STAGE_INVALID");
  try { await lstat(root); throw new Error("PROJECT_ALREADY_EXISTS"); } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
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
    assumptions: [],
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
    ...(mode === "adapt" ? { adaptationTrace: [] } : {}),
  });
  await atomicWriteText(root, ".gitignore", ".tmp/\n");
  process.stdout.write(`${JSON.stringify({ plugin: "training-program-design", artifactId, root: resolve(root), mode, targetStage })}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`[training-program-design:init] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
