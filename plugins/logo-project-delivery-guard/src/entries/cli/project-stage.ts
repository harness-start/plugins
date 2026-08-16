#!/usr/bin/env node

import { rename, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { PLAN_SCHEMA, computeLogoSubjectDigest, validateLogoModel } from "../../lib/contract.js";
import { consumeWriterCapability, processWriterArgv } from "../../lib/capability.js";
import { assertLogoProjectRoot, loadLogoProject } from "../../lib/project.js";
import { withWriterJournal } from "../../lib/writer.js";

function planField(plan: unknown, key: string): unknown {
  return typeof plan === "object" && plan !== null && !Array.isArray(plan)
    ? (plan as Record<string, unknown>)[key]
    : undefined;
}

const root = resolve(process.argv[2] ?? "");
const targetStage = process.argv[3] ?? "";
const planPath = join(root, "plan.contract.json");
const temporaryPath = join(root, `.plan.contract.${process.pid}.tmp`);

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
    await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { flag: "wx" });
    await rename(temporaryPath, planPath);
  });
  process.stdout.write(`[logo-project-stage] advanced ${model.artifactId} to release\n`);
}

main().catch((error: unknown) => { process.stderr.write(`[logo-project-stage] ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; });
