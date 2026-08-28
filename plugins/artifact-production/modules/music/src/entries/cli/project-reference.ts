#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { consumeMusicWriterCapability, processMusicWriterArgv } from "../../lib/capability.js";
import {
  BRIEF_SCHEMA,
  EXTERNAL_SKILLS,
  REFERENCE_PROFILE_INPUT_SCHEMA,
  REFERENCE_PROFILE_SCHEMA,
  REFERENCE_SOURCES_INPUT_SCHEMA,
  SKILL_COMPOSITION_SCHEMA,
  computeMusicSubjectDigest,
  musicBriefSha256,
  musicReferenceProfilePath,
} from "../../lib/contract.js";
import { collectMusicModel } from "../../lib/release.js";
import { atomicWriteMusicJson, musicSessionMetadata, withMusicJournal } from "../../lib/writer.js";

const DIMENSIONS = ["rhythmicFoundation", "harmonicArchitecture", "instrumentalTechniques", "productionAesthetics", "genreFusion", "energyArchitecture"] as const;
const MAPPINGS = ["rhythmAndTempo", "harmonyAndVoicing", "timbreAndEffects", "spaceAndDynamics", "formAndEnergy"] as const;
const OBSERVATION_BASIS = new Set(["auditioned", "documented-analysis", "user-described"]);
const TRAIT_BASIS = new Set(["observed", "inferred", "user-described"]);
const record = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
const sha256 = (value: NodeJS.ArrayBufferView) => createHash("sha256").update(value).digest("hex");

function externalPath(root: string, rawPath: string, code: string) {
  const target = resolve(rawPath);
  const relation = relative(root, target);
  if (!isAbsolute(rawPath) || (!relation.startsWith("..") && relation !== "")) throw new Error(code);
  return target;
}

function parseJson(bytes: Buffer, code: string) {
  try { return record(JSON.parse(bytes.toString("utf8"))); } catch { throw new Error(code); }
}

function nonEmptyStrings(value: unknown, { min = 1, max = Number.POSITIVE_INFINITY } = {}) {
  return Array.isArray(value) && value.length >= min && value.length <= max
    && value.every((entry) => typeof entry === "string" && entry.trim().length > 0);
}

function normalized(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/gu, " ").trim();
}

