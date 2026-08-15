#!/usr/bin/env node
// harness-source-hash: sha256:1ecafbd0352621e15e0b605402136b0ea866ca961edf865301c35a5fa8c3b975
import {
  assertLogoProjectRoot,
  loadLogoProject
} from "../chunks/chunk-QPTNINUP.mjs";
import {
  PLAN_SCHEMA,
  validateLogoModel
} from "../chunks/chunk-GKYXOIB4.mjs";

// plugins/logo-project-delivery-guard/src/entries/cli/project-stage.ts
import { rename, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
var root = resolve(process.argv[2] ?? "");
var targetStage = process.argv[3] ?? "";
var planPath = join(root, "plan.contract.json");
var temporaryPath = join(root, `.plan.contract.${process.pid}.tmp`);
async function main() {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(root))) throw new Error("project root must end in a kebab-case artifact id");
  await assertLogoProjectRoot(root);
  if (targetStage !== "release") throw new Error("only the monotonic source to release transition is supported");
  const model = await loadLogoProject(root);
  if (model.plan?.schema !== PLAN_SCHEMA || model.plan?.artifactId !== model.artifactId || model.plan?.targetStage !== "source") throw new Error("PLAN_TRANSITION_INVALID: current plan must be a bound source plan");
  const findings = validateLogoModel(model, { stage: "source" });
  if (findings.length > 0) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const next = { schema: PLAN_SCHEMA, artifactId: model.artifactId, targetStage: "release" };
  await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}
`, { flag: "wx" });
  await rename(temporaryPath, planPath);
  process.stdout.write(`[logo-project-stage] advanced ${model.artifactId} to release
`);
}
main().catch((error) => {
  process.stderr.write(`[logo-project-stage] ${error.message}
`);
  process.exitCode = 2;
});
