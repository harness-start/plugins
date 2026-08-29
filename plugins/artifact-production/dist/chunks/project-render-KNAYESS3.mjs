#!/usr/bin/env node
// harness-source-hash: sha256:230430fd2f48ea30b2238a97dd35e0ddd2522d1a741868ea1450333d3e33c83b
import {
  createRenderEvidence,
  renderTrainingMaterials
} from "./chunk-WI3F535F.mjs";
import {
  consumeWriterCapability,
  processWriterArgv
} from "./chunk-ITT6467U.mjs";
import {
  assertTrainingProjectRoot,
  atomicWriteJson,
  atomicWriteText,
  computeTrainingSubjectDigest,
  loadTrainingProject,
  validateTrainingModel,
  withWriterJournal
} from "./chunk-7ME2TRRS.mjs";
import "./chunk-IE4NLJBE.mjs";
import "./chunk-HL4EEBT7.mjs";

// plugins/artifact-production/src/domains/training/entries/cli/project-render.ts
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
  process.stdout.write(`${JSON.stringify({ plugin: "training-program-design", artifactId: model.artifactId, stage: "materials", status: "rendered" })}
`);
}
await main().catch((error) => {
  process.stderr.write(`[training-program-design:render] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 1;
});
