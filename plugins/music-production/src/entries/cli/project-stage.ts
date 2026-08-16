#!/usr/bin/env node

import { resolve } from "node:path";

import { consumeMusicWriterCapability, processMusicWriterArgv } from "../../lib/capability.js";
import { PLAN_SCHEMA, computeMusicSubjectDigest, validateMusicModel, validateMusicReview } from "../../lib/contract.js";
import { collectMusicModel } from "../../lib/release.js";
import { atomicWriteMusicJson, withMusicJournal } from "../../lib/writer.js";

async function main() {
  const root = resolve(process.argv[2] ?? "");
  const target = process.argv[3] ?? "";
  const grant = await consumeMusicWriterCapability({ root, capability: "music-stage", argv: processMusicWriterArgv() });
  if (target !== "release") throw new Error("only source to release is supported");
  const model = await collectMusicModel(root);
  const subjectDigest = computeMusicSubjectDigest(model);
  if (grant.subjectDigest !== subjectDigest) throw new Error("WRITER_SUBJECT_CHANGED");
  const plan = JSON.parse(model.files?.["plan.contract.json"] ?? "null") as Record<string, unknown>;
  if (plan.schema !== PLAN_SCHEMA || plan.artifactId !== model.artifactId || plan.targetStage !== "source") throw new Error("PLAN_TRANSITION_INVALID");
  const findings = [...validateMusicModel(model, { stage: "source" }), ...validateMusicReview(model, { requireApproved: true })];
  if (findings.length) throw new Error(findings.map((entry) => `${entry.code}:${entry.path}`).join(","));
  await withMusicJournal(root, "music-stage", grant, () => atomicWriteMusicJson(root, "plan.contract.json", { schema: PLAN_SCHEMA, artifactId: model.artifactId, targetStage: "release" }));
  process.stdout.write(`[music-project-stage] advanced ${model.artifactId} to release\n`);
}

main().catch((error: unknown) => { process.stderr.write(`[music-project-stage] ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; });