async function main() {
  const root = resolve(process.argv[2] ?? "");
  const grant = await consumeMusicWriterCapability({ root, capability: "music-reference", argv: processMusicWriterArgv() });
  const sourcesPath = externalPath(root, process.argv[3] ?? "", "REFERENCE_SOURCES_MUST_BE_EXTERNAL");
  const profilePath = externalPath(root, process.argv[4] ?? "", "REFERENCE_PROFILE_INPUT_MUST_BE_EXTERNAL");
  const [sourceBytes, profileBytes] = await Promise.all([readFile(sourcesPath), readFile(profilePath)]);
  if (sourceBytes.byteLength > 256 * 1024 || profileBytes.byteLength > 1024 * 1024) throw new Error("REFERENCE_INPUT_SIZE_EXCEEDED");
  const sources = parseJson(sourceBytes, "REFERENCE_SOURCES_JSON_INVALID");
  const payload = parseJson(profileBytes, "REFERENCE_PROFILE_JSON_INVALID");
  const references = Array.isArray(sources.references) ? sources.references.map(record) : [];
  const ids = references.map((entry) => String(entry.id ?? ""));
  if (sources.schema !== REFERENCE_SOURCES_INPUT_SCHEMA || references.length < 3 || references.length > 5 || new Set(ids).size !== references.length
    || references.some((entry) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(String(entry.id ?? ""))
      || typeof entry.artist !== "string" || !entry.artist.trim() || typeof entry.title !== "string" || !entry.title.trim()
      || !OBSERVATION_BASIS.has(String(entry.observationBasis)))) throw new Error("REFERENCE_SOURCES_INVALID");

  const model = await collectMusicModel(root);
  const subjectDigest = computeMusicSubjectDigest(model);
  const brief = parseJson(Buffer.from(model.files?.["plan.brief.json"] ?? ""), "REFERENCE_BRIEF_INVALID");
  const reference = record(brief.reference);
  const sourceSetSha256 = sha256(sourceBytes);
  const briefSha256 = musicBriefSha256(model);
  if (grant.subjectDigest !== subjectDigest || sources.artifactId !== model.artifactId || payload.artifactId !== model.artifactId
    || brief.schema !== BRIEF_SCHEMA || reference.mode !== "source-analysis" || reference.sourceSetSha256 !== sourceSetSha256
    || payload.schema !== REFERENCE_PROFILE_INPUT_SCHEMA || payload.briefSha256 !== briefSha256 || payload.sourceSetSha256 !== sourceSetSha256) {
    throw new Error("REFERENCE_BINDING_INVALID");
  }

  const expected = EXTERNAL_SKILLS.find((entry) => entry.name === "music-reference-profile");
  const composition = parseJson(Buffer.from(model.files?.["plan.skill-composition.json"] ?? ""), "REFERENCE_COMPOSITION_INVALID");
  const workers = Array.isArray(composition.workers) ? composition.workers.map(record) : [];
  const worker = workers.find((entry) => entry.name === "music-reference-profile");
  const evidencePath = musicReferenceProfilePath(model);
  if (!expected || composition.schema !== SKILL_COMPOSITION_SCHEMA || worker?.status !== "used" || worker.artifactKind !== "reference-profile"
    || worker.evidencePath !== evidencePath || payload.skillName !== expected.name
    || payload.ecosystem !== expected.ecosystem || payload.mode !== expected.mode
    || payload.phase !== "reference-analysis") throw new Error("REFERENCE_WORKER_NOT_SELECTED");

  if (Object.hasOwn(payload, "revision")) throw new Error("REFERENCE_INPUT_INVALID");
  const dimensions = record(payload.dimensions);
  const mappings = record(payload.toneJsMapping);
  const validTrait = (value: unknown) => Array.isArray(value) && value.length > 0 && value.every((item) => {
    const trait = record(item);
    return typeof trait.trait === "string" && trait.trait.trim().length > 0 && TRAIT_BASIS.has(String(trait.basis))
      && Array.isArray(trait.referenceIds) && trait.referenceIds.length > 0 && trait.referenceIds.every((id) => ids.includes(String(id)));
  });
  const antiImitation = record(payload.antiImitation);
  const unsupportedTraits = Array.isArray(payload.unsupportedTraits) ? payload.unsupportedTraits.map(record) : [];
  if (!DIMENSIONS.every((key) => validTrait(dimensions[key])) || !MAPPINGS.every((key) => nonEmptyStrings(mappings[key]))
    || !nonEmptyStrings(payload.descriptors, { min: 5, max: 10 })
    || unsupportedTraits.some((item) => typeof item.trait !== "string" || !item.trait.trim() || typeof item.reason !== "string" || !item.reason.trim())
    || antiImitation.artistNamesRemoved !== true || antiImitation.signatureMaterialExcluded !== true || antiImitation.imitationPromptExcluded !== true) {
    throw new Error("REFERENCE_PROFILE_INCOMPLETE");
  }

  const admitted = {
    dimensions: Object.fromEntries(DIMENSIONS.map((key) => [key, (dimensions[key] as unknown[]).map((item) => {
      const trait = record(item);
      return { trait: trait.trait, basis: trait.basis, referenceIds: trait.referenceIds };
    })])),
    descriptors: payload.descriptors,
    toneJsMapping: Object.fromEntries(MAPPINGS.map((key) => [key, mappings[key]])),
    unsupportedTraits: unsupportedTraits.map((item) => ({ trait: item.trait, reason: item.reason })),
    antiImitation: { artistNamesRemoved: true, signatureMaterialExcluded: true, imitationPromptExcluded: true },
  };
  const admittedText = normalized(JSON.stringify(admitted));
  const labels = references.flatMap((entry) => [String(entry.artist), String(entry.title)]).map(normalized).filter(Boolean);
  if (labels.some((label) => admittedText.includes(label))) throw new Error("REFERENCE_IDENTITY_LEAK");

  const output = {
    schema: REFERENCE_PROFILE_SCHEMA,
    plugin: "music-production",
    artifactId: model.artifactId,
    briefSha256,
    sourceSetSha256,
    referenceCount: references.length,
    skillName: expected.name,
    ecosystem: expected.ecosystem,
    mode: expected.mode,
    phase: "reference-analysis",
    ...admitted,
    profileInputSha256: sha256(profileBytes),
    ...musicSessionMetadata("music-reference", grant),
  };
  await mkdir(resolve(root, "evidence"), { recursive: true });
  await withMusicJournal(root, "music-reference", grant, () => atomicWriteMusicJson(root, evidencePath, output));
  process.stdout.write(`${JSON.stringify({ referenceProfilePath: evidencePath, briefSha256, sourceSetSha256 })}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`[music-project-reference] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
