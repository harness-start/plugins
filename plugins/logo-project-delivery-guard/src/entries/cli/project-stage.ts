#!/usr/bin/env node

import { rename, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { PLAN_SCHEMA, validateLogoModel } from "../../lib/contract.js";
import { assertLogoProjectRoot, loadLogoProject } from "../../lib/project.js";

const root = resolve(process.argv[2] ?? "");
const targetStage = process.argv[3] ?? "";
const planPath = join(root, "plan.contract.json");
const temporaryPath = join(root, `.plan.contract.${process.pid}.tmp`);

async function main() {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(root))) throw new Error("project root must end in a kebab-case artifact id");
  await assertLogoProjectRoot(root);
  if (targetStage !== "release") throw new Error("only the monotonic source to release transition is supported");
  const model = await loadLogoProject(root);
  if (model.plan?.schema !== PLAN_SCHEMA || model.plan?.artifactId !== model.artifactId || model.plan?.targetStage !== "source") throw new Error("PLAN_TRANSITION_INVALID: current plan must be a bound source plan");
  const findings = validateLogoModel(model, { stage: "source" });
  if (findings.length > 0) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const next = { schema: PLAN_SCHEMA, artifactId: model.artifactId, targetStage: "release" };
  await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { flag: "wx" });
  await rename(temporaryPath, planPath);
  process.stdout.write(`[logo-project-stage] advanced ${model.artifactId} to release\n`);
}

main().catch((error) => { process.stderr.write(`[logo-project-stage] ${error.message}\n`); process.exitCode = 2; });
