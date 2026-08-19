#!/usr/bin/env node
// harness-source-hash: sha256:85b13c2563bdc59fda6a978b54a670ea3995eff826a4b0880d4dd0c0892b9729
import {
  createRenderEvidence,
  renderTrainingMaterials
} from "../chunks/chunk-DUFV7B3H.mjs";
import {
  consumeWriterCapability,
  processWriterArgv
} from "../chunks/chunk-32HEFPD2.mjs";
import {
  assertTrainingProjectRoot,
  atomicWriteJson,
  atomicWriteText,
  computeTrainingSubjectDigest,
  loadTrainingProject,
  validateTrainingModel,
  withWriterJournal
} from "../chunks/chunk-WWIPRB2V.mjs";

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
