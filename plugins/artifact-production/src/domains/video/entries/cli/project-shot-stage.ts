#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { consumeWriterCapability, processWriterArgv } from "../../lib/capability.js";
import { APPROVALS_SCHEMA, SHOT_PLAN_SCHEMA } from "../../lib/contract.js";
import {
  getShotRecipe,
  shotSourceFiles,
  SHOT_LIBRARY_UPSTREAM_COMMIT,
} from "../../lib/shot-library.js";
import { assertVideoProjectRoot, atomicWriteJson, withWriterJournal } from "../../lib/writer.js";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const errorCode = (error: unknown) => isRecord(error) && typeof error.code === "string" ? error.code : undefined;

async function readJson(root: string, relativePath: string): Promise<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(await readFile(join(root, relativePath), "utf8"));
  if (!isRecord(parsed)) throw new Error(`SHOT_STAGE_INPUT_INVALID:${relativePath}`);
  return parsed;
}

async function main() {
  const root = assertVideoProjectRoot(process.argv[2]);
  const grant = await consumeWriterCapability({ root, capability: "video-shot-stage", argv: processWriterArgv() });
  const beatId = process.argv[3] ?? "";
  const recipeId = process.argv[4] ?? "";
  const styleId = process.argv[5] ?? "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(beatId)) throw new Error("SHOT_BEAT_ID_INVALID");
  const selected = getShotRecipe(recipeId, styleId);
  if (selected.style.status !== "executable" || selected.style.upstreamPath === null || selected.style.sourceSha256 === null) throw new Error("SHOT_STYLE_REFERENCE_ONLY");

  const storyboard = await readJson(root, "plan.storyboard.json");
  const beats = Array.isArray(storyboard.beats) ? storyboard.beats.filter(isRecord) : [];
  const beat = beats.find((entry) => entry.id === beatId);
  if (!beat || !Number.isInteger(beat.startFrame) || !Number.isInteger(beat.endFrame) || Number(beat.endFrame) - Number(beat.startFrame) < 2) throw new Error("SHOT_BEAT_UNKNOWN_OR_TOO_SHORT");
  const shotPlan = await readJson(root, "plan.shots.json");
  if (shotPlan.schema !== SHOT_PLAN_SCHEMA || shotPlan.catalogRevision !== SHOT_LIBRARY_UPSTREAM_COMMIT || !Array.isArray(shotPlan.selections) || !Array.isArray(shotPlan.customBeats)) throw new Error("SHOT_PLAN_INVALID");
  const approvals = await readJson(root, "plan.approvals.json");
  if (approvals.schema !== APPROVALS_SCHEMA || !Array.isArray(approvals.gates)) throw new Error("APPROVALS_INVALID");
  const approvalGates = approvals.gates;

  const snapshotRoot = join(root, "references", "shot-recipes", beatId);
  try {
    await access(snapshotRoot);
    throw new Error("SHOT_STAGE_EXISTS");
  } catch (error) {
    if (errorCode(error) !== "ENOENT" && !(error instanceof Error && error.message === "SHOT_STAGE_EXISTS")) throw error;
    if (error instanceof Error && error.message === "SHOT_STAGE_EXISTS") throw error;
  }
  const sourcePaths = [...new Set([selected.style.upstreamPath, ...selected.style.dependencyPaths])].toSorted();
  const sources = shotSourceFiles(sourcePaths);
  const reviewFrames = [...new Set([
    Number(beat.startFrame),
    Math.floor((Number(beat.startFrame) + Number(beat.endFrame) - 1) / 2),
    Number(beat.endFrame) - 1,
  ])];
  const selection = {
    beatId,
    recipeId,
    styleId,
    usage: "adapted",
    adaptationNotes: "pending implementation adaptation",
    implementationPath: "",
    reviewFrames,
    upstreamPath: selected.style.upstreamPath,
    sourceSha256: selected.style.sourceSha256,
  };
  const nextSelections = [
    ...shotPlan.selections.filter((entry) => !isRecord(entry) || entry.beatId !== beatId),
    selection,
  ];
  const nextShotPlan = { ...shotPlan, selections: nextSelections, customBeats: shotPlan.customBeats.filter((entry) => !isRecord(entry) || entry.beatId !== beatId) };

  await withWriterJournal(root, "video-shot-stage", async () => {
    await mkdir(snapshotRoot, { recursive: true });
    await writeFile(join(snapshotRoot, "recipe.md"), selected.recipe.markdown, { flag: "wx" });
    await writeFile(join(snapshotRoot, "selection.json"), `${JSON.stringify({ catalogRevision: SHOT_LIBRARY_UPSTREAM_COMMIT, recipeId, styleId, upstreamPath: selected.style.upstreamPath, sourceSha256: selected.style.sourceSha256 }, null, 2)}\n`, { flag: "wx" });
    for (const [upstreamPath, source] of Object.entries(sources)) {
      const target = join(snapshotRoot, "source", upstreamPath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, source, { flag: "wx" });
    }
    await atomicWriteJson(root, "plan.shots.json", nextShotPlan);
    const script = await readFile(join(root, "plan.script.json"), "utf8");
    const storyboardText = await readFile(join(root, "plan.storyboard.json"), "utf8");
    const shotsText = `${JSON.stringify(nextShotPlan, null, 2)}\n`;
    const subjectSha256 = sha256(`plan.script.json\0${sha256(script)}\nplan.storyboard.json\0${sha256(storyboardText)}\nplan.shots.json\0${sha256(shotsText)}\n`);
    const gates = approvalGates.map((gate: unknown) => isRecord(gate) && gate.stage === "storyboard"
      ? { ...gate, status: "pending", actor: "", reason: "shot selection changed", subjectSha256 }
      : gate);
    await atomicWriteJson(root, "plan.approvals.json", { ...approvals, gates });
  }, grant);

  process.stdout.write(`${JSON.stringify({ beatId, recipeId, styleId, upstreamPath: selected.style.upstreamPath, sourceSha256: selected.style.sourceSha256, reviewFrames })}\n`);
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[video-project-shot-stage] ${message}\n`);
  process.exitCode = 2;
});
