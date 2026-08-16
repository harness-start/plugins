#!/usr/bin/env node

import { resolve } from "node:path";

import { computeLogoSubjectDigest, createLogoReceipt, createLogoReleaseManifest, validateLogoModel, validateLogoReceipt } from "../../lib/contract.js";
import { consumeWriterCapability, processWriterArgv } from "../../lib/capability.js";
import { assertLogoProjectRoot, loadLogoProject } from "../../lib/project.js";
import { atomicWriteJson, sessionMetadata, withWriterJournal } from "../../lib/writer.js";

const planField = (plan: unknown, key: string): unknown => typeof plan === "object" && plan !== null && !Array.isArray(plan) ? (plan as Record<string, unknown>)[key] : undefined;

async function main() {
  const root = await assertLogoProjectRoot(resolve(process.argv[2] ?? ""));
  const grant = await consumeWriterCapability({ root, capability: "logo-release", argv: processWriterArgv() });
  let model = await loadLogoProject(root);
  if (grant.subjectDigest !== computeLogoSubjectDigest(model)) throw new Error("WRITER_SUBJECT_CHANGED");
  if (planField(model.plan, "targetStage") !== "release") throw new Error("RELEASE_STAGE_NOT_REQUESTED");
  let review: Record<string, unknown> = {};
  try { review = JSON.parse(String(model.files["review.logo.json"])); } catch { /* validator reports */ }
  const reviewer = typeof review.reviewer === "object" && review.reviewer !== null ? review.reviewer as Record<string, unknown> : {};
  if (reviewer.sessionId === grant.sessionId) throw new Error("SELF_RELEASE_REVIEW_DENIED");
  const findings = validateLogoModel(model, { stage: "release" }).filter(({ path, code }) => !["release.manifest.json", "receipt.release.json"].includes(path) && code !== "RECEIPT_INVALID");
  if (findings.length) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const receipt = await withWriterJournal(root, "logo-release", grant, async () => {
    await atomicWriteJson(root, "release.manifest.json", createLogoReleaseManifest(model));
    model = await loadLogoProject(root);
    const payload = { ...createLogoReceipt(model), ...sessionMetadata("logo-release", grant) };
    await atomicWriteJson(root, "receipt.release.json", payload);
    const finalModel = await loadLogoProject(root);
    const finalFindings = validateLogoModel(finalModel, { stage: "release" }).filter(({ code }) => code !== "MUTATION_JOURNAL_OPEN");
    if (finalFindings.length || !validateLogoReceipt(finalModel)) throw new Error(finalFindings.map(({ code, path }) => `${code}:${path}`).join(", ") || "written receipt did not verify against current files");
    return payload;
  });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

main().catch((error: unknown) => { process.stderr.write(`[logo-project-release] ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; });
