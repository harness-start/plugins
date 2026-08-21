#!/usr/bin/env node
// harness-source-hash: sha256:25c3b20e216773127ae1a706c8f53f4af8a6e4638a0fdd649025ac196dcc9533
import {
  createRenderEvidence,
  renderTrainingMaterials
} from "../chunks/chunk-7KSW5WFB.mjs";
import {
  consumeWriterCapability,
  processWriterArgv
} from "../chunks/chunk-OWAZFFTS.mjs";
import {
  assertTrainingProjectRoot,
  atomicWriteJson,
  atomicWriteText,
  computeTrainingSubjectDigest,
  loadTrainingProject,
  validateTrainingModel,
  withWriterJournal
} from "../chunks/chunk-DHFCXL5N.mjs";

// plugins/training-program-design/src/entries/cli/project-render.ts
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
main().catch((error) => {
  process.stderr.write(`[training-program-design:render] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 1;
});
