#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";

import { consumeWriterCapability, processWriterArgv } from "../../lib/capability.js";
import { validateVideoModel } from "../../lib/contract.js";
import { probeMedia } from "../../lib/media.js";
import { hashFile, loadVideoProject } from "../../lib/project.js";
import { assertVideoProjectRoot, atomicWriteJson, sessionMetadata, withWriterJournal } from "../../lib/writer.js";

const RUN_SCHEMA = "video-production/external-run/v1";
const ADMISSION_SCHEMA = "video-production/admission/v1";
const ALLOWED_EXTENSIONS: Record<string, Set<string>> = {
  image: new Set([".jpg", ".jpeg", ".png", ".webp"]),
  audio: new Set([".aac", ".m4a", ".mp3", ".wav"]),
  video: new Set([".mov", ".mp4", ".webm"]),
  subtitle: new Set([".json", ".srt", ".vtt"]),
  font: new Set([".otf", ".ttf", ".woff", ".woff2"]),
};
const MAX_ASSET_BYTES = 2 * 1024 * 1024 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

async function main() {
  const root = assertVideoProjectRoot(process.argv[2]);
  const grant = await consumeWriterCapability({ root, capability: "video-admit", argv: processWriterArgv() });
  const manifestPath = resolve(process.argv[3] ?? "");
  if (!isAbsolute(process.argv[3] ?? "") || (!relative(root, manifestPath).startsWith("..") && relative(root, manifestPath) !== "")) throw new Error("ADMISSION_MANIFEST_MUST_BE_EXTERNAL");
  const manifestMetadata = await lstat(manifestPath);
  if (!manifestMetadata.isFile() || manifestMetadata.isSymbolicLink() || manifestMetadata.size > 1024 * 1024) throw new Error("ADMISSION_MANIFEST_INVALID");
  const manifestBytes = await readFile(manifestPath);
  let input: unknown;
  try { input = JSON.parse(manifestBytes.toString("utf8")) as unknown; } catch { throw new Error("ADMISSION_MANIFEST_JSON_INVALID"); }
  const run = isRecord(input) ? input : {};
  const skill = isRecord(run.skill) ? run.skill : {};
  const provider = isRecord(run.provider) ? run.provider : {};
  const cost = isRecord(run.cost) ? run.cost : {};
  const outputs = Array.isArray(run.outputs) ? run.outputs : [];
  if (run.schema !== RUN_SCHEMA || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(String(run.runId)) || typeof skill.name !== "string" || !/^[a-f0-9]{40}$/u.test(String(skill.revision)) || skill.mode !== "external-runner" || typeof provider.name !== "string" || typeof provider.model !== "string" || typeof cost.currency !== "string" || typeof cost.amount !== "number" || cost.amount < 0 || outputs.length === 0) throw new Error("ADMISSION_MANIFEST_INVALID");
  let model = await loadVideoProject(root);
  const prerequisiteFindings = validateVideoModel(model, { stage: "assets" }).filter(({ code, path }) => ![
    "ASSET_FILE_MISSING", "ASSET_ADMISSION_MISSING", "MUTATION_JOURNAL_OPEN",
  ].includes(code) || !outputs.some((output) => isRecord(output) && path === `public/admitted/${basename(String(output.path))}`));
  if (prerequisiteFindings.length > 0) throw new Error(prerequisiteFindings.map(({ code, path }) => `${code}:${path}`).join(", "));
  if (run.artifactId !== model.artifactId) throw new Error("ADMISSION_ARTIFACT_MISMATCH");
  const plan = isRecord(model.plan) ? model.plan : {};
  const budget = isRecord(plan.externalBudget) ? plan.externalBudget : {};
  if (cost.currency !== budget.currency || Number(cost.amount) > Number(budget.limit) || Number(budget.spent) > Number(budget.limit) || Number(cost.amount) + Number(budget.spent) > Number(budget.limit)) throw new Error("ADMISSION_BUDGET_EXCEEDED");
  const composition = JSON.parse(model.files?.["plan.skill-composition.json"] ?? "null") as unknown;
  const workers = isRecord(composition) && Array.isArray(composition.workers) ? composition.workers : [];
  const worker = workers.find((entry) => isRecord(entry) && entry.name === skill.name);
  if (!isRecord(worker) || worker.revision !== skill.revision || worker.mode !== "external-runner" || worker.status !== "used") throw new Error("ADMISSION_WORKER_NOT_DECLARED");
  const assetManifest = JSON.parse(model.files?.["plan.assets.json"] ?? "null") as unknown;
  const assets = isRecord(assetManifest) && Array.isArray(assetManifest.assets) ? assetManifest.assets : [];
  const prepared: Array<{ assetId: string; kind: string; sourcePath: string; targetPath: string; digest: string; bytes: number; media: unknown }> = [];
  const outputAssetIds = new Set<string>();
  const outputTargets = new Set<string>();
  for (const output of outputs) {
    if (!isRecord(output) || typeof output.assetId !== "string" || typeof output.path !== "string" || !isAbsolute(output.path)) throw new Error("ADMISSION_OUTPUT_INVALID");
    const sourcePath = resolve(output.path);
    if (!relative(root, sourcePath).startsWith("..")) throw new Error("ADMISSION_OUTPUT_MUST_BE_EXTERNAL");
    const asset = assets.find((entry) => isRecord(entry) && entry.id === output.assetId);
    if (!isRecord(asset) || asset.source !== "external-run" || asset.runId !== run.runId || typeof asset.path !== "string" || typeof asset.kind !== "string" || typeof asset.rights !== "string" || !asset.rights.trim()) throw new Error("ADMISSION_ASSET_NOT_DECLARED");
    const extension = extname(sourcePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS[asset.kind]?.has(extension) || asset.path !== `public/admitted/${basename(sourcePath)}`) throw new Error("ADMISSION_MEDIA_TYPE_DENIED");
    if (outputAssetIds.has(output.assetId) || outputTargets.has(asset.path)) throw new Error("ADMISSION_OUTPUT_DUPLICATE");
    outputAssetIds.add(output.assetId);
    outputTargets.add(asset.path);
    const metadata = await lstat(sourcePath);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size <= 0 || metadata.size > MAX_ASSET_BYTES) throw new Error("ADMISSION_OUTPUT_INVALID");
    const measured = await hashFile(sourcePath, { maxBytes: MAX_ASSET_BYTES });
    if (typeof output.sha256 === "string" && output.sha256 !== measured.digest) throw new Error("ADMISSION_DIGEST_MISMATCH");
    const media = ["audio", "video"].includes(asset.kind) ? await probeMedia(sourcePath, { fps: model.project?.fps, cwd: dirname(sourcePath) }) : null;
    prepared.push({ assetId: output.assetId, kind: asset.kind, sourcePath, targetPath: asset.path, digest: measured.digest, bytes: measured.bytes, media });
  }
  const runId = String(run.runId);
  await withWriterJournal(root, "video-admit", async () => {
    for (const output of prepared) {
      const target = join(root, output.targetPath);
      await mkdir(dirname(target), { recursive: true });
      const temporary = join(root, ".tmp", "video-guard", `${basename(target)}.${process.pid}.admit`);
      await copyFile(output.sourcePath, temporary);
      const copied = await hashFile(temporary, { maxBytes: MAX_ASSET_BYTES });
      if (copied.digest !== output.digest) { await unlink(temporary).catch(() => {}); throw new Error("ADMISSION_COPY_DIGEST_MISMATCH"); }
      await rename(temporary, target);
    }
    await atomicWriteJson(root, `evidence/admissions/${runId}.json`, {
      schema: ADMISSION_SCHEMA,
      plugin: "video-production",
      artifactId: model.artifactId,
      runId,
      manifest: { path: manifestPath, sha256: sha256(manifestBytes) },
      skill,
      provider,
      cost,
      outputs: prepared.map(({ sourcePath: _sourcePath, ...output }) => ({ ...output, path: output.targetPath })),
      provenance: "declared",
      ...sessionMetadata("video-admit", grant),
    });
  }, grant);
  model = await loadVideoProject(root);
  process.stdout.write(`${JSON.stringify({ runId, evidenceSha256: model.digests?.[`evidence/admissions/${runId}.json`], outputs: prepared.map(({ targetPath }) => targetPath) })}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[video-project-admit] ${message}\n`);
  process.exitCode = 2;
});
