#!/usr/bin/env node
// harness-source-hash: sha256:0c9603a9b2462caf0217503d1d0d8c3689f2a3bfe3e623086067cd7377286b10
import {
  withWriterJournal
} from "../chunks/chunk-G3R5ML2A.mjs";
import {
  consumeWriterCapability,
  processWriterArgv
} from "../chunks/chunk-VS5OSNEI.mjs";
import {
  PLAN_SCHEMA,
  computeLogoSubjectDigest,
  validateLogoModel
} from "../chunks/chunk-77RZFMEG.mjs";
import {
  assertLogoProjectRoot,
  loadLogoProject
} from "../chunks/chunk-TLWPTCGP.mjs";

// plugins/brand-logo-production/src/entries/cli/project-stage.ts
import { rename, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
function planField(plan, key) {
  return typeof plan === "object" && plan !== null && !Array.isArray(plan) ? plan[key] : void 0;
}
var root = resolve(process.argv[2] ?? "");
var targetStage = process.argv[3] ?? "";
var planPath = join(root, "plan.contract.json");
var temporaryPath = join(root, `.plan.contract.${process.pid}.tmp`);
async function main() {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(root))) throw new Error("project root must end in a kebab-case artifact id");
  await assertLogoProjectRoot(root);
  const grant = await consumeWriterCapability({ root, capability: "logo-stage", argv: processWriterArgv() });
  if (targetStage !== "release") throw new Error("only the monotonic source to release transition is supported");
  const model = await loadLogoProject(root);
  if (grant.subjectDigest !== computeLogoSubjectDigest(model)) throw new Error("WRITER_SUBJECT_CHANGED");
  if (planField(model.plan, "schema") !== PLAN_SCHEMA || planField(model.plan, "artifactId") !== model.artifactId || planField(model.plan, "targetStage") !== "source") throw new Error("PLAN_TRANSITION_INVALID: current plan must be a bound source plan");
  const findings = validateLogoModel(model, { stage: "source" });
  if (findings.length > 0) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const next = { schema: PLAN_SCHEMA, artifactId: model.artifactId, targetStage: "release" };
  await withWriterJournal(root, "logo-stage", grant, async () => {
    await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}
`, { flag: "wx" });
    await rename(temporaryPath, planPath);
  });
  process.stdout.write(`[logo-project-stage] advanced ${model.artifactId} to release
`);
}
main().catch((error) => {
  process.stderr.write(`[logo-project-stage] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});
