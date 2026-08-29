#!/usr/bin/env node

import { consumeWriterCapability, processWriterArgv } from "../../lib/capability.js";
import { computeTrainingSubjectDigest, loadTrainingProject, validateTrainingModel } from "../../lib/contract.js";
import { createRenderEvidence, renderTrainingMaterials } from "../../lib/pipeline.js";
import { assertTrainingProjectRoot, atomicWriteJson, atomicWriteText, withWriterJournal } from "../../lib/writer.js";

async function main() {
  const root = assertTrainingProjectRoot(process.argv[2]);
  const grant = await consumeWriterCapability({ root, capability: "training-render", argv: processWriterArgv() });
  const model = await loadTrainingProject(root);
  if (grant.subjectDigest !== computeTrainingSubjectDigest(model)) throw new Error("WRITER_SUBJECT_STALE");
  const findings = validateTrainingModel(model, { stage: "design" });
  if (findings.length > 0) throw new Error(`DESIGN_INVALID:${findings.map((item) => item.code).join(",")}`);
  await withWriterJournal(root, "training-render", async () => {
    for (const [path, content] of Object.entries(renderTrainingMaterials(model))) await atomicWriteText(root, path, content);
    const rendered = await loadTrainingProject(root);
    await atomicWriteJson(root, "evidence.render.json", createRenderEvidence(rendered));
  }, grant);
  process.stdout.write(`${JSON.stringify({ plugin: "training-program-design", artifactId: model.artifactId, stage: "materials", status: "rendered" })}\n`);
}

await main().catch((error: unknown) => {
  process.stderr.write(`[training-program-design:render] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
