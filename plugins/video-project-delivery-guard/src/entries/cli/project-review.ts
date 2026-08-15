#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";

import { ACCESSIBILITY_EVIDENCE_SCHEMA, FRAME_EVIDENCE_SCHEMA, VIDEO_REVIEW_SCHEMA, computeVideoSubjectDigest, finalRenderPaths, validateVideoModel } from "../../lib/contract.js";
import { consumeWriterCapability, processWriterArgv } from "../../lib/capability.js";
import { extractFrameDigest, mediaToolVersion } from "../../lib/media.js";
import { loadVideoProject } from "../../lib/project.js";
import { assertVideoProjectRoot, atomicWriteJson, sessionMetadata, withWriterJournal } from "../../lib/writer.js";

function prerequisiteFindings(model) {
  const allowed = new Set(["ACCESSIBILITY_EVIDENCE_INVALID", "FRAME_EVIDENCE_INVALID", "VIDEO_REVIEW_INVALID", "RELEASE_MANIFEST_INVALID", "RECEIPT_INVALID", "RELEASE_PATH_MISSING", "MUTATION_JOURNAL_OPEN"]);
  return validateVideoModel(model, { stage: "release" }).filter(({ code }) => !allowed.has(code));
}

function validateInput(input, model, currentSession) {
  const { mediaPath } = finalRenderPaths(model);
  if (input?.schema !== "video-project-delivery-guard/review-input/v1" || input?.artifactId !== model.artifactId || input?.outputSha256 !== model.digests[mediaPath] || input?.verdict !== "pass") throw new Error("REVIEW_INPUT_INVALID");
  if (!["human", "independent-agent"].includes(input?.reviewer?.kind) || typeof input?.reviewer?.id !== "string" || !input.reviewer.id || typeof input?.reviewer?.sessionId !== "string" || !input.reviewer.sessionId) throw new Error("REVIEWER_INVALID");
  if (currentSession === "unknown") throw new Error("REVIEW_SESSION_UNAVAILABLE");
  const renderSessions = Object.entries(model.files)
    .filter(([filePath, value]) => filePath.endsWith(".proof.json") && typeof value === "string")
    .map(([, value]) => { try { return JSON.parse(value); } catch { return null; } })
    .filter((proof) => proof?.schema === "video-project-delivery-guard/render-proof/v1")
    .map((proof) => proof?.sessionId);
  if (renderSessions.includes(currentSession)) throw new Error("SELF_REVIEW_DENIED");
  if (input.reviewer.sessionId !== currentSession) throw new Error("REVIEW_SESSION_MISMATCH");
  if (!["captionsReviewed", "flashingReviewed", "contrastReviewed"].every((key) => input?.checks?.[key] === true)) throw new Error("ACCESSIBILITY_REVIEW_INCOMPLETE");
  const frames = Array.isArray(input?.frames) ? [...new Set(input.frames)] : [];
  if (frames.length < 3 || !frames.every((frame) => Number.isInteger(frame) && frame >= 0 && frame < model.project.durationInFrames) || !frames.includes(0) || !frames.includes(model.project.durationInFrames - 1)) throw new Error("FRAME_REVIEW_INCOMPLETE");
  return frames.sort((left, right) => left - right);
}

async function main() {
  const root = assertVideoProjectRoot(process.argv[2]);
  const grant = await consumeWriterCapability({ root, capability: "video-review", argv: processWriterArgv() });
  const inputPath = resolve(process.argv[3] ?? "");
  if (!isAbsolute(inputPath) || (!relative(root, inputPath).startsWith("..") && relative(root, inputPath) !== "")) throw new Error("REVIEW_INPUT_MUST_BE_EXTERNAL");
  const inputBytes = await readFile(inputPath);
  if (inputBytes.byteLength > 1024 * 1024) throw new Error("REVIEW_INPUT_SIZE_EXCEEDED");
  let input;
  try { input = JSON.parse(inputBytes.toString("utf8")); } catch { throw new Error("REVIEW_INPUT_JSON_INVALID"); }
  const reviewInputSha256 = createHash("sha256").update(inputBytes).digest("hex");
  let model = await loadVideoProject(root);
  const findings = prerequisiteFindings(model);
  if (findings.length > 0) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const session = grant.sessionId;
  const frames = validateInput(input, model, session);
  const { mediaPath } = finalRenderPaths(model);
  const frameEvidence = [];
  for (const frame of frames) frameEvidence.push(await extractFrameDigest(`${root}/${mediaPath}`, frame, model.project.fps, { cwd: root }));
  const tool = { name: "ffmpeg", version: await mediaToolVersion("ffmpeg") };
  const base = { plugin: "video-project-delivery-guard", artifactId: model.artifactId, subjectDigest: computeVideoSubjectDigest(model), output: { path: mediaPath, sha256: model.digests[mediaPath] }, ...sessionMetadata("video-review", grant) };
  await withWriterJournal(root, "video-review", async () => {
    await atomicWriteJson(root, "evidence.frames.json", { schema: FRAME_EVIDENCE_SCHEMA, ...base, tool, frames: frameEvidence });
    await atomicWriteJson(root, "evidence.accessibility.json", { schema: ACCESSIBILITY_EVIDENCE_SCHEMA, ...base, verdict: "pass", checks: input.checks, reviewer: input.reviewer, reviewInputSha256, notes: input.notes ?? "" });
    model = await loadVideoProject(root);
    await atomicWriteJson(root, "review.video.json", { schema: VIDEO_REVIEW_SCHEMA, ...base, verdict: "pass", reviewer: input.reviewer, reviewInputSha256, frameEvidenceSha256: model.digests["evidence.frames.json"], accessibilityEvidenceSha256: model.digests["evidence.accessibility.json"], notes: input.notes ?? "" });
  }, grant);
  process.stdout.write(`${JSON.stringify({ verdict: "pass", reviewer: input.reviewer })}\n`);
}

main().catch((error) => { process.stderr.write(`[video-project-review] ${error.message}\n`); process.exitCode = 2; });
