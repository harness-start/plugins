#!/usr/bin/env node
// harness-source-hash: sha256:270295f6dc4c44f7fd0084a824f37ca0fc45d0d63c0e4317eae40b7886d899f8
import {
  atomicWriteMusicJson,
  withMusicJournal
} from "../chunks/chunk-Z7MJWREE.mjs";
import {
  collectMusicModel
} from "../chunks/chunk-YJA6A3I4.mjs";
import {
  consumeMusicWriterCapability,
  processMusicWriterArgv
} from "../chunks/chunk-OG72MMCX.mjs";
import {
  PLAN_SCHEMA,
  computeMusicSubjectDigest,
  validateMusicModel,
  validateMusicReview
} from "../chunks/chunk-NMHJTGBI.mjs";

// plugins/music-production/src/entries/cli/project-stage.ts
import { resolve } from "node:path";
async function main() {
  const root = resolve(process.argv[2] ?? "");
  const target = process.argv[3] ?? "";
  const grant = await consumeMusicWriterCapability({ root, capability: "music-stage", argv: processMusicWriterArgv() });
  if (target !== "release") throw new Error("only source to release is supported");
  const model = await collectMusicModel(root);
  const subjectDigest = computeMusicSubjectDigest(model);
  if (grant.subjectDigest !== subjectDigest) throw new Error("WRITER_SUBJECT_CHANGED");
  const plan = JSON.parse(model.files?.["plan.contract.json"] ?? "null");
  if (plan.schema !== PLAN_SCHEMA || plan.artifactId !== model.artifactId || plan.targetStage !== "source") throw new Error("PLAN_TRANSITION_INVALID");
  const findings = [...validateMusicModel(model, { stage: "source" }), ...validateMusicReview(model, { requireApproved: true })];
  if (findings.length) throw new Error(findings.map((entry) => `${entry.code}:${entry.path}`).join(","));
  await withMusicJournal(root, "music-stage", grant, () => atomicWriteMusicJson(root, "plan.contract.json", { schema: PLAN_SCHEMA, artifactId: model.artifactId, targetStage: "release" }));
  process.stdout.write(`[music-project-stage] advanced ${model.artifactId} to release
`);
}
main().catch((error) => {
  process.stderr.write(`[music-project-stage] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});
