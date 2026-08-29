#!/usr/bin/env node
// harness-source-hash: sha256:370f9db476cbb0b946700bec5fe34c55a297fe8308b5bd733a1c0d3b4f4ce5e7
import {
  atomicWriteJson,
  sessionMetadata,
  withWriterJournal
} from "../chunks/chunk-GPVYZE6U.mjs";
import {
  consumeWriterCapability,
  processWriterArgv
} from "../chunks/chunk-DBLB772I.mjs";
import {
  computeLogoSubjectDigest,
  createLogoReceipt,
  createLogoReleaseManifest,
  validateLogoModel,
  validateLogoReceipt
} from "../chunks/chunk-IOV4IKM6.mjs";
import {
  assertLogoProjectRoot,
  loadLogoProject
} from "../chunks/chunk-WS3HCX7P.mjs";

// plugins/artifact-production/modules/logo/src/entries/cli/project-release.ts
import { resolve } from "node:path";
var planField = (plan, key) => typeof plan === "object" && plan !== null && !Array.isArray(plan) ? plan[key] : void 0;
async function main() {
  const root = await assertLogoProjectRoot(resolve(process.argv[2] ?? ""));
  const grant = await consumeWriterCapability({ root, capability: "logo-release", argv: processWriterArgv() });
  let model = await loadLogoProject(root);
  if (grant.subjectDigest !== computeLogoSubjectDigest(model)) throw new Error("WRITER_SUBJECT_CHANGED");
  if (planField(model.plan, "targetStage") !== "release") throw new Error("RELEASE_STAGE_NOT_REQUESTED");
  let review = {};
  try {
    review = JSON.parse(String(model.files["review.logo.json"]));
  } catch {
  }
  const reviewer = typeof review.reviewer === "object" && review.reviewer !== null ? review.reviewer : {};
  if (reviewer.sessionId === grant.sessionId) throw new Error("SELF_RELEASE_REVIEW_DENIED");
  const findings = validateLogoModel(model, { stage: "release" }).filter(({ path, code }) => !["release.manifest.json", "receipt.release.json"].includes(path) && code !== "RECEIPT_INVALID");
  if (findings.length) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const receipt = await withWriterJournal(root, "logo-release", grant, async () => {
    await atomicWriteJson(root, "release.manifest.json", createLogoReleaseManifest(model));
    model = await loadLogoProject(root);
    const payload = { ...createLogoReceipt(model), ...sessionMetadata("logo-release", grant) };
    await atomicWriteJson(root, "receipt.release.json", payload);
    const finalModel = await loadLogoProject(root);
    const finalFindings = validateLogoModel(finalModel, { stage: "release" }).filter(({ code }) => code !== "MUTATION_JOURNAL_OPEN");
    if (finalFindings.length || !validateLogoReceipt(finalModel)) throw new Error(finalFindings.map(({ code, path }) => `${code}:${path}`).join(", ") || "written receipt did not verify against current files");
    return payload;
  });
  process.stdout.write(`${JSON.stringify(receipt)}
`);
}
main().catch((error) => {
  process.stderr.write(`[logo-project-release] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});
