#!/usr/bin/env node
// harness-source-hash: sha256:5255d8fceb7d5d0f23a7cade4becece0e00325c93aa0c46337bcb9c50185d83d
import {
  atomicWriteJson,
  sessionMetadata,
  withWriterJournal
} from "../chunks/chunk-DF7NMKGN.mjs";
import {
  consumeWriterCapability,
  processWriterArgv
} from "../chunks/chunk-L27GW2C3.mjs";
import {
  EXTERNAL_SKILLS,
  SKILL_ADVICE_INPUT_SCHEMA,
  SKILL_ADVICE_SCHEMA,
  SKILL_COMPOSITION_SCHEMA,
  computeLogoSubjectDigest
} from "../chunks/chunk-2F62VZWO.mjs";
import {
  assertLogoProjectRoot,
  loadLogoProject
} from "../chunks/chunk-Z3XVMBVP.mjs";

// plugins/brand-logo-production/src/entries/cli/project-advice.ts
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
var record = (value) => value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
async function main() {
  const root = await assertLogoProjectRoot(resolve(process.argv[2] ?? ""));
  const grant = await consumeWriterCapability({ root, capability: "logo-advice", argv: processWriterArgv() });
  const inputPath = resolve(process.argv[3] ?? "");
  const relativeInput = relative(root, inputPath);
  if (!isAbsolute(inputPath) || !relativeInput.startsWith("..") && relativeInput !== "") throw new Error("ADVICE_INPUT_MUST_BE_EXTERNAL");
  const bytes = await readFile(inputPath);
  if (bytes.byteLength > 1024 * 1024) throw new Error("ADVICE_INPUT_SIZE_EXCEEDED");
  let payload;
  try {
    payload = record(JSON.parse(bytes.toString("utf8")));
  } catch {
    throw new Error("ADVICE_INPUT_JSON_INVALID");
  }
  const model = await loadLogoProject(root);
  const subjectDigest = computeLogoSubjectDigest(model);
  if (grant.subjectDigest !== subjectDigest || payload.subjectDigest !== subjectDigest || payload.schema !== SKILL_ADVICE_INPUT_SCHEMA || payload.artifactId !== model.artifactId || Object.hasOwn(payload, "revision")) throw new Error("ADVICE_INPUT_INVALID");
  const expected = EXTERNAL_SKILLS.find((entry) => entry.name === payload.skillName);
  const composition = record(JSON.parse(String(model.files["plan.skill-composition.json"] ?? "{}")));
  const workers = Array.isArray(composition.workers) ? composition.workers.map(record) : [];
  const worker = workers.find((entry) => entry.name === payload.skillName);
  if (composition.schema !== SKILL_COMPOSITION_SCHEMA || !expected || !worker || worker.status !== "used" || payload.ecosystem !== expected.ecosystem || payload.mode !== expected.mode || !expected.phases.includes(payload.phase)) throw new Error("ADVICE_WORKER_NOT_SELECTED");
  if (!Array.isArray(payload.recommendations) || !Array.isArray(payload.adopted) || !Array.isArray(payload.rejected) || typeof payload.summary !== "string" || !payload.summary.trim()) throw new Error("ADVICE_RESULT_INCOMPLETE");
  const output = {
    schema: SKILL_ADVICE_SCHEMA,
    plugin: "brand-logo-production",
    artifactId: model.artifactId,
    subjectDigest,
    skillName: expected.name,
    ecosystem: expected.ecosystem,
    mode: expected.mode,
    phase: payload.phase,
    summary: payload.summary,
    recommendations: payload.recommendations,
    adopted: payload.adopted,
    rejected: payload.rejected,
    inputSha256: createHash("sha256").update(bytes).digest("hex"),
    ...sessionMetadata("logo-advice", grant)
  };
  await withWriterJournal(root, "logo-advice", grant, () => atomicWriteJson(root, `evidence/skills/${expected.name}.json`, output));
  process.stdout.write(`${JSON.stringify({ skillName: expected.name, sha256: createHash("sha256").update(`${JSON.stringify(output, null, 2)}
`).digest("hex") })}
`);
}
main().catch((error) => {
  process.stderr.write(`[logo-project-advice] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});
