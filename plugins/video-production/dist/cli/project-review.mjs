#!/usr/bin/env node
// harness-source-hash: sha256:b8305f8af386749bfbb45f0cc4fc226c875d2e7d3d86e27f6fa57b17998514e3
import {
  extractFrameDigest,
  mediaToolVersion
} from "../chunks/chunk-LFJ4A6PP.mjs";
import {
  ACCESSIBILITY_EVIDENCE_SCHEMA,
  FRAME_EVIDENCE_SCHEMA,
  REVIEW_INPUT_SCHEMA,
  VIDEO_REVIEW_SCHEMA,
  computeVideoSubjectDigest,
  consumeWriterCapability,
  finalRenderPaths,
  processWriterArgv,
  validateVideoModel
} from "../chunks/chunk-EHYWQCUA.mjs";
import "../chunks/chunk-CO5DQXUU.mjs";
import {
  assertVideoProjectRoot,
  atomicWriteJson,
  loadVideoProject,
  sessionMetadata,
  withWriterJournal
} from "../chunks/chunk-TCUX2XUZ.mjs";

// plugins/video-production/src/entries/cli/project-review.ts
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function prerequisiteFindings(model) {
  return validateVideoModel(model, { stage: "probe" }).filter(({ code }) => code !== "MUTATION_JOURNAL_OPEN");
}
function validateInput(input, model, currentSession) {
  const record = isRecord(input) ? input : {};
  const reviewer = isRecord(record.reviewer) ? record.reviewer : void 0;
  const checks = isRecord(record.checks) ? record.checks : void 0;
  const accessibility = isRecord(record.accessibility) ? record.accessibility : void 0;
  const { mediaPath } = finalRenderPaths(model);
  if (record.schema !== REVIEW_INPUT_SCHEMA || record.artifactId !== model.artifactId || record.outputSha256 !== model.digests?.[mediaPath] || record.verdict !== "pass") throw new Error("REVIEW_INPUT_INVALID");
  const reviewerKind = reviewer?.kind;
  if (typeof reviewerKind !== "string" || !["human", "independent-agent"].includes(reviewerKind) || typeof reviewer?.id !== "string" || !reviewer.id || typeof reviewer.sessionId !== "string" || !reviewer.sessionId) throw new Error("REVIEWER_INVALID");
  if (currentSession === "unknown") throw new Error("REVIEW_SESSION_UNAVAILABLE");
  const renderSessions = Object.entries(model.files ?? {}).filter(([filePath, value]) => filePath.endsWith(".proof.json") && typeof value === "string").map(([, value]) => {
    try {
      return JSON.parse(String(value));
    } catch {
      return null;
    }
  }).filter((proof) => isRecord(proof) && proof.schema === "video-production/render-proof/v1").map((proof) => isRecord(proof) ? proof.sessionId : void 0);
  if (renderSessions.includes(currentSession)) throw new Error("SELF_REVIEW_DENIED");
  if (reviewer.sessionId !== currentSession) throw new Error("REVIEW_SESSION_MISMATCH");
  const profile = isRecord(model.plan) ? model.plan.profile : void 0;
  const shotPlan = (() => {
    try {
      return JSON.parse(model.files?.["plan.shots.json"] ?? "null");
    } catch {
      return null;
    }
  })();
  const shotSelections = isRecord(shotPlan) && Array.isArray(shotPlan.selections) ? shotPlan.selections.filter(isRecord) : [];
  const requiredChecks = ["narrative", "pacing", "motionContinuity", "shotComposition", "typography", "color", "captions", "audio", "sourceIntegrity", "assetRights", "profileFidelity", ...shotSelections.length > 0 ? ["shotFidelity"] : [], ...profile === "reference-led" ? ["referenceFidelity"] : [], ...profile === "micro-drama" ? ["characterContinuity"] : []];
  if (!requiredChecks.every((key) => checks?.[key] === "pass")) throw new Error("PROFILE_REVIEW_INCOMPLETE");
  if (!["captionsReviewed", "flashingReviewed", "contrastReviewed"].every((key) => accessibility?.[key] === true)) throw new Error("ACCESSIBILITY_REVIEW_INCOMPLETE");
  const frames = Array.isArray(record.frames) ? [...new Set(record.frames)] : [];
  const duration = model.project?.durationInFrames ?? Number.NaN;
  const requiredShotFrames = shotSelections.flatMap((selection) => Array.isArray(selection.reviewFrames) ? selection.reviewFrames : []);
  if (frames.length < 3 || !frames.every((frame) => Number.isInteger(frame) && frame >= 0 && frame < duration) || !frames.includes(0) || !frames.includes(duration - 1) || !requiredShotFrames.every((frame) => frames.includes(frame))) throw new Error("FRAME_REVIEW_INCOMPLETE");
  return frames.sort((left, right) => left - right);
}
async function main() {
  const root = assertVideoProjectRoot(process.argv[2]);
  const grant = await consumeWriterCapability({ root, capability: "video-review", argv: processWriterArgv() });
  const inputPath = resolve(process.argv[3] ?? "");
  if (!isAbsolute(inputPath) || !relative(root, inputPath).startsWith("..") && relative(root, inputPath) !== "") throw new Error("REVIEW_INPUT_MUST_BE_EXTERNAL");
  const inputBytes = await readFile(inputPath);
  if (inputBytes.byteLength > 1024 * 1024) throw new Error("REVIEW_INPUT_SIZE_EXCEEDED");
  let input;
  try {
    input = JSON.parse(inputBytes.toString("utf8"));
  } catch {
    throw new Error("REVIEW_INPUT_JSON_INVALID");
  }
  const reviewInputSha256 = createHash("sha256").update(inputBytes).digest("hex");
  let model = await loadVideoProject(root);
  const findings = prerequisiteFindings(model);
  if (findings.length > 0) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const session = grant.sessionId;
  const frames = validateInput(input, model, session);
  const { mediaPath } = finalRenderPaths(model);
  const frameEvidence = [];
  const fps = model.project?.fps ?? Number.NaN;
  for (const frame of frames) frameEvidence.push(await extractFrameDigest(`${root}/${mediaPath}`, frame, fps, { cwd: root }));
  const tool = { name: "ffmpeg", version: await mediaToolVersion("ffmpeg") };
  const inputRecord = isRecord(input) ? input : {};
  const base = { plugin: "video-production", artifactId: model.artifactId, subjectDigest: computeVideoSubjectDigest(model), output: { path: mediaPath, sha256: model.digests?.[mediaPath] }, ...sessionMetadata("video-review", grant) };
  await withWriterJournal(root, "video-review", async () => {
    await atomicWriteJson(root, "evidence.frames.json", { schema: FRAME_EVIDENCE_SCHEMA, ...base, tool, frames: frameEvidence });
    await atomicWriteJson(root, "evidence.accessibility.json", { schema: ACCESSIBILITY_EVIDENCE_SCHEMA, ...base, verdict: "pass", checks: inputRecord.accessibility, reviewer: inputRecord.reviewer, reviewInputSha256, notes: inputRecord.notes ?? "" });
    model = await loadVideoProject(root);
    await atomicWriteJson(root, "review.video.json", { schema: VIDEO_REVIEW_SCHEMA, ...base, verdict: "pass", reviewer: inputRecord.reviewer, checks: inputRecord.checks, findings: inputRecord.findings ?? [], reviewInputSha256, frameEvidenceSha256: model.digests?.["evidence.frames.json"], accessibilityEvidenceSha256: model.digests?.["evidence.accessibility.json"], ...model.digests?.["evidence.shots.json"] ? { shotEvidenceSha256: model.digests["evidence.shots.json"] } : {}, notes: inputRecord.notes ?? "" });
  }, grant);
  process.stdout.write(`${JSON.stringify({ verdict: "pass", reviewer: inputRecord.reviewer })}
`);
}
main().catch((error) => {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
  process.stderr.write(`[video-project-review] ${message}
`);
  process.exitCode = 2;
});
