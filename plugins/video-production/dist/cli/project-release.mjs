#!/usr/bin/env node
// harness-source-hash: sha256:d965cd2a582f40ee1f8339821b06dc65aaa884c31454ec60256b506974a95454
import {
  consumeWriterCapability,
  createVideoReceipt,
  createVideoReleaseManifest,
  processWriterArgv,
  validateVideoModel,
  validateVideoReceipt
} from "../chunks/chunk-I5QNJF2A.mjs";
import "../chunks/chunk-FBXJEUPB.mjs";
import {
  assertVideoProjectRoot,
  atomicWriteJson,
  loadVideoProject,
  sessionMetadata,
  withWriterJournal
} from "../chunks/chunk-G5K7MSNN.mjs";

// plugins/video-production/src/entries/cli/project-release.ts
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
main().catch((error) => {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
  process.stderr.write(`[video-project-release] ${message}
`);
  process.exitCode = 2;
});
