#!/usr/bin/env node
// harness-source-hash: sha256:253573a0f3bd6ecb6a919d8e9ce5b3cd54c5fb70cc95b2a32088d75ee36cc981
import {
  createRenderEvidence,
  renderTrainingMaterials
} from "./chunk-6QQOWDDN.mjs";
import {
  consumeWriterCapability,
  processWriterArgv
} from "./chunk-JRYP525B.mjs";
import {
  assertTrainingProjectRoot,
  atomicWriteJson,
  atomicWriteText,
  computeTrainingSubjectDigest,
  loadTrainingProject,
  validateTrainingModel,
  withWriterJournal
} from "./chunk-FB5OFMZ2.mjs";
import "./chunk-7LRQYS6E.mjs";
import "./chunk-ACZGLWAJ.mjs";

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
