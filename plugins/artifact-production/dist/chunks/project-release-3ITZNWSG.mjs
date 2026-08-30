#!/usr/bin/env node
// harness-source-hash: sha256:aa55e37b578bd1016a6403462a3f72057de2a4fa7baa3013af84343c8e6ab3f1
import {
  consumeWriterCapability,
  createVideoReceipt,
  createVideoReleaseManifest,
  processWriterArgv,
  validateVideoModel,
  validateVideoReceipt
} from "./chunk-JR67HQKB.mjs";
import {
  assertVideoProjectRoot,
  atomicWriteJson,
  loadVideoProject,
  sessionMetadata,
  withWriterJournal
} from "./chunk-FWVDQCJK.mjs";
import "./chunk-UVFAL34S.mjs";
import "./chunk-XFYUIVLB.mjs";
import "./chunk-TPU7ENF4.mjs";
import "./chunk-64RZK2M5.mjs";

// plugins/artifact-production/src/domains/video/entries/cli/project-release.ts
function beforeManifestFindings(model) {
  const allowed = /* @__PURE__ */ new Set(["RELEASE_MANIFEST_INVALID", "RECEIPT_INVALID", "RELEASE_PATH_MISSING", "MUTATION_JOURNAL_OPEN"]);
  return validateVideoModel(model, { stage: "release" }).filter(({ code, path }) => !allowed.has(code) || code === "RELEASE_PATH_MISSING" && !["release.manifest.json", "receipt.release.json"].includes(path));
}
async function main() {
  const root = assertVideoProjectRoot(process.argv[2]);
  const grant = await consumeWriterCapability({ root, capability: "video-release", argv: processWriterArgv() });
  let model = await loadVideoProject(root);
  const findings = beforeManifestFindings(model);
  if (findings.length > 0) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const review = JSON.parse(model.files?.["review.video.json"] ?? "null");
  if (typeof review === "object" && review !== null && "sessionId" in review && review.sessionId === grant.sessionId) throw new Error("REVIEW_RELEASE_SESSION_COLLISION");
  await withWriterJournal(root, "video-release", async () => {
    await atomicWriteJson(root, "release.manifest.json", createVideoReleaseManifest(model));
    model = await loadVideoProject(root);
    const manifestFindings = validateVideoModel(model, { stage: "release" }).filter(({ code, path }) => !["MUTATION_JOURNAL_OPEN", "RECEIPT_INVALID"].includes(code) && !(code === "RELEASE_PATH_MISSING" && path === "receipt.release.json"));
    if (manifestFindings.length > 0) throw new Error(manifestFindings.map(({ code, path }) => `${code}:${path}`).join(", "));
    const receipt = { ...createVideoReceipt(model), ...sessionMetadata("video-release", grant) };
    await atomicWriteJson(root, "receipt.release.json", receipt);
    model = await loadVideoProject(root);
    if (!validateVideoReceipt(model)) throw new Error("WRITTEN_RECEIPT_INVALID");
    process.stdout.write(`${JSON.stringify(receipt)}
`);
  }, grant);
}
await main().catch((error) => {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
  process.stderr.write(`[video-project-release] ${message}
`);
  process.exitCode = 2;
});
