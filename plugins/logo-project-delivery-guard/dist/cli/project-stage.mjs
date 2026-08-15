#!/usr/bin/env node
// harness-source-hash: sha256:8b6d710d6cd2226c331b93c4ff7254d225a172129e4624386a97285798320362
import {
  assertLogoProjectRoot,
  loadLogoProject
} from "../chunks/chunk-6VSA7JKI.mjs";
import {
  PLAN_SCHEMA,
  validateLogoModel
} from "../chunks/chunk-XNRN4R7K.mjs";

// plugins/logo-project-delivery-guard/src/entries/cli/project-stage.ts
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
  if (targetStage !== "release") throw new Error("only the monotonic source to release transition is supported");
  const model = await loadLogoProject(root);
  if (planField(model.plan, "schema") !== PLAN_SCHEMA || planField(model.plan, "artifactId") !== model.artifactId || planField(model.plan, "targetStage") !== "source") throw new Error("PLAN_TRANSITION_INVALID: current plan must be a bound source plan");
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
  process.stderr.write(`[logo-project-stage] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});
