#!/usr/bin/env node
// harness-source-hash: sha256:aa55e37b578bd1016a6403462a3f72057de2a4fa7baa3013af84343c8e6ab3f1
import {
  atomicWriteMusicJson,
  withMusicJournal
} from "./chunk-AFFXS23Z.mjs";
import {
  collectMusicModel
} from "./chunk-7UJIJAAR.mjs";
import {
  consumeMusicWriterCapability,
  processMusicWriterArgv
} from "./chunk-5QBXLGQD.mjs";
import {
  PLAN_SCHEMA,
  computeMusicSubjectDigest,
  validateMusicModel,
  validateMusicReview
} from "./chunk-E3W34T5Q.mjs";
import "./chunk-PNL4PTHT.mjs";
import "./chunk-XFYUIVLB.mjs";
import "./chunk-64RZK2M5.mjs";

// plugins/artifact-production/src/domains/music/entries/cli/project-stage.ts
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
await main().catch((error) => {
  process.stderr.write(`[music-project-stage] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});
