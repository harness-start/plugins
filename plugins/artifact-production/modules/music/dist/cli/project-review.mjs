#!/usr/bin/env node
// harness-source-hash: sha256:ab3cc7aebeec586bb7f7f6b7aaf5ca176baa1ad76e10a51ea0665bec30c4a980
import {
  atomicWriteMusicJson,
  musicSessionMetadata,
  withMusicJournal
} from "../chunks/chunk-2OMELO7L.mjs";
import {
  collectMusicModel
} from "../chunks/chunk-45JLUFZ7.mjs";
import {
  consumeMusicWriterCapability,
  processMusicWriterArgv
} from "../chunks/chunk-6WISBQAW.mjs";
import {
  BRIEF_SCHEMA,
  LEGACY_REVIEW_INPUT_SCHEMA,
  LEGACY_REVIEW_SCHEMA,
  REVIEW_INPUT_SCHEMA,
  REVIEW_SCHEMA,
  computeMusicSubjectDigest,
  musicReviewArtifactPaths,
  musicSourcePaths,
  validateMusicReview
} from "../chunks/chunk-DBL3PMOB.mjs";

// plugins/artifact-production/modules/music/src/entries/cli/project-review.ts
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
var record = (value) => typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
async function main() {
  const root = resolve(process.argv[2] ?? "");
  const grant = await consumeMusicWriterCapability({ root, capability: "music-review", argv: processMusicWriterArgv() });
  const inputPath = resolve(process.argv[3] ?? "");
  const relation = relative(root, inputPath);
  if (!isAbsolute(process.argv[3] ?? "") || !relation.startsWith("..") && relation !== "") throw new Error("REVIEW_INPUT_MUST_BE_EXTERNAL");
  const bytes = await readFile(inputPath);
  if (bytes.byteLength > 1024 * 1024) throw new Error("REVIEW_INPUT_SIZE_EXCEEDED");
  let payload;
  try {
    payload = record(JSON.parse(bytes.toString("utf8")));
  } catch {
    throw new Error("REVIEW_INPUT_JSON_INVALID");
  }
  const model = await collectMusicModel(root);
  const subjectDigest = computeMusicSubjectDigest(model);
  const paths = musicSourcePaths(model);
  const brief = record(JSON.parse(model.files?.["plan.brief.json"] ?? "null"));
  const inputSchema = brief.schema === BRIEF_SCHEMA ? REVIEW_INPUT_SCHEMA : LEGACY_REVIEW_INPUT_SCHEMA;
  const outputSchema = brief.schema === BRIEF_SCHEMA ? REVIEW_SCHEMA : LEGACY_REVIEW_SCHEMA;
  if (grant.subjectDigest !== subjectDigest || payload.schema !== inputSchema || payload.artifactId !== model.artifactId || payload.subjectDigest !== subjectDigest || payload.mixSha256 !== model.digests?.[paths.mix] || !["approved", "changes_requested"].includes(String(payload.decision))) throw new Error("REVIEW_INPUT_INVALID");
  const reviewer = record(payload.reviewer);
  const render = record(JSON.parse(model.files?.[`build/render.${subjectDigest}.json`] ?? "null"));
  if (!["human", "independent-agent"].includes(String(reviewer.kind)) || typeof reviewer.id !== "string" || !reviewer.id || reviewer.sessionId !== grant.sessionId || reviewer.sessionId === render.sessionId) throw new Error("SELF_REVIEW_DENIED");
  const output = { ...payload, schema: outputSchema, plugin: "music-production", reviewer, reviewInputSha256: createHash("sha256").update(bytes).digest("hex"), ...musicSessionMetadata("music-review", grant) };
  const outputBytes = `${JSON.stringify(output, null, 2)}
`;
  const candidate = { ...model, files: { ...model.files, "review.music.json": outputBytes }, digests: { ...model.digests, "review.music.json": createHash("sha256").update(outputBytes).digest("hex") } };
  const findings = validateMusicReview(candidate, { requireApproved: payload.decision === "approved" });
  if (findings.length) throw new Error(findings.map((entry) => `${entry.code}:${entry.path}`).join(","));
  await withMusicJournal(root, "music-review", grant, () => atomicWriteMusicJson(root, "review.music.json", output));
  process.stdout.write(`${JSON.stringify({ decision: payload.decision, covered: musicReviewArtifactPaths(candidate).length })}
`);
}
main().catch((error) => {
  process.stderr.write(`[music-project-review] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});
