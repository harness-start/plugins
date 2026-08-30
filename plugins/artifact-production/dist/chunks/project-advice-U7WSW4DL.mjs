#!/usr/bin/env node
// harness-source-hash: sha256:aa55e37b578bd1016a6403462a3f72057de2a4fa7baa3013af84343c8e6ab3f1
import {
  atomicWriteMusicJson,
  musicSessionMetadata,
  withMusicJournal
} from "./chunk-AFFXS23Z.mjs";
import {
  collectMusicModel
} from "./chunk-7UJIJAAR.mjs";
import {
  consumeMusicWriterCapability,
  processMusicWriterArgv
} from "./chunk-5QBXLGQD.mjs";
import {
  EXTERNAL_SKILLS,
  LEGACY_SKILL_COMPOSITION_SCHEMA,
  SKILL_ADVICE_INPUT_SCHEMA,
  SKILL_ADVICE_SCHEMA,
  SKILL_COMPOSITION_SCHEMA,
  computeMusicSubjectDigest
} from "./chunk-E3W34T5Q.mjs";
import "./chunk-PNL4PTHT.mjs";
import "./chunk-XFYUIVLB.mjs";
import "./chunk-64RZK2M5.mjs";

// plugins/artifact-production/src/domains/music/entries/cli/project-advice.ts
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
var record = (value) => typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
async function main() {
  const root = resolve(process.argv[2] ?? "");
  const grant = await consumeMusicWriterCapability({ root, capability: "music-advice", argv: processMusicWriterArgv() });
  const inputPath = resolve(process.argv[3] ?? "");
  const relation = relative(root, inputPath);
  if (!isAbsolute(process.argv[3] ?? "") || !relation.startsWith("..") && relation !== "") throw new Error("ADVICE_INPUT_MUST_BE_EXTERNAL");
  const bytes = await readFile(inputPath);
  if (bytes.byteLength > 1024 * 1024) throw new Error("ADVICE_INPUT_SIZE_EXCEEDED");
  let payload;
  try {
    payload = record(JSON.parse(bytes.toString("utf8")));
  } catch {
    throw new Error("ADVICE_INPUT_JSON_INVALID");
  }
  const model = await collectMusicModel(root);
  const subjectDigest = computeMusicSubjectDigest(model);
  if (grant.subjectDigest !== subjectDigest || payload.schema !== SKILL_ADVICE_INPUT_SCHEMA || payload.artifactId !== model.artifactId || payload.subjectDigest !== subjectDigest || Object.hasOwn(payload, "revision")) throw new Error("ADVICE_INPUT_INVALID");
  const expected = EXTERNAL_SKILLS.find((entry) => entry.name === payload.skillName);
  const composition = record(JSON.parse(model.files?.["plan.skill-composition.json"] ?? "null"));
  const workers = Array.isArray(composition.workers) ? composition.workers.map(record) : [];
  const worker = workers.find((entry) => entry.name === payload.skillName);
  const supportedComposition = composition.schema === SKILL_COMPOSITION_SCHEMA || composition.schema === LEGACY_SKILL_COMPOSITION_SCHEMA;
  const expectedEvidencePath = `evidence/skills/${expected?.name ?? ""}.json`;
  const declaredEvidencePath = composition.schema === SKILL_COMPOSITION_SCHEMA ? worker?.evidencePath : worker?.advicePath;
  if (!supportedComposition || !expected || expected.artifactKind !== "advice" || !worker || worker.status !== "used" || composition.schema === SKILL_COMPOSITION_SCHEMA && worker.artifactKind !== "advice" || declaredEvidencePath !== expectedEvidencePath || payload.ecosystem !== expected.ecosystem || payload.mode !== expected.mode || !expected.phases.includes(payload.phase)) throw new Error("ADVICE_WORKER_NOT_SELECTED");
  if (!Array.isArray(payload.recommendations) || !Array.isArray(payload.adopted) || !Array.isArray(payload.rejected) || typeof payload.summary !== "string" || !payload.summary.trim()) throw new Error("ADVICE_RESULT_INCOMPLETE");
  const output = {
    schema: SKILL_ADVICE_SCHEMA,
    plugin: "music-production",
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
    ...musicSessionMetadata("music-advice", grant)
  };
  await mkdir(resolve(root, "evidence", "skills"), { recursive: true });
  await withMusicJournal(root, "music-advice", grant, () => atomicWriteMusicJson(root, `evidence/skills/${expected.name}.json`, output));
  process.stdout.write(`${JSON.stringify({ skillName: expected.name, sha256: createHash("sha256").update(`${JSON.stringify(output, null, 2)}
`).digest("hex") })}
`);
}
await main().catch((error) => {
  process.stderr.write(`[music-project-advice] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});
